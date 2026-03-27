package api

import (
	"testing"
)

func newTestService(t *testing.T) *OrgService {
	t.Helper()
	svc := NewOrgService(NewMemorySnapshotStore())
	csv := []byte("Name,Role,Discipline,Manager,Team,Additional Teams,Status\nAlice,VP,Eng,,Eng,,Active\nBob,Engineer,Eng,Alice,Platform,,Active\nCarol,Engineer,Eng,Bob,Platform,,Active\n")
	resp, err := svc.Upload("test.csv", csv)
	if err != nil {
		t.Fatalf("upload failed: %v", err)
	}
	if resp.Status != "ready" {
		t.Fatalf("expected status 'ready', got '%s'", resp.Status)
	}
	return svc
}

func TestOrgService_Upload(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg()
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

func TestOrgService_Move(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg()
	carol := findByName(data.Working, "Carol")
	alice := findByName(data.Working, "Alice")

	result, err := svc.Move(carol.Id, alice.Id, "Eng")
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

	origCarol := findByName(svc.GetOrg().Original, "Carol")
	if origCarol.Team == "Eng" {
		t.Error("expected original Carol to still be on Platform")
	}
}

func TestOrgService_Move_SetsPod(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg()
	alice := findByName(data.Working, "Alice")
	bob := findByName(data.Working, "Bob")

	// Create a pod under Alice
	_, err := svc.CreatePod(alice.Id, "Alpha", "Eng")
	if err != nil {
		t.Fatalf("create pod failed: %v", err)
	}

	// Move Bob to Alice with pod "Alpha"
	result, err := svc.Move(bob.Id, alice.Id, "Eng", "Alpha")
	if err != nil {
		t.Fatalf("move failed: %v", err)
	}
	updated := findById(result.Working, bob.Id)
	if updated.Pod != "Alpha" {
		t.Errorf("expected Bob's pod to be Alpha, got %q", updated.Pod)
	}
}

func TestOrgService_Move_EmptyPodIgnored(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg()
	alice := findByName(data.Working, "Alice")
	carol := findByName(data.Working, "Carol")

	// Move with empty pod should not set pod field
	result, err := svc.Move(carol.Id, alice.Id, "Eng", "")
	if err != nil {
		t.Fatalf("move failed: %v", err)
	}
	updated := findById(result.Working, carol.Id)
	if updated.Pod != "" {
		t.Errorf("expected empty pod, got %q", updated.Pod)
	}
}

func TestOrgService_Update(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg()
	bob := findByName(data.Working, "Bob")

	result, err := svc.Update(bob.Id, map[string]string{"role": "Senior Engineer", "discipline": "SRE"})
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

func TestOrgService_Add(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg()
	alice := findByName(data.Working, "Alice")

	added, _, _, err := svc.Add(Person{
		Name: "Dave", Role: "Engineer", Discipline: "Eng",
		ManagerId: alice.Id, Team: "Eng", Status: "Active",
	})
	if err != nil {
		t.Fatalf("add failed: %v", err)
	}

	if added.Id == "" {
		t.Error("expected added person to have an ID")
	}

	working := svc.GetWorking()
	if len(working) != 4 {
		t.Errorf("expected 4 people, got %d", len(working))
	}
}

func TestOrgService_Delete(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg()
	bob := findByName(data.Working, "Bob")
	carol := findByName(data.Working, "Carol")

	_, err := svc.Delete(bob.Id)
	if err != nil {
		t.Fatalf("delete failed: %v", err)
	}

	working := svc.GetWorking()
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

	recycled := svc.GetRecycled()
	if len(recycled) != 1 {
		t.Errorf("expected 1 recycled, got %d", len(recycled))
	}
}

func TestOrgService_SoftDelete(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg()
	bobId := findByName(data.Working, "Bob").Id
	carolId := findByName(data.Working, "Carol").Id

	_, err := svc.Delete(bobId)
	if err != nil {
		t.Fatalf("delete failed: %v", err)
	}

	working := svc.GetWorking()
	if len(working) != 2 {
		t.Errorf("expected 2 working, got %d", len(working))
	}
	recycled := svc.GetRecycled()
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

func TestOrgService_Restore(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg()
	bobId := findByName(data.Working, "Bob").Id

	if _, err := svc.Delete(bobId); err != nil {
		t.Fatalf("delete failed: %v", err)
	}
	_, err := svc.Restore(bobId)
	if err != nil {
		t.Fatalf("restore failed: %v", err)
	}

	working := svc.GetWorking()
	if len(working) != 3 {
		t.Errorf("expected 3 working, got %d", len(working))
	}
	recycled := svc.GetRecycled()
	if len(recycled) != 0 {
		t.Errorf("expected 0 recycled, got %d", len(recycled))
	}
}

func TestOrgService_Restore_ManagerGone(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg()
	carolId := findByName(data.Working, "Carol").Id
	bobId := findByName(data.Working, "Bob").Id

	if _, err := svc.Delete(bobId); err != nil {
		t.Fatalf("delete bob: %v", err)
	}
	if _, err := svc.Delete(carolId); err != nil {
		t.Fatalf("delete carol: %v", err)
	}
	if _, err := svc.Restore(carolId); err != nil {
		t.Fatalf("restore carol: %v", err)
	}

	working := svc.GetWorking()
	restoredCarol := findById(working, carolId)
	if restoredCarol.ManagerId != "" {
		t.Errorf("expected Carol unparented (manager Bob gone), got %s", restoredCarol.ManagerId)
	}
}

func TestOrgService_EmptyBin(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg()
	bobId := findByName(data.Working, "Bob").Id
	carolId := findByName(data.Working, "Carol").Id

	if _, err := svc.Delete(bobId); err != nil {
		t.Fatalf("delete bob: %v", err)
	}
	if _, err := svc.Delete(carolId); err != nil {
		t.Fatalf("delete carol: %v", err)
	}

	if len(svc.GetRecycled()) != 2 {
		t.Fatalf("expected 2 recycled")
	}

	svc.EmptyBin()
	if len(svc.GetRecycled()) != 0 {
		t.Errorf("expected 0 recycled after empty bin")
	}
}

func TestOrgService_Upload_AutoProceed(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	csv := []byte("Name,Role,Discipline,Manager,Team,Additional Teams,Status\nAlice,VP,Eng,,Eng,,Active\n")
	resp, err := svc.Upload("test.csv", csv)
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

func TestOrgService_Upload_NeedsMapping(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	// Use headers that won't all map to high confidence.
	// "Nombre" and "Nivel" are unrecognizable, so name/role won't be high.
	csv := []byte("Nombre,Nivel,Discipline,Manager,Team,Additional Teams,Status\nAlice,VP,Eng,,Eng,,Active\n")
	resp, err := svc.Upload("test.csv", csv)
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

func TestOrgService_ConfirmMapping(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	// Use unrecognizable headers so InferMapping won't auto-proceed.
	csv := []byte("Nombre,Nivel,Discipline,Manager,Team,Additional Teams,Status\nAlice,VP,Eng,,Eng,,Active\nBob,Engineer,Eng,Alice,Platform,,Active\n")
	resp, err := svc.Upload("test.csv", csv)
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
	orgData, err := svc.ConfirmMapping(mapping)
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

func TestOrgService_ConfirmMapping_NoPending(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	_, err := svc.ConfirmMapping(map[string]string{"name": "Name"})
	if err == nil {
		t.Fatal("expected error when no pending file")
	}
}

func TestOrgService_Reorder(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg()
	alice := findByName(data.Working, "Alice")
	bob := findByName(data.Working, "Bob")
	carol := findByName(data.Working, "Carol")

	// Reorder: Carol first, then Alice, then Bob
	result, err := svc.Reorder([]string{carol.Id, alice.Id, bob.Id})
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

func TestOrgService_Reorder_PartialIds(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg()
	bob := findByName(data.Working, "Bob")

	// Only reorder Bob — others should be unaffected (SortIndex stays 0)
	result, err := svc.Reorder([]string{bob.Id})
	if err != nil {
		t.Fatalf("reorder failed: %v", err)
	}

	bobUpdated := findById(result.Working, bob.Id)
	if bobUpdated.SortIndex != 0 {
		t.Errorf("expected Bob sortIndex 0, got %d", bobUpdated.SortIndex)
	}
}

func TestOrgService_ResetToOriginal(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg()
	bob := findByName(data.Working, "Bob")
	alice := findByName(data.Working, "Alice")

	// Make some changes: move Bob under Alice, delete Carol
	carol := findByName(data.Working, "Carol")
	if _, err := svc.Move(bob.Id, alice.Id, "Eng"); err != nil {
		t.Fatalf("move failed: %v", err)
	}
	if _, err := svc.Delete(carol.Id); err != nil {
		t.Fatalf("delete failed: %v", err)
	}

	// Verify changes took effect
	if len(svc.GetWorking()) != 2 {
		t.Fatalf("expected 2 working after delete, got %d", len(svc.GetWorking()))
	}
	if len(svc.GetRecycled()) != 1 {
		t.Fatalf("expected 1 recycled after delete, got %d", len(svc.GetRecycled()))
	}

	// Reset
	orgData := svc.ResetToOriginal()

	// Working should match original (3 people, original teams)
	if len(orgData.Working) != 3 {
		t.Errorf("expected 3 working after reset, got %d", len(orgData.Working))
	}
	if len(orgData.Original) != 3 {
		t.Errorf("expected 3 original after reset, got %d", len(orgData.Original))
	}

	// Recycled should be cleared
	recycled := svc.GetRecycled()
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

func TestOrgService_Update_AllFields(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg()
	bob := findByName(data.Working, "Bob")
	alice := findByName(data.Working, "Alice")

	// Update every supported field
	result, err := svc.Update(bob.Id, map[string]string{
		"name":            "Robert",
		"role":            "Staff Engineer",
		"discipline":      "SRE",
		"team":            "Infra",
		"status":          "Transfer In",
		"managerId":       alice.Id,
		"employmentType":  "Contractor",
		"additionalTeams": "Platform, Eng",
		"newRole":         "Principal",
		"newTeam":         "Cloud",
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

func TestOrgService_Update_InvalidStatus(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg()
	bob := findByName(data.Working, "Bob")

	_, err := svc.Update(bob.Id, map[string]string{"status": "INVALID"})
	if err == nil {
		t.Fatal("expected error for invalid status, got nil")
	}
}

func TestOrgService_Update_AdditionalTeamsEmpty(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg()
	bob := findByName(data.Working, "Bob")

	// First set additional teams
	if _, err := svc.Update(bob.Id, map[string]string{"additionalTeams": "Platform, Eng"}); err != nil {
		t.Fatalf("update failed: %v", err)
	}

	// Then clear them
	result, err := svc.Update(bob.Id, map[string]string{"additionalTeams": ""})
	if err != nil {
		t.Fatalf("update failed: %v", err)
	}
	updated := findById(result.Working, bob.Id)
	if updated.AdditionalTeams != nil {
		t.Errorf("expected nil additional teams, got %v", updated.AdditionalTeams)
	}
}

func TestOrgService_Update_UnknownField(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg()
	bob := findByName(data.Working, "Bob")

	_, err := svc.Update(bob.Id, map[string]string{"unknownField": "value"})
	if err == nil {
		t.Fatal("expected error for unknown field")
	}
}

func TestOrgService_Update_PersonNotFound(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	_, err := svc.Update("nonexistent", map[string]string{"role": "VP"})
	if err == nil {
		t.Fatal("expected error for nonexistent person")
	}
}

func TestOrgService_Move_PersonNotFound(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	_, err := svc.Move("nonexistent", "", "Eng")
	if err == nil {
		t.Fatal("expected error for nonexistent person")
	}
}

func TestOrgService_Move_ManagerNotFound(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg()
	bob := findByName(data.Working, "Bob")

	_, err := svc.Move(bob.Id, "nonexistent-manager", "Eng")
	if err == nil {
		t.Fatal("expected error for nonexistent manager")
	}
}

func TestOrgService_Move_NoTeamChange(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg()
	carol := findByName(data.Working, "Carol")
	alice := findByName(data.Working, "Alice")

	// Move with empty newTeam — team should stay the same
	result, err := svc.Move(carol.Id, alice.Id, "")
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

func TestOrgService_Move_SelfAsManager(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg()
	bob := findByName(data.Working, "Bob")

	_, err := svc.Move(bob.Id, bob.Id, "")
	if err == nil {
		t.Fatal("expected error when moving person to be their own manager")
	}
}

func TestOrgService_Move_CycleDetection(t *testing.T) {
	t.Parallel()
	// Alice -> Bob -> Carol
	// Moving Alice under Carol would create Alice -> Carol -> ... -> Alice
	svc := newTestService(t)
	data := svc.GetOrg()
	alice := findByName(data.Working, "Alice")
	carol := findByName(data.Working, "Carol")

	_, err := svc.Move(alice.Id, carol.Id, "")
	if err == nil {
		t.Fatal("expected error when creating circular manager chain")
	}
}

func TestOrgService_Update_CycleDetection(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg()
	alice := findByName(data.Working, "Alice")
	carol := findByName(data.Working, "Carol")

	// Alice -> Bob -> Carol; setting Alice's manager to Carol creates cycle
	_, err := svc.Update(alice.Id, map[string]string{"managerId": carol.Id})
	if err == nil {
		t.Fatal("expected error when creating circular manager chain via Update")
	}
}

func TestOrgService_Delete_PersonNotFound(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	_, err := svc.Delete("nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent person")
	}
}

func TestOrgService_Restore_PersonNotFound(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	_, err := svc.Restore("nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent person in recycled")
	}
}

func TestOrgService_Delete_ReturnsBothArrays(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg()
	bob := findByName(data.Working, "Bob")

	result, err := svc.Delete(bob.Id)
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
	working := svc.GetWorking()
	for _, p := range working {
		if p.Name == "MUTATED" {
			t.Error("expected result to be a deep copy, but mutation leaked to service state")
		}
	}
}

func TestOrgService_Restore_ReturnsBothArrays(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg()
	bob := findByName(data.Working, "Bob")

	if _, err := svc.Delete(bob.Id); err != nil {
		t.Fatalf("delete failed: %v", err)
	}

	result, err := svc.Restore(bob.Id)
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

func TestOrgService_Upload_UnsupportedFormat(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	_, err := svc.Upload("test.txt", []byte("hello"))
	if err == nil {
		t.Fatal("expected error for unsupported format")
	}
}

func TestOrgService_Upload_InvalidCSV(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	// Only header, no data row
	_, err := svc.Upload("test.csv", []byte("Name,Role\n"))
	if err == nil {
		t.Fatal("expected error for CSV with no data rows")
	}
}

func TestOrgService_DeepCopyPeople_WithAdditionalTeams(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg()
	bob := findByName(data.Working, "Bob")

	// Set additional teams on Bob
	if _, err := svc.Update(bob.Id, map[string]string{"additionalTeams": "Platform, Eng"}); err != nil {
		t.Fatalf("update failed: %v", err)
	}

	// Get working — should be a deep copy
	working1 := svc.GetWorking()
	working2 := svc.GetWorking()

	bob1 := findById(working1, bob.Id)
	bob2 := findById(working2, bob.Id)

	// Mutate one copy — the other should be unaffected
	bob1.AdditionalTeams[0] = "MUTATED"
	if bob2.AdditionalTeams[0] == "MUTATED" {
		t.Error("expected deep copy to isolate additional teams slices")
	}
}

func TestOrgService_GetOrg_NoData(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	data := svc.GetOrg()
	if data != nil {
		t.Error("expected nil when no data loaded")
	}
}

func TestOrgService_FieldLengthValidation(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg()
	alice := findByName(data.Working, "Alice")
	longStr := string(make([]byte, maxFieldLen+1))

	t.Run("Update rejects long field", func(t *testing.T) {
		_, err := svc.Update(alice.Id, map[string]string{"name": longStr})
		if err == nil {
			t.Error("expected error for field too long")
		}
	})

	t.Run("Update accepts max-length field", func(t *testing.T) {
		okStr := string(make([]byte, maxFieldLen))
		_, err := svc.Update(alice.Id, map[string]string{"name": okStr})
		if err != nil {
			t.Errorf("expected no error, got %v", err)
		}
	})

	t.Run("Add rejects long name", func(t *testing.T) {
		_, _, _, err := svc.Add(Person{
			Name: longStr, Role: "Eng", Discipline: "Eng",
			Team: "Eng", Status: "Active",
		})
		if err == nil {
			t.Error("expected error for long name on Add")
		}
	})
}

func TestOrgService_ValidateManagerChange(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg()
	alice := findByName(data.Working, "Alice")
	bob := findByName(data.Working, "Bob")
	carol := findByName(data.Working, "Carol")

	t.Run("self-reference via Move", func(t *testing.T) {
		_, err := svc.Move(alice.Id, alice.Id, "")
		if err == nil {
			t.Error("expected error for self-reference")
		}
	})

	t.Run("self-reference via Update", func(t *testing.T) {
		_, err := svc.Update(bob.Id, map[string]string{"managerId": bob.Id})
		if err == nil {
			t.Error("expected error for self-reference")
		}
	})

	t.Run("cycle via Move", func(t *testing.T) {
		// Alice -> Bob -> Carol. Moving Alice under Carol creates cycle.
		_, err := svc.Move(alice.Id, carol.Id, "")
		if err == nil {
			t.Error("expected error for cycle")
		}
	})

	t.Run("nonexistent manager", func(t *testing.T) {
		_, err := svc.Move(bob.Id, "nonexistent-id", "")
		if err == nil {
			t.Error("expected error for nonexistent manager")
		}
	})
}

func TestOrgService_ExportSnapshot(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	if err := svc.SaveSnapshot("snap1"); err != nil {
		t.Fatalf("save: %v", err)
	}

	t.Run("returns working for __working__", func(t *testing.T) {
		t.Parallel()
		people, err := svc.ExportSnapshot(SnapshotWorking)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(people) != 3 {
			t.Errorf("expected 3 people, got %d", len(people))
		}
	})

	t.Run("returns original for __original__", func(t *testing.T) {
		t.Parallel()
		people, err := svc.ExportSnapshot(SnapshotOriginal)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(people) != 3 {
			t.Errorf("expected 3 people, got %d", len(people))
		}
	})

	t.Run("returns named snapshot", func(t *testing.T) {
		t.Parallel()
		people, err := svc.ExportSnapshot("snap1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(people) != 3 {
			t.Errorf("expected 3 people, got %d", len(people))
		}
	})

	t.Run("errors on missing snapshot", func(t *testing.T) {
		t.Parallel()
		_, err := svc.ExportSnapshot("nonexistent")
		if err == nil {
			t.Error("expected error for missing snapshot")
		}
	})

	t.Run("returns deep copy", func(t *testing.T) {
		t.Parallel()
		people, _ := svc.ExportSnapshot("snap1")
		people[0].Name = "MUTATED"
		original, _ := svc.ExportSnapshot("snap1")
		if original[0].Name == "MUTATED" {
			t.Error("ExportSnapshot should return a deep copy")
		}
	})
}

func TestOrgService_SaveSnapshot_RejectsReservedNames(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)

	for _, name := range []string{SnapshotWorking, SnapshotOriginal} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			err := svc.SaveSnapshot(name)
			if err == nil {
				t.Errorf("expected error for reserved name %q", name)
			}
		})
	}
}

func TestOrgService_Add_RejectsInvalidStatus(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	_, _, _, err := svc.Add(Person{Name: "Test", Status: "BOGUS", Team: "Eng"})
	if err == nil {
		t.Fatal("expected error for invalid status")
	}
}

func TestOrgService_Add_RejectsInvalidManager(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	_, _, _, err := svc.Add(Person{Name: "Test", Status: "Active", Team: "Eng", ManagerId: "nonexistent"})
	if err == nil {
		t.Fatal("expected error for invalid manager")
	}
}

func TestUpload_PreservesSnapshotsOnParseFailure(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	if err := svc.SaveSnapshot("important"); err != nil {
		t.Fatalf("save snapshot: %v", err)
	}
	if len(svc.ListSnapshots()) != 1 {
		t.Fatal("expected 1 snapshot")
	}
	// Upload invalid data — should fail without destroying snapshots
	_, err := svc.Upload("bad.csv", []byte("just-one-row-no-data\n"))
	if err == nil {
		t.Fatal("expected upload to fail")
	}
	// Snapshots should still exist
	if len(svc.ListSnapshots()) != 1 {
		t.Error("expected snapshot to survive failed upload")
	}
}

func TestUpload_SeedsPods(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	csv := "Name,Role,Discipline,Manager,Team,Status,Pod\nAlice,VP,Eng,,Eng,Active,\nBob,Engineer,Eng,Alice,Platform,Active,Platform\nCarol,Engineer,Eng,Alice,Infra,Active,Infra\n"
	resp, err := svc.Upload("test.csv", []byte(csv))
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

func TestUpload_DerivesSettings(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	csv := "Name,Role,Discipline,Manager,Team,Status\nAlice,VP,Product,,Eng,Active\nBob,Engineer,Engineering,Alice,Platform,Active\n"
	resp, err := svc.Upload("test.csv", []byte(csv))
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

	svc.RestoreState(data)

	org := svc.GetOrg()
	if org == nil {
		t.Fatal("expected org data after RestoreState")
	}
	if len(org.Original) != 2 {
		t.Errorf("expected 2 original, got %d", len(org.Original))
	}
	if len(org.Working) != 2 {
		t.Errorf("expected 2 working, got %d", len(org.Working))
	}
	recycled := svc.GetRecycled()
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

	svc.RestoreState(data)

	// Delete should work on restored data
	result, err := svc.Delete("3")
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
	updateResult, err := svc.Update("2", map[string]string{"role": "Staff Engineer"})
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

	svc.RestoreState(data)

	org := svc.GetOrg()
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

func TestOrgService_IsFrontlineManager(t *testing.T) {
	t.Parallel()
	// Build a hierarchy: Alice -> Bob -> Carol, Alice -> Dave (IC)
	svc := NewOrgService(NewMemorySnapshotStore())
	csv := []byte("Name,Role,Discipline,Manager,Team,Status\nAlice,VP,Eng,,Eng,Active\nBob,Manager,Eng,Alice,Platform,Active\nCarol,Engineer,Eng,Bob,Platform,Active\nDave,Engineer,Eng,Alice,Eng,Active\n")
	resp, err := svc.Upload("test.csv", csv)
	if err != nil {
		t.Fatalf("upload failed: %v", err)
	}
	if resp.Status != "ready" {
		t.Fatalf("expected ready, got %s", resp.Status)
	}
	data := svc.GetOrg()
	alice := findByName(data.Working, "Alice")
	bob := findByName(data.Working, "Bob")
	carol := findByName(data.Working, "Carol")
	dave := findByName(data.Working, "Dave")

	t.Run("person with ICs but no sub-managers is frontline", func(t *testing.T) {
		t.Parallel()
		// Bob has Carol (IC only) -> frontline manager
		svc.mu.RLock()
		result := isFrontlineManager(svc.working, bob.Id)
		svc.mu.RUnlock()
		if !result {
			t.Error("expected Bob to be a frontline manager")
		}
	})

	t.Run("person with sub-managers is not frontline", func(t *testing.T) {
		t.Parallel()
		// Alice has Bob (who has reports) and Dave -> not frontline
		svc.mu.RLock()
		result := isFrontlineManager(svc.working, alice.Id)
		svc.mu.RUnlock()
		if result {
			t.Error("expected Alice to NOT be a frontline manager")
		}
	})

	t.Run("person with no reports is not frontline", func(t *testing.T) {
		t.Parallel()
		// Carol has no reports -> not frontline
		svc.mu.RLock()
		result := isFrontlineManager(svc.working, carol.Id)
		svc.mu.RUnlock()
		if result {
			t.Error("expected Carol to NOT be a frontline manager")
		}
	})

	t.Run("IC with no reports is not frontline", func(t *testing.T) {
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

func TestOrgService_Update_TeamCascadeFrontlineManager(t *testing.T) {
	t.Parallel()
	// Bob is a frontline manager with ICs Carol and Dave.
	// Changing Bob's team should cascade to Carol and Dave.
	svc := NewOrgService(NewMemorySnapshotStore())
	csv := []byte("Name,Role,Discipline,Manager,Team,Status\nAlice,VP,Eng,,Eng,Active\nBob,Manager,Eng,Alice,Platform,Active\nCarol,Engineer,Eng,Bob,Platform,Active\nDave,Engineer,Eng,Bob,Platform,Active\n")
	resp, err := svc.Upload("test.csv", csv)
	if err != nil {
		t.Fatalf("upload failed: %v", err)
	}
	if resp.Status != "ready" {
		t.Fatalf("expected ready, got %s", resp.Status)
	}
	data := svc.GetOrg()
	bob := findByName(data.Working, "Bob")
	carol := findByName(data.Working, "Carol")
	dave := findByName(data.Working, "Dave")

	result, err := svc.Update(bob.Id, map[string]string{"team": "Infra"})
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

func TestOrgService_Update_TeamNoCascadeNonFrontlineManager(t *testing.T) {
	t.Parallel()
	// Alice -> Bob -> Carol. Alice is NOT a frontline manager (Bob has reports).
	// Changing Alice's team should NOT cascade to Bob or Carol.
	svc := newTestService(t) // Alice -> Bob -> Carol
	data := svc.GetOrg()
	alice := findByName(data.Working, "Alice")
	bob := findByName(data.Working, "Bob")
	carol := findByName(data.Working, "Carol")

	result, err := svc.Update(alice.Id, map[string]string{"team": "NewTeam"})
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

func TestOrgService_Update_PodAutoCreate(t *testing.T) {
	t.Parallel()
	svc := newTestService(t) // Alice -> Bob -> Carol
	data := svc.GetOrg()
	carol := findByName(data.Working, "Carol")
	bob := findByName(data.Working, "Bob")

	// Setting a new pod name should auto-create the pod
	result, err := svc.Update(carol.Id, map[string]string{"pod": "Alpha"})
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

func TestOrgService_Update_PodReusesExisting(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg()
	carol := findByName(data.Working, "Carol")
	bob := findByName(data.Working, "Bob")

	// Create pod "Alpha" first by setting it on Carol
	_, err := svc.Update(carol.Id, map[string]string{"pod": "Alpha"})
	if err != nil {
		t.Fatalf("first pod update failed: %v", err)
	}

	// Add a new person under Bob and assign same pod "Alpha"
	added, _, _, err := svc.Add(Person{
		Name: "Eve", Role: "Engineer", Discipline: "Eng",
		ManagerId: bob.Id, Team: "Platform", Status: "Active",
	})
	if err != nil {
		t.Fatalf("add failed: %v", err)
	}

	result, err := svc.Update(added.Id, map[string]string{"pod": "Alpha"})
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

func TestOrgService_Update_PodClearRemovesAssignment(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg()
	carol := findByName(data.Working, "Carol")

	// Set pod first
	_, err := svc.Update(carol.Id, map[string]string{"pod": "Alpha"})
	if err != nil {
		t.Fatalf("set pod failed: %v", err)
	}

	// Clear pod
	result, err := svc.Update(carol.Id, map[string]string{"pod": ""})
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
