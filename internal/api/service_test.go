package api

import (
	"context"
	"testing"
	"time"
)

func ptr[T any](v T) *T { return &v }

func newTestService(t *testing.T) *OrgService {
	t.Helper()
	svc := NewOrgService(NewMemorySnapshotStore())
	csv := []byte("Name,Role,Discipline,Manager,Team,Additional Teams,Status\nAlice,VP,Eng,,Eng,,Active\nBob,Engineer,Eng,Alice,Platform,,Active\nCarol,Engineer,Eng,Bob,Platform,,Active\n")
	resp, err := svc.Upload(context.Background(), "test.csv", csv)
	if err != nil {
		t.Fatalf("upload failed: %v", err)
	}
	if resp.Status != "ready" {
		t.Fatalf("expected status 'ready', got '%s'", resp.Status)
	}
	return svc
}

// Scenarios: UPLOAD-001
func TestOrgService_Upload(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	if data == nil {
		t.Fatal("expected org data after upload")
	}
	if len(data.Original) != 3 {
		t.Errorf("expected 3 original people, got %d", len(data.Original))
	}
	if len(data.Working) != 3 {
		t.Errorf("expected 3 working people, got %d", len(data.Working))
	}
	if data.Original[0].Id != data.Working[0].Id {
		t.Error("expected original and working to share IDs")
	}
}

// Scenarios: ORG-001
func TestOrgService_Move(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	carol := findByName(data.Working, "Carol")
	alice := findByName(data.Working, "Alice")

	result, err := svc.Move(context.Background(), carol.Id, alice.Id, "Eng")
	if err != nil {
		t.Fatalf("move failed: %v", err)
	}
	updated := findById(result.Working, carol.Id)
	if updated.ManagerId != alice.Id {
		t.Errorf("expected Carol's manager to be Alice, got %s", updated.ManagerId)
	}
	if updated.Team != "Eng" {
		t.Errorf("expected Carol's team to be Eng, got %s", updated.Team)
	}

	origCarol := findByName(svc.GetOrg(context.Background()).Original, "Carol")
	if origCarol.Team == "Eng" {
		t.Error("expected original Carol to still be on Platform")
	}
}

// Scenarios: ORG-004
func TestOrgService_Move_SetsPod(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	alice := findByName(data.Working, "Alice")
	bob := findByName(data.Working, "Bob")

	// Create a pod under Alice
	_, err := svc.CreatePod(context.Background(), alice.Id, "Alpha", "Eng")
	if err != nil {
		t.Fatalf("create pod failed: %v", err)
	}

	// Move Bob to Alice with pod "Alpha"
	result, err := svc.Move(context.Background(), bob.Id, alice.Id, "Eng", "Alpha")
	if err != nil {
		t.Fatalf("move failed: %v", err)
	}
	updated := findById(result.Working, bob.Id)
	if updated.Pod != "Alpha" {
		t.Errorf("expected Bob's pod to be Alpha, got %q", updated.Pod)
	}
}

// Scenarios: ORG-004
func TestOrgService_Move_EmptyPodIgnored(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	alice := findByName(data.Working, "Alice")
	carol := findByName(data.Working, "Carol")

	// Move with empty pod should not set pod field
	result, err := svc.Move(context.Background(), carol.Id, alice.Id, "Eng", "")
	if err != nil {
		t.Fatalf("move failed: %v", err)
	}
	updated := findById(result.Working, carol.Id)
	if updated.Pod != "" {
		t.Errorf("expected empty pod, got %q", updated.Pod)
	}
}

// Scenarios: ORG-005
func TestOrgService_Update(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	bob := findByName(data.Working, "Bob")

	result, err := svc.Update(context.Background(), bob.Id, PersonUpdate{Role: ptr("Senior Engineer"), Discipline: ptr("SRE")})
	if err != nil {
		t.Fatalf("update failed: %v", err)
	}
	updated := findById(result.Working, bob.Id)
	if updated.Role != "Senior Engineer" {
		t.Errorf("expected role 'Senior Engineer', got '%s'", updated.Role)
	}
	if updated.Discipline != "SRE" {
		t.Errorf("expected discipline 'SRE', got '%s'", updated.Discipline)
	}
}

// Scenarios: ORG-011
func TestOrgService_Add(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	alice := findByName(data.Working, "Alice")

	added, _, _, err := svc.Add(context.Background(), Person{
		Name: "Dave", Role: "Engineer", Discipline: "Eng",
		ManagerId: alice.Id, Team: "Eng", Status: "Active",
	})
	if err != nil {
		t.Fatalf("add failed: %v", err)
	}

	if added.Id == "" {
		t.Error("expected added person to have an ID")
	}

	working := svc.GetWorking(context.Background())
	if len(working) != 4 {
		t.Errorf("expected 4 people, got %d", len(working))
	}
}

// Scenarios: ORG-012
func TestOrgService_Delete(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	bob := findByName(data.Working, "Bob")
	carol := findByName(data.Working, "Carol")

	_, err := svc.Delete(context.Background(), bob.Id)
	if err != nil {
		t.Fatalf("delete failed: %v", err)
	}

	working := svc.GetWorking(context.Background())
	if len(working) != 2 {
		t.Errorf("expected 2 people, got %d", len(working))
	}

	updatedCarol := findById(working, carol.Id)
	if updatedCarol == nil {
		t.Fatal("expected Carol to still exist")
	}
	if updatedCarol.ManagerId != "" {
		t.Errorf("expected Carol to be unparented, got managerId %s", updatedCarol.ManagerId)
	}

	recycled := svc.GetRecycled(context.Background())
	if len(recycled) != 1 {
		t.Errorf("expected 1 recycled, got %d", len(recycled))
	}
}

// Scenarios: ORG-012
func TestOrgService_SoftDelete(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	bobId := findByName(data.Working, "Bob").Id
	carolId := findByName(data.Working, "Carol").Id

	_, err := svc.Delete(context.Background(), bobId)
	if err != nil {
		t.Fatalf("delete failed: %v", err)
	}

	working := svc.GetWorking(context.Background())
	if len(working) != 2 {
		t.Errorf("expected 2 working, got %d", len(working))
	}
	recycled := svc.GetRecycled(context.Background())
	if len(recycled) != 1 {
		t.Fatalf("expected 1 recycled, got %d", len(recycled))
	}
	if recycled[0].Id != bobId {
		t.Errorf("expected recycled person to be Bob")
	}
	updatedCarol := findById(working, carolId)
	if updatedCarol.ManagerId != "" {
		t.Errorf("expected Carol to be unparented, got %s", updatedCarol.ManagerId)
	}
}

// Scenarios: ORG-012
func TestOrgService_Restore(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	bobId := findByName(data.Working, "Bob").Id

	if _, err := svc.Delete(context.Background(), bobId); err != nil {
		t.Fatalf("delete failed: %v", err)
	}
	_, err := svc.Restore(context.Background(), bobId)
	if err != nil {
		t.Fatalf("restore failed: %v", err)
	}

	working := svc.GetWorking(context.Background())
	if len(working) != 3 {
		t.Errorf("expected 3 working, got %d", len(working))
	}
	recycled := svc.GetRecycled(context.Background())
	if len(recycled) != 0 {
		t.Errorf("expected 0 recycled, got %d", len(recycled))
	}
}

