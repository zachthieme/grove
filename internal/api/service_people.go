package api

import (
	"context"
	"strings"

	"github.com/google/uuid"
	"github.com/zachthieme/grove/internal/model"
)

// Move reassigns a person's manager, team, and/or pod. Empty strings mean
// "no change" for team and pod; an empty newManagerId reassigns the person to
// the root (no manager).
func (s *OrgService) Move(ctx context.Context, personId, newManagerId, newTeam, newPod string) (*MoveResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, p := s.findWorking(personId)
	if p == nil {
		return nil, errNotFound("person %s not found", personId)
	}
	if newManagerId != "" {
		if err := s.validateManagerChange(personId, newManagerId); err != nil {
			return nil, err
		}
	}
	p.ManagerId = newManagerId
	if newPod != "" {
		p.Pod = newPod
	}
	if newTeam != "" {
		s.applyTeamChange(p, personId, newTeam)
	} else {
		s.podMgr.unsafeReassign(p)
		s.podMgr.unsafeCleanup(s.working)
	}
	return &MoveResult{Working: deepCopyNodes(s.working), Pods: CopyPods(s.podMgr.unsafeGetPods())}, nil
}

func (s *OrgService) Update(ctx context.Context, personId string, fields OrgNodeUpdate) (*MoveResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := validateNodeUpdate(&fields); err != nil {
		return nil, err
	}

	_, p := s.findWorking(personId)
	if p == nil {
		return nil, errNotFound("person %s not found", personId)
	}

	// Clear warning on any edit.
	p.Warning = ""

	// Order is load-bearing: Type first (it constrains valid Status); identity
	// next (purely local writes); Status validates against the now-current Type;
	// Notes are content-only; relational fields last because they trigger pod
	// reassignment / cycle detection / cascading team writes.
	applyTypeChange(p, fields)
	applyIdentityFields(p, fields)
	if err := applyStatus(p, fields); err != nil {
		return nil, err
	}
	applyNotes(p, fields)

	if fields.ManagerId != nil {
		if err := s.applyManagerChange(p, personId, *fields.ManagerId, fields.Team != nil); err != nil {
			return nil, err
		}
	}
	if fields.Team != nil {
		s.applyTeamChange(p, personId, *fields.Team)
	}
	if fields.Pod != nil {
		s.applyPodChange(p, *fields.Pod)
	}

	return &MoveResult{Working: deepCopyNodes(s.working), Pods: CopyPods(s.podMgr.unsafeGetPods())}, nil
}

// applyTypeChange flips Type and, when switching to product, clears the
// person-only fields. If the caller omitted Status and the existing status
// isn't valid under the new Type, defaults to Active so the node is never
// left in an invalid state. Active is valid for both types.
func applyTypeChange(p *OrgNode, fields OrgNodeUpdate) {
	if fields.Type == nil {
		return
	}
	p.Type = *fields.Type
	if model.IsProduct(p.Type) {
		p.Role = ""
		p.Discipline = ""
		p.EmploymentType = ""
		p.Level = 0
		p.AdditionalTeams = nil
	}
	if fields.Status == nil && !model.ValidStatuses(p.Type)[p.Status] {
		p.Status = model.StatusActive
	}
}

// applyIdentityFields writes the purely-local string/scalar fields. None of
// these mutate relationships or affect pod/team membership.
func applyIdentityFields(p *OrgNode, fields OrgNodeUpdate) {
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
}

// applyStatus validates the requested status against the (possibly just-changed)
// Type and writes it. Returns errValidation for an unknown status.
func applyStatus(p *OrgNode, fields OrgNodeUpdate) error {
	if fields.Status == nil {
		return nil
	}
	if !model.ValidStatuses(p.Type)[*fields.Status] {
		return errValidation("invalid status '%s'", *fields.Status)
	}
	p.Status = *fields.Status
	return nil
}

// applyNotes writes public/private notes. Length already enforced upstream by
// validateNodeUpdate.
func applyNotes(p *OrgNode, fields OrgNodeUpdate) {
	if fields.PublicNote != nil {
		p.PublicNote = *fields.PublicNote
	}
	if fields.PrivateNote != nil {
		p.PrivateNote = *fields.PrivateNote
	}
}

// Reorder sets the sort indices for a list of person IDs in the given order.
// Returns an error if any ID is unknown so callers see a clear failure rather
// than a partially-applied reorder.
func (s *OrgService) Reorder(ctx context.Context, personIds []string) (*MoveResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, id := range personIds {
		idx, ok := s.idIndex[id]
		if !ok || idx >= len(s.working) || s.working[idx].Id != id {
			return nil, errNotFound("person %s not found", id)
		}
	}
	for i, id := range personIds {
		s.working[s.idIndex[id]].SortIndex = i
	}
	return &MoveResult{Working: deepCopyNodes(s.working), Pods: CopyPods(s.podMgr.unsafeGetPods())}, nil
}

