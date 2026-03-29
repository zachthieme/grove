package api

// Scenarios: CONC-002 — all tests in this file

import (
	"context"
	"bytes"
	"encoding/csv"
	"fmt"
	"strings"
	"testing"
)

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

// uploadLargeOrg is a test helper that creates a service and uploads n people.
func uploadLargeOrg(t *testing.T, n int) *OrgService {
	t.Helper()
	svc := NewOrgService(NewMemorySnapshotStore())
	csvData := generateLargeCSV(n)
	resp, err := svc.Upload(context.Background(), "test.csv", csvData)
	if err != nil {
		t.Fatalf("upload failed: %v", err)
	}
	if resp.Status != "ready" {
		t.Fatalf("expected status 'ready', got '%s'", resp.Status)
	}
	return svc
}

func TestLargeOrg_Upload(t *testing.T) {
	svc := uploadLargeOrg(t, 200)
	data := svc.GetOrg(context.Background())
	if data == nil {
		t.Fatal("expected org data after upload")
	}
	if len(data.Original) != 200 {
		t.Errorf("expected 200 original people, got %d", len(data.Original))
	}
	if len(data.Working) != 200 {
		t.Errorf("expected 200 working people, got %d", len(data.Working))
	}
}

func TestLargeOrg_MoveChain(t *testing.T) {
	svc := uploadLargeOrg(t, 200)
	data := svc.GetOrg(context.Background())

	// Find a target director to move ICs to
	targetDir := findByName(data.Working, "Person-10")
	if targetDir == nil {
		t.Fatal("target director Person-10 not found")
	}

	// Move 50 ICs (Person-25 through Person-74) to the target director
	for i := 25; i < 75; i++ {
		name := fmt.Sprintf("Person-%d", i)
		p := findByName(data.Working, name)
		if p == nil {
			t.Fatalf("person %s not found", name)
		}
		_, err := svc.Move(context.Background(), p.Id, targetDir.Id, "")
		if err != nil {
			t.Fatalf("move %s failed: %v", name, err)
		}
	}

	// Verify total count is still 200
	working := svc.GetWorking(context.Background())
	if len(working) != 200 {
		t.Errorf("expected 200 working people after moves, got %d", len(working))
	}

	// Verify all moved ICs now report to the target director
	for i := 25; i < 75; i++ {
		name := fmt.Sprintf("Person-%d", i)
		p := findByName(working, name)
		if p == nil {
			t.Fatalf("person %s not found after moves", name)
		}
		if p.ManagerId != targetDir.Id {
			t.Errorf("expected %s manager to be %s, got %s", name, targetDir.Id, p.ManagerId)
		}
	}
}

func TestLargeOrg_BulkUpdate(t *testing.T) {
	svc := uploadLargeOrg(t, 200)
	data := svc.GetOrg(context.Background())

	// Update all ICs (Person-25 through Person-199) to have a new role
	for i := 25; i < 200; i++ {
		name := fmt.Sprintf("Person-%d", i)
		p := findByName(data.Working, name)
		if p == nil {
			t.Fatalf("person %s not found", name)
		}
		newRole := fmt.Sprintf("Senior Engineer %d", i)
		_, err := svc.Update(context.Background(), p.Id, PersonUpdate{Role: ptr(newRole)})
		if err != nil {
			t.Fatalf("update %s failed: %v", name, err)
		}
	}

	// Verify all updates were applied
	working := svc.GetWorking(context.Background())
	for i := 25; i < 200; i++ {
		name := fmt.Sprintf("Person-%d", i)
		p := findByName(working, name)
		if p == nil {
			t.Fatalf("person %s not found after updates", name)
		}
		expected := fmt.Sprintf("Senior Engineer %d", i)
		if p.Role != expected {
			t.Errorf("expected %s role to be %q, got %q", name, expected, p.Role)
		}
	}
}

