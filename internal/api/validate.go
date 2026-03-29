package api

import (
	"errors"
	"fmt"
	"strings"
)

// Error types for distinguishing HTTP status codes in handlers.
type (
	// ValidationError indicates invalid input data (422).
	ValidationError struct{ msg string }
	// NotFoundError indicates a requested resource doesn't exist (404).
	NotFoundError struct{ msg string }
	// ConflictError indicates a duplicate or conflicting state (409).
	ConflictError struct{ msg string }
)

func (e *ValidationError) Error() string { return e.msg }
func (e *NotFoundError) Error() string   { return e.msg }
func (e *ConflictError) Error() string   { return e.msg }

// Error constructors
func errValidation(format string, args ...any) error { return &ValidationError{fmt.Sprintf(format, args...)} }
func errNotFound(format string, args ...any) error   { return &NotFoundError{fmt.Sprintf(format, args...)} }
func errConflict(format string, args ...any) error    { return &ConflictError{fmt.Sprintf(format, args...)} }

// isNotFound checks if an error is a NotFoundError.
func isNotFound(err error) bool {
	var e *NotFoundError
	return errors.As(err, &e)
}

// isConflict checks if an error is a ConflictError.
func isConflict(err error) bool {
	var e *ConflictError
	return errors.As(err, &e)
}

// isValidation checks if an error is a ValidationError.
func isValidation(err error) bool {
	var e *ValidationError
	return errors.As(err, &e)
}

const (
	maxFieldLen = 500
	maxNoteLen  = 2000
)

// validatePersonUpdate checks field lengths on a PersonUpdate struct.
// Short fields use maxFieldLen; note fields use maxNoteLen.
func validatePersonUpdate(u *PersonUpdate) error {
	shortFields := []*string{
		u.Name, u.Role, u.Discipline, u.Team, u.ManagerId,
		u.Status, u.EmploymentType, u.AdditionalTeams,
		u.NewRole, u.NewTeam, u.Pod,
	}
	for _, v := range shortFields {
		if v != nil && len(*v) > maxFieldLen {
			return errValidation("field value too long (max %d characters)", maxFieldLen)
		}
	}
	noteFields := []*string{u.PublicNote, u.PrivateNote}
	for _, v := range noteFields {
		if v != nil && len(*v) > maxNoteLen {
			return errValidation("note too long (max %d characters)", maxNoteLen)
		}
	}
	return nil
}

// validateFieldLengths checks that all string values in fields don't exceed maxFieldLen.
func validateFieldLengths(fields map[string]string) error {
	for _, v := range fields {
		if len(v) > maxFieldLen {
			return errValidation("field value too long (max %d characters)", maxFieldLen)
		}
	}
	return nil
}

// validateNoteLen returns an error if the note value exceeds maxNoteLen.
func validateNoteLen(value string) error {
	if len(value) > maxNoteLen {
		return errValidation("note too long (max %d characters)", maxNoteLen)
	}
	return nil
}

// findInSlice finds a person by ID in a people slice. Returns the index and a
// pointer into the slice, or (-1, nil) if not found.
func findInSlice(people []Person, id string) (int, *Person) {
	for i := range people {
		if people[i].Id == id {
			return i, &people[i]
		}
	}
	return -1, nil
}

// isFrontlineManager returns true if personId has direct reports but none of
// those reports have reports of their own.
func isFrontlineManager(working []Person, personId string) bool {
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

// validateManagerChange checks that setting person's manager to newManagerId is valid.
func validateManagerChange(working []Person, personId, newManagerId string) error {
	if newManagerId == personId {
		return errValidation("a person cannot be their own manager")
	}
	if _, mgr := findInSlice(working, newManagerId); mgr == nil {
		return errNotFound("manager %s not found", newManagerId)
	}
	if wouldCreateCycle(working, personId, newManagerId) {
		return errValidation("this move would create a circular reporting chain")
	}
	return nil
}

// wouldCreateCycle checks if setting personId's manager to newManagerId
// would create a cycle. This happens if newManagerId is a descendant of personId.
func wouldCreateCycle(working []Person, personId, newManagerId string) bool {
	current := newManagerId
	visited := map[string]bool{personId: true}
	for current != "" {
		if visited[current] {
			return true
		}
		visited[current] = true
		_, p := findInSlice(working, current)
		if p == nil {
			return false
		}
		current = p.ManagerId
	}
	return false
}

// validateSettings checks that discipline order entries are non-empty, unique,
// and don't contain characters that break CSV export (newlines, NUL).
// It normalizes entries in-place (trims whitespace) so the stored value matches
// what was validated.
func validateSettings(s *Settings) error {
	seen := make(map[string]bool, len(s.DisciplineOrder))
	for i, d := range s.DisciplineOrder {
		d = strings.TrimSpace(d)
		s.DisciplineOrder[i] = d
		if d == "" {
			return errValidation("discipline name cannot be empty")
		}
		if strings.ContainsAny(d, "\n\r\x00") {
			return errValidation("discipline name contains invalid characters")
		}
		if len(d) > maxFieldLen {
			return errValidation("discipline name too long (max %d characters)", maxFieldLen)
		}
		if seen[d] {
			return errValidation("duplicate discipline name: %s", d)
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
