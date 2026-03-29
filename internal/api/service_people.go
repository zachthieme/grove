package api

import (
	"context"
	"strings"

	"github.com/google/uuid"
	"github.com/zachthieme/grove/internal/model"
)

func (s *OrgService) Move(ctx context.Context, personId, newManagerId, newTeam string, newPod ...string) (*MoveResult, error) {
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
	s.podMgr.Reassign(p)
	s.podMgr.Cleanup(s.working)
	return &MoveResult{Working: deepCopyPeople(s.working), Pods: CopyPods(s.podMgr.GetPods())}, nil
}

func (s *OrgService) Update(ctx context.Context, personId string, fields PersonUpdate) (*MoveResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := validatePersonUpdate(&fields); err != nil {
		return nil, err
	}

	_, p := s.findWorking(personId)
	if p == nil {
		return nil, errNotFound("person %s not found", personId)
	}

	// Clear warning on any edit
	p.Warning = ""

	// Simple fields
	if fields.Name != nil {
		p.Name = *fields.Name
	}
	if fields.Role != nil {
		p.Role = *fields.Role
	}
	if fields.Discipline != nil {
		p.Discipline = *fields.Discipline
	}
	if fields.EmploymentType != nil {
		p.EmploymentType = *fields.EmploymentType
	}
	if fields.NewRole != nil {
		p.NewRole = *fields.NewRole
	}
	if fields.NewTeam != nil {
		p.NewTeam = *fields.NewTeam
	}
	if fields.AdditionalTeams != nil {
		p.AdditionalTeams = parseAdditionalTeams(*fields.AdditionalTeams)
	}
	if fields.Private != nil {
		p.Private = *fields.Private
	}
	if fields.Level != nil {
		p.Level = *fields.Level
	}

	// Status — requires validation
	if fields.Status != nil {
		if !model.ValidStatuses[*fields.Status] {
			return nil, errValidation("invalid status '%s'", *fields.Status)
		}
		p.Status = *fields.Status
	}

	// Notes — length already validated by validatePersonUpdate
	if fields.PublicNote != nil {
		p.PublicNote = *fields.PublicNote
	}
	if fields.PrivateNote != nil {
		p.PrivateNote = *fields.PrivateNote
	}

	// Manager change — requires cycle detection and team inheritance
	if fields.ManagerId != nil {
		if err := s.applyManagerChange(p, personId, *fields.ManagerId, fields.Team != nil); err != nil {
			return nil, err
		}
	}

	// Team change — cascades to ICs of front-line managers
	if fields.Team != nil {
		s.applyTeamChange(p, personId, *fields.Team)
	}

	// Pod change — may auto-create pod
	if fields.Pod != nil {
		s.applyPodChange(p, *fields.Pod)
	}

	return &MoveResult{Working: deepCopyPeople(s.working), Pods: CopyPods(s.podMgr.GetPods())}, nil
}

// Reorder sets the sort indices for a list of person IDs in the given order.
func (s *OrgService) Reorder(ctx context.Context, personIds []string) (*MoveResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, id := range personIds {
		if idx, ok := s.idIndex[id]; ok && idx < len(s.working) && s.working[idx].Id == id {
			s.working[idx].SortIndex = i
		}
	}
	return &MoveResult{Working: deepCopyPeople(s.working), Pods: CopyPods(s.podMgr.GetPods())}, nil
}

func (s *OrgService) Add(ctx context.Context, p Person) (Person, []Person, []Pod, error) {
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
	s.podMgr.Reassign(&s.working[len(s.working)-1])
	return p, deepCopyPeople(s.working), CopyPods(s.podMgr.GetPods()), nil
}

func (s *OrgService) AddParent(ctx context.Context, childId, name string) (Person, []Person, []Pod, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return Person{}, nil, nil, errValidation("name is required")
	}
	if len(name) > maxFieldLen {
		return Person{}, nil, nil, errValidation("name too long (max %d characters)", maxFieldLen)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	_, child := s.findWorking(childId)
	if child == nil {
		return Person{}, nil, nil, errNotFound("person %s not found", childId)
	}
	if child.ManagerId != "" {
		return Person{}, nil, nil, errConflict("person %s already has a manager", childId)
	}

	parent := Person{
		Id:     uuid.NewString(),
		Name:   name,
		Status: "Active",
	}
	child.ManagerId = parent.Id
	s.working = append(s.working, parent)
	s.rebuildIndex()
	return parent, deepCopyPeople(s.working), CopyPods(s.podMgr.GetPods()), nil
}

func (s *OrgService) Delete(ctx context.Context, personId string) (*MutationResult, error) {
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
	s.podMgr.Cleanup(s.working)
	return &MutationResult{
		Working:  deepCopyPeople(s.working),
		Recycled: deepCopyPeople(s.recycled),
		Pods:     CopyPods(s.podMgr.GetPods()),
	}, nil
}

func (s *OrgService) Restore(ctx context.Context, personId string) (*MutationResult, error) {
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
	s.podMgr.Reassign(&s.working[len(s.working)-1])
	return &MutationResult{
		Working:  deepCopyPeople(s.working),
		Recycled: deepCopyPeople(s.recycled),
		Pods:     CopyPods(s.podMgr.GetPods()),
	}, nil
}

func (s *OrgService) EmptyBin(ctx context.Context) []Person {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.recycled = nil
	return deepCopyPeople(s.recycled)
}

// applyTeamChange updates a person's team and cascades to ICs of front-line managers.
// Must be called with s.mu held.
func (s *OrgService) applyTeamChange(p *Person, personId, team string) {
	p.Team = team
	s.podMgr.Reassign(p)
	if isFrontlineManager(s.working, personId) {
		for i := range s.working {
			if s.working[i].ManagerId == personId {
				s.working[i].Team = team
				s.podMgr.Reassign(&s.working[i])
			}
		}
	}
	s.podMgr.Cleanup(s.working)
}

// applyManagerChange validates and applies a manager reassignment.
// Must be called with s.mu held.
func (s *OrgService) applyManagerChange(p *Person, personId, newManagerId string, hasTeamField bool) error {
	if newManagerId != "" {
		if err := validateManagerChange(s.working, personId, newManagerId); err != nil {
			return err
		}
		if !hasTeamField {
			if _, mgr := s.findWorking(newManagerId); mgr != nil {
				p.Team = mgr.Team
			}
		}
	}
	p.ManagerId = newManagerId
	s.podMgr.Reassign(p)
	s.podMgr.Cleanup(s.working)
	return nil
}

// applyPodChange assigns or clears a person's pod, auto-creating if needed.
// Must be called with s.mu held.
func (s *OrgService) applyPodChange(p *Person, podName string) {
	if podName == "" {
		p.Pod = ""
		s.podMgr.Cleanup(s.working)
		return
	}
	pod := findPod(s.podMgr.GetPods(), podName, p.ManagerId)
	if pod == nil {
		s.podMgr.SetPods(append(s.podMgr.GetPods(), Pod{
			Id:        uuid.NewString(),
			Name:      podName,
			Team:      p.Team,
			ManagerId: p.ManagerId,
		}))
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