func TestLargeOrg_ReorderAll(t *testing.T) {
	svc := uploadLargeOrg(t, 200)
	working := svc.GetWorking(context.Background())

	// Collect all IDs and reverse them
	ids := make([]string, len(working))
	for i, p := range working {
		ids[i] = p.Id
	}
	// Reverse the slice
	for i, j := 0, len(ids)-1; i < j; i, j = i+1, j-1 {
		ids[i], ids[j] = ids[j], ids[i]
	}

	result, err := svc.Reorder(context.Background(), ids)
	if err != nil {
		t.Fatalf("reorder failed: %v", err)
	}

	// Verify sort indices match the reversed order
	idToIndex := make(map[string]int, len(ids))
	for i, id := range ids {
		idToIndex[id] = i
	}
	for _, p := range result.Working {
		expected, ok := idToIndex[p.Id]
		if !ok {
			t.Errorf("unexpected person ID %s in result", p.Id)
			continue
		}
		if p.SortIndex != expected {
			t.Errorf("person %s: expected SortIndex %d, got %d", p.Name, expected, p.SortIndex)
		}
	}
}

func TestLargeOrg_DeleteAndRestore(t *testing.T) {
	svc := uploadLargeOrg(t, 200)
	data := svc.GetOrg(context.Background())

	// Delete 50 ICs (Person-150 through Person-199) — chosen from the end
	// to avoid disrupting other people's manager references as much.
	deletedIds := make([]string, 0, 50)
	for i := 150; i < 200; i++ {
		name := fmt.Sprintf("Person-%d", i)
		p := findByName(data.Working, name)
		if p == nil {
			t.Fatalf("person %s not found", name)
		}
		deletedIds = append(deletedIds, p.Id)
		_, err := svc.Delete(context.Background(), p.Id)
		if err != nil {
			t.Fatalf("delete %s failed: %v", name, err)
		}
	}

	// Assert 150 working, 50 recycled
	working := svc.GetWorking(context.Background())
	recycled := svc.GetRecycled(context.Background())
	if len(working) != 150 {
		t.Errorf("expected 150 working after deletes, got %d", len(working))
	}
	if len(recycled) != 50 {
		t.Errorf("expected 50 recycled after deletes, got %d", len(recycled))
	}

	// Restore all deleted people
	for _, id := range deletedIds {
		_, err := svc.Restore(context.Background(), id)
		if err != nil {
			t.Fatalf("restore %s failed: %v", id, err)
		}
	}

	// Assert 200 working, 0 recycled
	working = svc.GetWorking(context.Background())
	recycled = svc.GetRecycled(context.Background())
	if len(working) != 200 {
		t.Errorf("expected 200 working after restores, got %d", len(working))
	}
	if len(recycled) != 0 {
		t.Errorf("expected 0 recycled after restores, got %d", len(recycled))
	}
}

func TestLargeOrg_SnapshotRoundTrip(t *testing.T) {
	svc := uploadLargeOrg(t, 200)

	// Save a snapshot of the initial state
	if err := svc.SaveSnapshot(context.Background(), "before-mutations"); err != nil {
		t.Fatalf("save snapshot failed: %v", err)
	}

	// Capture working state before mutations for comparison
	preMutation := svc.GetWorking(context.Background())

	// Mutate 50 people (change their roles)
	data := svc.GetOrg(context.Background())
	for i := 25; i < 75; i++ {
		name := fmt.Sprintf("Person-%d", i)
		p := findByName(data.Working, name)
		if p == nil {
			t.Fatalf("person %s not found", name)
		}
		_, err := svc.Update(context.Background(), p.Id, PersonUpdate{Role: ptr("Mutated")})
		if err != nil {
			t.Fatalf("update %s failed: %v", name, err)
		}
	}

	// Verify mutations happened
	postMutation := svc.GetWorking(context.Background())
	mutatedPerson := findByName(postMutation, "Person-30")
	if mutatedPerson == nil || mutatedPerson.Role != "Mutated" {
		t.Fatal("expected Person-30 role to be 'Mutated' after update")
	}

	// Load snapshot — should restore pre-mutation state
	_, err := svc.LoadSnapshot(context.Background(), "before-mutations")
	if err != nil {
		t.Fatalf("load snapshot failed: %v", err)
	}

	// Verify state matches pre-mutation
	restored := svc.GetWorking(context.Background())
	if len(restored) != len(preMutation) {
		t.Fatalf("expected %d working after snapshot load, got %d", len(preMutation), len(restored))
	}
	for _, orig := range preMutation {
		found := findById(restored, orig.Id)
		if found == nil {
			t.Errorf("person %s not found after snapshot load", orig.Name)
			continue
		}
		if found.Role != orig.Role {
			t.Errorf("person %s: expected role %q after snapshot load, got %q", orig.Name, orig.Role, found.Role)
		}
	}
}

