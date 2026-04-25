package api

import (
	"context"
	"testing"
)


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

