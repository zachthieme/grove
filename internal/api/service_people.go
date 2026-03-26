package api

import (
	"fmt"
	"maps"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/zachthieme/grove/internal/model"
)

func (s *OrgService) Move(personId, newManagerId, newTeam string, newPod ...string) (*MoveResult, error) {
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
	if len(newPod) > 0 && newPod[0] != "" {
		p.Pod = newPod[0]
	}
	s.pods = ReassignPersonPod(s.pods, p)
	s.pods = CleanupEmptyPods(s.pods, s.working)
	return &MoveResult{Working: deepCopyPeople(s.working), Pods: CopyPods(s.pods)}, nil
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
	maps.Copy(fields, noteFields)
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
