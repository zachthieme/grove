package api

import (
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
		return nil, errNotFound("person %s not found", personId)
	}
	if newManagerId != "" {
		if err := validateManagerChange(s.working, personId, newManagerId); err != nil {
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
		return nil, errNotFound("person %s not found", personId)
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
			s.applyTeamChange(p, personId, v)
		case "status":
			if !model.ValidStatuses[v] {
				return nil, errValidation("invalid status '%s'", v)
			}
			p.Status = v
		case "managerId":
			if err := s.applyManagerChange(p, personId, v, fields); err != nil {
				return nil, err
			}
		case "employmentType":
			p.EmploymentType = v
		case "additionalTeams":
			p.AdditionalTeams = parseAdditionalTeams(v)
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
				return nil, errValidation("invalid level: %s", v)
			}
			p.Level = n
		case "pod":
			s.applyPodChange(p, v)
		default:
			return nil, errValidation("unknown field: %s", k)
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
		return Person{}, nil, nil, errValidation("invalid status '%s'", p.Status)
	}
	if p.ManagerId != "" {
		if _, mgr := s.findWorking(p.ManagerId); mgr == nil {
			return Person{}, nil, nil, errNotFound("manager %s not found", p.ManagerId)
		}
	}
	p.Id = uuid.NewString()
	s.working = append(s.working, p)
	s.rebuildIndex()
	s.pods = ReassignPersonPod(s.pods, &s.working[len(s.working)-1])
	return p, deepCopyPeople(s.working), CopyPods(s.pods), nil
}

func (s *OrgService) Delete(personId string) (*MutationResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	idx, _ := s.findWorking(personId)
	if idx == -1 {
		return nil, errNotFound("person %s not found", personId)
	}
	for i := range s.working {
		if s.working[i].ManagerId == personId {
			s.working[i].ManagerId = ""
		}
	}
	s.recycled = append(s.recycled, s.working[idx])
	s.working = append(s.working[:idx], s.working[idx+1:]...)
	s.rebuildIndex()
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
		return nil, errNotFound("person %s not found in recycled", personId)
	}
	person := s.recycled[idx]
	s.recycled = append(s.recycled[:idx], s.recycled[idx+1:]...)
	if person.ManagerId != "" {
		if _, mgr := s.findWorking(person.ManagerId); mgr == nil {
			person.ManagerId = ""
		}
	}
	s.working = append(s.working, person)
	s.rebuildIndex()
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

// applyTeamChange updates a person's team and cascades to ICs of front-line managers.
// Must be called with s.mu held.
func (s *OrgService) applyTeamChange(p *Person, personId, team string) {
	p.Team = team
	s.pods = ReassignPersonPod(s.pods, p)
	if isFrontlineManager(s.working, personId) {
		for i := range s.working {
			if s.working[i].ManagerId == personId {
				s.working[i].Team = team
				s.pods = ReassignPersonPod(s.pods, &s.working[i])
			}
		}
	}
	s.pods = CleanupEmptyPods(s.pods, s.working)
}

// applyManagerChange validates and applies a manager reassignment.
// Must be called with s.mu held.
func (s *OrgService) applyManagerChange(p *Person, personId, newManagerId string, fields map[string]string) error {
	if newManagerId != "" {
		if err := validateManagerChange(s.working, personId, newManagerId); err != nil {
			return err
		}
		if _, hasTeam := fields["team"]; !hasTeam {
			if _, mgr := s.findWorking(newManagerId); mgr != nil {
				p.Team = mgr.Team
			}
		}
	}
	p.ManagerId = newManagerId
	s.pods = ReassignPersonPod(s.pods, p)
	s.pods = CleanupEmptyPods(s.pods, s.working)
	return nil
}

// applyPodChange assigns or clears a person's pod, auto-creating if needed.
// Must be called with s.mu held.
func (s *OrgService) applyPodChange(p *Person, podName string) {
	if podName == "" {
		p.Pod = ""
		s.pods = CleanupEmptyPods(s.pods, s.working)
		return
	}
	pod := FindPod(s.pods, podName, p.ManagerId)
	if pod == nil {
		s.pods = append(s.pods, Pod{
			Id:        uuid.NewString(),
			Name:      podName,
			Team:      p.Team,
			ManagerId: p.ManagerId,
		})
	}
	p.Pod = podName
}

// parseAdditionalTeams splits a comma-separated string into trimmed, non-empty team names.
func parseAdditionalTeams(v string) []string {
	if v == "" {
		return nil
	}
	teams := strings.Split(v, ",")
	result := make([]string, 0, len(teams))
	for _, t := range teams {
		t = strings.TrimSpace(t)
		if t != "" {
			result = append(result, t)
		}
	}
	return result
}
