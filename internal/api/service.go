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
	"github.com/zach/orgchart/internal/model"
	"github.com/zach/orgchart/internal/parser"
)

type OrgService struct {
	mu       sync.RWMutex
	original []Person
	working  []Person
}

func NewOrgService() *OrgService {
	return &OrgService{}
}

func (s *OrgService) Upload(filename string, data []byte) error {
	org, err := parseBytes(filename, data)
	if err != nil {
		return fmt.Errorf("parsing file: %w", err)
	}
	people := ConvertOrg(org)
	s.mu.Lock()
	defer s.mu.Unlock()
	s.original = people
	s.working = deepCopyPeople(people)
	return nil
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
	return s.working
}

func (s *OrgService) findWorking(id string) (int, *Person) {
	for i := range s.working {
		if s.working[i].Id == id {
			return i, &s.working[i]
		}
	}
	return -1, nil
}

func (s *OrgService) Move(personId, newManagerId, newTeam string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, p := s.findWorking(personId)
	if p == nil {
		return fmt.Errorf("person %s not found", personId)
	}
	if newManagerId != "" {
		if _, mgr := s.findWorking(newManagerId); mgr == nil {
			return fmt.Errorf("manager %s not found", newManagerId)
		}
	}
	p.ManagerId = newManagerId
	if newTeam != "" {
		p.Team = newTeam
	}
	return nil
}

func (s *OrgService) Update(personId string, fields map[string]string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, p := s.findWorking(personId)
	if p == nil {
		return fmt.Errorf("person %s not found", personId)
	}
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
		case "newRole":
			p.NewRole = v
		case "newTeam":
			p.NewTeam = v
		}
	}
	return nil
}

func (s *OrgService) Add(p Person) Person {
	s.mu.Lock()
	defer s.mu.Unlock()
	p.Id = uuid.NewString()
	s.working = append(s.working, p)
	return p
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
	s.working = append(s.working[:idx], s.working[idx+1:]...)
	return nil
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

func parseBytes(filename string, data []byte) (*model.Org, error) {
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".csv":
		return parseBytesCSV(data)
	case ".xlsx":
		return parseBytesXLSX(data)
	default:
		return nil, fmt.Errorf("unsupported file format '%s'", ext)
	}
}

func parseBytesCSV(data []byte) (*model.Org, error) {
	reader := csv.NewReader(bytes.NewReader(data))
	records, err := reader.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("reading CSV: %w", err)
	}
	if len(records) < 2 {
		return nil, fmt.Errorf("CSV must have a header and at least one data row")
	}
	return parser.BuildPeople(records[0], records[1:])
}

func parseBytesXLSX(data []byte) (*model.Org, error) {
	f, err := excelize.OpenReader(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("opening xlsx: %w", err)
	}
	defer f.Close()
	sheet := f.GetSheetName(0)
	rows, err := f.GetRows(sheet)
	if err != nil {
		return nil, fmt.Errorf("reading rows: %w", err)
	}
	if len(rows) < 2 {
		return nil, fmt.Errorf("xlsx must have a header and at least one data row")
	}
	return parser.BuildPeople(rows[0], rows[1:])
}
