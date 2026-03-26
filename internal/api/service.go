package api

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"

	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"
	"github.com/zachthieme/grove/internal/model"
	"github.com/zachthieme/grove/internal/parser"
)

const maxFieldLen = 500

type OrgService struct {
	mu              sync.RWMutex
	original        []Person
	working         []Person
	recycled        []Person
	pods            []Pod
	originalPods    []Pod
	settings        Settings
	snapshots       map[string]snapshotData
	pendingFile     []byte
	pendingFilename string
	pendingIsZip    bool
	snapshotStore   SnapshotStore
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

func (s *OrgService) Upload(filename string, data []byte) (*UploadResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.pendingFile = nil
	s.pendingFilename = ""
	s.pendingIsZip = false

	header, dataRows, err := extractRows(filename, data)
	if err != nil {
		return nil, fmt.Errorf("parsing file: %w", err)
	}

	mapping := InferMapping(header)
	if AllRequiredHigh(mapping) {
		simpleMapping := make(map[string]string, len(mapping))
		for field, mc := range mapping {
			simpleMapping[field] = mc.Column
		}
		org, err := parser.BuildPeopleWithMapping(header, dataRows, simpleMapping)
		if err != nil {
			return nil, fmt.Errorf("building org: %w", err)
		}
		people := ConvertOrg(org)
		s.snapshots = nil
		var persistWarn string
		if err := s.snapshotStore.Delete(); err != nil {
			persistWarn = fmt.Sprintf("snapshot cleanup failed: %v", err)
		}
		s.original = people
		s.working = deepCopyPeople(people)
		s.recycled = nil
		s.pods = SeedPods(s.working)
		s.originalPods = CopyPods(s.pods)
		// Seed original people's pod fields too
		_ = SeedPods(s.original)
		s.settings = Settings{DisciplineOrder: deriveDisciplineOrder(s.working)}
		return &UploadResponse{
			Status:             "ready",
			OrgData:            &OrgData{Original: deepCopyPeople(s.original), Working: deepCopyPeople(s.working), Pods: CopyPods(s.pods), Settings: &s.settings},
			PersistenceWarning: persistWarn,
		}, nil
	}

	// Required field (name) not matched with high confidence — hold as pending.
	// Don't clear snapshots yet — user may cancel the mapping dialog.
	// Snapshots are cleared when the mapping is confirmed in ConfirmMapping.
	s.pendingFile = data
	s.pendingFilename = filename
	preview := [][]string{header}
	for i, row := range dataRows {
		if i >= 3 {
			break
		}
		preview = append(preview, row)
	}
	return &UploadResponse{
		Status:  "needs_mapping",
		Headers: header,
		Mapping: mapping,
		Preview: preview,
	}, nil
}

func (s *OrgService) ConfirmMapping(mapping map[string]string) (*OrgData, error) {
	s.mu.Lock()
	if s.pendingFile == nil {
		s.mu.Unlock()
		return nil, fmt.Errorf("no pending file to confirm")
	}

	if s.pendingIsZip {
		entries, podsSidecar, settingsSidecar, err := parseZipFileList(s.pendingFile)
		if err != nil {
			s.mu.Unlock()
			return nil, fmt.Errorf("parsing pending zip: %w", err)
		}
		orig, work, snaps, err := parseZipEntries(entries, mapping)
		if err != nil {
			s.mu.Unlock()
			return nil, fmt.Errorf("parsing pending zip: %w", err)
		}
		s.original = orig
		s.working = deepCopyPeople(work)
		s.recycled = nil
		s.snapshots = snaps
		s.pods = SeedPods(s.working)
		s.originalPods = CopyPods(s.pods)
		_ = SeedPods(s.original)

		if podsSidecar != nil {
			sidecarEntries := parsePodsSidecar(podsSidecar)
			if len(sidecarEntries) > 0 {
				idToName := buildIDToName(s.working)
				applyPodSidecarNotes(s.pods, sidecarEntries, idToName)
				applyPodSidecarNotes(s.originalPods, sidecarEntries, idToName)
			}
		}

		s.settings = Settings{DisciplineOrder: deriveDisciplineOrder(s.working)}
		if settingsSidecar != nil {
			if order := parseSettingsSidecar(settingsSidecar); len(order) > 0 {
				s.settings = Settings{DisciplineOrder: order}
			}
		}

		snapCopy := make(map[string]snapshotData, len(s.snapshots))
		for k, v := range s.snapshots {
			snapCopy[k] = v
		}
		s.pendingFile = nil
		s.pendingFilename = ""
		s.pendingIsZip = false
		resp := &OrgData{Original: deepCopyPeople(s.original), Working: deepCopyPeople(s.working), Pods: CopyPods(s.pods), Settings: &s.settings}
		s.mu.Unlock()

		// Disk I/O outside the lock
		var persistWarn string
		if err := s.snapshotStore.Delete(); err != nil {
			persistWarn = fmt.Sprintf("snapshot cleanup failed: %v", err)
		}
		if err := s.snapshotStore.Write(snapCopy); err != nil {
			msg := fmt.Sprintf("snapshot persist error: %v", err)
			if persistWarn != "" {
				persistWarn += "; " + msg
			} else {
				persistWarn = msg
			}
		}
		resp.PersistenceWarning = persistWarn
		return resp, nil
	}

	header, dataRows, err := extractRows(s.pendingFilename, s.pendingFile)
	if err != nil {
		s.mu.Unlock()
		return nil, fmt.Errorf("parsing pending file: %w", err)
	}

	org, err := parser.BuildPeopleWithMapping(header, dataRows, mapping)
	if err != nil {
		s.mu.Unlock()
		return nil, fmt.Errorf("building org: %w", err)
	}

	people := ConvertOrg(org)
	s.original = people
	s.working = deepCopyPeople(people)
	s.recycled = nil
	s.snapshots = nil
	s.pods = SeedPods(s.working)
	s.originalPods = CopyPods(s.pods)
	_ = SeedPods(s.original)
	s.settings = Settings{DisciplineOrder: deriveDisciplineOrder(s.working)}
	s.pendingFile = nil
	s.pendingFilename = ""
	s.pendingIsZip = false
	resp := &OrgData{Original: deepCopyPeople(s.original), Working: deepCopyPeople(s.working), Pods: CopyPods(s.pods), Settings: &s.settings}
	s.mu.Unlock()

	// Disk I/O outside the lock
	var persistWarn string
	if err := s.snapshotStore.Delete(); err != nil {
		persistWarn = fmt.Sprintf("snapshot cleanup failed: %v", err)
	}
	resp.PersistenceWarning = persistWarn
	return resp, nil
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

func (s *OrgService) Move(personId, newManagerId, newTeam string) (*MoveResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, p := s.findWorking(personId)
	if p == nil {
		return nil, fmt.Errorf("person %s not found", personId)
	}
	if newManagerId != "" {
		if err := s.validateManagerChange(personId, newManagerId); err != nil {
			return nil, err
		}
	}
	p.ManagerId = newManagerId
	if newTeam != "" {
		p.Team = newTeam
	}
	s.pods = ReassignPersonPod(s.pods, p)
	s.pods = CleanupEmptyPods(s.pods, s.working)
	return &MoveResult{Working: deepCopyPeople(s.working), Pods: CopyPods(s.pods)}, nil
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

func (s *OrgService) Update(personId string, fields map[string]string) (*MoveResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	// Extract note/pod fields so they don't hit the 500-char limit
	noteFields := map[string]string{}
	for _, key := range []string{"publicNote", "privateNote", "pod"} {
		if v, ok := fields[key]; ok {
			noteFields[key] = v
			delete(fields, key)
		}
	}
	if err := validateFieldLengths(fields); err != nil {
		return nil, err
	}
	// Re-add for switch processing
	for k, v := range noteFields {
		fields[k] = v
	}
	_, p := s.findWorking(personId)
	if p == nil {
		return nil, fmt.Errorf("person %s not found", personId)
	}
	// Clear warning on any edit — the user is actively fixing the data
	p.Warning = ""
	for k, v := range fields {
		switch k {
		case "name":
			p.Name = v
		case "role":
			p.Role = v
		case "discipline":
			p.Discipline = v
		case "team":
			p.Team = v
			s.pods = ReassignPersonPod(s.pods, p)
			// Cascade to ICs if this person is a front-line manager
			// (has direct reports, but none of those reports have reports)
			if s.isFrontlineManager(personId) {
				for i := range s.working {
					if s.working[i].ManagerId == personId {
						s.working[i].Team = v
						s.pods = ReassignPersonPod(s.pods, &s.working[i])
					}
				}
			}
			s.pods = CleanupEmptyPods(s.pods, s.working)
		case "status":
			if !model.ValidStatuses[v] {
				return nil, fmt.Errorf("invalid status '%s'", v)
			}
			p.Status = v
		case "managerId":
			if v != "" {
				if err := s.validateManagerChange(personId, v); err != nil {
					return nil, err
				}
				// Update team to match new manager unless team is also being set explicitly
				if _, hasTeam := fields["team"]; !hasTeam {
					if _, mgr := s.findWorking(v); mgr != nil {
						p.Team = mgr.Team
					}
				}
			}
			p.ManagerId = v
			s.pods = ReassignPersonPod(s.pods, p)
			s.pods = CleanupEmptyPods(s.pods, s.working)
		case "employmentType":
			p.EmploymentType = v
		case "additionalTeams":
			if v == "" {
				p.AdditionalTeams = nil
			} else {
				teams := strings.Split(v, ",")
				p.AdditionalTeams = make([]string, 0, len(teams))
				for _, t := range teams {
					t = strings.TrimSpace(t)
					if t != "" {
						p.AdditionalTeams = append(p.AdditionalTeams, t)
					}
				}
			}
		case "newRole":
			p.NewRole = v
		case "newTeam":
			p.NewTeam = v
		case "publicNote":
			if err := validateNoteLen(v); err != nil {
				return nil, err
			}
			p.PublicNote = v
		case "privateNote":
			if err := validateNoteLen(v); err != nil {
				return nil, err
			}
			p.PrivateNote = v
		case "level":
			n, err := strconv.Atoi(v)
			if err != nil {
				return nil, fmt.Errorf("invalid level: %s", v)
			}
			p.Level = n
		case "pod":
			if v == "" {
				p.Pod = ""
				s.pods = CleanupEmptyPods(s.pods, s.working)
			} else {
				pod := FindPod(s.pods, v, p.ManagerId)
				if pod == nil {
					// Auto-create the pod under this manager
					newPod := Pod{
						Id:        uuid.NewString(),
						Name:      v,
						Team:      p.Team,
						ManagerId: p.ManagerId,
					}
					s.pods = append(s.pods, newPod)
				}
				p.Pod = v
			}
		default:
			return nil, fmt.Errorf("unknown field: %s", k)
		}
	}
	return &MoveResult{Working: deepCopyPeople(s.working), Pods: CopyPods(s.pods)}, nil
}

// Reorder sets the sort indices for a list of person IDs in the given order.
func (s *OrgService) Reorder(personIds []string) (*MoveResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, id := range personIds {
		for j := range s.working {
			if s.working[j].Id == id {
				s.working[j].SortIndex = i
				break
			}
		}
	}
	return &MoveResult{Working: deepCopyPeople(s.working), Pods: CopyPods(s.pods)}, nil
}

func (s *OrgService) Add(p Person) (Person, []Person, []Pod, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	fields := map[string]string{
		"name": p.Name, "role": p.Role,
		"discipline": p.Discipline, "team": p.Team,
	}
	if err := validateFieldLengths(fields); err != nil {
		return Person{}, nil, nil, err
	}
	if p.Status != "" && !model.ValidStatuses[p.Status] {
		return Person{}, nil, nil, fmt.Errorf("invalid status '%s'", p.Status)
	}
	if p.ManagerId != "" {
		if _, mgr := s.findWorking(p.ManagerId); mgr == nil {
			return Person{}, nil, nil, fmt.Errorf("manager %s not found", p.ManagerId)
		}
	}
	p.Id = uuid.NewString()
	s.working = append(s.working, p)
	s.pods = ReassignPersonPod(s.pods, &s.working[len(s.working)-1])
	return p, deepCopyPeople(s.working), CopyPods(s.pods), nil
}

// MutationResult holds both working and recycled slices, returned atomically
// from mutations that affect both (e.g. Delete, Restore).
type MutationResult struct {
	Working  []Person
	Recycled []Person
	Pods     []Pod
}

func (s *OrgService) Delete(personId string) (*MutationResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	idx, _ := s.findWorking(personId)
	if idx == -1 {
		return nil, fmt.Errorf("person %s not found", personId)
	}
	for i := range s.working {
		if s.working[i].ManagerId == personId {
			s.working[i].ManagerId = ""
		}
	}
	s.recycled = append(s.recycled, s.working[idx])
	s.working = append(s.working[:idx], s.working[idx+1:]...)
	s.pods = CleanupEmptyPods(s.pods, s.working)
	return &MutationResult{
		Working:  deepCopyPeople(s.working),
		Recycled: deepCopyPeople(s.recycled),
		Pods:     CopyPods(s.pods),
	}, nil
}

func (s *OrgService) Restore(personId string) (*MutationResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	idx := -1
	for i := range s.recycled {
		if s.recycled[i].Id == personId {
			idx = i
			break
		}
	}
	if idx == -1 {
		return nil, fmt.Errorf("person %s not found in recycled", personId)
	}
	person := s.recycled[idx]
	s.recycled = append(s.recycled[:idx], s.recycled[idx+1:]...)
	if person.ManagerId != "" {
		if _, mgr := s.findWorking(person.ManagerId); mgr == nil {
			person.ManagerId = ""
		}
	}
	s.working = append(s.working, person)
	s.pods = ReassignPersonPod(s.pods, &s.working[len(s.working)-1])
	return &MutationResult{
		Working:  deepCopyPeople(s.working),
		Recycled: deepCopyPeople(s.recycled),
		Pods:     CopyPods(s.pods),
	}, nil
}

func (s *OrgService) EmptyBin() []Person {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.recycled = nil
	return deepCopyPeople(s.recycled)
}

func (s *OrgService) ListPods() []PodInfo {
	s.mu.RLock()
	defer s.mu.RUnlock()
	counts := map[string]int{}
	for _, p := range s.working {
		if p.Pod != "" && p.ManagerId != "" {
			counts[p.ManagerId+":"+p.Pod]++
		}
	}
	result := make([]PodInfo, len(s.pods))
	for i, pod := range s.pods {
		result[i] = PodInfo{Pod: pod, MemberCount: counts[pod.ManagerId+":"+pod.Name]}
	}
	return result
}

func (s *OrgService) UpdatePod(podID string, fields map[string]string) (*MoveResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	pod := FindPodByID(s.pods, podID)
	if pod == nil {
		return nil, fmt.Errorf("pod %s not found", podID)
	}
	for k, v := range fields {
		switch k {
		case "name":
			if err := RenamePod(s.pods, s.working, podID, v); err != nil {
				return nil, err
			}
		case "publicNote":
			if err := validateNoteLen(v); err != nil {
				return nil, err
			}
			pod.PublicNote = v
		case "privateNote":
			if err := validateNoteLen(v); err != nil {
				return nil, err
			}
			pod.PrivateNote = v
		default:
			return nil, fmt.Errorf("unknown pod field: %s", k)
		}
	}
	return &MoveResult{Working: deepCopyPeople(s.working), Pods: CopyPods(s.pods)}, nil
}

func (s *OrgService) CreatePod(managerID, name, team string) (*MoveResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, p := range s.pods {
		if p.ManagerId == managerID && p.Team == team {
			return nil, fmt.Errorf("pod already exists for this manager and team")
		}
	}
	pod := Pod{Id: uuid.NewString(), Name: name, Team: team, ManagerId: managerID}
	s.pods = append(s.pods, pod)
	return &MoveResult{Working: deepCopyPeople(s.working), Pods: CopyPods(s.pods)}, nil
}

func (s *OrgService) GetSettings() Settings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.settings
}

func (s *OrgService) UpdateSettings(settings Settings) Settings {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.settings = settings
	return s.settings
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

