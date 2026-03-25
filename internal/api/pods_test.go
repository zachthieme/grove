package api

import (
	"testing"
)

func TestSeedPods_GroupsByManagerAndTeam(t *testing.T) {
	// 1 manager (Alice) with 2 ICs on Platform (Bob, Carol) and 1 on Infra (Dave) → 2 pods
	people := []Person{
		{Id: "mgr1", Name: "Alice", ManagerId: "", Team: "Platform"},
		{Id: "ic1", Name: "Bob", ManagerId: "mgr1", Team: "Platform"},
		{Id: "ic2", Name: "Carol", ManagerId: "mgr1", Team: "Platform"},
		{Id: "ic3", Name: "Dave", ManagerId: "mgr1", Team: "Infra"},
	}

	pods := SeedPods(people)

	if len(pods) != 2 {
		t.Fatalf("expected 2 pods, got %d", len(pods))
	}

	// Verify Bob and Carol have Pod == "Platform"
	bob := people[1]
	if bob.Pod != "Platform" {
		t.Errorf("expected Bob.Pod = %q, got %q", "Platform", bob.Pod)
	}
	carol := people[2]
	if carol.Pod != "Platform" {
		t.Errorf("expected Carol.Pod = %q, got %q", "Platform", carol.Pod)
	}

	// Verify Dave has Pod == "Infra"
	dave := people[3]
	if dave.Pod != "Infra" {
		t.Errorf("expected Dave.Pod = %q, got %q", "Infra", dave.Pod)
	}

	// Verify pod IDs are non-empty UUIDs
	for _, pod := range pods {
		if pod.Id == "" {
			t.Errorf("pod %q has empty Id", pod.Name)
		}
		if pod.ManagerId != "mgr1" {
			t.Errorf("expected pod.ManagerId = %q, got %q", "mgr1", pod.ManagerId)
		}
	}

	// Verify pod names match team names
	podNames := map[string]bool{}
	for _, pod := range pods {
		podNames[pod.Name] = true
	}
	if !podNames["Platform"] {
		t.Error("expected a pod named 'Platform'")
	}
	if !podNames["Infra"] {
		t.Error("expected a pod named 'Infra'")
	}
}

func TestSeedPods_RootNodesSkipped(t *testing.T) {
	// Root-only person → 0 pods, Pod field stays empty
	people := []Person{
		{Id: "root1", Name: "CEO", ManagerId: "", Team: "Exec"},
	}

	pods := SeedPods(people)

	if len(pods) != 0 {
		t.Fatalf("expected 0 pods for root-only, got %d", len(pods))
	}
	if people[0].Pod != "" {
		t.Errorf("expected root person Pod to be empty, got %q", people[0].Pod)
	}
}

func TestSeedPods_PreservesExistingPodNames(t *testing.T) {
	// People with pre-set Pod field "Alpha Pod" → pod uses that name instead of team name
	people := []Person{
		{Id: "mgr1", Name: "Alice", ManagerId: "", Team: "Platform"},
		{Id: "ic1", Name: "Bob", ManagerId: "mgr1", Team: "Platform", Pod: "Alpha Pod"},
		{Id: "ic2", Name: "Carol", ManagerId: "mgr1", Team: "Platform"},
	}

	pods := SeedPods(people)

	if len(pods) != 1 {
		t.Fatalf("expected 1 pod, got %d", len(pods))
	}
	if pods[0].Name != "Alpha Pod" {
		t.Errorf("expected pod name %q, got %q", "Alpha Pod", pods[0].Name)
	}
	// All members should have the pod name set
	if people[1].Pod != "Alpha Pod" {
		t.Errorf("expected Bob.Pod = %q, got %q", "Alpha Pod", people[1].Pod)
	}
	if people[2].Pod != "Alpha Pod" {
		t.Errorf("expected Carol.Pod = %q, got %q", "Alpha Pod", people[2].Pod)
	}
}