// Scenarios: ORG-012
func TestOrgService_Restore_ManagerGone(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	carolId := findByName(data.Working, "Carol").Id
	bobId := findByName(data.Working, "Bob").Id

	if _, err := svc.Delete(context.Background(), bobId); err != nil {
		t.Fatalf("delete bob: %v", err)
	}
	if _, err := svc.Delete(context.Background(), carolId); err != nil {
		t.Fatalf("delete carol: %v", err)
	}
	if _, err := svc.Restore(context.Background(), carolId); err != nil {
		t.Fatalf("restore carol: %v", err)
	}

	working := svc.GetWorking(context.Background())
	restoredCarol := findById(working, carolId)
	if restoredCarol.ManagerId != "" {
		t.Errorf("expected Carol unparented (manager Bob gone), got %s", restoredCarol.ManagerId)
	}
}

// Scenarios: ORG-014
func TestOrgService_EmptyBin(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	bobId := findByName(data.Working, "Bob").Id
	carolId := findByName(data.Working, "Carol").Id

	if _, err := svc.Delete(context.Background(), bobId); err != nil {
		t.Fatalf("delete bob: %v", err)
	}
	if _, err := svc.Delete(context.Background(), carolId); err != nil {
		t.Fatalf("delete carol: %v", err)
	}

	if len(svc.GetRecycled(context.Background())) != 2 {
		t.Fatalf("expected 2 recycled")
	}

	svc.EmptyBin(context.Background())
	if len(svc.GetRecycled(context.Background())) != 0 {
		t.Errorf("expected 0 recycled after empty bin")
	}
}

// Scenarios: UPLOAD-001
func TestOrgService_Upload_AutoProceed(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	csv := []byte("Name,Role,Discipline,Manager,Team,Additional Teams,Status\nAlice,VP,Eng,,Eng,,Active\n")
	resp, err := svc.Upload(context.Background(), "test.csv", csv)
	if err != nil {
		t.Fatalf("upload failed: %v", err)
	}
	if resp.Status != "ready" {
		t.Errorf("expected status 'ready', got '%s'", resp.Status)
	}
	if resp.OrgData == nil {
		t.Fatal("expected OrgData to be set")
	}
	if len(resp.OrgData.Original) != 1 {
		t.Errorf("expected 1 person, got %d", len(resp.OrgData.Original))
	}
}

// Scenarios: UPLOAD-002
func TestOrgService_Upload_NeedsMapping(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	// Use headers that won't all map to high confidence.
	// "Nombre" and "Nivel" are unrecognizable, so name/role won't be high.
	csv := []byte("Nombre,Nivel,Discipline,Manager,Team,Additional Teams,Status\nAlice,VP,Eng,,Eng,,Active\n")
	resp, err := svc.Upload(context.Background(), "test.csv", csv)
	if err != nil {
		t.Fatalf("upload failed: %v", err)
	}
	if resp.Status != "needs_mapping" {
		t.Errorf("expected status 'needs_mapping', got '%s'", resp.Status)
	}
	if resp.OrgData != nil {
		t.Error("expected OrgData to be nil for needs_mapping")
	}
	if len(resp.Headers) != 7 {
		t.Errorf("expected 7 headers, got %d", len(resp.Headers))
	}
	if resp.Mapping == nil {
		t.Fatal("expected mapping to be set")
	}
	if len(resp.Preview) < 2 {
		t.Errorf("expected at least 2 preview rows (header + data), got %d", len(resp.Preview))
	}
}

// Scenarios: UPLOAD-002
func TestOrgService_ConfirmMapping(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	// Use unrecognizable headers so InferMapping won't auto-proceed.
	csv := []byte("Nombre,Nivel,Discipline,Manager,Team,Additional Teams,Status\nAlice,VP,Eng,,Eng,,Active\nBob,Engineer,Eng,Alice,Platform,,Active\n")
	resp, err := svc.Upload(context.Background(), "test.csv", csv)
	if err != nil {
		t.Fatalf("upload failed: %v", err)
	}
	if resp.Status != "needs_mapping" {
		t.Fatalf("expected needs_mapping, got %s", resp.Status)
	}

	mapping := map[string]string{
		"name":            "Nombre",
		"role":            "Nivel",
		"discipline":      "Discipline",
		"manager":         "Manager",
		"team":            "Team",
		"additionalTeams": "Additional Teams",
		"status":          "Status",
	}
	orgData, err := svc.ConfirmMapping(context.Background(), mapping)
	if err != nil {
		t.Fatalf("confirm mapping failed: %v", err)
	}
	if len(orgData.Original) != 2 {
		t.Errorf("expected 2 original people, got %d", len(orgData.Original))
	}
	if len(orgData.Working) != 2 {
		t.Errorf("expected 2 working people, got %d", len(orgData.Working))
	}
}

// Scenarios: UPLOAD-003
func TestOrgService_ConfirmMapping_NoPending(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	_, err := svc.ConfirmMapping(context.Background(), map[string]string{"name": "Name"})
	if err == nil {
		t.Fatal("expected error when no pending file")
	}
}

// Scenarios: UPLOAD-008
func TestOrgService_ConfirmMapping_NonZip(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	csv := []byte("Full Name,Title,Department,Reports To,Group\nAlice,VP,Eng,,Eng\nBob,SWE,Eng,Alice,Platform\n")
	resp, err := svc.Upload(context.Background(), "test.csv", csv)
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	if resp.Status != "needs_mapping" {
		t.Skipf("headers were auto-mapped; skipping confirm test")
	}
	mapping := map[string]string{
		"name": "Full Name", "role": "Title", "discipline": "Department",
		"manager": "Reports To", "team": "Group",
	}
	data, err := svc.ConfirmMapping(context.Background(), mapping)
	if err != nil {
		t.Fatalf("confirm: %v", err)
	}
	if len(data.Working) != 2 {
		t.Errorf("expected 2 working, got %d", len(data.Working))
	}
}

// Scenarios: ORG-015
func TestOrgService_Reorder(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	alice := findByName(data.Working, "Alice")
	bob := findByName(data.Working, "Bob")
	carol := findByName(data.Working, "Carol")

	// Reorder: Carol first, then Alice, then Bob
	result, err := svc.Reorder(context.Background(), []string{carol.Id, alice.Id, bob.Id})
	if err != nil {
		t.Fatalf("reorder failed: %v", err)
	}

	carolUpdated := findById(result.Working, carol.Id)
	aliceUpdated := findById(result.Working, alice.Id)
	bobUpdated := findById(result.Working, bob.Id)

	if carolUpdated.SortIndex != 0 {
		t.Errorf("expected Carol sortIndex 0, got %d", carolUpdated.SortIndex)
	}
	if aliceUpdated.SortIndex != 1 {
		t.Errorf("expected Alice sortIndex 1, got %d", aliceUpdated.SortIndex)
	}
	if bobUpdated.SortIndex != 2 {
		t.Errorf("expected Bob sortIndex 2, got %d", bobUpdated.SortIndex)
	}
}

// Scenarios: ORG-015
func TestOrgService_Reorder_PartialIds(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	bob := findByName(data.Working, "Bob")

	// Only reorder Bob — others should be unaffected (SortIndex stays 0)
	result, err := svc.Reorder(context.Background(), []string{bob.Id})
	if err != nil {
		t.Fatalf("reorder failed: %v", err)
	}

	bobUpdated := findById(result.Working, bob.Id)
	if bobUpdated.SortIndex != 0 {
		t.Errorf("expected Bob sortIndex 0, got %d", bobUpdated.SortIndex)
	}
}