func (s *OrgService) Add(ctx context.Context, p OrgNode) (OrgNode, []OrgNode, []Pod, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	fields := map[string]string{
		"name": p.Name, "role": p.Role,
		"discipline": p.Discipline, "team": p.Team,
	}
	if err := validateFieldLengths(fields); err != nil {
		return OrgNode{}, nil, nil, err
	}
	if p.Type != "" && p.Type != model.NodeTypePerson && p.Type != model.NodeTypeProduct {
		return OrgNode{}, nil, nil, errValidation("invalid type '%s'", p.Type)
	}
	if p.Status != "" && !model.ValidStatuses(p.Type)[p.Status] {
		return OrgNode{}, nil, nil, errValidation("invalid status '%s'", p.Status)
	}
	if p.ManagerId != "" {
		if _, mgr := s.findWorking(p.ManagerId); mgr == nil {
			return OrgNode{}, nil, nil, errNotFound("manager %s not found", p.ManagerId)
		}
	}
	if !model.IsProduct(p.Type) && p.EmploymentType == "" {
		p.EmploymentType = "FTE"
	}
	p.Id = uuid.NewString()
	s.working = append(s.working, p)
	s.rebuildIndex()
	s.podMgr.unsafeReassign(&s.working[len(s.working)-1])
	return p, deepCopyNodes(s.working), CopyPods(s.podMgr.unsafeGetPods()), nil
}

func (s *OrgService) AddParent(ctx context.Context, childId, name string) (OrgNode, []OrgNode, []Pod, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return OrgNode{}, nil, nil, errValidation("name is required")
	}
	if len(name) > maxFieldLen {
		return OrgNode{}, nil, nil, errValidation("name too long (max %d characters)", maxFieldLen)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	_, child := s.findWorking(childId)
	if child == nil {
		return OrgNode{}, nil, nil, errNotFound("person %s not found", childId)
	}

	parent := OrgNode{
		OrgNodeFields: model.OrgNodeFields{Name: name, Status: "Active"},
		Id:            uuid.NewString(),
	}

	// Insert between child and its existing manager (if any)
	parent.ManagerId = child.ManagerId
	parent.Team = child.Team
	child.ManagerId = parent.Id

	s.working = append(s.working, parent)
	s.rebuildIndex()
	s.podMgr.unsafeReassign(&s.working[len(s.working)-1])
	return parent, deepCopyNodes(s.working), CopyPods(s.podMgr.unsafeGetPods()), nil
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
	s.podMgr.unsafeCleanup(s.working)
	return &MutationResult{
		Working:  deepCopyNodes(s.working),
		Recycled: deepCopyNodes(s.recycled),
		Pods:     CopyPods(s.podMgr.unsafeGetPods()),
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
	s.podMgr.unsafeReassign(&s.working[len(s.working)-1])
	return &MutationResult{
		Working:  deepCopyNodes(s.working),
		Recycled: deepCopyNodes(s.recycled),
		Pods:     CopyPods(s.podMgr.unsafeGetPods()),
	}, nil
}

func (s *OrgService) EmptyBin(ctx context.Context) []OrgNode {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.recycled = nil
	return []OrgNode{}
}

// applyTeamChange updates a person's team and cascades to ICs of front-line managers.
// Must be called with s.mu held.
func (s *OrgService) applyTeamChange(p *OrgNode, personId, team string) {
	p.Team = team
	s.podMgr.unsafeReassign(p)
	if isFrontlineManager(s.working, personId) {
		for i := range s.working {
			if s.working[i].ManagerId == personId {
				s.working[i].Team = team
				s.podMgr.unsafeReassign(&s.working[i])
			}
		}
	}
	s.podMgr.unsafeCleanup(s.working)
}

// applyManagerChange validates and applies a manager reassignment.
// Must be called with s.mu held.
func (s *OrgService) applyManagerChange(p *OrgNode, personId, newManagerId string, hasTeamField bool) error {
	if newManagerId != "" {
		if err := s.validateManagerChange(personId, newManagerId); err != nil {
			return err
		}
		if !hasTeamField {
			if _, mgr := s.findWorking(newManagerId); mgr != nil {
				p.Team = mgr.Team
			}
		}
	}
	p.ManagerId = newManagerId
	s.podMgr.unsafeReassign(p)
	s.podMgr.unsafeCleanup(s.working)
	return nil
}

// applyPodChange assigns or clears a node's pod, auto-creating if needed.
// Must be called with s.mu held.
func (s *OrgService) applyPodChange(p *OrgNode, podName string) {
	if podName == "" {
		p.Pod = ""
		s.podMgr.unsafeCleanup(s.working)
		return
	}
	pod := findPod(s.podMgr.unsafeGetPods(), podName, p.ManagerId)
	if pod == nil {
		s.podMgr.unsafeSetPods(append(s.podMgr.unsafeGetPods(), Pod{
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
