package org

import (
	"context"
	"testing"

	"github.com/zachthieme/grove/internal/apitypes"
	"github.com/zachthieme/grove/internal/autosave"
	"github.com/zachthieme/grove/internal/model"
	"github.com/zachthieme/grove/internal/snapshot"
)

func ptr[T any](v T) *T { return &v }

func newTestService(t *testing.T) *OrgService {
	t.Helper()
	svc := New(snapshot.NewMemoryStore())
	csv := []byte("Name,Role,Discipline,Manager,Team,Additional Teams,Status\nAlice,VP,Eng,,Eng,,Active\nBob,Engineer,Eng,Alice,Platform,,Active\nCarol,Engineer,Eng,Bob,Platform,,Active\n")
	resp, err := svc.Upload(context.Background(), "test.csv", csv)
	if err != nil {
		t.Fatalf("upload failed: %v", err)
	}
	if resp.Status != UploadReady {
		t.Fatalf("expected status 'ready', got '%s'", resp.Status)
	}
	return svc
}

// Scenarios: ORG-001
func TestOrgService_Move(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	carol := findByName(data.Working, "Carol")
	alice := findByName(data.Working, "Alice")

	result, err := svc.Move(context.Background(), carol.Id, alice.Id, "Eng", "")
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

	result, err := svc.Update(context.Background(), bob.Id, apitypes.OrgNodeUpdate{Role: ptr("Senior Engineer"), Discipline: ptr("SRE")})
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

	added, _, _, err := svc.Add(context.Background(), apitypes.OrgNode{OrgNodeFields: model.OrgNodeFields{Name: "Dave", Role: "Engineer", Discipline: "Eng",
		Team: "Eng", Status: "Active"}, ManagerId: alice.Id,
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

// Scenarios: ORG-020
func TestOrgService_CopySubtree_Leaf(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	carol := findByName(data.Working, "Carol")
	alice := findByName(data.Working, "Alice")

	idMap, working, _, err := svc.CopySubtree(context.Background(), []string{carol.Id}, alice.Id)
	if err != nil {
		t.Fatalf("CopySubtree: %v", err)
	}
	if len(idMap) != 1 {
		t.Fatalf("expected 1 entry in idMap, got %d", len(idMap))
	}
	newId, ok := idMap[carol.Id]
	if !ok || newId == carol.Id {
		t.Fatalf("expected new id distinct from original; idMap=%v", idMap)
	}
	if len(working) != 4 {
		t.Errorf("expected 4 working nodes (3 + 1 copy), got %d", len(working))
	}
	copied := findById(working, newId)
	if copied == nil {
		t.Fatal("copy not in working")
	}
	if copied.Name != carol.Name {
		t.Errorf("copy name=%q, want %q", copied.Name, carol.Name)
	}
	if copied.ManagerId != alice.Id {
		t.Errorf("copy manager=%q, want %q (alice)", copied.ManagerId, alice.Id)
	}
}

// Scenarios: ORG-020
func TestOrgService_CopySubtree_PreservesInternalEdges(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	bob := findByName(data.Working, "Bob")
	alice := findByName(data.Working, "Alice")

	// Copy Bob's subtree (Bob → Carol) under Alice (so Alice gets a second
	// Bob-shaped subtree as a peer of the original Bob).
	idMap, working, _, err := svc.CopySubtree(context.Background(), []string{bob.Id}, alice.Id)
	if err != nil {
		t.Fatalf("CopySubtree: %v", err)
	}
	if len(idMap) != 2 {
		t.Fatalf("expected idMap to cover Bob + Carol, got %d entries: %v", len(idMap), idMap)
	}
	newBobId := idMap[bob.Id]
	carol := findByName(data.Working, "Carol")
	newCarolId := idMap[carol.Id]
	if newBobId == "" || newCarolId == "" {
		t.Fatalf("idMap missing entries: %v", idMap)
	}
	newBob := findById(working, newBobId)
	newCarol := findById(working, newCarolId)
	if newBob == nil || newCarol == nil {
		t.Fatal("expected both copies in working")
	}
	if newBob.ManagerId != alice.Id {
		t.Errorf("new Bob's manager=%q, want alice", newBob.ManagerId)
	}
	if newCarol.ManagerId != newBobId {
		t.Errorf("new Carol's manager=%q, want new Bob (%q)", newCarol.ManagerId, newBobId)
	}
	if findById(working, bob.Id) == nil || findById(working, carol.Id) == nil {
		t.Error("originals must remain in working")
	}
}

// Scenarios: ORG-020
func TestOrgService_CopySubtree_RootDuplicateDemoted(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	bob := findByName(data.Working, "Bob")
	carol := findByName(data.Working, "Carol")
	alice := findByName(data.Working, "Alice")

	// Carol is Bob's descendant; passing both as roots should demote Carol
	// — the copy still happens (Carol's copy is a child of Bob's copy)
	// but Carol is not re-rooted directly under Alice.
	idMap, working, _, err := svc.CopySubtree(context.Background(), []string{bob.Id, carol.Id}, alice.Id)
	if err != nil {
		t.Fatalf("CopySubtree: %v", err)
	}
	newBobId := idMap[bob.Id]
	newCarolId := idMap[carol.Id]
	if newCarolId == "" {
		t.Fatalf("expected Carol copied; idMap=%v", idMap)
	}
	newCarol := findById(working, newCarolId)
	if newCarol.ManagerId != newBobId {
		t.Errorf("Carol copy manager=%q, want new Bob (Carol was demoted from root); idMap=%v", newCarol.ManagerId, idMap)
	}
}

// Scenarios: ORG-020
func TestOrgService_CopySubtree_NoRootsRejected(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	_, _, _, err := svc.CopySubtree(context.Background(), nil, "")
	if err == nil {
		t.Fatal("expected error for empty rootIds")
	}
}

// Scenarios: ORG-020
func TestOrgService_CopySubtree_MissingTarget(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	bob := findByName(data.Working, "Bob")
	_, _, _, err := svc.CopySubtree(context.Background(), []string{bob.Id}, "no-such-target")
	if err == nil {
		t.Fatal("expected error for missing target")
	}
}

// Scenarios: ORG-020
func TestOrgService_CopySubtree_TargetIsProductRejected(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	alice := findByName(data.Working, "Alice")
	bob := findByName(data.Working, "Bob")

	// Add a product under alice and try to copy under it.
	prod, _, _, err := svc.Add(context.Background(), apitypes.OrgNode{
		OrgNodeFields: model.OrgNodeFields{Name: "Widget", Type: "product", Status: "Active", Team: "Eng"},
		ManagerId:     alice.Id,
	})
	if err != nil {
		t.Fatalf("seed product: %v", err)
	}
	_, _, _, err = svc.CopySubtree(context.Background(), []string{bob.Id}, prod.Id)
	if err == nil {
		t.Fatal("expected error: cannot copy under a product")
	}
}

// Scenarios: ORG-020
func TestOrgService_CopySubtree_TopLevelPaste(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	bob := findByName(data.Working, "Bob")

	idMap, working, _, err := svc.CopySubtree(context.Background(), []string{bob.Id}, "")
	if err != nil {
		t.Fatalf("CopySubtree: %v", err)
	}
	newBob := findById(working, idMap[bob.Id])
	if newBob == nil {
		t.Fatal("new Bob missing")
	}
	if newBob.ManagerId != "" {
		t.Errorf("expected new Bob to be top-level (managerId=''), got %q", newBob.ManagerId)
	}
}

// Scenarios: ORG-020
func TestOrgService_CopySubtree_PodsCarry(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	bob := findByName(data.Working, "Bob")
	alice := findByName(data.Working, "Alice")

	// Put Carol in a pod under Bob, then copy Bob's subtree.
	carol := findByName(data.Working, "Carol")
	if _, err := svc.CreatePod(context.Background(), bob.Id, "Backend", "Platform"); err != nil {
		t.Fatalf("seed pod: %v", err)
	}
	pod := "Backend"
	if _, err := svc.Update(context.Background(), carol.Id, apitypes.OrgNodeUpdate{Pod: &pod}); err != nil {
		t.Fatalf("seed pod via update: %v", err)
	}

	idMap, working, pods, err := svc.CopySubtree(context.Background(), []string{bob.Id}, alice.Id)
	if err != nil {
		t.Fatalf("CopySubtree: %v", err)
	}
	newBobId := idMap[bob.Id]
	newCarolId := idMap[carol.Id]

	newCarol := findById(working, newCarolId)
	if newCarol == nil {
		t.Fatal("new Carol missing")
	}
	if newCarol.Pod != "Backend" {
		t.Errorf("new Carol's pod should carry across the copy, got %q", newCarol.Pod)
	}

	// A new pod entry must exist under the new Bob.
	var found bool
	for _, p := range pods {
		if p.ManagerId == newBobId && p.Name == "Backend" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected duplicated pod 'Backend' under new Bob (%q); pods=%+v", newBobId, pods)
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
	if _, err := svc.Move(context.Background(), bob.Id, alice.Id, "Eng", ""); err != nil {
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
	result, err := svc.Update(context.Background(), bob.Id, apitypes.OrgNodeUpdate{
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

	_, err := svc.Update(context.Background(), bob.Id, apitypes.OrgNodeUpdate{Status: ptr("INVALID")})
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
	if _, err := svc.Update(context.Background(), bob.Id, apitypes.OrgNodeUpdate{AdditionalTeams: ptr("Platform, Eng")}); err != nil {
		t.Fatalf("update failed: %v", err)
	}

	// Then clear them
	result, err := svc.Update(context.Background(), bob.Id, apitypes.OrgNodeUpdate{AdditionalTeams: ptr("")})
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
	result, err := svc.Update(context.Background(), bob.Id, apitypes.OrgNodeUpdate{Private: ptr(true)})
	if err != nil {
		t.Fatalf("update failed: %v", err)
	}
	updated := findById(result.Working, bob.Id)
	if !updated.Private {
		t.Error("expected Private to be true")
	}

	// Set private to false
	result, err = svc.Update(context.Background(), bob.Id, apitypes.OrgNodeUpdate{Private: ptr(false)})
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
	_, err := svc.Update(context.Background(), "nonexistent", apitypes.OrgNodeUpdate{Role: ptr("VP")})
	if err == nil {
		t.Fatal("expected error for nonexistent person")
	}
}

// Scenarios: ORG-003
func TestOrgService_Move_PersonNotFound(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	_, err := svc.Move(context.Background(), "nonexistent", "", "Eng", "")
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

	_, err := svc.Move(context.Background(), bob.Id, "nonexistent-manager", "Eng", "")
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
	result, err := svc.Move(context.Background(), carol.Id, alice.Id, "", "")
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

	_, err := svc.Move(context.Background(), bob.Id, bob.Id, "", "")
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

	_, err := svc.Move(context.Background(), alice.Id, carol.Id, "", "")
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
	_, err := svc.Update(context.Background(), alice.Id, apitypes.OrgNodeUpdate{ManagerId: ptr(carol.Id)})
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

// Scenarios: CONTRACT-006
func TestOrgService_DeepCopyPeople_WithAdditionalTeams(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	bob := findByName(data.Working, "Bob")

	// Set additional teams on Bob
	if _, err := svc.Update(context.Background(), bob.Id, apitypes.OrgNodeUpdate{AdditionalTeams: ptr("Platform, Eng")}); err != nil {
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
	svc := New(snapshot.NewMemoryStore())
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
		_, err := svc.Update(context.Background(), alice.Id, apitypes.OrgNodeUpdate{Name: ptr(longStr)})
		if err == nil {
			t.Error("expected error for field too long")
		}
	})

	t.Run("[ORG-009] Update accepts max-length field", func(t *testing.T) {
		okStr := string(make([]byte, maxFieldLen))
		_, err := svc.Update(context.Background(), alice.Id, apitypes.OrgNodeUpdate{Name: ptr(okStr)})
		if err != nil {
			t.Errorf("expected no error, got %v", err)
		}
	})

	t.Run("[ORG-009] Add rejects long name", func(t *testing.T) {
		_, _, _, err := svc.Add(context.Background(), apitypes.OrgNode{OrgNodeFields: model.OrgNodeFields{Name: longStr, Role: "Eng", Discipline: "Eng",
			Team: "Eng", Status: "Active"},
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
		_, err := svc.Move(context.Background(), alice.Id, alice.Id, "", "")
		if err == nil {
			t.Error("expected error for self-reference")
		}
	})

	t.Run("[ORG-002] self-reference via Update", func(t *testing.T) {
		_, err := svc.Update(context.Background(), bob.Id, apitypes.OrgNodeUpdate{ManagerId: ptr(bob.Id)})
		if err == nil {
			t.Error("expected error for self-reference")
		}
	})

	t.Run("[ORG-002] cycle via Move", func(t *testing.T) {
		// Alice -> Bob -> Carol. Moving Alice under Carol creates cycle.
		_, err := svc.Move(context.Background(), alice.Id, carol.Id, "", "")
		if err == nil {
			t.Error("expected error for cycle")
		}
	})

	t.Run("[ORG-002] nonexistent manager", func(t *testing.T) {
		_, err := svc.Move(context.Background(), bob.Id, "nonexistent-id", "", "")
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
		people, err := svc.ExportSnapshot(context.Background(), snapshot.Working)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(people) != 3 {
			t.Errorf("expected 3 people, got %d", len(people))
		}
	})

	t.Run("[SNAP-008] returns original for __original__", func(t *testing.T) {
		t.Parallel()
		people, err := svc.ExportSnapshot(context.Background(), snapshot.Original)
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

	for _, name := range []string{snapshot.Working, snapshot.Original} {
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
	_, _, _, err := svc.Add(context.Background(), apitypes.OrgNode{OrgNodeFields: model.OrgNodeFields{Name: "Test", Status: "BOGUS", Team: "Eng"}})
	if err == nil {
		t.Fatal("expected error for invalid status")
	}
}

// Scenarios: ORG-011
func TestOrgService_Add_RejectsInvalidManager(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	_, _, _, err := svc.Add(context.Background(), apitypes.OrgNode{OrgNodeFields: model.OrgNodeFields{Name: "Test", Status: "Active", Team: "Eng"}, ManagerId: "nonexistent"})
	if err == nil {
		t.Fatal("expected error for invalid manager")
	}
}

// Scenarios: AUTO-007
func TestOrgService_RestoreState_FullState(t *testing.T) {
	t.Parallel()
	svc := New(snapshot.NewMemoryStore())
	settings := &apitypes.Settings{DisciplineOrder: []string{"Eng", "Product"}}
	data := autosave.AutosaveData{
		Original: []apitypes.OrgNode{
			{OrgNodeFields: model.OrgNodeFields{Name: "Alice", Role: "VP", Team: "Eng", Status: "Active"}, Id: "1"},
			{OrgNodeFields: model.OrgNodeFields{Name: "Bob", Role: "Engineer", Team: "Platform", Status: "Active"}, Id: "2", ManagerId: "1"},
		},
		Working: []apitypes.OrgNode{
			{OrgNodeFields: model.OrgNodeFields{Name: "Alice", Role: "VP", Team: "Eng", Status: "Active"}, Id: "1"},
			{OrgNodeFields: model.OrgNodeFields{Name: "Bob", Role: "Senior Engineer", Team: "Platform", Status: "Active"}, Id: "2", ManagerId: "1"},
		},
		Recycled: []apitypes.OrgNode{
			{OrgNodeFields: model.OrgNodeFields{Name: "Carol", Role: "Engineer", Team: "Platform", Status: "Active"}, Id: "3"},
		},
		Pods:         []apitypes.Pod{{Id: "p1", Name: "Platform", Team: "Platform", ManagerId: "1"}},
		OriginalPods: []apitypes.Pod{{Id: "p1", Name: "Platform", Team: "Platform", ManagerId: "1"}},
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
	svc := New(snapshot.NewMemoryStore())
	data := autosave.AutosaveData{
		Original: []apitypes.OrgNode{
			{OrgNodeFields: model.OrgNodeFields{Name: "Alice", Role: "VP", Team: "Eng", Status: "Active"}, Id: "1"},
			{OrgNodeFields: model.OrgNodeFields{Name: "Bob", Role: "Engineer", Team: "Platform", Status: "Active"}, Id: "2", ManagerId: "1"},
			{OrgNodeFields: model.OrgNodeFields{Name: "Carol", Role: "Engineer", Team: "Platform", Status: "Active"}, Id: "3", ManagerId: "2"},
		},
		Working: []apitypes.OrgNode{
			{OrgNodeFields: model.OrgNodeFields{Name: "Alice", Role: "VP", Team: "Eng", Status: "Active"}, Id: "1"},
			{OrgNodeFields: model.OrgNodeFields{Name: "Bob", Role: "Engineer", Team: "Platform", Status: "Active"}, Id: "2", ManagerId: "1"},
			{OrgNodeFields: model.OrgNodeFields{Name: "Carol", Role: "Engineer", Team: "Platform", Status: "Active"}, Id: "3", ManagerId: "2"},
		},
		Settings: &apitypes.Settings{DisciplineOrder: []string{"Eng"}},
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
	updateResult, err := svc.Update(context.Background(), "2", apitypes.OrgNodeUpdate{Role: ptr("Staff Engineer")})
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
	svc := New(snapshot.NewMemoryStore())
	data := autosave.AutosaveData{
		Original: []apitypes.OrgNode{
			{OrgNodeFields: model.OrgNodeFields{Name: "Alice", Discipline: "Product", Team: "Eng", Status: "Active"}, Id: "1"},
			{OrgNodeFields: model.OrgNodeFields{Name: "Bob", Discipline: "Engineering", Team: "Platform", Status: "Active"}, Id: "2", ManagerId: "1"},
		},
		Working: []apitypes.OrgNode{
			{OrgNodeFields: model.OrgNodeFields{Name: "Alice", Discipline: "Product", Team: "Eng", Status: "Active"}, Id: "1"},
			{OrgNodeFields: model.OrgNodeFields{Name: "Bob", Discipline: "Engineering", Team: "Platform", Status: "Active"}, Id: "2", ManagerId: "1"},
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
	svc := New(snapshot.NewMemoryStore())
	csv := []byte("Name,Role,Discipline,Manager,Team,Status\nAlice,VP,Eng,,Eng,Active\nBob,Manager,Eng,Alice,Platform,Active\nCarol,Engineer,Eng,Bob,Platform,Active\nDave,Engineer,Eng,Alice,Eng,Active\n")
	resp, err := svc.Upload(context.Background(), "test.csv", csv)
	if err != nil {
		t.Fatalf("upload failed: %v", err)
	}
	if resp.Status != UploadReady {
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
	svc := New(snapshot.NewMemoryStore())
	csv := []byte("Name,Role,Discipline,Manager,Team,Status\nAlice,VP,Eng,,Eng,Active\nBob,Manager,Eng,Alice,Platform,Active\nCarol,Engineer,Eng,Bob,Platform,Active\nDave,Engineer,Eng,Bob,Platform,Active\n")
	resp, err := svc.Upload(context.Background(), "test.csv", csv)
	if err != nil {
		t.Fatalf("upload failed: %v", err)
	}
	if resp.Status != UploadReady {
		t.Fatalf("expected ready, got %s", resp.Status)
	}
	data := svc.GetOrg(context.Background())
	bob := findByName(data.Working, "Bob")
	carol := findByName(data.Working, "Carol")
	dave := findByName(data.Working, "Dave")

	result, err := svc.Update(context.Background(), bob.Id, apitypes.OrgNodeUpdate{Team: ptr("Infra")})
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

	result, err := svc.Update(context.Background(), alice.Id, apitypes.OrgNodeUpdate{Team: ptr("NewTeam")})
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
	result, err := svc.Update(context.Background(), carol.Id, apitypes.OrgNodeUpdate{Pod: ptr("Alpha")})
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
	_, err := svc.Update(context.Background(), carol.Id, apitypes.OrgNodeUpdate{Pod: ptr("Alpha")})
	if err != nil {
		t.Fatalf("first pod update failed: %v", err)
	}

	// Add a new person under Bob and assign same pod "Alpha"
	added, _, _, err := svc.Add(context.Background(), apitypes.OrgNode{OrgNodeFields: model.OrgNodeFields{Name: "Eve", Role: "Engineer", Discipline: "Eng",
		Team: "Platform", Status: "Active"}, ManagerId: bob.Id,
	})
	if err != nil {
		t.Fatalf("add failed: %v", err)
	}

	result, err := svc.Update(context.Background(), added.Id, apitypes.OrgNodeUpdate{Pod: ptr("Alpha")})
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
	_, err := svc.Update(context.Background(), carol.Id, apitypes.OrgNodeUpdate{Pod: ptr("Alpha")})
	if err != nil {
		t.Fatalf("set pod failed: %v", err)
	}

	// Clear pod
	result, err := svc.Update(context.Background(), carol.Id, apitypes.OrgNodeUpdate{Pod: ptr("")})
	if err != nil {
		t.Fatalf("clear pod failed: %v", err)
	}
	updatedCarol := findById(result.Working, carol.Id)
	if updatedCarol.Pod != "" {
		t.Errorf("expected Carol's pod to be empty, got '%s'", updatedCarol.Pod)
	}
}

func findById(people []apitypes.OrgNode, id string) *apitypes.OrgNode {
	for i := range people {
		if people[i].Id == id {
			return &people[i]
		}
	}
	return nil
}

// Scenarios: CREATE-002
func TestOrgService_AddParent(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	alice := findByName(data.Working, "Alice")

	parent, working, pods, err := svc.AddParent(context.Background(), alice.Id, "CEO")
	if err != nil {
		t.Fatalf("add parent failed: %v", err)
	}
	if parent.Name != "CEO" {
		t.Errorf("expected parent name CEO, got %s", parent.Name)
	}
	if parent.Status != "Active" {
		t.Errorf("expected status Active, got %s", parent.Status)
	}
	if parent.Id == "" {
		t.Error("expected non-empty parent ID")
	}
	if parent.ManagerId != "" {
		t.Error("expected parent to have no manager")
	}
	// Alice should now report to the new parent
	updatedAlice := findById(working, alice.Id)
	if updatedAlice.ManagerId != parent.Id {
		t.Errorf("expected Alice's manager to be %s, got %s", parent.Id, updatedAlice.ManagerId)
	}
	// New parent should be in working but NOT in original
	if len(working) != 4 {
		t.Errorf("expected 4 working people, got %d", len(working))
	}
	orig := svc.GetOrg(context.Background()).Original
	if len(orig) != 3 {
		t.Errorf("expected 3 original people (unchanged), got %d", len(orig))
	}
	_ = pods
}

// Scenarios: CREATE-003
func TestOrgService_AddParent_ChildHasManager(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	ctx := context.Background()
	data := svc.GetOrg(ctx)
	bob := findByName(data.Working, "Bob")     // Bob reports to Alice
	alice := findByName(data.Working, "Alice") // Alice is root

	parent, working, _, err := svc.AddParent(ctx, bob.Id, "Middle Manager")
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if parent.Name != "Middle Manager" {
		t.Errorf("expected parent name 'Middle Manager', got %q", parent.Name)
	}
	// The new parent should now manage Bob
	updatedBob := findById(working, bob.Id)
	if updatedBob.ManagerId != parent.Id {
		t.Errorf("expected bob.ManagerId=%q, got %q", parent.Id, updatedBob.ManagerId)
	}
	// The new parent should report to Alice (Bob's old manager)
	newParent := findById(working, parent.Id)
	if newParent == nil {
		t.Fatal("new parent not found in working")
	}
	if newParent.ManagerId != alice.Id {
		t.Errorf("expected newParent.ManagerId=%q (Alice), got %q", alice.Id, newParent.ManagerId)
	}
}

// Scenarios: CREATE-004
func TestOrgService_AddParent_EmptyName(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	alice := findByName(data.Working, "Alice")

	_, _, _, err := svc.AddParent(context.Background(), alice.Id, "")
	if err == nil {
		t.Fatal("expected error for empty name")
	}
	if !IsValidation(err) {
		t.Errorf("expected ValidationError, got %T: %v", err, err)
	}
}

// Scenarios: CREATE-004
func TestOrgService_AddParent_ChildNotFound(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)

	_, _, _, err := svc.AddParent(context.Background(), "nonexistent", "CEO")
	if err == nil {
		t.Fatal("expected error for nonexistent child")
	}
	if !IsNotFound(err) {
		t.Errorf("expected NotFoundError, got %T: %v", err, err)
	}
}

// Scenarios: CREATE-001
func TestOrgService_Create(t *testing.T) {
	t.Parallel()
	svc := New(snapshot.NewMemoryStore())

	data, err := svc.Create(context.Background(), "Alice")
	if err != nil {
		t.Fatalf("create failed: %v", err)
	}
	if len(data.Original) != 1 {
		t.Errorf("expected 1 original, got %d", len(data.Original))
	}
	if len(data.Working) != 1 {
		t.Errorf("expected 1 working, got %d", len(data.Working))
	}
	p := data.Working[0]
	if p.Name != "Alice" {
		t.Errorf("expected name Alice, got %s", p.Name)
	}
	if p.Status != "Active" {
		t.Errorf("expected status Active, got %s", p.Status)
	}
	if p.Id == "" {
		t.Error("expected non-empty ID")
	}
	if p.Role != "" || p.Discipline != "" || p.Team != "" {
		t.Error("expected blank role, discipline, and team")
	}
	// disciplineOrder must be [] not nil so JSON encodes as [] not null
	if data.Settings == nil {
		t.Fatal("expected non-nil settings")
	}
	if data.Settings.DisciplineOrder == nil {
		t.Error("[CREATE-001] disciplineOrder must be [] not null after create")
	}
	if len(data.Settings.DisciplineOrder) != 0 {
		t.Errorf("[CREATE-001] expected empty disciplineOrder, got %v", data.Settings.DisciplineOrder)
	}
}

// Scenarios: CREATE-004
func TestOrgService_Create_EmptyName(t *testing.T) {
	t.Parallel()
	svc := New(snapshot.NewMemoryStore())

	_, err := svc.Create(context.Background(), "")
	if err == nil {
		t.Fatal("expected error for empty name")
	}
	if !IsValidation(err) {
		t.Errorf("expected ValidationError, got %T: %v", err, err)
	}
}

// Scenarios: CREATE-004
func TestOrgService_Create_WhitespaceName(t *testing.T) {
	t.Parallel()
	svc := New(snapshot.NewMemoryStore())

	_, err := svc.Create(context.Background(), "   ")
	if err == nil {
		t.Fatal("expected error for whitespace-only name")
	}
	if !IsValidation(err) {
		t.Errorf("expected ValidationError, got %T: %v", err, err)
	}
}

// Scenarios: CREATE-001, CREATE-002
func TestOrgService_CreateThenAddThenAddParent(t *testing.T) {
	t.Parallel()
	svc := New(snapshot.NewMemoryStore())

	// Step 1: Create from scratch
	data, err := svc.Create(context.Background(), "Alice")
	if err != nil {
		t.Fatalf("create failed: %v", err)
	}
	alice := data.Working[0]

	// Step 2: Add a direct report
	bob, working, _, err := svc.Add(context.Background(), apitypes.OrgNode{OrgNodeFields: model.OrgNodeFields{Name: "Bob", Status: "Active"}, ManagerId: alice.Id})
	if err != nil {
		t.Fatalf("add failed: %v", err)
	}
	if len(working) != 2 {
		t.Errorf("expected 2 working, got %d", len(working))
	}

	// Step 3: Add parent above Alice
	ceo, working, _, err := svc.AddParent(context.Background(), alice.Id, "CEO")
	if err != nil {
		t.Fatalf("add parent failed: %v", err)
	}
	if len(working) != 3 {
		t.Errorf("expected 3 working, got %d", len(working))
	}

	// Verify hierarchy: CEO -> Alice -> Bob
	updatedAlice := findById(working, alice.Id)
	if updatedAlice.ManagerId != ceo.Id {
		t.Errorf("Alice should report to CEO")
	}
	updatedBob := findById(working, bob.Id)
	if updatedBob.ManagerId != alice.Id {
		t.Errorf("Bob should still report to Alice")
	}
	ceoEntry := findById(working, ceo.Id)
	if ceoEntry.ManagerId != "" {
		t.Errorf("CEO should be root (no manager)")
	}
}

// Scenarios: SNAP-001
func TestOrgService_CaptureState_DeepCopiesWorking(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	state := svc.CaptureState()

	if len(state.People) == 0 {
		t.Fatal("expected captured people")
	}
	// Mutating the captured slice must not affect the service.
	state.People[0].Name = "MUTATED"

	working := svc.GetWorking(context.Background())
	for _, p := range working {
		if p.Name == "MUTATED" {
			t.Fatal("CaptureState did not deep-copy: mutation leaked")
		}
	}
}

// Scenarios: SNAP-001
func TestOrgService_CaptureState_DeepCopiesAdditionalTeams(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	bob := findByName(data.Working, "Bob")

	// Seed Bob with a non-empty AdditionalTeams so we can mutate an existing element.
	if _, err := svc.Update(context.Background(), bob.Id, apitypes.OrgNodeUpdate{AdditionalTeams: ptr("Platform, Eng")}); err != nil {
		t.Fatalf("seeding AdditionalTeams failed: %v", err)
	}

	state := svc.CaptureState()

	// Find Bob in the captured state.
	var capturedBob *apitypes.OrgNode
	for i := range state.People {
		if state.People[i].Id == bob.Id {
			capturedBob = &state.People[i]
			break
		}
	}
	if capturedBob == nil {
		t.Fatal("Bob not found in captured state")
	}
	if len(capturedBob.AdditionalTeams) == 0 {
		t.Fatal("expected non-empty AdditionalTeams in captured state")
	}

	// Mutate the captured slice in-place (not append — this writes through if not deep-copied).
	original := capturedBob.AdditionalTeams[0]
	capturedBob.AdditionalTeams[0] = "LEAKED"

	// Re-fetch from service and verify the original value is preserved.
	working := svc.GetWorking(context.Background())
	for _, p := range working {
		if p.Id == bob.Id {
			if len(p.AdditionalTeams) > 0 && p.AdditionalTeams[0] == "LEAKED" {
				t.Errorf("CaptureState did not deep-copy AdditionalTeams: in-place mutation leaked (was %q)", original)
			}
			return
		}
	}
	t.Fatal("Bob not found in working after CaptureState")
}

// Scenarios: SNAP-001
func TestOrgService_CaptureState_IncludesPodsAndSettings(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	state := svc.CaptureState()

	// Settings derived from upload should appear.
	if len(state.Settings.DisciplineOrder) == 0 {
		t.Errorf("expected non-empty discipline order in captured settings")
	}
	// Pods slice exists (may be empty for a fresh upload).
	if state.Pods == nil {
		t.Errorf("expected non-nil pods slice in captured state")
	}
}

// Scenarios: SNAP-002
func TestOrgService_ApplyState_ReplacesWorkingPodsSettings(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	original := svc.CaptureState()

	// Build a state with one synthetic person and replace.
	newState := snapshot.OrgState{
		People: []apitypes.OrgNode{{
			OrgNodeFields: model.OrgNodeFields{Name: "Solo", Status: "Active"},
			Id:            "synthetic-id",
		}},
		Pods:     []apitypes.Pod{},
		Settings: apitypes.Settings{DisciplineOrder: []string{"Synthetic"}},
	}
	svc.ApplyState(newState)

	working := svc.GetWorking(context.Background())
	if len(working) != 1 || working[0].Name != "Solo" {
		t.Errorf("expected working = [Solo], got %v", working)
	}
	if got := svc.GetSettings(context.Background()).DisciplineOrder; len(got) != 1 || got[0] != "Synthetic" {
		t.Errorf("expected settings replaced, got %v", got)
	}

	// Restore so subsequent assertions could run if extended.
	svc.ApplyState(original)
}

func newTestServiceFromNodes(t *testing.T, nodes []model.OrgNode) *OrgService {
	t.Helper()
	mod, err := model.NewOrg(nodes)
	if err != nil {
		t.Fatalf("newTestServiceFromNodes: NewOrg failed: %v", err)
	}
	apiNodes := ConvertOrg(mod)
	svc := New(snapshot.NewMemoryStore())
	svc.RestoreState(context.Background(), autosave.AutosaveData{
		Original: apiNodes,
		Working:  apiNodes,
	})
	return svc
}