// Scenarios: ORG-016
func TestOrgService_ResetToOriginal(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	bob := findByName(data.Working, "Bob")
	alice := findByName(data.Working, "Alice")

	// Make some changes: move Bob under Alice, delete Carol
	carol := findByName(data.Working, "Carol")
	if _, err := svc.Move(context.Background(), bob.Id, alice.Id, "Eng"); err != nil {
		t.Fatalf("move failed: %v", err)
	}
	if _, err := svc.Delete(context.Background(), carol.Id); err != nil {
		t.Fatalf("delete failed: %v", err)
	}

	// Verify changes took effect
	if len(svc.GetWorking(context.Background())) != 2 {
		t.Fatalf("expected 2 working after delete, got %d", len(svc.GetWorking(context.Background())))
	}
	if len(svc.GetRecycled(context.Background())) != 1 {
		t.Fatalf("expected 1 recycled after delete, got %d", len(svc.GetRecycled(context.Background())))
	}

	// Reset
	orgData := svc.ResetToOriginal(context.Background())

	// Working should match original (3 people, original teams)
	if len(orgData.Working) != 3 {
		t.Errorf("expected 3 working after reset, got %d", len(orgData.Working))
	}
	if len(orgData.Original) != 3 {
		t.Errorf("expected 3 original after reset, got %d", len(orgData.Original))
	}

	// Recycled should be cleared
	recycled := svc.GetRecycled(context.Background())
	if len(recycled) != 0 {
		t.Errorf("expected 0 recycled after reset, got %d", len(recycled))
	}

	// Bob should be back on Platform team
	resetBob := findByName(orgData.Working, "Bob")
	if resetBob == nil {
		t.Fatal("expected Bob in working after reset")
	}
	if resetBob.Team != "Platform" {
		t.Errorf("expected Bob's team to be Platform after reset, got %s", resetBob.Team)
	}

	// Carol should be back
	resetCarol := findByName(orgData.Working, "Carol")
	if resetCarol == nil {
		t.Fatal("expected Carol in working after reset")
	}
}

// --- Additional Update field coverage ---

// Scenarios: ORG-005
func TestOrgService_Update_AllFields(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	bob := findByName(data.Working, "Bob")
	alice := findByName(data.Working, "Alice")

	// Update every supported field
	result, err := svc.Update(context.Background(), bob.Id, PersonUpdate{
		Name:            ptr("Robert"),
		Role:            ptr("Staff Engineer"),
		Discipline:      ptr("SRE"),
		Team:            ptr("Infra"),
		Status:          ptr("Transfer In"),
		ManagerId:       ptr(alice.Id),
		EmploymentType:  ptr("Contractor"),
		AdditionalTeams: ptr("Platform, Eng"),
		NewRole:         ptr("Principal"),
		NewTeam:         ptr("Cloud"),
	})
	if err != nil {
		t.Fatalf("update failed: %v", err)
	}
	updated := findById(result.Working, bob.Id)
	if updated.Name != "Robert" {
		t.Errorf("expected name 'Robert', got '%s'", updated.Name)
	}
	if updated.Status != "Transfer In" {
		t.Errorf("expected status 'Transfer In', got '%s'", updated.Status)
	}
	if updated.ManagerId != alice.Id {
		t.Errorf("expected managerId '%s', got '%s'", alice.Id, updated.ManagerId)
	}
	if updated.EmploymentType != "Contractor" {
		t.Errorf("expected employmentType 'Contractor', got '%s'", updated.EmploymentType)
	}
	if len(updated.AdditionalTeams) != 2 {
		t.Fatalf("expected 2 additional teams, got %d", len(updated.AdditionalTeams))
	}
	if updated.AdditionalTeams[0] != "Platform" || updated.AdditionalTeams[1] != "Eng" {
		t.Errorf("unexpected additional teams: %v", updated.AdditionalTeams)
	}
	if updated.NewRole != "Principal" {
		t.Errorf("expected newRole 'Principal', got '%s'", updated.NewRole)
	}
	if updated.NewTeam != "Cloud" {
		t.Errorf("expected newTeam 'Cloud', got '%s'", updated.NewTeam)
	}
	// Warning should be cleared on edit
	if updated.Warning != "" {
		t.Errorf("expected warning to be cleared, got '%s'", updated.Warning)
	}
}

// Scenarios: ORG-006
func TestOrgService_Update_InvalidStatus(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	bob := findByName(data.Working, "Bob")

	_, err := svc.Update(context.Background(), bob.Id, PersonUpdate{Status: ptr("INVALID")})
	if err == nil {
		t.Fatal("expected error for invalid status, got nil")
	}
}

// Scenarios: ORG-005, ORG-010
func TestOrgService_Update_AdditionalTeamsEmpty(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	bob := findByName(data.Working, "Bob")

	// First set additional teams
	if _, err := svc.Update(context.Background(), bob.Id, PersonUpdate{AdditionalTeams: ptr("Platform, Eng")}); err != nil {
		t.Fatalf("update failed: %v", err)
	}

	// Then clear them
	result, err := svc.Update(context.Background(), bob.Id, PersonUpdate{AdditionalTeams: ptr("")})
	if err != nil {
		t.Fatalf("update failed: %v", err)
	}
	updated := findById(result.Working, bob.Id)
	if updated.AdditionalTeams != nil {
		t.Errorf("expected nil additional teams, got %v", updated.AdditionalTeams)
	}
}

// Scenarios: ORG-005
func TestOrgService_Update_Private(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	bob := findByName(data.Working, "Bob")

	// Set private to true
	result, err := svc.Update(context.Background(), bob.Id, PersonUpdate{Private: ptr(true)})
	if err != nil {
		t.Fatalf("update failed: %v", err)
	}
	updated := findById(result.Working, bob.Id)
	if !updated.Private {
		t.Error("expected Private to be true")
	}

	// Set private to false
	result, err = svc.Update(context.Background(), bob.Id, PersonUpdate{Private: ptr(false)})
	if err != nil {
		t.Fatalf("update failed: %v", err)
	}
	updated = findById(result.Working, bob.Id)
	if updated.Private {
		t.Error("expected Private to be false")
	}
}

// Scenarios: ORG-008
func TestOrgService_Update_PersonNotFound(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	_, err := svc.Update(context.Background(), "nonexistent", PersonUpdate{Role: ptr("VP")})
	if err == nil {
		t.Fatal("expected error for nonexistent person")
	}
}

// Scenarios: ORG-003
func TestOrgService_Move_PersonNotFound(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	_, err := svc.Move(context.Background(), "nonexistent", "", "Eng")
	if err == nil {
		t.Fatal("expected error for nonexistent person")
	}
}

// Scenarios: ORG-003
func TestOrgService_Move_ManagerNotFound(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	bob := findByName(data.Working, "Bob")

	_, err := svc.Move(context.Background(), bob.Id, "nonexistent-manager", "Eng")
	if err == nil {
		t.Fatal("expected error for nonexistent manager")
	}
}

