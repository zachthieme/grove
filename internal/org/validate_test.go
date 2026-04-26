package org

import "testing"

// Scenarios: ORG-009
func TestValidateNoteLen(t *testing.T) {
	t.Parallel()
	// Within limit
	if err := validateNoteLen("short note"); err != nil {
		t.Errorf("unexpected error for short note: %v", err)
	}

	// At limit
	longNote := make([]byte, maxNoteLen)
	for i := range longNote {
		longNote[i] = 'a'
	}
	if err := validateNoteLen(string(longNote)); err != nil {
		t.Errorf("unexpected error for note at limit: %v", err)
	}

	// Over limit
	tooLong := make([]byte, maxNoteLen+1)
	for i := range tooLong {
		tooLong[i] = 'a'
	}
	if err := validateNoteLen(string(tooLong)); err == nil {
		t.Error("expected error for note over limit")
	}
}
