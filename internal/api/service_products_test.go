package api

import (
	"context"
	"strings"
	"testing"

	"github.com/zachthieme/grove/internal/apitypes"
	"github.com/zachthieme/grove/internal/model"
)

// Scenarios: PROD-001
func TestOrgService_AddProduct(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	alice := findByName(data.Working, "Alice")

	created, _, _, err := svc.Add(context.Background(), apitypes.OrgNode{
		OrgNodeFields: model.OrgNodeFields{Name: "Widget", Type: "product", Status: "Active"},
		ManagerId:     alice.Id,
	})
	if err != nil {
		t.Fatalf("add product failed: %v", err)
	}
	if created.Type != "product" {
		t.Errorf("expected type 'product', got %q", created.Type)
	}
	if created.ManagerId != alice.Id {
		t.Errorf("expected managerId %q, got %q", alice.Id, created.ManagerId)
	}
	working := svc.GetWorking(context.Background())
	widget := findById(working, created.Id)
	if widget == nil {
		t.Fatal("expected Widget in working slice")
	}
	if widget.Type != "product" {
		t.Errorf("expected type 'product' in working, got %q", widget.Type)
	}
}

// Scenarios: PROD-002
func TestOrgService_MoveProduct(t *testing.T) {
	t.Parallel()
	svc := newTestServiceFromNodes(t, []model.OrgNode{
		{OrgNodeFields: model.OrgNodeFields{Name: "Alice", Status: "Active"}, Manager: ""},
		{OrgNodeFields: model.OrgNodeFields{Name: "Bob", Status: "Active"}, Manager: "Alice"},
		{OrgNodeFields: model.OrgNodeFields{Name: "Widget", Type: "product", Status: "Active"}, Manager: "Alice"},
	})
	working := svc.GetWorking(context.Background())
	bob := findByName(working, "Bob")
	widget := findByName(working, "Widget")

	result, err := svc.Move(context.Background(), widget.Id, bob.Id, "", "")
	if err != nil {
		t.Fatalf("move product failed: %v", err)
	}
	updated := findById(result.Working, widget.Id)
	if updated.ManagerId != bob.Id {
		t.Errorf("expected Widget's managerId to be Bob's id %q, got %q", bob.Id, updated.ManagerId)
	}
	if updated.Type != "product" {
		t.Errorf("expected type 'product' after move, got %q", updated.Type)
	}
}

// Scenarios: PROD-003
func TestOrgService_MoveProductToPod(t *testing.T) {
	t.Parallel()
	svc := newTestServiceFromNodes(t, []model.OrgNode{
		{OrgNodeFields: model.OrgNodeFields{Name: "Alice", Status: "Active", Team: "Eng"}, Manager: ""},
		{OrgNodeFields: model.OrgNodeFields{Name: "Widget", Type: "product", Status: "Active"}, Manager: "Alice"},
	})
	ctx := context.Background()
	working := svc.GetWorking(ctx)
	alice := findByName(working, "Alice")
	widget := findByName(working, "Widget")

	_, err := svc.CreatePod(ctx, alice.Id, "Alpha", "Eng")
	if err != nil {
		t.Fatalf("create pod failed: %v", err)
	}

	result, err := svc.Move(ctx, widget.Id, alice.Id, "Eng", "Alpha")
	if err != nil {
		t.Fatalf("move product to pod failed: %v", err)
	}
	updated := findById(result.Working, widget.Id)
	if updated.Pod != "Alpha" {
		t.Errorf("expected Widget's pod to be 'Alpha', got %q", updated.Pod)
	}
}