// Scenarios: ORG-001
func TestOrgService_Move_NoTeamChange(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	carol := findByName(data.Working, "Carol")
	alice := findByName(data.Working, "Alice")

	// Move with empty newTeam — team should stay the same
	result, err := svc.Move(context.Background(), carol.Id, alice.Id, "")
	if err != nil {
		t.Fatalf("move failed: %v", err)
	}
	updated := findById(result.Working, carol.Id)
	if updated.Team != "Platform" {
		t.Errorf("expected team to remain 'Platform', got '%s'", updated.Team)
	}
	if updated.ManagerId != alice.Id {
		t.Errorf("expected manager to be Alice, got '%s'", updated.ManagerId)
	}
}

// Scenarios: ORG-002
func TestOrgService_Move_SelfAsManager(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	bob := findByName(data.Working, "Bob")

	_, err := svc.Move(context.Background(), bob.Id, bob.Id, "")
	if err == nil {
		t.Fatal("expected error when moving person to be their own manager")
	}
}

// Scenarios: ORG-002
func TestOrgService_Move_CycleDetection(t *testing.T) {
	t.Parallel()
	// Alice -> Bob -> Carol
	// Moving Alice under Carol would create Alice -> Carol -> ... -> Alice
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	alice := findByName(data.Working, "Alice")
	carol := findByName(data.Working, "Carol")

	_, err := svc.Move(context.Background(), alice.Id, carol.Id, "")
	if err == nil {
		t.Fatal("expected error when creating circular manager chain")
	}
}

// Scenarios: ORG-002
func TestOrgService_Update_CycleDetection(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	alice := findByName(data.Working, "Alice")
	carol := findByName(data.Working, "Carol")

	// Alice -> Bob -> Carol; setting Alice's manager to Carol creates cycle
	_, err := svc.Update(context.Background(), alice.Id, PersonUpdate{ManagerId: ptr(carol.Id)})
	if err == nil {
		t.Fatal("expected error when creating circular manager chain via Update")
	}
}

// Scenarios: ORG-013
func TestOrgService_Delete_PersonNotFound(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	_, err := svc.Delete(context.Background(), "nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent person")
	}
}

// Scenarios: ORG-013
func TestOrgService_Restore_PersonNotFound(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	_, err := svc.Restore(context.Background(), "nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent person in recycled")
	}
}

// Scenarios: ORG-012
func TestOrgService_Delete_ReturnsBothArrays(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	bob := findByName(data.Working, "Bob")

	result, err := svc.Delete(context.Background(), bob.Id)
	if err != nil {
		t.Fatalf("delete failed: %v", err)
	}
	if result == nil {
		t.Fatal("expected non-nil MutationResult")
	}
	if len(result.Working) != 2 {
		t.Errorf("expected 2 working in result, got %d", len(result.Working))
	}
	if len(result.Recycled) != 1 {
		t.Errorf("expected 1 recycled in result, got %d", len(result.Recycled))
	}
	if result.Recycled[0].Id != bob.Id {
		t.Errorf("expected recycled person to be Bob, got %s", result.Recycled[0].Id)
	}

	// Verify the result is a deep copy (mutating it doesn't affect service state)
	result.Working[0].Name = "MUTATED"
	working := svc.GetWorking(context.Background())
	for _, p := range working {
		if p.Name == "MUTATED" {
			t.Error("expected result to be a deep copy, but mutation leaked to service state")
		}
	}
}

// Scenarios: ORG-012
func TestOrgService_Restore_ReturnsBothArrays(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	bob := findByName(data.Working, "Bob")

	if _, err := svc.Delete(context.Background(), bob.Id); err != nil {
		t.Fatalf("delete failed: %v", err)
	}

	result, err := svc.Restore(context.Background(), bob.Id)
	if err != nil {
		t.Fatalf("restore failed: %v", err)
	}
	if result == nil {
		t.Fatal("expected non-nil MutationResult")
	}
	if len(result.Working) != 3 {
		t.Errorf("expected 3 working in result, got %d", len(result.Working))
	}
	if len(result.Recycled) != 0 {
		t.Errorf("expected 0 recycled in result, got %d", len(result.Recycled))
	}
}

// Scenarios: UPLOAD-011
func TestOrgService_Upload_UnsupportedFormat(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	_, err := svc.Upload(context.Background(), "test.txt", []byte("hello"))
	if err == nil {
		t.Fatal("expected error for unsupported format")
	}
}

// Scenarios: UPLOAD-011
func TestOrgService_Upload_InvalidCSV(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	// Only header, no data row
	_, err := svc.Upload(context.Background(), "test.csv", []byte("Name,Role\n"))
	if err == nil {
		t.Fatal("expected error for CSV with no data rows")
	}
}

// Scenarios: CONTRACT-006
func TestOrgService_DeepCopyPeople_WithAdditionalTeams(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	bob := findByName(data.Working, "Bob")

	// Set additional teams on Bob
	if _, err := svc.Update(context.Background(), bob.Id, PersonUpdate{AdditionalTeams: ptr("Platform, Eng")}); err != nil {
		t.Fatalf("update failed: %v", err)
	}

	// Get working — should be a deep copy
	working1 := svc.GetWorking(context.Background())
	working2 := svc.GetWorking(context.Background())

	bob1 := findById(working1, bob.Id)
	bob2 := findById(working2, bob.Id)

	// Mutate one copy — the other should be unaffected
	bob1.AdditionalTeams[0] = "MUTATED"
	if bob2.AdditionalTeams[0] == "MUTATED" {
		t.Error("expected deep copy to isolate additional teams slices")
	}
}

// Scenarios: CONTRACT-006
func TestOrgService_GetOrg_NoData(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	data := svc.GetOrg(context.Background())
	if data != nil {
		t.Error("expected nil when no data loaded")
	}
}

// Scenarios: ORG-009
func TestOrgService_FieldLengthValidation(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	alice := findByName(data.Working, "Alice")
	longStr := string(make([]byte, maxFieldLen+1))

	t.Run("[ORG-009] Update rejects long field", func(t *testing.T) {
		_, err := svc.Update(context.Background(), alice.Id, PersonUpdate{Name: ptr(longStr)})
		if err == nil {
			t.Error("expected error for field too long")
		}
	})

	t.Run("[ORG-009] Update accepts max-length field", func(t *testing.T) {
		okStr := string(make([]byte, maxFieldLen))
		_, err := svc.Update(context.Background(), alice.Id, PersonUpdate{Name: ptr(okStr)})
		if err != nil {
			t.Errorf("expected no error, got %v", err)
		}
	})

	t.Run("[ORG-009] Add rejects long name", func(t *testing.T) {
		_, _, _, err := svc.Add(context.Background(), Person{
			Name: longStr, Role: "Eng", Discipline: "Eng",
			Team: "Eng", Status: "Active",
		})
		if err == nil {
			t.Error("expected error for long name on Add")
		}
	})
}

// Scenarios: ORG-002
func TestOrgService_ValidateManagerChange(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	alice := findByName(data.Working, "Alice")
	bob := findByName(data.Working, "Bob")
	carol := findByName(data.Working, "Carol")

	t.Run("[ORG-002] self-reference via Move", func(t *testing.T) {
		_, err := svc.Move(context.Background(), alice.Id, alice.Id, "")
		if err == nil {
			t.Error("expected error for self-reference")
		}
	})

	t.Run("[ORG-002] self-reference via Update", func(t *testing.T) {
		_, err := svc.Update(context.Background(), bob.Id, PersonUpdate{ManagerId: ptr(bob.Id)})
		if err == nil {
			t.Error("expected error for self-reference")
		}
	})

	t.Run("[ORG-002] cycle via Move", func(t *testing.T) {
		// Alice -> Bob -> Carol. Moving Alice under Carol creates cycle.
		_, err := svc.Move(context.Background(), alice.Id, carol.Id, "")
		if err == nil {
			t.Error("expected error for cycle")
		}
	})

	t.Run("[ORG-002] nonexistent manager", func(t *testing.T) {
		_, err := svc.Move(context.Background(), bob.Id, "nonexistent-id", "")
		if err == nil {
			t.Error("expected error for nonexistent manager")
		}
	})
}

