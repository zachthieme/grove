package httpapi

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"testing"

	"github.com/zachthieme/grove/internal/apitypes"
	"github.com/zachthieme/grove/internal/org"
	"github.com/zachthieme/grove/internal/snapshot"
)

// findByName looks up a person by Name in a slice. Used across api tests.
// (Previously lived in convert_test.go before that file moved to internal/org.)
func findByName(people []apitypes.OrgNode, name string) *apitypes.OrgNode {
	for i := range people {
		if people[i].Name == name {
			return &people[i]
		}
	}
	return nil
}

// findById looks up a person by Id in a slice. Used across api tests.
func findById(people []apitypes.OrgNode, id string) *apitypes.OrgNode {
	for i := range people {
		if people[i].Id == id {
			return &people[i]
		}
	}
	return nil
}

// ptr returns a pointer to v. Used by tests that need *T fields.
func ptr[T any](v T) *T { return &v }

// newTestService creates a fresh *org.OrgService pre-loaded with a 3-person
// org (Alice → Bob → Carol). Used by HTTP-level tests that need a working
// service to exercise the router.
func newTestService(t *testing.T) *org.OrgService {
	t.Helper()
	svc := org.New(snapshot.NewMemoryStore())
	csv := []byte("Name,Role,Discipline,Manager,Team,Additional Teams,Status\nAlice,VP,Eng,,Eng,,Active\nBob,Engineer,Eng,Alice,Platform,,Active\nCarol,Engineer,Eng,Bob,Platform,,Active\n")
	resp, err := svc.Upload(context.Background(), "test.csv", csv)
	if err != nil {
		t.Fatalf("upload failed: %v", err)
	}
	if resp.Status != org.UploadReady {
		t.Fatalf("expected status 'ready', got '%s'", resp.Status)
	}
	return svc
}

// generateLargeCSV creates a CSV with n people in a realistic org structure:
//   - Person 0: CEO (root, no manager)
//   - Persons 1-4: VPs (report to CEO)
//   - Persons 5-24: Directors (report to a VP, round-robin)
//   - Persons 25+: ICs (report to a Director, round-robin)
func generateLargeCSV(n int) []byte {
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	_ = w.Write([]string{"Name", "Role", "Discipline", "Manager", "Team", "Additional Teams", "Status"})

	for i := range n {
		name := fmt.Sprintf("Person-%d", i)
		var role, manager string
		switch {
		case i == 0:
			role = "CEO"
			manager = ""
		case i <= 4:
			role = "VP"
			manager = "Person-0"
		case i <= 24:
			role = "Director"
			vpIndex := ((i - 5) % 4) + 1
			manager = fmt.Sprintf("Person-%d", vpIndex)
		default:
			role = "Engineer"
			dirIndex := ((i - 25) % 20) + 5
			manager = fmt.Sprintf("Person-%d", dirIndex)
		}
		team := fmt.Sprintf("Team-%d", i%10)
		_ = w.Write([]string{name, role, "Eng", manager, team, "", "Active"})
	}
	w.Flush()
	return buf.Bytes()
}
