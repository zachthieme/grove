package pod

import (
	"errors"
	"testing"

	"github.com/zachthieme/grove/internal/apitypes"
)

// person builds a minimal OrgNode for pod tests.
func person(id, mgr, team, podName string) apitypes.OrgNode {
	p := apitypes.OrgNode{Id: id, ManagerId: mgr}
	p.Team = team
	p.Pod = podName
	return p
}

// Scenarios: POD-001
func TestManager_New_Empty(t *testing.T) {
	t.Parallel()
	pm := New()
	if pm.Pods() != nil {
		t.Errorf("expected nil Pods on empty Manager, got %v", pm.Pods())
	}
	if pm.OriginalPods() != nil {
		t.Errorf("expected nil OriginalPods on empty Manager, got %v", pm.OriginalPods())
	}
}

// Scenarios: POD-001
func TestManager_SetState_ReplacesBoth(t *testing.T) {
	t.Parallel()
	pm := New()
	pods := []apitypes.Pod{{Id: "p1", Name: "Pod1"}}
	orig := []apitypes.Pod{{Id: "o1", Name: "Orig1"}}
	pm.SetState(pods, orig)
	if len(pm.Pods()) != 1 || pm.Pods()[0].Id != "p1" {
		t.Errorf("Pods not replaced")
	}
	if len(pm.OriginalPods()) != 1 || pm.OriginalPods()[0].Id != "o1" {
		t.Errorf("OriginalPods not replaced")
	}
}

// Scenarios: POD-001
func TestManager_SetPods_DoesNotTouchOriginal(t *testing.T) {
	t.Parallel()
	pm := New()
	orig := []apitypes.Pod{{Id: "o1"}}
	pm.SetState([]apitypes.Pod{{Id: "p1"}}, orig)
	pm.SetPods([]apitypes.Pod{{Id: "p2"}})
	if pm.Pods()[0].Id != "p2" {
		t.Errorf("expected p2, got %s", pm.Pods()[0].Id)
	}
	if pm.OriginalPods()[0].Id != "o1" {
		t.Errorf("OriginalPods mutated unexpectedly: %v", pm.OriginalPods())
	}
}

// Scenarios: POD-001
//
// Reset must produce a deep copy of originalPods — mutating Pods after
// Reset must not affect OriginalPods.
func TestManager_Reset_DeepCopiesOriginal(t *testing.T) {
	t.Parallel()
	pm := New()
	pm.SetState([]apitypes.Pod{}, []apitypes.Pod{{Id: "o1", Name: "Orig"}})
	pm.Reset()
	if pm.Pods()[0].Id != "o1" {
		t.Fatal("Reset did not restore originalPods")
	}
	pm.Pods()[0].Name = "Mutated"
	if pm.OriginalPods()[0].Name == "Mutated" {
		t.Errorf("Reset returned shallow copy: original mutated")
	}
}

// Scenarios: POD-002
//
// Seed builds pods from working people and captures a copy as
// originalPods. Mutating pods later must not corrupt the captured
// originalPods.
func TestManager_Seed_CapturesOriginalCopy(t *testing.T) {
	t.Parallel()
	pm := New()
	working := []apitypes.OrgNode{
		person("p1", "m1", "Eng", "Alpha"),
	}
	pm.Seed(working)
	if len(pm.Pods()) == 0 {
		t.Fatal("expected Seed to create pods")
	}
	pm.Pods()[0].Name = "Mutated"
	for _, op := range pm.OriginalPods() {
		if op.Name == "Mutated" {
			t.Errorf("Seed captured shallow ref: originalPods mutated")
		}
	}
}

// Scenarios: POD-003
func TestManager_List_CountsMembers(t *testing.T) {
	t.Parallel()
	pm := New()
	pm.SetState([]apitypes.Pod{
		{Id: "pod-a", Name: "Alpha", ManagerId: "m1"},
		{Id: "pod-b", Name: "Beta", ManagerId: "m1"},
	}, nil)
	working := []apitypes.OrgNode{
		person("u1", "m1", "Eng", "Alpha"),
		person("u2", "m1", "Eng", "Alpha"),
		person("u3", "m1", "Eng", "Beta"),
		person("u4", "m1", "Eng", ""), // not in any pod
	}
	got := pm.List(working)
	want := map[string]int{"Alpha": 2, "Beta": 1}
	for _, info := range got {
		if got, expected := info.MemberCount, want[info.Name]; got != expected {
			t.Errorf("pod %s: count %d, want %d", info.Name, got, expected)
		}
	}
}