// Scenarios: SNAP-008
func TestOrgService_ExportSnapshot(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	if err := svc.SaveSnapshot(context.Background(), "snap1"); err != nil {
		t.Fatalf("save: %v", err)
	}

	t.Run("[SNAP-008] returns working for __working__", func(t *testing.T) {
		t.Parallel()
		people, err := svc.ExportSnapshot(context.Background(), SnapshotWorking)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(people) != 3 {
			t.Errorf("expected 3 people, got %d", len(people))
		}
	})

	t.Run("[SNAP-008] returns original for __original__", func(t *testing.T) {
		t.Parallel()
		people, err := svc.ExportSnapshot(context.Background(), SnapshotOriginal)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(people) != 3 {
			t.Errorf("expected 3 people, got %d", len(people))
		}
	})

	t.Run("[SNAP-008] returns named snapshot", func(t *testing.T) {
		t.Parallel()
		people, err := svc.ExportSnapshot(context.Background(), "snap1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(people) != 3 {
			t.Errorf("expected 3 people, got %d", len(people))
		}
	})

	t.Run("[SNAP-008] errors on missing snapshot", func(t *testing.T) {
		t.Parallel()
		_, err := svc.ExportSnapshot(context.Background(), "nonexistent")
		if err == nil {
			t.Error("expected error for missing snapshot")
		}
	})

	t.Run("[SNAP-008] returns deep copy", func(t *testing.T) {
		t.Parallel()
		people, _ := svc.ExportSnapshot(context.Background(), "snap1")
		people[0].Name = "MUTATED"
		original, _ := svc.ExportSnapshot(context.Background(), "snap1")
		if original[0].Name == "MUTATED" {
			t.Error("ExportSnapshot should return a deep copy")
		}
	})
}

// Scenarios: SNAP-005
func TestOrgService_SaveSnapshot_RejectsReservedNames(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)

	for _, name := range []string{SnapshotWorking, SnapshotOriginal} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			err := svc.SaveSnapshot(context.Background(), name)
			if err == nil {
				t.Errorf("expected error for reserved name %q", name)
			}
		})
	}
}

// Scenarios: ORG-011
func TestOrgService_Add_RejectsInvalidStatus(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	_, _, _, err := svc.Add(context.Background(), Person{Name: "Test", Status: "BOGUS", Team: "Eng"})
	if err == nil {
		t.Fatal("expected error for invalid status")
	}
}

// Scenarios: ORG-011
func TestOrgService_Add_RejectsInvalidManager(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	_, _, _, err := svc.Add(context.Background(), Person{Name: "Test", Status: "Active", Team: "Eng", ManagerId: "nonexistent"})
	if err == nil {
		t.Fatal("expected error for invalid manager")
	}
}

// Scenarios: UPLOAD-011
func TestUpload_PreservesSnapshotsOnParseFailure(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	if err := svc.SaveSnapshot(context.Background(), "important"); err != nil {
		t.Fatalf("save snapshot: %v", err)
	}
	if len(svc.ListSnapshots(context.Background())) != 1 {
		t.Fatal("expected 1 snapshot")
	}
	// Upload invalid data — should fail without destroying snapshots
	_, err := svc.Upload(context.Background(), "bad.csv", []byte("just-one-row-no-data\n"))
	if err == nil {
		t.Fatal("expected upload to fail")
	}
	// Snapshots should still exist
	if len(svc.ListSnapshots(context.Background())) != 1 {
		t.Error("expected snapshot to survive failed upload")
	}
}

// Scenarios: ORG-018
func TestUpload_SeedsPods(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	csv := "Name,Role,Discipline,Manager,Team,Status,Pod\nAlice,VP,Eng,,Eng,Active,\nBob,Engineer,Eng,Alice,Platform,Active,Platform\nCarol,Engineer,Eng,Alice,Infra,Active,Infra\n"
	resp, err := svc.Upload(context.Background(), "test.csv", []byte(csv))
	if err != nil {
		t.Fatal(err)
	}
	if resp.OrgData == nil {
		t.Fatal("expected orgData")
	}
	if len(resp.OrgData.Pods) != 2 {
		t.Errorf("expected 2 pods, got %d", len(resp.OrgData.Pods))
	}
}

// Scenarios: SETTINGS-002
func TestUpload_DerivesSettings(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	csv := "Name,Role,Discipline,Manager,Team,Status\nAlice,VP,Product,,Eng,Active\nBob,Engineer,Engineering,Alice,Platform,Active\n"
	resp, err := svc.Upload(context.Background(), "test.csv", []byte(csv))
	if err != nil {
		t.Fatal(err)
	}
	if resp.OrgData.Settings == nil {
		t.Fatal("expected settings")
	}
	order := resp.OrgData.Settings.DisciplineOrder
	if len(order) != 2 {
		t.Fatalf("expected 2 disciplines, got %d", len(order))
	}
	if order[0] != "Engineering" || order[1] != "Product" {
		t.Errorf("expected [Engineering Product], got %v", order)
	}
}

// --- RestoreState tests ---

// Scenarios: AUTO-007
func TestOrgService_RestoreState_FullState(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	settings := &Settings{DisciplineOrder: []string{"Eng", "Product"}}
	data := AutosaveData{
		Original: []Person{
			{Id: "1", Name: "Alice", Role: "VP", Team: "Eng", Status: "Active"},
			{Id: "2", Name: "Bob", Role: "Engineer", Team: "Platform", ManagerId: "1", Status: "Active"},
		},
		Working: []Person{
			{Id: "1", Name: "Alice", Role: "VP", Team: "Eng", Status: "Active"},
			{Id: "2", Name: "Bob", Role: "Senior Engineer", Team: "Platform", ManagerId: "1", Status: "Active"},
		},
		Recycled: []Person{
			{Id: "3", Name: "Carol", Role: "Engineer", Team: "Platform", Status: "Active"},
		},
		Pods:         []Pod{{Id: "p1", Name: "Platform", Team: "Platform", ManagerId: "1"}},
		OriginalPods: []Pod{{Id: "p1", Name: "Platform", Team: "Platform", ManagerId: "1"}},
		Settings:     settings,
	}

	svc.RestoreState(context.Background(), data)

	org := svc.GetOrg(context.Background())
	if org == nil {
		t.Fatal("expected org data after RestoreState")
	}
	if len(org.Original) != 2 {
		t.Errorf("expected 2 original, got %d", len(org.Original))
	}
	if len(org.Working) != 2 {
		t.Errorf("expected 2 working, got %d", len(org.Working))
	}
	recycled := svc.GetRecycled(context.Background())
	if len(recycled) != 1 {
		t.Errorf("expected 1 recycled, got %d", len(recycled))
	}
	if len(org.Pods) != 1 {
		t.Errorf("expected 1 pod, got %d", len(org.Pods))
	}
	if org.Settings == nil {
		t.Fatal("expected settings")
	}
	if len(org.Settings.DisciplineOrder) != 2 {
		t.Errorf("expected 2 discipline order entries, got %d", len(org.Settings.DisciplineOrder))
	}
	if org.Settings.DisciplineOrder[0] != "Eng" || org.Settings.DisciplineOrder[1] != "Product" {
		t.Errorf("unexpected discipline order: %v", org.Settings.DisciplineOrder)
	}
}