func TestLargeOrg_ExportCSV(t *testing.T) {
	svc := uploadLargeOrg(t, 200)
	working := svc.GetWorking(context.Background())

	exported, err := ExportCSV(working)
	if err != nil {
		t.Fatalf("export CSV failed: %v", err)
	}

	// Parse the exported CSV
	reader := csv.NewReader(bytes.NewReader(exported))
	records, err := reader.ReadAll()
	if err != nil {
		t.Fatalf("parsing exported CSV failed: %v", err)
	}

	// Should be 200 data rows + 1 header row
	if len(records) != 201 {
		t.Errorf("expected 201 rows (1 header + 200 data), got %d", len(records))
	}

	// Verify header
	header := strings.Join(records[0], ",")
	if !strings.Contains(header, "Name") || !strings.Contains(header, "Manager") {
		t.Errorf("unexpected header: %s", header)
	}

	// Verify all people appear in the export
	nameSet := make(map[string]bool, 200)
	for _, row := range records[1:] {
		nameSet[row[0]] = true
	}
	for i := range 200 {
		name := fmt.Sprintf("Person-%d", i)
		if !nameSet[name] {
			t.Errorf("person %s not found in exported CSV", name)
		}
	}
}

func TestLargeOrg_500People(t *testing.T) {
	svc := uploadLargeOrg(t, 500)
	data := svc.GetOrg(context.Background())
	if len(data.Working) != 500 {
		t.Fatalf("expected 500 working people, got %d", len(data.Working))
	}

	// Move some ICs to a different director
	targetDir := findByName(data.Working, "Person-15")
	if targetDir == nil {
		t.Fatal("target director Person-15 not found")
	}
	for i := 100; i < 120; i++ {
		name := fmt.Sprintf("Person-%d", i)
		p := findByName(data.Working, name)
		if p == nil {
			t.Fatalf("person %s not found", name)
		}
		_, err := svc.Move(context.Background(), p.Id, targetDir.Id, "")
		if err != nil {
			t.Fatalf("move %s failed: %v", name, err)
		}
	}

	// Update some roles
	for i := 200; i < 230; i++ {
		name := fmt.Sprintf("Person-%d", i)
		p := findByName(data.Working, name)
		if p == nil {
			t.Fatalf("person %s not found", name)
		}
		_, err := svc.Update(context.Background(), p.Id, PersonUpdate{Role: ptr("Staff Engineer")})
		if err != nil {
			t.Fatalf("update %s failed: %v", name, err)
		}
	}

	// Verify total count unchanged
	working := svc.GetWorking(context.Background())
	if len(working) != 500 {
		t.Errorf("expected 500 working people after mutations, got %d", len(working))
	}

	// Export and verify
	exported, err := ExportCSV(working)
	if err != nil {
		t.Fatalf("export CSV failed: %v", err)
	}
	reader := csv.NewReader(bytes.NewReader(exported))
	records, err := reader.ReadAll()
	if err != nil {
		t.Fatalf("parsing exported CSV failed: %v", err)
	}
	if len(records) != 501 {
		t.Errorf("expected 501 rows (1 header + 500 data), got %d", len(records))
	}
}
