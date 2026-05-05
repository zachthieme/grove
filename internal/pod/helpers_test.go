package pod

import (
	"testing"

	"github.com/zachthieme/grove/internal/apitypes"
	"github.com/zachthieme/grove/internal/model"
)

// Scenarios: ORG-018
func TestSeedPods_OnlyCreatesPodsForExplicitPodFields(t *testing.T) {
	t.Parallel()
	// People without Pod field → no pods created
	people := []apitypes.OrgNode{
		{OrgNodeFields: model.OrgNodeFields{Name: "Alice", Team: "Platform"}, Id: "mgr1", ManagerId: ""},
		{OrgNodeFields: model.OrgNodeFields{Name: "Bob", Team: "Platform"}, Id: "ic1", ManagerId: "mgr1"},
		{OrgNodeFields: model.OrgNodeFields{Name: "Carol", Team: "Platform"}, Id: "ic2", ManagerId: "mgr1"},
	}

	pods := SeedPods(people)
	if len(pods) != 0 {
		t.Fatalf("expected 0 pods for people without Pod field, got %d", len(pods))
	}
	// Pod fields should remain empty
	if people[1].Pod != "" {
		t.Errorf("expected Bob.Pod = empty, got %q", people[1].Pod)
	}
}

// Scenarios: ORG-018
func TestSeedPods_GroupsByPodName(t *testing.T) {
	t.Parallel()
	// People with explicit Pod fields get grouped
	people := []apitypes.OrgNode{
		{OrgNodeFields: model.OrgNodeFields{Name: "Alice", Team: "Platform"}, Id: "mgr1", ManagerId: ""},
		{OrgNodeFields: model.OrgNodeFields{Name: "Bob", Team: "Platform", Pod: "Platform"}, Id: "ic1", ManagerId: "mgr1"},
		{OrgNodeFields: model.OrgNodeFields{Name: "Carol", Team: "Platform", Pod: "Platform"}, Id: "ic2", ManagerId: "mgr1"},
		{OrgNodeFields: model.OrgNodeFields{Name: "Dave", Team: "Infra", Pod: "Infra"}, Id: "ic3", ManagerId: "mgr1"},
	}

	pods := SeedPods(people)

	if len(pods) != 2 {
		t.Fatalf("expected 2 pods, got %d", len(pods))
	}

	podNames := map[string]bool{}
	for _, pod := range pods {
		podNames[pod.Name] = true
		if pod.Id == "" {
			t.Errorf("pod %q has empty Id", pod.Name)
		}
		if pod.ManagerId != "mgr1" {
			t.Errorf("expected pod.ManagerId = %q, got %q", "mgr1", pod.ManagerId)
		}
	}
	if !podNames["Platform"] {
		t.Error("expected a pod named 'Platform'")
	}
	if !podNames["Infra"] {
		t.Error("expected a pod named 'Infra'")
	}
}

// Scenarios: ORG-018
func TestSeedPods_RootNodesSkipped(t *testing.T) {
	t.Parallel()
	// Root-only person → 0 pods, Pod field stays empty
	people := []apitypes.OrgNode{
		{OrgNodeFields: model.OrgNodeFields{Name: "CEO", Team: "Exec"}, Id: "root1", ManagerId: ""},
	}

	pods := SeedPods(people)

	if len(pods) != 0 {
		t.Fatalf("expected 0 pods for root-only, got %d", len(pods))
	}
	if people[0].Pod != "" {
		t.Errorf("expected root person Pod to be empty, got %q", people[0].Pod)
	}
}

// Scenarios: ORG-018
func TestSeedPods_PreservesExistingPodNames(t *testing.T) {
	t.Parallel()
	// Bob has Pod="Alpha Pod", Carol has no pod → only one pod created
	people := []apitypes.OrgNode{
		{OrgNodeFields: model.OrgNodeFields{Name: "Alice", Team: "Platform"}, Id: "mgr1", ManagerId: ""},
		{OrgNodeFields: model.OrgNodeFields{Name: "Bob", Team: "Platform", Pod: "Alpha Pod"}, Id: "ic1", ManagerId: "mgr1"},
		{OrgNodeFields: model.OrgNodeFields{Name: "Carol", Team: "Platform"}, Id: "ic2", ManagerId: "mgr1"},
	}

	pods := SeedPods(people)

	if len(pods) != 1 {
		t.Fatalf("expected 1 pod, got %d", len(pods))
	}
	if pods[0].Name != "Alpha Pod" {
		t.Errorf("expected pod name %q, got %q", "Alpha Pod", pods[0].Name)
	}
	if people[1].Pod != "Alpha Pod" {
		t.Errorf("expected Bob.Pod = %q, got %q", "Alpha Pod", people[1].Pod)
	}
	// Carol should still have no pod
	if people[2].Pod != "" {
		t.Errorf("expected Carol.Pod = empty, got %q", people[2].Pod)
	}
}