func TestCleanupEmptyPods(t *testing.T) {
	// 2 pods, only 1 has members → cleanup returns 1 pod
	pods := []Pod{
		{Id: "pod1", Name: "Platform", Team: "Platform", ManagerId: "mgr1"},
		{Id: "pod2", Name: "Ghost", Team: "Ghost", ManagerId: "mgr2"},
	}
	people := []Person{
		{Id: "ic1", Name: "Bob", ManagerId: "mgr1", Team: "Platform", Pod: "Platform"},
	}

	result := CleanupEmptyPods(pods, people)

	if len(result) != 1 {
		t.Fatalf("expected 1 pod after cleanup, got %d", len(result))
	}
	if result[0].Id != "pod1" {
		t.Errorf("expected surviving pod to be pod1, got %q", result[0].Id)
	}
}

func TestFindPod(t *testing.T) {
	pods := []Pod{
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

func TestFindPodByID(t *testing.T) {
	pods := []Pod{
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

func TestRenamePod(t *testing.T) {
	pods := []Pod{
		{Id: "pod1", Name: "OldName", Team: "Platform", ManagerId: "mgr1"},
	}
	people := []Person{
		{Id: "ic1", Name: "Bob", ManagerId: "mgr1", Team: "Platform", Pod: "OldName"},
		{Id: "ic2", Name: "Carol", ManagerId: "mgr1", Team: "Platform", Pod: "OldName"},
		{Id: "ic3", Name: "Dave", ManagerId: "mgr2", Team: "Infra", Pod: "Other"},
	}

	err := RenamePod(pods, people, "pod1", "NewName")
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

func TestRenamePod_NotFound(t *testing.T) {
	pods := []Pod{}
	people := []Person{}

	err := RenamePod(pods, people, "nope", "NewName")
	if err == nil {
		t.Error("expected error for non-existent pod")
	}
}

func TestReassignPersonPod_ClearsForRoot(t *testing.T) {
	person := Person{Id: "p1", Name: "Root", ManagerId: "", Pod: "SomePod"}
	pods := []Pod{{Id: "pod1", Name: "SomePod", Team: "T", ManagerId: "mgr1"}}

	result := ReassignPersonPod(pods, &person)

	if person.Pod != "" {
		t.Errorf("expected Pod cleared for root, got %q", person.Pod)
	}
	if len(result) != len(pods) {
		t.Errorf("expected pods unchanged for root")
	}
}

func TestReassignPersonPod_FindsExisting(t *testing.T) {
	pods := []Pod{
		{Id: "pod1", Name: "Platform", Team: "Platform", ManagerId: "mgr1"},
	}
	person := Person{Id: "p1", Name: "Bob", ManagerId: "mgr1", Team: "Platform"}

	result := ReassignPersonPod(pods, &person)

	if person.Pod != "Platform" {
		t.Errorf("expected Pod = %q, got %q", "Platform", person.Pod)
	}
	if len(result) != 1 {
		t.Errorf("expected no new pods created")
	}
}

func TestReassignPersonPod_CreatesNewPod(t *testing.T) {
	pods := []Pod{
		{Id: "pod1", Name: "Platform", Team: "Platform", ManagerId: "mgr1"},
	}
	person := Person{Id: "p1", Name: "Bob", ManagerId: "mgr2", Team: "Infra"}

	result := ReassignPersonPod(pods, &person)

	if len(result) != 2 {
		t.Fatalf("expected 2 pods after auto-create, got %d", len(result))
	}
	if person.Pod != "Infra" {
		t.Errorf("expected Pod = %q, got %q", "Infra", person.Pod)
	}
	newPod := result[1]
	if newPod.Team != "Infra" || newPod.ManagerId != "mgr2" {
		t.Errorf("new pod has wrong team/manager: %+v", newPod)
	}
	if newPod.Id == "" {
		t.Error("new pod should have a UUID")
	}
}

func TestCopyPods(t *testing.T) {
	src := []Pod{
		{Id: "pod1", Name: "A", Team: "T1", ManagerId: "m1"},
		{Id: "pod2", Name: "B", Team: "T2", ManagerId: "m2"},
	}
	dst := CopyPods(src)

	if len(dst) != 2 {
		t.Fatalf("expected 2 pods, got %d", len(dst))
	}
	// Verify it's a copy, not the same slice
	dst[0].Name = "Changed"
	if src[0].Name == "Changed" {
		t.Error("CopyPods should produce an independent copy")
	}
}

func TestCopyPods_Nil(t *testing.T) {
	result := CopyPods(nil)
	if result != nil {
		t.Errorf("expected nil for nil input, got %v", result)
	}
}

func TestValidateNoteLen(t *testing.T) {
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
