package model

import "testing"

func TestNewOrg_ValidPeople(t *testing.T) {
	t.Parallel()
	people := []Person{
		{Name: "Alice", Role: "VP", Discipline: "Engineering", Manager: "", Team: "Eng", Status: "Active"},
		{Name: "Bob", Role: "Engineer", Discipline: "Engineering", Manager: "Alice", Team: "Platform", Status: "Active"},
	}
	org, err := NewOrg(people)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(org.People) != 2 {
		t.Errorf("expected 2 people, got %d", len(org.People))
	}
	if len(org.Warnings) != 0 {
		t.Errorf("expected 0 warnings, got %d", len(org.Warnings))
	}
}

func TestNewOrg_DuplicateNameAllowed(t *testing.T) {
	t.Parallel()
	people := []Person{
		{Name: "Alice", Role: "VP", Discipline: "Eng", Manager: "", Team: "Eng", Status: "Active"},
		{Name: "Alice", Role: "PM", Discipline: "PM", Manager: "", Team: "PM", Status: "Active"},
	}
	org, err := NewOrg(people)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(org.People) != 2 {
		t.Errorf("expected 2 people, got %d", len(org.People))
	}
}

func TestNewOrg_DanglingManagerAllowed(t *testing.T) {
	t.Parallel()
	people := []Person{
		{Name: "Bob", Role: "Eng", Discipline: "Eng", Manager: "Nobody", Team: "Eng", Status: "Active"},
	}
	org, err := NewOrg(people)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(org.People) != 1 {
		t.Errorf("expected 1 person, got %d", len(org.People))
	}
}

func TestNewOrg_AnyOrderAllowed(t *testing.T) {
	t.Parallel()
	people := []Person{
		{Name: "Bob", Role: "Engineer", Discipline: "Eng", Manager: "Alice", Team: "Platform", Status: "Active"},
		{Name: "Alice", Role: "VP", Discipline: "Eng", Manager: "", Team: "Eng", Status: "Active"},
	}
	org, err := NewOrg(people)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(org.People) != 2 {
		t.Errorf("expected 2 people, got %d", len(org.People))
	}
}

func TestNewOrg_InvalidStatusWarns(t *testing.T) {
	t.Parallel()
	people := []Person{
		{Name: "Alice", Role: "VP", Discipline: "Eng", Manager: "", Team: "Eng", Status: "TBD"},
	}
	org, err := NewOrg(people)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(org.Warnings) != 1 {
		t.Fatalf("expected 1 warning, got %d", len(org.Warnings))
	}
	if org.People[0].Warning == "" {
		t.Error("expected warning on person")
	}
}

func TestNewOrg_MissingFieldWarns(t *testing.T) {
	t.Parallel()
	people := []Person{
		{Name: "Alice", Role: "", Discipline: "Eng", Manager: "", Team: "Eng", Status: "Active"},
	}
	org, err := NewOrg(people)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(org.Warnings) != 1 {
		t.Fatalf("expected 1 warning, got %d", len(org.Warnings))
	}
}

func TestNewOrg_TransferAllowsBlankRoleAndDiscipline(t *testing.T) {
	t.Parallel()
	people := []Person{
		{Name: "Alice", Role: "VP", Discipline: "Eng", Manager: "", Team: "Eng", Status: "Active"},
		{Name: "Incoming", Role: "", Discipline: "", Manager: "Alice", Team: "Eng", Status: "Transfer In"},
	}
	org, err := NewOrg(people)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(org.Warnings) != 0 {
		t.Errorf("expected 0 warnings, got %d: %v", len(org.Warnings), org.Warnings)
	}
}

func TestNewOrg_NewStatuses(t *testing.T) {
	t.Parallel()
	allStatuses := []string{
		StatusActive, StatusOpen, StatusPendingOpen,
		StatusTransferIn, StatusTransferOut,
		StatusBackfill, StatusPlanned,
	}
	for _, s := range allStatuses {
		role, disc := "Engineer", "Eng"
		if s == StatusTransferIn || s == StatusTransferOut || s == StatusPendingOpen || s == StatusPlanned {
			role, disc = "", ""
		}
		people := []Person{
			{Name: "Test", Role: role, Discipline: disc, Manager: "", Team: "Eng", Status: s},
		}
		org, err := NewOrg(people)
		if err != nil {
			t.Errorf("status %q: unexpected error: %v", s, err)
		}
		if len(org.Warnings) != 0 {
			t.Errorf("status %q should be valid but got warnings: %v", s, org.Warnings)
		}
	}
}

func TestNewOrg_OldStatusesWarn(t *testing.T) {
	t.Parallel()
	oldStatuses := []string{"Hiring", "Transfer"}
	for _, s := range oldStatuses {
		people := []Person{
			{Name: "Test", Role: "Eng", Discipline: "Eng", Manager: "", Team: "Eng", Status: s},
		}
		org, err := NewOrg(people)
		if err != nil {
			t.Errorf("status %q: unexpected error: %v", s, err)
			continue
		}
		if len(org.Warnings) == 0 {
			t.Errorf("old status %q should produce a warning", s)
		}
	}
}

func TestNewOrg_MultipleWarnings(t *testing.T) {
	t.Parallel()
	// A single row missing name, team, and with invalid status should get all issues in one warning.
	people := []Person{
		{Name: "", Role: "Eng", Discipline: "Eng", Manager: "", Team: "", Status: "Bogus"},
	}
	org, err := NewOrg(people)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(org.Warnings) != 1 {
		t.Fatalf("expected 1 warning (covering multiple issues), got %d", len(org.Warnings))
	}
	w := org.People[0].Warning
	if w == "" {
		t.Fatal("expected non-empty warning on person")
	}
	// Should mention all three problems
	for _, substr := range []string{"missing Name", "missing Team", "invalid status"} {
		if !contains(w, substr) {
			t.Errorf("expected warning to contain %q, got: %s", substr, w)
		}
	}
}

func TestNewOrg_WarningDoesNotBlockOtherRows(t *testing.T) {
	t.Parallel()
	people := []Person{
		{Name: "Alice", Role: "VP", Discipline: "Eng", Manager: "", Team: "Eng", Status: "Active"},
		{Name: "", Role: "", Discipline: "", Manager: "", Team: "", Status: "Bogus"}, // bad row
		{Name: "Carol", Role: "Eng", Discipline: "Eng", Manager: "Alice", Team: "Eng", Status: "Active"},
	}
	org, err := NewOrg(people)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// All 3 rows should be present
	if len(org.People) != 3 {
		t.Errorf("expected 3 people, got %d", len(org.People))
	}
	// Only the bad row should have a warning
	if org.People[0].Warning != "" {
		t.Errorf("expected no warning on Alice, got: %s", org.People[0].Warning)
	}
	if org.People[1].Warning == "" {
		t.Error("expected warning on the bad row")
	}
	if org.People[2].Warning != "" {
		t.Errorf("expected no warning on Carol, got: %s", org.People[2].Warning)
	}
	// Should have exactly 1 warning
	if len(org.Warnings) != 1 {
		t.Errorf("expected 1 warning, got %d", len(org.Warnings))
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsSubstr(s, substr))
}

func containsSubstr(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}

func TestNewOrg_Empty(t *testing.T) {
	t.Parallel()
	_, err := NewOrg([]Person{})
	if err == nil {
		t.Error("expected error for empty data")
	}
}
