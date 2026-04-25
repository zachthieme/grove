package api

import (
	"context"
	"testing"

	"github.com/zachthieme/grove/internal/apitypes"
)

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
	_, err = svc.Update(ctx, bob.Id, apitypes.OrgNodeUpdate{Pod: ptr("Alpha")})
	if err != nil {
		t.Fatalf("assign pod: %v", err)
	}

	pods := svc.ListPods(ctx)
	if len(pods) == 0 {
		t.Fatal("expected at least one pod")
	}
	var alpha *apitypes.PodInfo
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
	_, err := svc.UpdatePod(context.Background(), "nonexistent-pod-id", apitypes.PodUpdate{PublicNote: ptr("hello")})
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
	_, err = svc.UpdatePod(ctx, pods[0].Id, apitypes.PodUpdate{PublicNote: ptr(longNote)})
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
