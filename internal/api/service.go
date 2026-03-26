package api

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"github.com/xuri/excelize/v2"
)

const maxFieldLen = 500

type OrgService struct {
	mu           sync.RWMutex
	original     []Person
	working      []Person
	recycled     []Person
	pods         []Pod
	originalPods []Pod
	settings     Settings
	snapshots    map[string]snapshotData
	pending      *PendingUpload
	snapshotStore SnapshotStore
}

func deriveDisciplineOrder(people []Person) []string {
	seen := map[string]bool{}
	var disciplines []string
	for _, p := range people {
		if p.Discipline != "" && !seen[p.Discipline] {
			seen[p.Discipline] = true
			disciplines = append(disciplines, p.Discipline)
		}
	}
	sort.Strings(disciplines)
	return disciplines
}

// MoveResult holds working people and pods, returned from mutations that
// affect both (e.g. Move, Update, Reorder).
type MoveResult struct {
	Working []Person
	Pods    []Pod
}

func NewOrgService(snapStore SnapshotStore) *OrgService {
	svc := &OrgService{snapshotStore: snapStore}
	if snaps, err := snapStore.Read(); err == nil && snaps != nil {
		svc.snapshots = snaps
	}
	return svc
}

func extractRows(filename string, data []byte) ([]string, [][]string, error) {
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".csv":
		return extractRowsCSV(data)
	case ".xlsx":
		return extractRowsXLSX(data)
	default:
		return nil, nil, fmt.Errorf("unsupported file format '%s'", ext)
	}
}

func extractRowsCSV(data []byte) ([]string, [][]string, error) {
	reader := csv.NewReader(bytes.NewReader(data))
	records, err := reader.ReadAll()
	if err != nil {
		return nil, nil, fmt.Errorf("reading CSV: %w", err)
	}
	if len(records) < 2 {
		return nil, nil, fmt.Errorf("CSV must have a header and at least one data row")
	}
	return records[0], records[1:], nil
}

func extractRowsXLSX(data []byte) ([]string, [][]string, error) {
	f, err := excelize.OpenReader(bytes.NewReader(data))
	if err != nil {
		return nil, nil, fmt.Errorf("opening xlsx: %w", err)
	}
	defer func() { _ = f.Close() }()
	sheet := f.GetSheetName(0)
	rows, err := f.GetRows(sheet)
	if err != nil {
		return nil, nil, fmt.Errorf("reading rows: %w", err)
	}
	if len(rows) < 2 {
		return nil, nil, fmt.Errorf("xlsx must have a header and at least one data row")
	}
	return rows[0], rows[1:], nil
}

// RestoreState loads full state from an autosave payload into the service,
// syncing the backend with a frontend that restored from autosave.
func (s *OrgService) RestoreState(data AutosaveData) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.original = deepCopyPeople(data.Original)
	s.working = deepCopyPeople(data.Working)
	s.recycled = deepCopyPeople(data.Recycled)
	s.pods = CopyPods(data.Pods)
	s.originalPods = CopyPods(data.OriginalPods)
	if data.Settings != nil {
		s.settings = *data.Settings
	} else {
		s.settings = Settings{DisciplineOrder: deriveDisciplineOrder(s.original)}
	}
}

func (s *OrgService) GetOrg() *OrgData {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.original == nil {
		return nil
	}
	return &OrgData{Original: deepCopyPeople(s.original), Working: deepCopyPeople(s.working), Pods: CopyPods(s.pods), Settings: &s.settings}
}

func (s *OrgService) GetWorking() []Person {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return deepCopyPeople(s.working)
}

func (s *OrgService) GetRecycled() []Person {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return deepCopyPeople(s.recycled)
}

func (s *OrgService) ResetToOriginal() *OrgData {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.working = deepCopyPeople(s.original)
	s.recycled = nil
	s.pods = CopyPods(s.originalPods)
	s.settings = Settings{DisciplineOrder: deriveDisciplineOrder(s.original)}
	return &OrgData{Original: deepCopyPeople(s.original), Working: deepCopyPeople(s.working), Pods: CopyPods(s.pods), Settings: &s.settings}
}

func (s *OrgService) findWorking(id string) (int, *Person) {
	for i := range s.working {
		if s.working[i].Id == id {
			return i, &s.working[i]
		}
	}
	return -1, nil
}

// isFrontlineManager returns true if personId has direct reports but none of
// those reports have reports of their own. Must be called with s.mu held.
func (s *OrgService) isFrontlineManager(personId string) bool {
	hasReports := false
	for _, p := range s.working {
		if p.ManagerId == personId {
			hasReports = true
			// Check if this report has any reports of their own
			for _, q := range s.working {
				if q.ManagerId == p.Id {
					return false // has a sub-manager → not front-line
				}
			}
		}
	}
	return hasReports
}

// validateFieldLengths checks that all string values in fields don't exceed maxFieldLen.
func validateFieldLengths(fields map[string]string) error {
	for _, v := range fields {
		if len(v) > maxFieldLen {
			return fmt.Errorf("field value too long (max %d characters)", maxFieldLen)
		}
	}
	return nil
}

// validateManagerChange checks that setting person's manager to newManagerId is valid.
// Must be called with s.mu held.
func (s *OrgService) validateManagerChange(personId, newManagerId string) error {
	if newManagerId == personId {
		return fmt.Errorf("a person cannot be their own manager")
	}
	if _, mgr := s.findWorking(newManagerId); mgr == nil {
		return fmt.Errorf("manager %s not found", newManagerId)
	}
	if s.wouldCreateCycle(personId, newManagerId) {
		return fmt.Errorf("this move would create a circular reporting chain")
	}
	return nil
}

// wouldCreateCycle checks if setting personId's manager to newManagerId
// would create a cycle. This happens if newManagerId is a descendant of personId.
// Must be called with s.mu held.
func (s *OrgService) wouldCreateCycle(personId, newManagerId string) bool {
	current := newManagerId
	visited := map[string]bool{personId: true}
	for current != "" {
		if visited[current] {
			return true
		}
		visited[current] = true
		_, p := s.findWorking(current)
		if p == nil {
			return false
		}
		current = p.ManagerId
	}
	return false
}

// MutationResult holds both working and recycled slices, returned atomically
// from mutations that affect both (e.g. Delete, Restore).
type MutationResult struct {
	Working  []Person
	Recycled []Person
	Pods     []Pod
}

func deepCopyPeople(src []Person) []Person {
	dst := make([]Person, len(src))
	for i, p := range src {
		dst[i] = p
		if p.AdditionalTeams != nil {
			dst[i].AdditionalTeams = make([]string, len(p.AdditionalTeams))
			copy(dst[i].AdditionalTeams, p.AdditionalTeams)
		}
	}
	return dst
}