// Scenarios: AUTO-007
func TestOrgService_RestoreState_OperationsWork(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	data := AutosaveData{
		Original: []Person{
			{Id: "1", Name: "Alice", Role: "VP", Team: "Eng", Status: "Active"},
			{Id: "2", Name: "Bob", Role: "Engineer", Team: "Platform", ManagerId: "1", Status: "Active"},
			{Id: "3", Name: "Carol", Role: "Engineer", Team: "Platform", ManagerId: "2", Status: "Active"},
		},
		Working: []Person{
			{Id: "1", Name: "Alice", Role: "VP", Team: "Eng", Status: "Active"},
			{Id: "2", Name: "Bob", Role: "Engineer", Team: "Platform", ManagerId: "1", Status: "Active"},
			{Id: "3", Name: "Carol", Role: "Engineer", Team: "Platform", ManagerId: "2", Status: "Active"},
		},
		Settings: &Settings{DisciplineOrder: []string{"Eng"}},
	}

	svc.RestoreState(context.Background(), data)

	// Delete should work on restored data
	result, err := svc.Delete(context.Background(), "3")
	if err != nil {
		t.Fatalf("delete after restore failed: %v", err)
	}
	if len(result.Working) != 2 {
		t.Errorf("expected 2 working after delete, got %d", len(result.Working))
	}
	if len(result.Recycled) != 1 {
		t.Errorf("expected 1 recycled after delete, got %d", len(result.Recycled))
	}

	// Update should work on restored data
	updateResult, err := svc.Update(context.Background(), "2", PersonUpdate{Role: ptr("Staff Engineer")})
	if err != nil {
		t.Fatalf("update after restore failed: %v", err)
	}
	bob := findById(updateResult.Working, "2")
	if bob == nil {
		t.Fatal("expected Bob in working")
	}
	if bob.Role != "Staff Engineer" {
		t.Errorf("expected role 'Staff Engineer', got '%s'", bob.Role)
	}
}

// Scenarios: AUTO-007
func TestOrgService_RestoreState_NilSettings(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	data := AutosaveData{
		Original: []Person{
			{Id: "1", Name: "Alice", Discipline: "Product", Team: "Eng", Status: "Active"},
			{Id: "2", Name: "Bob", Discipline: "Engineering", Team: "Platform", ManagerId: "1", Status: "Active"},
		},
		Working: []Person{
			{Id: "1", Name: "Alice", Discipline: "Product", Team: "Eng", Status: "Active"},
			{Id: "2", Name: "Bob", Discipline: "Engineering", Team: "Platform", ManagerId: "1", Status: "Active"},
		},
		Settings: nil, // nil settings should derive defaults
	}

	svc.RestoreState(context.Background(), data)

	org := svc.GetOrg(context.Background())
	if org.Settings == nil {
		t.Fatal("expected settings to be derived")
	}
	// Should derive from original people's disciplines, sorted alphabetically
	order := org.Settings.DisciplineOrder
	if len(order) != 2 {
		t.Fatalf("expected 2 disciplines, got %d", len(order))
	}
	if order[0] != "Engineering" || order[1] != "Product" {
		t.Errorf("expected [Engineering Product], got %v", order)
	}
}

// --- isFrontlineManager tests ---

// Scenarios: ORG-017
func TestOrgService_IsFrontlineManager(t *testing.T) {
	t.Parallel()
	// Build a hierarchy: Alice -> Bob -> Carol, Alice -> Dave (IC)
	svc := NewOrgService(NewMemorySnapshotStore())
	csv := []byte("Name,Role,Discipline,Manager,Team,Status\nAlice,VP,Eng,,Eng,Active\nBob,Manager,Eng,Alice,Platform,Active\nCarol,Engineer,Eng,Bob,Platform,Active\nDave,Engineer,Eng,Alice,Eng,Active\n")
	resp, err := svc.Upload(context.Background(), "test.csv", csv)
	if err != nil {
		t.Fatalf("upload failed: %v", err)
	}
	if resp.Status != "ready" {
		t.Fatalf("expected ready, got %s", resp.Status)
	}
	data := svc.GetOrg(context.Background())
	alice := findByName(data.Working, "Alice")
	bob := findByName(data.Working, "Bob")
	carol := findByName(data.Working, "Carol")
	dave := findByName(data.Working, "Dave")

	t.Run("[ORG-017] person with ICs but no sub-managers is frontline", func(t *testing.T) {
		t.Parallel()
		// Bob has Carol (IC only) -> frontline manager
		svc.mu.RLock()
		result := isFrontlineManager(svc.working, bob.Id)
		svc.mu.RUnlock()
		if !result {
			t.Error("expected Bob to be a frontline manager")
		}
	})

	t.Run("[ORG-017] person with sub-managers is not frontline", func(t *testing.T) {
		t.Parallel()
		// Alice has Bob (who has reports) and Dave -> not frontline
		svc.mu.RLock()
		result := isFrontlineManager(svc.working, alice.Id)
		svc.mu.RUnlock()
		if result {
			t.Error("expected Alice to NOT be a frontline manager")
		}
	})

	t.Run("[ORG-017] person with no reports is not frontline", func(t *testing.T) {
		t.Parallel()
		// Carol has no reports -> not frontline
		svc.mu.RLock()
		result := isFrontlineManager(svc.working, carol.Id)
		svc.mu.RUnlock()
		if result {
			t.Error("expected Carol to NOT be a frontline manager")
		}
	})

	t.Run("[ORG-017] IC with no reports is not frontline", func(t *testing.T) {
		t.Parallel()
		svc.mu.RLock()
		result := isFrontlineManager(svc.working, dave.Id)
		svc.mu.RUnlock()
		if result {
			t.Error("expected Dave to NOT be a frontline manager")
		}
	})
}

// --- Team cascade on Update tests ---

// Scenarios: ORG-017
func TestOrgService_Update_TeamCascadeFrontlineManager(t *testing.T) {
	t.Parallel()
	// Bob is a frontline manager with ICs Carol and Dave.
	// Changing Bob's team should cascade to Carol and Dave.
	svc := NewOrgService(NewMemorySnapshotStore())
	csv := []byte("Name,Role,Discipline,Manager,Team,Status\nAlice,VP,Eng,,Eng,Active\nBob,Manager,Eng,Alice,Platform,Active\nCarol,Engineer,Eng,Bob,Platform,Active\nDave,Engineer,Eng,Bob,Platform,Active\n")
	resp, err := svc.Upload(context.Background(), "test.csv", csv)
	if err != nil {
		t.Fatalf("upload failed: %v", err)
	}
	if resp.Status != "ready" {
		t.Fatalf("expected ready, got %s", resp.Status)
	}
	data := svc.GetOrg(context.Background())
	bob := findByName(data.Working, "Bob")
	carol := findByName(data.Working, "Carol")
	dave := findByName(data.Working, "Dave")

	result, err := svc.Update(context.Background(), bob.Id, PersonUpdate{Team: ptr("Infra")})
	if err != nil {
		t.Fatalf("update failed: %v", err)
	}

	updatedBob := findById(result.Working, bob.Id)
	if updatedBob.Team != "Infra" {
		t.Errorf("expected Bob's team 'Infra', got '%s'", updatedBob.Team)
	}
	updatedCarol := findById(result.Working, carol.Id)
	if updatedCarol.Team != "Infra" {
		t.Errorf("expected Carol's team to cascade to 'Infra', got '%s'", updatedCarol.Team)
	}
	updatedDave := findById(result.Working, dave.Id)
	if updatedDave.Team != "Infra" {
		t.Errorf("expected Dave's team to cascade to 'Infra', got '%s'", updatedDave.Team)
	}
}