// Scenarios: POD-004
func TestManager_Update_NotFound(t *testing.T) {
	t.Parallel()
	pm := New()
	str := func(s string) *string { return &s }
	err := pm.Update("missing", apitypes.PodUpdate{Name: str("X")}, nil)
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

// Scenarios: POD-004
func TestManager_Update_RenameAndNotes(t *testing.T) {
	t.Parallel()
	pm := New()
	pm.SetState([]apitypes.Pod{
		{Id: "p1", Name: "OldName", Team: "Eng", ManagerId: "m1"},
	}, nil)
	working := []apitypes.OrgNode{person("u1", "m1", "Eng", "OldName")}

	str := func(s string) *string { return &s }
	err := pm.Update("p1", apitypes.PodUpdate{
		Name:        str("NewName"),
		PublicNote:  str("pub"),
		PrivateNote: str("priv"),
	}, working)
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	got := pm.Pods()[0]
	if got.Name != "NewName" {
		t.Errorf("name: %q want NewName", got.Name)
	}
	if got.PublicNote != "pub" || got.PrivateNote != "priv" {
		t.Errorf("notes not applied: %+v", got)
	}
	// Working person's pod field should be updated too.
	if working[0].Pod != "NewName" {
		t.Errorf("Rename did not propagate to working: %q", working[0].Pod)
	}
}

// Scenarios: POD-004
//
// Update with only notes set must NOT rename — Name=nil means "leave alone".
func TestManager_Update_NotesOnlyDoesNotRename(t *testing.T) {
	t.Parallel()
	pm := New()
	pm.SetState([]apitypes.Pod{{Id: "p1", Name: "Keep", ManagerId: "m1"}}, nil)
	str := func(s string) *string { return &s }
	if err := pm.Update("p1", apitypes.PodUpdate{PublicNote: str("note")}, nil); err != nil {
		t.Fatalf("Update: %v", err)
	}
	if pm.Pods()[0].Name != "Keep" {
		t.Errorf("expected name unchanged, got %q", pm.Pods()[0].Name)
	}
}

// Scenarios: POD-005
func TestManager_Create_NewPod(t *testing.T) {
	t.Parallel()
	pm := New()
	if err := pm.Create("m1", "Alpha", "Eng"); err != nil {
		t.Fatalf("Create: %v", err)
	}
	if len(pm.Pods()) != 1 {
		t.Fatalf("expected 1 pod, got %d", len(pm.Pods()))
	}
	got := pm.Pods()[0]
	if got.Name != "Alpha" || got.Team != "Eng" || got.ManagerId != "m1" {
		t.Errorf("pod fields wrong: %+v", got)
	}
	if got.Id == "" {
		t.Error("expected non-empty UUID")
	}
}

// Scenarios: POD-005
func TestManager_Create_DuplicateRejected(t *testing.T) {
	t.Parallel()
	pm := New()
	if err := pm.Create("m1", "Alpha", "Eng"); err != nil {
		t.Fatalf("first Create: %v", err)
	}
	err := pm.Create("m1", "Alpha2", "Eng")
	if !errors.Is(err, ErrDuplicate) {
		t.Errorf("expected ErrDuplicate (same manager+team), got %v", err)
	}
	if len(pm.Pods()) != 1 {
		t.Errorf("duplicate should not have been added: %d pods", len(pm.Pods()))
	}
}

// Scenarios: POD-005
//
// Different (manager, team) combinations are independent — same name is
// fine.
func TestManager_Create_SameNameDifferentManagerOK(t *testing.T) {
	t.Parallel()
	pm := New()
	if err := pm.Create("m1", "Alpha", "Eng"); err != nil {
		t.Fatalf("Create m1: %v", err)
	}
	if err := pm.Create("m2", "Alpha", "Eng"); err != nil {
		t.Errorf("expected different manager allowed, got %v", err)
	}
}

// Scenarios: POD-006
func TestManager_Cleanup_RemovesEmpty(t *testing.T) {
	t.Parallel()
	pm := New()
	pm.SetState([]apitypes.Pod{
		{Id: "a", Name: "Alpha", ManagerId: "m1"},
		{Id: "b", Name: "Beta", ManagerId: "m1"},
	}, nil)
	working := []apitypes.OrgNode{
		person("u1", "m1", "Eng", "Alpha"),
	}
	pm.Cleanup(working)
	if len(pm.Pods()) != 1 || pm.Pods()[0].Name != "Alpha" {
		t.Errorf("expected only Alpha after cleanup, got %v", pm.Pods())
	}
}

// Scenarios: POD-007
//
// Reassign clears a person's Pod field if their current pod is no longer
// valid for their (manager, team) combination.
func TestManager_Reassign_ClearsStalePod(t *testing.T) {
	t.Parallel()
	pm := New()
	pm.SetState([]apitypes.Pod{
		{Id: "a", Name: "Alpha", Team: "Eng", ManagerId: "m1"},
	}, nil)
	// Person was in Alpha under m1/Eng; now moved to m2/Design — stale pod.
	p := person("u1", "m2", "Design", "Alpha")
	pm.Reassign(&p)
	if p.Pod != "" {
		t.Errorf("expected pod cleared after invalid reassign, got %q", p.Pod)
	}
}

// Scenarios: POD-007
func TestManager_Reassign_KeepsValidPod(t *testing.T) {
	t.Parallel()
	pm := New()
	pm.SetState([]apitypes.Pod{
		{Id: "a", Name: "Alpha", Team: "Eng", ManagerId: "m1"},
	}, nil)
	p := person("u1", "m1", "Eng", "Alpha")
	pm.Reassign(&p)
	if p.Pod != "Alpha" {
		t.Errorf("expected valid pod kept, got %q", p.Pod)
	}
}

// Scenarios: IMPORT-EXPORT
//
// ApplyNotes overlays sidecar notes onto BOTH pods and originalPods so
// notes survive a Reset.
func TestManager_ApplyNotes_OverlaysBothMaps(t *testing.T) {
	t.Parallel()
	pm := New()
	pods := []apitypes.Pod{{Id: "p1", Name: "Alpha", ManagerId: "m1"}}
	orig := []apitypes.Pod{{Id: "o1", Name: "Alpha", ManagerId: "m1"}}
	pm.SetState(pods, orig)
	idToName := map[string]string{"m1": "Alice"}
	sidecar := []SidecarEntry{
		{PodName: "Alpha", ManagerName: "Alice", PublicNote: "pub", PrivateNote: "priv"},
	}
	pm.ApplyNotes(sidecar, idToName)
	if pm.Pods()[0].PublicNote != "pub" || pm.Pods()[0].PrivateNote != "priv" {
		t.Errorf("pods notes not applied: %+v", pm.Pods()[0])
	}
	if pm.OriginalPods()[0].PublicNote != "pub" || pm.OriginalPods()[0].PrivateNote != "priv" {
		t.Errorf("originalPods notes not applied: %+v", pm.OriginalPods()[0])
	}
}

// Scenarios: IMPORT-EXPORT
//
// ApplyNotes ignores entries whose (podName, managerName) does not match
// any existing pod. No spurious matches, no panics.
func TestManager_ApplyNotes_IgnoresUnmatchedEntries(t *testing.T) {
	t.Parallel()
	pm := New()
	pm.SetState([]apitypes.Pod{{Id: "p1", Name: "Alpha", ManagerId: "m1"}}, nil)
	idToName := map[string]string{"m1": "Alice"}
	sidecar := []SidecarEntry{
		{PodName: "Beta", ManagerName: "Alice", PublicNote: "no match"},
		{PodName: "Alpha", ManagerName: "Bob", PublicNote: "no match"},
	}
	pm.ApplyNotes(sidecar, idToName)
	if pm.Pods()[0].PublicNote != "" {
		t.Errorf("expected no notes applied, got %q", pm.Pods()[0].PublicNote)
	}
}