// Scenarios: PROD-004
func TestOrgService_DeleteProduct(t *testing.T) {
	t.Parallel()
	svc := newTestServiceFromNodes(t, []model.OrgNode{
		{OrgNodeFields: model.OrgNodeFields{Name: "Alice", Status: "Active"}, Manager: ""},
		{OrgNodeFields: model.OrgNodeFields{Name: "Widget", Type: "product", Status: "Active"}, Manager: "Alice"},
	})
	ctx := context.Background()
	widget := findByName(svc.GetWorking(ctx), "Widget")

	result, err := svc.Delete(ctx, widget.Id)
	if err != nil {
		t.Fatalf("delete product failed: %v", err)
	}
	if findById(result.Working, widget.Id) != nil {
		t.Error("expected Widget not in working after delete")
	}
	recycled := findById(result.Recycled, widget.Id)
	if recycled == nil {
		t.Fatal("expected Widget in recycled after delete")
	}
	if recycled.Type != "product" {
		t.Errorf("expected recycled type 'product', got %q", recycled.Type)
	}
}

// Scenarios: PROD-005
func TestOrgService_RestoreProduct(t *testing.T) {
	t.Parallel()
	svc := newTestServiceFromNodes(t, []model.OrgNode{
		{OrgNodeFields: model.OrgNodeFields{Name: "Alice", Status: "Active"}, Manager: ""},
		{OrgNodeFields: model.OrgNodeFields{Name: "Widget", Type: "product", Status: "Active"}, Manager: "Alice"},
	})
	ctx := context.Background()
	widget := findByName(svc.GetWorking(ctx), "Widget")

	if _, err := svc.Delete(ctx, widget.Id); err != nil {
		t.Fatalf("delete product failed: %v", err)
	}
	result, err := svc.Restore(ctx, widget.Id)
	if err != nil {
		t.Fatalf("restore product failed: %v", err)
	}
	restored := findById(result.Working, widget.Id)
	if restored == nil {
		t.Fatal("expected Widget back in working after restore")
	}
	if restored.Type != "product" {
		t.Errorf("expected type 'product' after restore, got %q", restored.Type)
	}
	if len(result.Recycled) != 0 {
		t.Errorf("expected empty recycled after restore, got %d", len(result.Recycled))
	}
}

// Scenarios: PROD-004
func TestOrgService_Update_RejectProductAsManager(t *testing.T) {
	t.Parallel()
	svc := newTestServiceFromNodes(t, []model.OrgNode{
		{OrgNodeFields: model.OrgNodeFields{Name: "Alice", Status: "Active"}, Manager: ""},
		{OrgNodeFields: model.OrgNodeFields{Name: "Widget", Type: "product", Status: "Active"}, Manager: "Alice"},
		{OrgNodeFields: model.OrgNodeFields{Name: "Bob", Status: "Active"}, Manager: "Alice"},
	})
	working := svc.GetWorking(context.Background())
	var widgetId, bobId string
	for _, p := range working {
		if p.Name == "Widget" {
			widgetId = p.Id
		}
		if p.Name == "Bob" {
			bobId = p.Id
		}
	}
	if widgetId == "" || bobId == "" {
		t.Fatal("test data setup failed: could not find Widget or Bob")
	}
	_, err := svc.Update(context.Background(), bobId, apitypes.OrgNodeUpdate{ManagerId: ptr(widgetId)})
	if err == nil {
		t.Fatal("expected error when reparenting to a product via Update")
	}
	if !isValidation(err) {
		t.Errorf("expected ValidationError, got: %T", err)
	}
	if !strings.Contains(err.Error(), "cannot report to a product") {
		t.Errorf("unexpected error message: %s", err.Error())
	}
}

