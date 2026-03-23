package api

import (
	"testing"
)

func newTestService(t *testing.T) *OrgService {
	t.Helper()
	svc := NewOrgService()
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
	svc := newTestService(t)
	data := svc.GetOrg()
	carol := findByName(data.Working, "Carol")
	alice := findByName(data.Working, "Alice")

	working, err := svc.Move(carol.Id, alice.Id, "Eng")
	if err != nil {
		t.Fatalf("move failed: %v", err)
	}
	updated := findById(working, carol.Id)
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

func TestOrgService_Update(t *testing.T) {
	svc := newTestService(t)
	data := svc.GetOrg()
	bob := findByName(data.Working, "Bob")

	working, err := svc.Update(bob.Id, map[string]string{"role": "Senior Engineer", "discipline": "SRE"})
	if err != nil {
		t.Fatalf("update failed: %v", err)
	}
	updated := findById(working, bob.Id)
	if updated.Role != "Senior Engineer" {
		t.Errorf("expected role 'Senior Engineer', got '%s'", updated.Role)
	}
	if updated.Discipline != "SRE" {
		t.Errorf("expected discipline 'SRE', got '%s'", updated.Discipline)
	}
}

func TestOrgService_Add(t *testing.T) {
	svc := newTestService(t)
	data := svc.GetOrg()
	alice := findByName(data.Working, "Alice")

	added, _ := svc.Add(Person{
		Name: "Dave", Role: "Engineer", Discipline: "Eng",
		ManagerId: alice.Id, Team: "Eng", Status: "Active",
	})

	if added.Id == "" {
		t.Error("expected added person to have an ID")
	}

	working := svc.GetWorking()
	if len(working) != 4 {
		t.Errorf("expected 4 people, got %d", len(working))
	}
}

func TestOrgService_Delete(t *testing.T) {
	svc := newTestService(t)
	data := svc.GetOrg()
	bob := findByName(data.Working, "Bob")
	carol := findByName(data.Working, "Carol")

	err := svc.Delete(bob.Id)
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
	svc := newTestService(t)
	data := svc.GetOrg()
	bobId := findByName(data.Working, "Bob").Id
	carolId := findByName(data.Working, "Carol").Id

	err := svc.Delete(bobId)
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
	svc := newTestService(t)
	data := svc.GetOrg()
	bobId := findByName(data.Working, "Bob").Id

	svc.Delete(bobId)
	err := svc.Restore(bobId)
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
	svc := newTestService(t)
	data := svc.GetOrg()
	carolId := findByName(data.Working, "Carol").Id
	bobId := findByName(data.Working, "Bob").Id

	svc.Delete(bobId)
	svc.Delete(carolId)
	svc.Restore(carolId)

	working := svc.GetWorking()
	restoredCarol := findById(working, carolId)
	if restoredCarol.ManagerId != "" {
		t.Errorf("expected Carol unparented (manager Bob gone), got %s", restoredCarol.ManagerId)
	}
}

func TestOrgService_EmptyBin(t *testing.T) {
	svc := newTestService(t)
	data := svc.GetOrg()
	bobId := findByName(data.Working, "Bob").Id
	carolId := findByName(data.Working, "Carol").Id

	svc.Delete(bobId)
	svc.Delete(carolId)

	if len(svc.GetRecycled()) != 2 {
		t.Fatalf("expected 2 recycled")
	}

	svc.EmptyBin()
	if len(svc.GetRecycled()) != 0 {
		t.Errorf("expected 0 recycled after empty bin")
	}
}

func TestOrgService_Upload_AutoProceed(t *testing.T) {
	svc := NewOrgService()
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
	svc := NewOrgService()
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
	svc := NewOrgService()
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
	svc := NewOrgService()
	_, err := svc.ConfirmMapping(map[string]string{"name": "Name"})
	if err == nil {
		t.Fatal("expected error when no pending file")
	}
}

func TestOrgService_Reorder(t *testing.T) {
	svc := newTestService(t)
	data := svc.GetOrg()
	alice := findByName(data.Working, "Alice")
	bob := findByName(data.Working, "Bob")
	carol := findByName(data.Working, "Carol")

	// Reorder: Carol first, then Alice, then Bob
	working, err := svc.Reorder([]string{carol.Id, alice.Id, bob.Id})
	if err != nil {
		t.Fatalf("reorder failed: %v", err)
	}

	carolUpdated := findById(working, carol.Id)
	aliceUpdated := findById(working, alice.Id)
	bobUpdated := findById(working, bob.Id)

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
	svc := newTestService(t)
	data := svc.GetOrg()
	bob := findByName(data.Working, "Bob")

	// Only reorder Bob — others should be unaffected (SortIndex stays 0)
	working, err := svc.Reorder([]string{bob.Id})
	if err != nil {
		t.Fatalf("reorder failed: %v", err)
	}

	bobUpdated := findById(working, bob.Id)
	if bobUpdated.SortIndex != 0 {
		t.Errorf("expected Bob sortIndex 0, got %d", bobUpdated.SortIndex)
	}
}

func TestOrgService_ResetToOriginal(t *testing.T) {
	svc := newTestService(t)
	data := svc.GetOrg()
	bob := findByName(data.Working, "Bob")
	alice := findByName(data.Working, "Alice")

	// Make some changes: move Bob under Alice, delete Carol
	carol := findByName(data.Working, "Carol")
	svc.Move(bob.Id, alice.Id, "Eng")
	svc.Delete(carol.Id)

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
	svc := newTestService(t)
	data := svc.GetOrg()
	bob := findByName(data.Working, "Bob")
	alice := findByName(data.Working, "Alice")

	// Update every supported field
	working, err := svc.Update(bob.Id, map[string]string{
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
	updated := findById(working, bob.Id)
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
	svc := newTestService(t)
	data := svc.GetOrg()
	bob := findByName(data.Working, "Bob")

	_, err := svc.Update(bob.Id, map[string]string{"status": "INVALID"})
	if err == nil {
		t.Fatal("expected error for invalid status, got nil")
	}
}

func TestOrgService_Update_AdditionalTeamsEmpty(t *testing.T) {
	svc := newTestService(t)
	data := svc.GetOrg()
	bob := findByName(data.Working, "Bob")

	// First set additional teams
	svc.Update(bob.Id, map[string]string{"additionalTeams": "Platform, Eng"})

	// Then clear them
	working, err := svc.Update(bob.Id, map[string]string{"additionalTeams": ""})
	if err != nil {
		t.Fatalf("update failed: %v", err)
	}
	updated := findById(working, bob.Id)
	if updated.AdditionalTeams != nil {
		t.Errorf("expected nil additional teams, got %v", updated.AdditionalTeams)
	}
}

func TestOrgService_Update_UnknownField(t *testing.T) {
	svc := newTestService(t)
	data := svc.GetOrg()
	bob := findByName(data.Working, "Bob")

	_, err := svc.Update(bob.Id, map[string]string{"unknownField": "value"})
	if err == nil {
		t.Fatal("expected error for unknown field")
	}
}

func TestOrgService_Update_PersonNotFound(t *testing.T) {
	svc := newTestService(t)
	_, err := svc.Update("nonexistent", map[string]string{"role": "VP"})
	if err == nil {
		t.Fatal("expected error for nonexistent person")
	}
}

func TestOrgService_Move_PersonNotFound(t *testing.T) {
	svc := newTestService(t)
	_, err := svc.Move("nonexistent", "", "Eng")
	if err == nil {
		t.Fatal("expected error for nonexistent person")
	}
}

func TestOrgService_Move_ManagerNotFound(t *testing.T) {
	svc := newTestService(t)
	data := svc.GetOrg()
	bob := findByName(data.Working, "Bob")

	_, err := svc.Move(bob.Id, "nonexistent-manager", "Eng")
	if err == nil {
		t.Fatal("expected error for nonexistent manager")
	}
}

func TestOrgService_Move_NoTeamChange(t *testing.T) {
	svc := newTestService(t)
	data := svc.GetOrg()
	carol := findByName(data.Working, "Carol")
	alice := findByName(data.Working, "Alice")

	// Move with empty newTeam — team should stay the same
	working, err := svc.Move(carol.Id, alice.Id, "")
	if err != nil {
		t.Fatalf("move failed: %v", err)
	}
	updated := findById(working, carol.Id)
	if updated.Team != "Platform" {
		t.Errorf("expected team to remain 'Platform', got '%s'", updated.Team)
	}
	if updated.ManagerId != alice.Id {
		t.Errorf("expected manager to be Alice, got '%s'", updated.ManagerId)
	}
}

func TestOrgService_Move_SelfAsManager(t *testing.T) {
	svc := newTestService(t)
	data := svc.GetOrg()
	bob := findByName(data.Working, "Bob")

	_, err := svc.Move(bob.Id, bob.Id, "")
	if err == nil {
		t.Fatal("expected error when moving person to be their own manager")
	}
}

func TestOrgService_Move_CycleDetection(t *testing.T) {
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
	svc := newTestService(t)
	err := svc.Delete("nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent person")
	}
}

func TestOrgService_Restore_PersonNotFound(t *testing.T) {
	svc := newTestService(t)
	err := svc.Restore("nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent person in recycled")
	}
}

func TestOrgService_Upload_UnsupportedFormat(t *testing.T) {
	svc := NewOrgService()
	_, err := svc.Upload("test.txt", []byte("hello"))
	if err == nil {
		t.Fatal("expected error for unsupported format")
	}
}

func TestOrgService_Upload_InvalidCSV(t *testing.T) {
	svc := NewOrgService()
	// Only header, no data row
	_, err := svc.Upload("test.csv", []byte("Name,Role\n"))
	if err == nil {
		t.Fatal("expected error for CSV with no data rows")
	}
}

func TestOrgService_DeepCopyPeople_WithAdditionalTeams(t *testing.T) {
	svc := newTestService(t)
	data := svc.GetOrg()
	bob := findByName(data.Working, "Bob")

	// Set additional teams on Bob
	svc.Update(bob.Id, map[string]string{"additionalTeams": "Platform, Eng"})

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
	svc := NewOrgService()
	data := svc.GetOrg()
	if data != nil {
		t.Error("expected nil when no data loaded")
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