// Scenarios: ORG-017
func TestOrgService_Update_TeamNoCascadeNonFrontlineManager(t *testing.T) {
	t.Parallel()
	// Alice -> Bob -> Carol. Alice is NOT a frontline manager (Bob has reports).
	// Changing Alice's team should NOT cascade to Bob or Carol.
	svc := newTestService(t) // Alice -> Bob -> Carol
	data := svc.GetOrg(context.Background())
	alice := findByName(data.Working, "Alice")
	bob := findByName(data.Working, "Bob")
	carol := findByName(data.Working, "Carol")

	result, err := svc.Update(context.Background(), alice.Id, PersonUpdate{Team: ptr("NewTeam")})
	if err != nil {
		t.Fatalf("update failed: %v", err)
	}

	updatedAlice := findById(result.Working, alice.Id)
	if updatedAlice.Team != "NewTeam" {
		t.Errorf("expected Alice's team 'NewTeam', got '%s'", updatedAlice.Team)
	}
	updatedBob := findById(result.Working, bob.Id)
	if updatedBob.Team != "Platform" {
		t.Errorf("expected Bob's team to remain 'Platform', got '%s'", updatedBob.Team)
	}
	updatedCarol := findById(result.Working, carol.Id)
	if updatedCarol.Team != "Platform" {
		t.Errorf("expected Carol's team to remain 'Platform', got '%s'", updatedCarol.Team)
	}
}

// --- Pod auto-create on Update tests ---

// Scenarios: ORG-018, ORG-019
func TestOrgService_Update_PodAutoCreate(t *testing.T) {
	t.Parallel()
	svc := newTestService(t) // Alice -> Bob -> Carol
	data := svc.GetOrg(context.Background())
	carol := findByName(data.Working, "Carol")
	bob := findByName(data.Working, "Bob")

	// Setting a new pod name should auto-create the pod
	result, err := svc.Update(context.Background(), carol.Id, PersonUpdate{Pod: ptr("Alpha")})
	if err != nil {
		t.Fatalf("update failed: %v", err)
	}
	updatedCarol := findById(result.Working, carol.Id)
	if updatedCarol.Pod != "Alpha" {
		t.Errorf("expected Carol's pod 'Alpha', got '%s'", updatedCarol.Pod)
	}
	// Verify the pod was created
	found := false
	for _, pod := range result.Pods {
		if pod.Name == "Alpha" && pod.ManagerId == bob.Id {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected pod 'Alpha' to be auto-created under Bob")
	}
}

// Scenarios: ORG-018
func TestOrgService_Update_PodReusesExisting(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	carol := findByName(data.Working, "Carol")
	bob := findByName(data.Working, "Bob")

	// Create pod "Alpha" first by setting it on Carol
	_, err := svc.Update(context.Background(), carol.Id, PersonUpdate{Pod: ptr("Alpha")})
	if err != nil {
		t.Fatalf("first pod update failed: %v", err)
	}

	// Add a new person under Bob and assign same pod "Alpha"
	added, _, _, err := svc.Add(context.Background(), Person{
		Name: "Eve", Role: "Engineer", Discipline: "Eng",
		ManagerId: bob.Id, Team: "Platform", Status: "Active",
	})
	if err != nil {
		t.Fatalf("add failed: %v", err)
	}

	result, err := svc.Update(context.Background(), added.Id, PersonUpdate{Pod: ptr("Alpha")})
	if err != nil {
		t.Fatalf("second pod update failed: %v", err)
	}

	// Count pods named "Alpha" under Bob — should be exactly 1
	count := 0
	for _, pod := range result.Pods {
		if pod.Name == "Alpha" && pod.ManagerId == bob.Id {
			count++
		}
	}
	if count != 1 {
		t.Errorf("expected exactly 1 pod named 'Alpha' under Bob, got %d", count)
	}
}

// Scenarios: ORG-018
func TestOrgService_Update_PodClearRemovesAssignment(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	carol := findByName(data.Working, "Carol")

	// Set pod first
	_, err := svc.Update(context.Background(), carol.Id, PersonUpdate{Pod: ptr("Alpha")})
	if err != nil {
		t.Fatalf("set pod failed: %v", err)
	}

	// Clear pod
	result, err := svc.Update(context.Background(), carol.Id, PersonUpdate{Pod: ptr("")})
	if err != nil {
		t.Fatalf("clear pod failed: %v", err)
	}
	updatedCarol := findById(result.Working, carol.Id)
	if updatedCarol.Pod != "" {
		t.Errorf("expected Carol's pod to be empty, got '%s'", updatedCarol.Pod)
	}
}

func findById(people []Person, id string) *Person {
	for i := range people {
		if people[i].Id == id {
			return &people[i]
		}
	}
	return nil
}

// Scenarios: SETTINGS-001
func TestOrgService_UpdateSettings_Validation(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)

	t.Run("[SETTINGS-001] rejects empty discipline name", func(t *testing.T) {
		_, err := svc.UpdateSettings(context.Background(), Settings{DisciplineOrder: []string{"Eng", "", "Design"}})
		if err == nil {
			t.Fatal("expected error for empty discipline name")
		}
		if !isValidation(err) {
			t.Errorf("expected ValidationError, got %T: %v", err, err)
		}
	})

	t.Run("[SETTINGS-001] rejects duplicate discipline names", func(t *testing.T) {
		_, err := svc.UpdateSettings(context.Background(), Settings{DisciplineOrder: []string{"Eng", "Design", "Eng"}})
		if err == nil {
			t.Fatal("expected error for duplicate discipline")
		}
	})

	t.Run("[SETTINGS-001] accepts valid settings", func(t *testing.T) {
		result, err := svc.UpdateSettings(context.Background(), Settings{DisciplineOrder: []string{"Eng", "Design", "PM"}})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(result.DisciplineOrder) != 3 {
			t.Errorf("expected 3 disciplines, got %d", len(result.DisciplineOrder))
		}
	})

	t.Run("[SETTINGS-001] accepts empty list (clears order)", func(t *testing.T) {
		result, err := svc.UpdateSettings(context.Background(), Settings{DisciplineOrder: []string{}})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(result.DisciplineOrder) != 0 {
			t.Errorf("expected empty, got %d", len(result.DisciplineOrder))
		}
	})

	t.Run("[SETTINGS-001] trims whitespace from discipline names", func(t *testing.T) {
		result, err := svc.UpdateSettings(context.Background(), Settings{DisciplineOrder: []string{"  Eng  ", " Design"}})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.DisciplineOrder[0] != "Eng" {
			t.Errorf("expected trimmed 'Eng', got %q", result.DisciplineOrder[0])
		}
		if result.DisciplineOrder[1] != "Design" {
			t.Errorf("expected trimmed 'Design', got %q", result.DisciplineOrder[1])
		}
	})
}