// Scenarios: ORG-018
func TestCleanupEmpty(t *testing.T) {
	t.Parallel()
	// 2 pods, only 1 has members → cleanup returns 1 pod
	pods := []apitypes.Pod{
		{Id: "pod1", Name: "Platform", Team: "Platform", ManagerId: "mgr1"},
		{Id: "pod2", Name: "Ghost", Team: "Ghost", ManagerId: "mgr2"},
	}
	people := []apitypes.OrgNode{
		{OrgNodeFields: model.OrgNodeFields{Name: "Bob", Team: "Platform", Pod: "Platform"}, Id: "ic1", ManagerId: "mgr1"},
	}

	result := CleanupEmpty(pods, people)

	if len(result) != 1 {
		t.Fatalf("expected 1 pod after cleanup, got %d", len(result))
	}
	if result[0].Id != "pod1" {
		t.Errorf("expected surviving pod to be pod1, got %q", result[0].Id)
	}
}

// Scenarios: ORG-018
func TestFindPod(t *testing.T) {
	t.Parallel()
	pods := []apitypes.Pod{
		{Id: "pod1", Name: "Platform", Team: "Platform", ManagerId: "mgr1"},
		{Id: "pod2", Name: "Infra", Team: "Infra", ManagerId: "mgr1"},
	}

	found := FindPod(pods, "Infra", "mgr1")
	if found == nil {
		t.Fatal("expected to find pod")
	}
	if found.Id != "pod2" {
		t.Errorf("expected pod2, got %q", found.Id)
	}

	notFound := FindPod(pods, "NoSuch", "mgr1")
	if notFound != nil {
		t.Error("expected nil for non-existent pod")
	}
}

// Scenarios: ORG-018
func TestFindPodByID(t *testing.T) {
	t.Parallel()
	pods := []apitypes.Pod{
		{Id: "pod1", Name: "Platform", Team: "Platform", ManagerId: "mgr1"},
		{Id: "pod2", Name: "Infra", Team: "Infra", ManagerId: "mgr1"},
	}

	found := FindPodByID(pods, "pod2")
	if found == nil {
		t.Fatal("expected to find pod by ID")
	}
	if found.Name != "Infra" {
		t.Errorf("expected Infra, got %q", found.Name)
	}

	notFound := FindPodByID(pods, "nope")
	if notFound != nil {
		t.Error("expected nil for non-existent pod ID")
	}
}

// Scenarios: ORG-018
func TestRename(t *testing.T) {
	t.Parallel()
	pods := []apitypes.Pod{
		{Id: "pod1", Name: "OldName", Team: "Platform", ManagerId: "mgr1"},
	}
	people := []apitypes.OrgNode{
		{OrgNodeFields: model.OrgNodeFields{Name: "Bob", Team: "Platform", Pod: "OldName"}, Id: "ic1", ManagerId: "mgr1"},
		{OrgNodeFields: model.OrgNodeFields{Name: "Carol", Team: "Platform", Pod: "OldName"}, Id: "ic2", ManagerId: "mgr1"},
		{OrgNodeFields: model.OrgNodeFields{Name: "Dave", Team: "Infra", Pod: "Other"}, Id: "ic3", ManagerId: "mgr2"},
	}

	err := Rename(pods, people, "pod1", "NewName")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if pods[0].Name != "NewName" {
		t.Errorf("expected pod name %q, got %q", "NewName", pods[0].Name)
	}
	if people[0].Pod != "NewName" {
		t.Errorf("expected Bob.Pod = %q, got %q", "NewName", people[0].Pod)
	}
	if people[1].Pod != "NewName" {
		t.Errorf("expected Carol.Pod = %q, got %q", "NewName", people[1].Pod)
	}
	// Dave should be unchanged
	if people[2].Pod != "Other" {
		t.Errorf("expected Dave.Pod = %q, got %q", "Other", people[2].Pod)
	}
}

