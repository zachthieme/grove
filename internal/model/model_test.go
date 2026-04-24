package model

// Scenarios: CONTRACT-009 — all tests in this file

import "testing"

func TestNewOrg_ValidPeople(t *testing.T) {
	t.Parallel()
	people := []OrgNode{
		{OrgNodeFields: OrgNodeFields{Name: "Alice", Role: "VP", Discipline: "Engineering", Team: "Eng", Status: "Active"}},
		{OrgNodeFields: OrgNodeFields{Name: "Bob", Role: "Engineer", Discipline: "Engineering", Team: "Platform", Status: "Active"}, Manager: "Alice"},
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
	people := []OrgNode{
		{OrgNodeFields: OrgNodeFields{Name: "Alice", Role: "VP", Discipline: "Eng", Team: "Eng", Status: "Active"}},
		{OrgNodeFields: OrgNodeFields{Name: "Alice", Role: "PM", Discipline: "PM", Team: "PM", Status: "Active"}},
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
	people := []OrgNode{
		{OrgNodeFields: OrgNodeFields{Name: "Bob", Role: "Eng", Discipline: "Eng", Team: "Eng", Status: "Active"}, Manager: "Nobody"},
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
	people := []OrgNode{
		{OrgNodeFields: OrgNodeFields{Name: "Bob", Role: "Engineer", Discipline: "Eng", Team: "Platform", Status: "Active"}, Manager: "Alice"},
		{OrgNodeFields: OrgNodeFields{Name: "Alice", Role: "VP", Discipline: "Eng", Team: "Eng", Status: "Active"}},
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
	people := []OrgNode{
		{OrgNodeFields: OrgNodeFields{Name: "Alice", Role: "VP", Discipline: "Eng", Team: "Eng", Status: "TBD"}},
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
	// After validation relaxation, only Name and Status are required.
	// Missing Name should still produce a warning.
	people := []OrgNode{
		{OrgNodeFields: OrgNodeFields{Name: "", Role: "VP", Discipline: "Eng", Team: "Eng", Status: "Active"}},
	}
	org, err := NewOrg(people)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(org.Warnings) != 1 {
		t.Fatalf("expected 1 warning, got %d: %v", len(org.Warnings), org.Warnings)
	}
}

func TestNewOrg_TransferAllowsBlankRoleAndDiscipline(t *testing.T) {
	t.Parallel()
	people := []OrgNode{
		{OrgNodeFields: OrgNodeFields{Name: "Alice", Role: "VP", Discipline: "Eng", Team: "Eng", Status: "Active"}},
		{OrgNodeFields: OrgNodeFields{Name: "Incoming", Team: "Eng", Status: "Transfer In"}, Manager: "Alice"},
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
		StatusActive, StatusOpen,
		StatusTransferIn, StatusTransferOut,
		StatusBackfill, StatusPlanned,
	}
	for _, s := range allStatuses {
		role, disc := "Engineer", "Eng"
		if s == StatusTransferIn || s == StatusTransferOut || s == StatusPlanned {
			role, disc = "", ""
		}
		people := []OrgNode{
			{OrgNodeFields: OrgNodeFields{Name: "Test", Role: role, Discipline: disc, Team: "Eng", Status: s}},
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
		people := []OrgNode{
			{OrgNodeFields: OrgNodeFields{Name: "Test", Role: "Eng", Discipline: "Eng", Team: "Eng", Status: s}},
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
	people := []OrgNode{
		{OrgNodeFields: OrgNodeFields{Name: "", Role: "Eng", Discipline: "Eng", Status: "Bogus"}},
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
	for _, substr := range []string{"missing Name", "invalid status"} {
		if !contains(w, substr) {
			t.Errorf("expected warning to contain %q, got: %s", substr, w)
		}
	}
}

func TestNewOrg_WarningDoesNotBlockOtherRows(t *testing.T) {
	t.Parallel()
	people := []OrgNode{
		{OrgNodeFields: OrgNodeFields{Name: "Alice", Role: "VP", Discipline: "Eng", Team: "Eng", Status: "Active"}},
		{OrgNodeFields: OrgNodeFields{Status: "Bogus"}}, // bad row
		{OrgNodeFields: OrgNodeFields{Name: "Carol", Role: "Eng", Discipline: "Eng", Team: "Eng", Status: "Active"}, Manager: "Alice"},
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

func TestNewOrg_ActiveAllowsBlankRoleDisciplineTeam(t *testing.T) {
	t.Parallel()
	people := []OrgNode{
		{OrgNodeFields: OrgNodeFields{Name: "Alice", Status: "Active"}},
	}
	org, err := NewOrg(people)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(org.Warnings) != 0 {
		t.Errorf("expected 0 warnings, got %d: %v", len(org.Warnings), org.Warnings)
	}
}

func TestNewOrg_Empty(t *testing.T) {
	t.Parallel()
	_, err := NewOrg([]OrgNode{})
	if err == nil {
		t.Error("expected error for empty data")
	}
}

func TestValidStatuses_PersonType(t *testing.T) {
	t.Parallel()
	set := ValidStatuses("")
	for _, s := range []string{StatusActive, StatusOpen, StatusTransferIn, StatusTransferOut, StatusBackfill, StatusPlanned} {
		if !set[s] {
			t.Errorf("expected person status %q to be valid", s)
		}
	}
	for _, s := range []string{StatusDeprecated, StatusSunsetting} {
		if set[s] {
			t.Errorf("expected product status %q to be invalid for person type", s)
		}
	}
}

func TestValidStatuses_ProductType(t *testing.T) {
	t.Parallel()
	set := ValidStatuses("product")
	for _, s := range []string{StatusActive, StatusDeprecated, StatusPlanned, StatusSunsetting} {
		if !set[s] {
			t.Errorf("expected product status %q to be valid", s)
		}
	}
	for _, s := range []string{StatusOpen, StatusTransferIn, StatusTransferOut, StatusBackfill} {
		if set[s] {
			t.Errorf("expected person status %q to be invalid for product type", s)
		}
	}
}

func TestNewOrg_ProductStatusValid(t *testing.T) {
	t.Parallel()
	for _, s := range []string{StatusActive, StatusDeprecated, StatusPlanned, StatusSunsetting} {
		people := []OrgNode{
			{OrgNodeFields: OrgNodeFields{Type: "product", Name: "Search", Status: s}},
		}
		org, err := NewOrg(people)
		if err != nil {
			t.Errorf("product status %q: unexpected error: %v", s, err)
			continue
		}
		if len(org.Warnings) != 0 {
			t.Errorf("product status %q should be valid but got warnings: %v", s, org.Warnings)
		}
	}
}

func TestNewOrg_ProductStatusInvalidForPerson(t *testing.T) {
	t.Parallel()
	for _, s := range []string{StatusDeprecated, StatusSunsetting} {
		people := []OrgNode{
			{OrgNodeFields: OrgNodeFields{Name: "Alice", Status: s}},
		}
		org, err := NewOrg(people)
		if err != nil {
			t.Errorf("status %q: unexpected error: %v", s, err)
			continue
		}
		if len(org.Warnings) == 0 {
			t.Errorf("product-only status %q should warn on a person node", s)
		}
	}
}

func TestNewOrg_PersonStatusInvalidForProduct(t *testing.T) {
	t.Parallel()
	for _, s := range []string{StatusOpen, StatusTransferIn, StatusTransferOut, StatusBackfill} {
		people := []OrgNode{
			{OrgNodeFields: OrgNodeFields{Type: "product", Name: "Search", Status: s}},
		}
		org, err := NewOrg(people)
		if err != nil {
			t.Errorf("status %q: unexpected error: %v", s, err)
			continue
		}
		if len(org.Warnings) == 0 {
			t.Errorf("person-only status %q should warn on a product node", s)
		}
	}
}
