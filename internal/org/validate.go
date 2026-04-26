package org

import (
	"strings"

	"github.com/zachthieme/grove/internal/apitypes"
	"github.com/zachthieme/grove/internal/model"
)

const (
	maxFieldLen = 500
	maxNoteLen  = 2000
)

// validateNodeUpdate checks field lengths on a OrgNodeUpdate struct.
// Short fields use maxFieldLen; note fields use maxNoteLen.
func validateNodeUpdate(u *apitypes.OrgNodeUpdate) error {
	shortFields := []*string{
		u.Name, u.Role, u.Discipline, u.Team, u.ManagerId,
		u.Status, u.EmploymentType, u.AdditionalTeams,
		u.NewRole, u.NewTeam, u.Pod,
	}
	for _, v := range shortFields {
		if v != nil && len(*v) > maxFieldLen {
			return ErrValidation("field value too long (max %d characters)", maxFieldLen)
		}
	}
	noteFields := []*string{u.PublicNote, u.PrivateNote}
	for _, v := range noteFields {
		if v != nil && len(*v) > maxNoteLen {
			return ErrValidation("note too long (max %d characters)", maxNoteLen)
		}
	}
	if u.Type != nil && *u.Type != model.NodeTypePerson && *u.Type != model.NodeTypeProduct {
		return ErrValidation("invalid type '%s'", *u.Type)
	}
	return nil
}

// validateFieldLengths checks that all string values in fields don't exceed maxFieldLen.
func validateFieldLengths(fields map[string]string) error {
	for _, v := range fields {
		if len(v) > maxFieldLen {
			return ErrValidation("field value too long (max %d characters)", maxFieldLen)
		}
	}
	return nil
}

// validateNoteLen returns an error if the note value exceeds maxNoteLen.
func validateNoteLen(value string) error {
	if len(value) > maxNoteLen {
		return ErrValidation("note too long (max %d characters)", maxNoteLen)
	}
	return nil
}

// findInSlice finds a node by ID with a linear scan. Use only when no index
// is available (tests, fuzz harness). OrgService callers should use findWorking,
// which is O(1) via idIndex.
func findInSlice(nodes []apitypes.OrgNode, id string) (int, *apitypes.OrgNode) {
	for i := range nodes {
		if nodes[i].Id == id {
			return i, &nodes[i]
		}
	}
	return -1, nil
}

// findByID looks up a node via an index map and verifies the entry against the
// slice. Returns (-1, nil) on miss or stale index. O(1).
func findByID(nodes []apitypes.OrgNode, idIndex map[string]int, id string) (int, *apitypes.OrgNode) {
	if i, ok := idIndex[id]; ok && i < len(nodes) && nodes[i].Id == id {
		return i, &nodes[i]
	}
	return -1, nil
}

// isFrontlineManager returns true if personId has direct reports but none of
// those reports have reports of their own.
func isFrontlineManager(working []apitypes.OrgNode, personId string) bool {
	// Build set of IDs that have at least one direct report (O(n))
	hasReports := make(map[string]bool, len(working)/4)
	for _, p := range working {
		if p.ManagerId != "" {
			hasReports[p.ManagerId] = true
		}
	}
	if !hasReports[personId] {
		return false
	}
	// Check if any direct report is also a manager (O(n))
	for _, p := range working {
		if p.ManagerId == personId && hasReports[p.Id] {
			return false // has a sub-manager → not front-line
		}
	}
	return true
}

// validateManagerChange checks that setting person's manager to newManagerId is
// valid against the working slice + idIndex. Cycle detection is O(depth) thanks
// to the index lookup.
func validateManagerChange(working []apitypes.OrgNode, idIndex map[string]int, personId, newManagerId string) error {
	if newManagerId == personId {
		return ErrValidation("a person cannot be their own manager")
	}
	_, mgr := findByID(working, idIndex, newManagerId)
	if mgr == nil {
		return ErrNotFound("manager %s not found", newManagerId)
	}
	if model.IsProduct(mgr.Type) {
		return ErrValidation("cannot report to a product")
	}
	if wouldCreateCycle(working, idIndex, personId, newManagerId) {
		return ErrValidation("this move would create a circular reporting chain")
	}
	return nil
}

// wouldCreateCycle reports whether setting personId's manager to newManagerId
// would create a cycle (newManagerId is a descendant of personId).
func wouldCreateCycle(working []apitypes.OrgNode, idIndex map[string]int, personId, newManagerId string) bool {
	current := newManagerId
	visited := map[string]bool{personId: true}
	for current != "" {
		if visited[current] {
			return true
		}
		visited[current] = true
		_, p := findByID(working, idIndex, current)
		if p == nil {
			return false
		}
		current = p.ManagerId
	}
	return false
}

// validateManagerChange is a convenience method on OrgService that uses the
// service's idIndex. Must be called with s.mu held.
func (s *OrgService) validateManagerChange(personId, newManagerId string) error {
	return validateManagerChange(s.working, s.idIndex, personId, newManagerId)
}

// validateSettings checks that discipline order entries are non-empty, unique,
// and don't contain characters that break CSV export (newlines, NUL).
// It normalizes entries in-place (trims whitespace) so the stored value matches
// what was validated.
func validateSettings(s *apitypes.Settings) error {
	seen := make(map[string]bool, len(s.DisciplineOrder))
	for i, d := range s.DisciplineOrder {
		d = strings.TrimSpace(d)
		s.DisciplineOrder[i] = d
		if d == "" {
			return ErrValidation("discipline name cannot be empty")
		}
		if strings.ContainsAny(d, "\n\r\x00") {
			return ErrValidation("discipline name contains invalid characters")
		}
		if len(d) > maxFieldLen {
			return ErrValidation("discipline name too long (max %d characters)", maxFieldLen)
		}
		if seen[d] {
			return ErrValidation("duplicate discipline name: %s", d)
		}
		seen[d] = true
	}
	return nil
}

// mergeWarnings combines a base warning string with additional warning slices,
// joining all non-empty parts with "; ".
func mergeWarnings(base string, extras ...[]string) string {
	parts := make([]string, 0, 4)
	if base != "" {
		parts = append(parts, base)
	}
	for _, ws := range extras {
		for _, w := range ws {
			if w != "" {
				parts = append(parts, w)
			}
		}
	}
	return strings.Join(parts, "; ")
}