// Scenarios: ORG-018
func TestRename_NotFound(t *testing.T) {
	t.Parallel()
	pods := []apitypes.Pod{}
	people := []apitypes.OrgNode{}

	err := Rename(pods, people, "nope", "NewName")
	if err == nil {
		t.Error("expected error for non-existent pod")
	}
}

// Scenarios: ORG-018
func TestReassignPerson_ClearsForRoot(t *testing.T) {
	t.Parallel()
	person := apitypes.OrgNode{OrgNodeFields: model.OrgNodeFields{Name: "Root", Pod: "SomePod"}, Id: "p1", ManagerId: ""}
	pods := []apitypes.Pod{{Id: "pod1", Name: "SomePod", Team: "T", ManagerId: "mgr1"}}

	result := ReassignPerson(pods, &person)

	if person.Pod != "" {
		t.Errorf("expected Pod cleared for root, got %q", person.Pod)
	}
	if len(result) != len(pods) {
		t.Errorf("expected pods unchanged for root")
	}
}

// Scenarios: ORG-018
func TestReassignPerson_KeepsValidPod(t *testing.T) {
	t.Parallel()
	pods := []apitypes.Pod{
		{Id: "pod1", Name: "Platform", Team: "Platform", ManagerId: "mgr1"},
	}
	person := apitypes.OrgNode{OrgNodeFields: model.OrgNodeFields{Name: "Bob", Team: "Platform", Pod: "Platform"}, Id: "p1", ManagerId: "mgr1"}

	result := ReassignPerson(pods, &person)

	if person.Pod != "Platform" {
		t.Errorf("expected Pod = %q, got %q", "Platform", person.Pod)
	}
	if len(result) != 1 {
		t.Errorf("expected no new pods created")
	}
}

// Scenarios: ORG-018
func TestReassignPerson_ClearsInvalidPod(t *testing.T) {
	t.Parallel()
	pods := []apitypes.Pod{
		{Id: "pod1", Name: "Platform", Team: "Platform", ManagerId: "mgr1"},
	}
	// OrgNode has a pod but under a different manager — pod is invalid
	person := apitypes.OrgNode{OrgNodeFields: model.OrgNodeFields{Name: "Bob", Team: "Infra", Pod: "OldPod"}, Id: "p1", ManagerId: "mgr2"}

	result := ReassignPerson(pods, &person)

	if person.Pod != "" {
		t.Errorf("expected Pod cleared for invalid pod, got %q", person.Pod)
	}
	if len(result) != 1 {
		t.Errorf("expected no new pods created")
	}
}

// Scenarios: ORG-018
func TestReassignPerson_LeavesEmptyPodAlone(t *testing.T) {
	t.Parallel()
	pods := []apitypes.Pod{
		{Id: "pod1", Name: "Platform", Team: "Platform", ManagerId: "mgr1"},
	}
	// OrgNode has no pod — should stay without one
	person := apitypes.OrgNode{OrgNodeFields: model.OrgNodeFields{Name: "Bob", Team: "Platform"}, Id: "p1", ManagerId: "mgr1"}

	result := ReassignPerson(pods, &person)

	if person.Pod != "" {
		t.Errorf("expected Pod to remain empty, got %q", person.Pod)
	}
	if len(result) != 1 {
		t.Errorf("expected no new pods created")
	}
}

// Scenarios: ORG-018
func TestCopy(t *testing.T) {
	t.Parallel()
	src := []apitypes.Pod{
		{Id: "pod1", Name: "A", Team: "T1", ManagerId: "m1"},
		{Id: "pod2", Name: "B", Team: "T2", ManagerId: "m2"},
	}
	dst := Copy(src)

	if len(dst) != 2 {
		t.Fatalf("expected 2 pods, got %d", len(dst))
	}
	// Verify it's a copy, not the same slice
	dst[0].Name = "Changed"
	if src[0].Name == "Changed" {
		t.Error("Copy should produce an independent copy")
	}
}

// Scenarios: ORG-018
func TestCopy_NilReturnsEmptySlice(t *testing.T) {
	t.Parallel()
	result := Copy(nil)
	if result == nil {
		t.Fatal("Copy(nil) returned nil, want empty slice")
	}
	if len(result) != 0 {
		t.Fatalf("expected empty slice, got len %d", len(result))
	}
}
