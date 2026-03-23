package api

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"path/filepath"
	"strings"
	"sync"

	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"
	"github.com/zachthieme/grove/internal/parser"
)

type OrgService struct {
	mu              sync.RWMutex
	original        []Person
	working         []Person
	recycled        []Person
	snapshots       map[string]snapshotData
	pendingFile     []byte
	pendingFilename string
}

func NewOrgService() *OrgService {
	return &OrgService{}
}

func (s *OrgService) Upload(filename string, data []byte) (*UploadResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.pendingFile = nil
	s.pendingFilename = ""
	s.snapshots = nil

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
		s.original = people
		s.working = deepCopyPeople(people)
		s.recycled = nil
		return &UploadResponse{
			Status:  "ready",
			OrgData: &OrgData{Original: s.original, Working: s.working},
		}, nil
	}

	// Not all required fields matched with high confidence — hold as pending.
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
	defer s.mu.Unlock()
	if s.pendingFile == nil {
		return nil, fmt.Errorf("no pending file to confirm")
	}

	header, dataRows, err := extractRows(s.pendingFilename, s.pendingFile)
	if err != nil {
		return nil, fmt.Errorf("parsing pending file: %w", err)
	}

	org, err := parser.BuildPeopleWithMapping(header, dataRows, mapping)
	if err != nil {
		return nil, fmt.Errorf("building org: %w", err)
	}

	people := ConvertOrg(org)
	s.original = people
	s.working = deepCopyPeople(people)
	s.recycled = nil
	s.pendingFile = nil
	s.pendingFilename = ""
	return &OrgData{Original: s.original, Working: s.working}, nil
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
	defer f.Close()
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

func (s *OrgService) GetOrg() *OrgData {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.original == nil {
		return nil
	}
	return &OrgData{Original: s.original, Working: s.working}
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
	return &OrgData{Original: s.original, Working: s.working}
}

func (s *OrgService) findWorking(id string) (int, *Person) {
	for i := range s.working {
		if s.working[i].Id == id {
			return i, &s.working[i]
		}
	}
	return -1, nil
}

func (s *OrgService) Move(personId, newManagerId, newTeam string) ([]Person, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, p := s.findWorking(personId)
	if p == nil {
		return nil, fmt.Errorf("person %s not found", personId)
	}
	if newManagerId != "" {
		if _, mgr := s.findWorking(newManagerId); mgr == nil {
			return nil, fmt.Errorf("manager %s not found", newManagerId)
		}
	}
	p.ManagerId = newManagerId
	if newTeam != "" {
		p.Team = newTeam
	}
	return deepCopyPeople(s.working), nil
}

func (s *OrgService) Update(personId string, fields map[string]string) ([]Person, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
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
		case "status":
			p.Status = v
		case "managerId":
			p.ManagerId = v
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
		default:
			return nil, fmt.Errorf("unknown field: %s", k)
		}
	}
	return deepCopyPeople(s.working), nil
}

// Reorder sets the sort indices for a list of person IDs in the given order.
func (s *OrgService) Reorder(personIds []string) ([]Person, error) {
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
	return deepCopyPeople(s.working), nil
}

func (s *OrgService) Add(p Person) (Person, []Person) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p.Id = uuid.NewString()
	s.working = append(s.working, p)
	return p, deepCopyPeople(s.working)
}

func (s *OrgService) Delete(personId string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	idx, _ := s.findWorking(personId)
	if idx == -1 {
		return fmt.Errorf("person %s not found", personId)
	}
	for i := range s.working {
		if s.working[i].ManagerId == personId {
			s.working[i].ManagerId = ""
		}
	}
	s.recycled = append(s.recycled, s.working[idx])
	s.working = append(s.working[:idx], s.working[idx+1:]...)
	return nil
}



func (s *OrgService) Restore(personId string) error {
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
		return fmt.Errorf("person %s not found in recycled", personId)
	}
	person := s.recycled[idx]
	s.recycled = append(s.recycled[:idx], s.recycled[idx+1:]...)
	if person.ManagerId != "" {
		if _, mgr := s.findWorking(person.ManagerId); mgr == nil {
			person.ManagerId = ""
		}
	}
	s.working = append(s.working, person)
	return nil
}

func (s *OrgService) EmptyBin() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.recycled = nil
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

