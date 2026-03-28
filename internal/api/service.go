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

type OrgService struct {
	mu       sync.RWMutex
	original []Person
	working  []Person
	recycled []Person
	settings Settings
	pending  *PendingUpload
	snaps    *SnapshotManager
	podMgr   *PodManager
	idIndex  map[string]int
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
	return &OrgService{snaps: NewSnapshotManager(snapStore), podMgr: NewPodManager()}
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
	s.rebuildIndex()
	s.recycled = deepCopyPeople(data.Recycled)
	s.podMgr.SetState(CopyPods(data.Pods), CopyPods(data.OriginalPods))
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
	return &OrgData{Original: deepCopyPeople(s.original), Working: deepCopyPeople(s.working), Pods: CopyPods(s.podMgr.GetPods()), Settings: &s.settings}
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
	s.rebuildIndex()
	s.recycled = nil
	s.podMgr.Reset()
	s.settings = Settings{DisciplineOrder: deriveDisciplineOrder(s.original)}
	return &OrgData{Original: deepCopyPeople(s.original), Working: deepCopyPeople(s.working), Pods: CopyPods(s.podMgr.GetPods()), Settings: &s.settings}
}

// resetState replaces the full org state after an import. Must be called with s.mu held.
// Callers are responsible for setting s.settings and s.pending as appropriate.
func (s *OrgService) resetState(original, working []Person, snaps map[string]snapshotData) {
	s.original = original
	s.working = deepCopyPeople(working)
	s.rebuildIndex()
	s.recycled = nil
	s.snaps.ReplaceAll(snaps)
	s.podMgr.Seed(s.working)
	_ = SeedPods(s.original)
}

// rebuildIndex rebuilds the idIndex from the current working slice.
// Must be called with s.mu held after any operation that changes the
// working slice's structure (append, remove, replace).
func (s *OrgService) rebuildIndex() {
	s.idIndex = make(map[string]int, len(s.working))
	for i, p := range s.working {
		s.idIndex[p.Id] = i
	}
}

// findWorking finds a person by ID in the working slice. Must be called with s.mu held.
func (s *OrgService) findWorking(id string) (int, *Person) {
	if idx, ok := s.idIndex[id]; ok && idx < len(s.working) && s.working[idx].Id == id {
		return idx, &s.working[idx]
	}
	return -1, nil
}

// MutationResult holds both working and recycled slices, returned atomically
// from mutations that affect both (e.g. Delete, Restore).
type MutationResult struct {
	Working  []Person
	Recycled []Person
	Pods     []Pod
}

// deepCopyPeople returns an independent copy of src, including each person's
// AdditionalTeams slice. This is the concurrency safety boundary: every value
// returned from OrgService to a handler (or stored internally as a separate
// generation, e.g. original vs working) MUST go through deepCopyPeople so
// that in-place mutations on one slice never corrupt another. The struct
// fields themselves are value types (strings, ints) and are copied by the
// range loop; only slice fields (AdditionalTeams) need explicit cloning.
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