// Scenarios: ORG-002, PROD-004
func TestOrgService_Move_RejectProductAsManager(t *testing.T) {
	t.Parallel()
	svc := newTestServiceFromNodes(t, []model.OrgNode{
		{OrgNodeFields: model.OrgNodeFields{Name: "Alice", Status: "Active"}, Manager: ""},
		{OrgNodeFields: model.OrgNodeFields{Name: "Widget", Type: "product", Status: "Active"}, Manager: "Alice"},
		{OrgNodeFields: model.OrgNodeFields{Name: "Bob", Status: "Active"}, Manager: "Alice"},
	})
	working := svc.GetWorking(context.Background())
	var widgetId, bobId string
	for _, p := range working {
		if p.Name == "Widget" {
			widgetId = p.Id
		}
		if p.Name == "Bob" {
			bobId = p.Id
		}
	}
	if widgetId == "" || bobId == "" {
		t.Fatal("test data setup failed: could not find Widget or Bob")
	}
	_, err := svc.Move(context.Background(), bobId, widgetId, "", "")
	if err == nil {
		t.Fatal("expected error when moving to a product manager")
	}
	if !isValidation(err) {
		t.Errorf("expected ValidationError, got: %T", err)
	}
	if !strings.Contains(err.Error(), "cannot report to a product") {
		t.Errorf("unexpected error message: %s", err.Error())
	}
}

// Scenarios: PROD-011
func TestOrgService_Update_TypeChange(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	bob := findByName(data.Working, "Bob")

	result, err := svc.Update(context.Background(), bob.Id, apitypes.OrgNodeUpdate{
		Type:   ptr("product"),
		Status: ptr("Active"),
	})
	if err != nil {
		t.Fatalf("update type failed: %v", err)
	}
	updated := findById(result.Working, bob.Id)
	if updated.Type != "product" {
		t.Errorf("expected type 'product', got %q", updated.Type)
	}
}

// Scenarios: PROD-011
func TestOrgService_Update_TypeChange_RevalidatesStatus(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	bob := findByName(data.Working, "Bob")

	// Bob is Active (valid for both). Switch type to product without changing status.
	if _, err := svc.Update(context.Background(), bob.Id, apitypes.OrgNodeUpdate{Type: ptr("product")}); err != nil {
		t.Fatalf("update to product failed: %v", err)
	}
	// Setting a person-only status on a product must be rejected.
	_, err := svc.Update(context.Background(), bob.Id, apitypes.OrgNodeUpdate{Status: ptr("Backfill")})
	if err == nil {
		t.Fatal("expected validation error for person-only status on product")
	}
}

// Scenarios: PROD-011
func TestOrgService_Update_TypeChange_AutoCorrectsStatus(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	bob := findByName(data.Working, "Bob")

	// Bob -> product, then set product-only "Deprecated" status.
	if _, err := svc.Update(context.Background(), bob.Id, apitypes.OrgNodeUpdate{Type: ptr("product"), Status: ptr("Deprecated")}); err != nil {
		t.Fatalf("update to product failed: %v", err)
	}

	// Switch back to person without supplying a status. "Deprecated" isn't valid
	// for person — Update must auto-correct rather than leave the node invalid.
	result, err := svc.Update(context.Background(), bob.Id, apitypes.OrgNodeUpdate{Type: ptr("person")})
	if err != nil {
		t.Fatalf("update back to person failed: %v", err)
	}
	updated := findById(result.Working, bob.Id)
	if updated.Status != "Active" {
		t.Errorf("expected status auto-corrected to 'Active', got %q", updated.Status)
	}
}

// Scenarios: PROD-001
func TestOrgService_Add_InvalidType(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)

	_, _, _, err := svc.Add(context.Background(), apitypes.OrgNode{
		OrgNodeFields: model.OrgNodeFields{Name: "Bogus", Type: "widget", Status: "Active"},
	})
	if err == nil {
		t.Fatal("expected validation error for invalid type on Add")
	}
	if !isValidation(err) {
		t.Errorf("expected ValidationError, got: %T", err)
	}
}

// Scenarios: PROD-011
func TestOrgService_Update_InvalidType(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	bob := findByName(data.Working, "Bob")

	_, err := svc.Update(context.Background(), bob.Id, apitypes.OrgNodeUpdate{Type: ptr("widget")})
	if err == nil {
		t.Fatal("expected validation error for invalid type")
	}
	if !isValidation(err) {
		t.Errorf("expected ValidationError, got: %T", err)
	}
}