// Scenarios: CONTRACT-008
func TestConfirmMapping_CancelledContext(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	// Upload a file that needs mapping (non-standard headers)
	csv := []byte("Nombre,Cargo,Departamento\nAlice,VP,Eng\nBob,Engineer,Eng\n")
	resp, err := svc.Upload(context.Background(), "test.csv", csv)
	if err != nil {
		t.Fatalf("upload failed: %v", err)
	}
	if resp.Status != "needs_mapping" {
		t.Fatalf("expected needs_mapping, got %s", resp.Status)
	}

	// Cancel context before calling ConfirmMapping
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // already cancelled

	_, err = svc.ConfirmMapping(ctx, map[string]string{"name": "Nombre"})
	if err == nil {
		t.Fatal("expected error from cancelled context")
	}
	if err != context.Canceled {
		t.Errorf("expected context.Canceled, got %v", err)
	}

	// Verify no state was committed — pending was cleared in Phase 1,
	// but no org data should be loaded
	org := svc.GetOrg(context.Background())
	if org != nil {
		t.Error("expected nil org data (no state committed)")
	}
}

func TestConfirmMapping_DeadlineExceeded(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	csv := []byte("Nombre,Cargo,Departamento\nAlice,VP,Eng\nBob,Engineer,Eng\n")
	resp, err := svc.Upload(context.Background(), "test.csv", csv)
	if err != nil {
		t.Fatalf("upload failed: %v", err)
	}
	if resp.Status != "needs_mapping" {
		t.Fatalf("expected needs_mapping, got %s", resp.Status)
	}

	// Create an already-expired deadline
	ctx, cancel := context.WithDeadline(context.Background(), time.Now().Add(-time.Second))
	defer cancel()

	_, err = svc.ConfirmMapping(ctx, map[string]string{"name": "Nombre"})
	if err == nil {
		t.Fatal("expected error from expired deadline")
	}
	if err != context.DeadlineExceeded {
		t.Errorf("expected context.DeadlineExceeded, got %v", err)
	}
}

// --- Direct service_pods.go tests ---

// Scenarios: ORG-018
func TestOrgService_ListPods_MemberCounts(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	ctx := context.Background()

	// Create a pod and assign a person to it
	alice := findByName(svc.GetWorking(ctx), "Alice")
	bob := findByName(svc.GetWorking(ctx), "Bob")
	_, err := svc.CreatePod(ctx, alice.Id, "Alpha", "Eng")
	if err != nil {
		t.Fatalf("create pod: %v", err)
	}
	// Assign Bob to the pod
	_, err = svc.Update(ctx, bob.Id, PersonUpdate{Pod: ptr("Alpha")})
	if err != nil {
		t.Fatalf("assign pod: %v", err)
	}

	pods := svc.ListPods(ctx)
	if len(pods) == 0 {
		t.Fatal("expected at least one pod")
	}
	var alpha *PodInfo
	for i := range pods {
		if pods[i].Name == "Alpha" {
			alpha = &pods[i]
		}
	}
	if alpha == nil {
		t.Fatal("expected pod 'Alpha' in list")
	}
	if alpha.MemberCount != 1 {
		t.Errorf("expected 1 member in Alpha pod, got %d", alpha.MemberCount)
	}
}

// Scenarios: ORG-018
func TestOrgService_UpdatePod_NotFound(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	_, err := svc.UpdatePod(context.Background(), "nonexistent-pod-id", PodUpdate{PublicNote: ptr("hello")})
	if err == nil {
		t.Fatal("expected error for nonexistent pod")
	}
	if !isNotFound(err) {
		t.Errorf("expected NotFoundError, got %T: %v", err, err)
	}
}

// Scenarios: ORG-018
func TestOrgService_UpdatePod_NoteTooLong(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	ctx := context.Background()

	alice := findByName(svc.GetWorking(ctx), "Alice")
	_, err := svc.CreatePod(ctx, alice.Id, "Alpha", "Eng")
	if err != nil {
		t.Fatalf("create pod: %v", err)
	}
	pods := svc.ListPods(ctx)

	longNote := string(make([]byte, maxNoteLen+1))
	_, err = svc.UpdatePod(ctx, pods[0].Id, PodUpdate{PublicNote: ptr(longNote)})
	if err == nil {
		t.Fatal("expected error for oversized note")
	}
	if !isValidation(err) {
		t.Errorf("expected ValidationError, got %T: %v", err, err)
	}
}

// Scenarios: ORG-018
func TestOrgService_CreatePod_Duplicate(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	ctx := context.Background()

	alice := findByName(svc.GetWorking(ctx), "Alice")
	_, err := svc.CreatePod(ctx, alice.Id, "Alpha", "Eng")
	if err != nil {
		t.Fatalf("first create: %v", err)
	}
	// Creating another pod for same manager+team should conflict
	_, err = svc.CreatePod(ctx, alice.Id, "Beta", "Eng")
	if err == nil {
		t.Fatal("expected error for duplicate manager+team pod")
	}
	if !isConflict(err) {
		t.Errorf("expected ConflictError, got %T: %v", err, err)
	}
}

// --- Direct service_settings.go tests ---

// Scenarios: SETTINGS-001
func TestOrgService_GetSettings_ReturnsDefault(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	settings := svc.GetSettings(context.Background())
	// After upload, settings should have discipline order derived from data
	if len(settings.DisciplineOrder) == 0 {
		t.Error("expected non-empty discipline order after upload")
	}
}

// Scenarios: SETTINGS-001
func TestOrgService_Settings_RoundTrip(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	ctx := context.Background()

	newSettings := Settings{DisciplineOrder: []string{"Design", "PM", "Eng"}}
	result, err := svc.UpdateSettings(ctx, newSettings)
	if err != nil {
		t.Fatalf("update settings: %v", err)
	}
	if len(result.DisciplineOrder) != 3 {
		t.Fatalf("expected 3 disciplines, got %d", len(result.DisciplineOrder))
	}

	// Read back
	got := svc.GetSettings(ctx)
	if got.DisciplineOrder[0] != "Design" {
		t.Errorf("expected 'Design' first, got '%s'", got.DisciplineOrder[0])
	}
}

// Scenarios: SETTINGS-001
func TestOrgService_UpdateSettings_RejectsInvalidChars(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	_, err := svc.UpdateSettings(context.Background(), Settings{DisciplineOrder: []string{"Eng\nDesign"}})
	if err == nil {
		t.Fatal("expected error for newline in discipline name")
	}
	if !isValidation(err) {
		t.Errorf("expected ValidationError, got %T: %v", err, err)
	}
}

// Scenarios: SETTINGS-001
func TestOrgService_UpdateSettings_RejectsOversizedName(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	longName := string(make([]byte, maxFieldLen+1))
	_, err := svc.UpdateSettings(context.Background(), Settings{DisciplineOrder: []string{longName}})
	if err == nil {
		t.Fatal("expected error for oversized discipline name")
	}
	if !isValidation(err) {
		t.Errorf("expected ValidationError, got %T: %v", err, err)
	}
}
