package org

import (
	"context"
	"strings"

	"github.com/google/uuid"
	"github.com/zachthieme/grove/internal/apitypes"
	"github.com/zachthieme/grove/internal/model"
	"github.com/zachthieme/grove/internal/pod"
)

// Move reassigns a person's manager, team, and/or pod. Empty strings mean
// "no change" for team and pod; an empty newManagerId reassigns the person to
// the root (no manager).
func (s *OrgService) Move(ctx context.Context, personId, newManagerId, newTeam, newPod string) (*MoveResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, p := s.findWorking(personId)
	if p == nil {
		return nil, ErrNotFound("person %s not found", personId)
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
		s.podMgr.Reassign(p)
		s.podMgr.Cleanup(s.working)
	}
	return &MoveResult{Working: deepCopyNodes(s.working), Pods: pod.Copy(s.podMgr.Pods())}, nil
}

func (s *OrgService) Update(ctx context.Context, personId string, fields apitypes.OrgNodeUpdate) (*MoveResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := validateNodeUpdate(&fields); err != nil {
		return nil, err
	}

	_, p := s.findWorking(personId)
	if p == nil {
		return nil, ErrNotFound("person %s not found", personId)
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

	return &MoveResult{Working: deepCopyNodes(s.working), Pods: pod.Copy(s.podMgr.Pods())}, nil
}

// applyTypeChange flips Type and, when switching to product, clears the
// person-only fields. If the caller omitted Status and the existing status
// isn't valid under the new Type, defaults to Active so the node is never
// left in an invalid state. Active is valid for both types.
func applyTypeChange(p *apitypes.OrgNode, fields apitypes.OrgNodeUpdate) {
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
func applyIdentityFields(p *apitypes.OrgNode, fields apitypes.OrgNodeUpdate) {
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
func applyStatus(p *apitypes.OrgNode, fields apitypes.OrgNodeUpdate) error {
	if fields.Status == nil {
		return nil
	}
	if !model.ValidStatuses(p.Type)[*fields.Status] {
		return ErrValidation("invalid status '%s'", *fields.Status)
	}
	p.Status = *fields.Status
	return nil
}

// applyNotes writes public/private notes. Length already enforced upstream by
// validateNodeUpdate.
func applyNotes(p *apitypes.OrgNode, fields apitypes.OrgNodeUpdate) {
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
			return nil, ErrNotFound("person %s not found", id)
		}
	}
	for i, id := range personIds {
		s.working[s.idIndex[id]].SortIndex = i
	}
	return &MoveResult{Working: deepCopyNodes(s.working), Pods: pod.Copy(s.podMgr.Pods())}, nil
}

func (s *OrgService) Add(ctx context.Context, p apitypes.OrgNode) (apitypes.OrgNode, []apitypes.OrgNode, []apitypes.Pod, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	fields := map[string]string{
		"name": p.Name, "role": p.Role,
		"discipline": p.Discipline, "team": p.Team,
	}
	if err := validateFieldLengths(fields); err != nil {
		return apitypes.OrgNode{}, nil, nil, err
	}
	if p.Type != "" && p.Type != model.NodeTypePerson && p.Type != model.NodeTypeProduct {
		return apitypes.OrgNode{}, nil, nil, ErrValidation("invalid type '%s'", p.Type)
	}
	if p.Status != "" && !model.ValidStatuses(p.Type)[p.Status] {
		return apitypes.OrgNode{}, nil, nil, ErrValidation("invalid status '%s'", p.Status)
	}
	if p.ManagerId != "" {
		if _, mgr := s.findWorking(p.ManagerId); mgr == nil {
			return apitypes.OrgNode{}, nil, nil, ErrNotFound("manager %s not found", p.ManagerId)
		}
	}
	if !model.IsProduct(p.Type) && p.EmploymentType == "" {
		p.EmploymentType = "FTE"
	}
	p.Id = uuid.NewString()
	s.working = append(s.working, p)
	s.rebuildIndex()
	s.podMgr.Reassign(&s.working[len(s.working)-1])
	return p, deepCopyNodes(s.working), pod.Copy(s.podMgr.Pods()), nil
}

func (s *OrgService) AddParent(ctx context.Context, childId, name string) (apitypes.OrgNode, []apitypes.OrgNode, []apitypes.Pod, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return apitypes.OrgNode{}, nil, nil, ErrValidation("name is required")
	}
	if len(name) > maxFieldLen {
		return apitypes.OrgNode{}, nil, nil, ErrValidation("name too long (max %d characters)", maxFieldLen)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	_, child := s.findWorking(childId)
	if child == nil {
		return apitypes.OrgNode{}, nil, nil, ErrNotFound("person %s not found", childId)
	}

	parent := apitypes.OrgNode{
		OrgNodeFields: model.OrgNodeFields{Name: name, Status: "Active"},
		Id:            uuid.NewString(),
	}

	// Insert between child and its existing manager (if any)
	parent.ManagerId = child.ManagerId
	parent.Team = child.Team
	child.ManagerId = parent.Id

	s.working = append(s.working, parent)
	s.rebuildIndex()
	s.podMgr.Reassign(&s.working[len(s.working)-1])
	return parent, deepCopyNodes(s.working), pod.Copy(s.podMgr.Pods()), nil
}

// CopySubtree duplicates a forest of subtrees rooted at rootIds and attaches
// the copies under targetParentId. Each copied node gets a fresh UUID;
// internal manager edges within the copied forest are remapped to the new
// IDs. Pods owned by copied managers are also duplicated under the
// corresponding copy so descendants don't lose their pod assignment.
//
// Returns idMap (oldId → newId) so callers can locate the new copies — the
// rapid-add UI uses this to auto-select the first new copy after paste.
//
// Validation: targetParentId must exist (or be empty for root-level paste)
// and must not be a product. rootIds must all exist in working. A rootId
// that is already a descendant of another rootId is auto-demoted (only the
// topmost ancestor is treated as a true root); the descendant copy still
// happens, just nested under its ancestor's copy.
func (s *OrgService) CopySubtree(ctx context.Context, rootIds []string, targetParentId string) (map[string]string, []apitypes.OrgNode, []apitypes.Pod, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if len(rootIds) == 0 {
		return nil, nil, nil, ErrValidation("rootIds is required")
	}

	if targetParentId != "" {
		_, target := s.findWorking(targetParentId)
		if target == nil {
			return nil, nil, nil, ErrNotFound("target %s not found", targetParentId)
		}
		if model.IsProduct(target.Type) {
			return nil, nil, nil, ErrValidation("cannot copy under a product")
		}
	}

	rootSet := make(map[string]bool, len(rootIds))
	for _, id := range rootIds {
		if _, n := s.findWorking(id); n == nil {
			return nil, nil, nil, ErrNotFound("node %s not found", id)
		}
		rootSet[id] = true
	}

	// Build childrenByParent index for the BFS.
	childrenByParent := make(map[string][]string, len(s.working))
	for _, n := range s.working {
		childrenByParent[n.ManagerId] = append(childrenByParent[n.ManagerId], n.Id)
	}

	// Collect every node id in the copy set via BFS from each root.
	toCopy := make([]string, 0)
	seen := make(map[string]bool)
	for _, root := range rootIds {
		if seen[root] {
			continue
		}
		queue := []string{root}
		for len(queue) > 0 {
			id := queue[0]
			queue = queue[1:]
			if seen[id] {
				continue
			}
			seen[id] = true
			toCopy = append(toCopy, id)
			queue = append(queue, childrenByParent[id]...)
		}
	}

	// Demote roots whose ancestor is also a root — only the topmost ancestor
	// reparents to targetParentId; nested roots stay as descendants in the
	// copy (their copy's manager is its ancestor's copy via idMap).
	for _, id := range rootIds {
		_, src := s.findWorking(id)
		if src == nil {
			continue
		}
		current := src.ManagerId
		for current != "" {
			if rootSet[current] {
				delete(rootSet, id)
				break
			}
			_, parent := s.findWorking(current)
			if parent == nil {
				break
			}
			current = parent.ManagerId
		}
	}

	idMap := make(map[string]string, len(toCopy))
	for _, id := range toCopy {
		idMap[id] = uuid.NewString()
	}

	// Duplicate pods owned by copied managers BEFORE adding nodes — so
	// Reassign during node insertion finds the new pods under the new
	// managers and preserves descendants' pod assignments.
	srcPods := s.podMgr.Pods()
	for _, p := range srcPods {
		newMgrId, ok := idMap[p.ManagerId]
		if !ok {
			continue
		}
		np := p
		np.Id = uuid.NewString()
		np.ManagerId = newMgrId
		srcPods = append(srcPods, np)
	}
	s.podMgr.SetPods(srcPods)

	// Build new nodes — manager edges remapped via idMap, roots reparent
	// to targetParentId. Slice fields deep-copied to avoid sharing.
	newNodes := make([]apitypes.OrgNode, 0, len(toCopy))
	for _, id := range toCopy {
		_, src := s.findWorking(id)
		if src == nil {
			continue
		}
		copied := *src
		copied.Id = idMap[id]
		if len(src.AdditionalTeams) > 0 {
			copied.AdditionalTeams = append([]string(nil), src.AdditionalTeams...)
		}
		if rootSet[id] {
			copied.ManagerId = targetParentId
		} else {
			copied.ManagerId = idMap[src.ManagerId]
		}
		newNodes = append(newNodes, copied)
	}

	startIdx := len(s.working)
	s.working = append(s.working, newNodes...)
	s.rebuildIndex()
	for i := startIdx; i < len(s.working); i++ {
		s.podMgr.Reassign(&s.working[i])
	}

	return idMap, deepCopyNodes(s.working), pod.Copy(s.podMgr.Pods()), nil
}

func (s *OrgService) Delete(ctx context.Context, personId string) (*MutationResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	idx, _ := s.findWorking(personId)
	if idx == -1 {
		return nil, ErrNotFound("person %s not found", personId)
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
		Working:  deepCopyNodes(s.working),
		Recycled: deepCopyNodes(s.recycled),
		Pods:     pod.Copy(s.podMgr.Pods()),
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
		return nil, ErrNotFound("person %s not found in recycled", personId)
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
		Working:  deepCopyNodes(s.working),
		Recycled: deepCopyNodes(s.recycled),
		Pods:     pod.Copy(s.podMgr.Pods()),
	}, nil
}

func (s *OrgService) EmptyBin(ctx context.Context) []apitypes.OrgNode {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.recycled = nil
	return []apitypes.OrgNode{}
}

// applyTeamChange updates a person's team and cascades to ICs of front-line managers.
// Must be called with s.mu held.
func (s *OrgService) applyTeamChange(p *apitypes.OrgNode, personId, team string) {
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
func (s *OrgService) applyManagerChange(p *apitypes.OrgNode, personId, newManagerId string, hasTeamField bool) error {
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
	s.podMgr.Reassign(p)
	s.podMgr.Cleanup(s.working)
	return nil
}

// applyPodChange assigns or clears a node's pod, auto-creating if needed.
// Must be called with s.mu held.
func (s *OrgService) applyPodChange(p *apitypes.OrgNode, podName string) {
	if podName == "" {
		p.Pod = ""
		s.podMgr.Cleanup(s.working)
		return
	}
	existing := pod.FindPod(s.podMgr.Pods(), podName, p.ManagerId)
	if existing == nil {
		s.podMgr.SetPods(append(s.podMgr.Pods(), apitypes.Pod{
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
