package api

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// generateBenchCSV creates a CSV with n people arranged as a hierarchy:
// 1 CEO, then managers with ~5 reports each.
func generateBenchCSV(n int) []byte {
	var b strings.Builder
	b.WriteString("Name,Role,Discipline,Manager,Team,Status\n")
	b.WriteString("CEO,Chief Executive,Leadership,,Executive,Active\n")
	manager := "CEO"
	reportsUnderManager := 0
	managerIdx := 1
	for i := 1; i < n; i++ {
		name := fmt.Sprintf("Person%d", i)
		fmt.Fprintf(&b, "%s,Engineer,Engineering,%s,Team%d,Active\n", name, manager, managerIdx)
		reportsUnderManager++
		if reportsUnderManager >= 5 {
			// Promote the first report of this manager to be the next manager
			manager = fmt.Sprintf("Person%d", i-4)
			managerIdx++
			reportsUnderManager = 0
		}
	}
	return []byte(b.String())
}

// benchService creates an OrgService pre-loaded with an n-person org.
func benchService(b *testing.B, n int) *OrgService {
	b.Helper()
	svc := NewOrgService(NewMemorySnapshotStore())
	csv := generateBenchCSV(n)
	resp, err := svc.Upload(context.Background(), "bench.csv", csv)
	if err != nil {
		b.Fatalf("upload failed: %v", err)
	}
	if resp.Status != UploadReady {
		b.Fatalf("expected status 'ready', got '%s'", resp.Status)
	}
	return svc
}

func BenchmarkUpload_50(b *testing.B) {
	csv := generateBenchCSV(50)
	for b.Loop() {
		svc := NewOrgService(NewMemorySnapshotStore())
		if _, err := svc.Upload(context.Background(), "bench.csv", csv); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkUpload_200(b *testing.B) {
	csv := generateBenchCSV(200)
	for b.Loop() {
		svc := NewOrgService(NewMemorySnapshotStore())
		if _, err := svc.Upload(context.Background(), "bench.csv", csv); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkUpload_500(b *testing.B) {
	csv := generateBenchCSV(500)
	for b.Loop() {
		svc := NewOrgService(NewMemorySnapshotStore())
		if _, err := svc.Upload(context.Background(), "bench.csv", csv); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkMove(b *testing.B) {
	svc := benchService(b, 200)
	org := svc.GetOrg(context.Background())
	// Find a leaf node (no one reports to them) to safely move around
	hasReports := make(map[string]bool)
	for _, p := range org.Working {
		if p.ManagerId != "" {
			hasReports[p.ManagerId] = true
		}
	}
	var leafID, ceoID string
	for _, p := range org.Working {
		if p.Name == "CEO" {
			ceoID = p.Id
		}
		if leafID == "" && !hasReports[p.Id] && p.Name != "CEO" {
			leafID = p.Id
		}
	}
	if leafID == "" || ceoID == "" {
		b.Fatal("could not find test people")
	}
	// Find a second manager to alternate with
	var altManagerID string
	for _, p := range org.Working {
		if hasReports[p.Id] && p.Name != "CEO" {
			altManagerID = p.Id
			break
		}
	}
	if altManagerID == "" {
		altManagerID = ceoID
	}
	toggle := false
	for b.Loop() {
		target := ceoID
		if toggle {
			target = altManagerID
		}
		toggle = !toggle
		if _, err := svc.Move(context.Background(), leafID, target, "Team1"); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkUpdate(b *testing.B) {
	svc := benchService(b, 200)
	org := svc.GetOrg(context.Background())
	personID := org.Working[10].Id
	roles := []string{"Engineer", "Senior Engineer", "Staff Engineer"}
	i := 0
	for b.Loop() {
		role := roles[i%len(roles)]
		i++
		if _, err := svc.Update(context.Background(), personID, PersonUpdate{Role: ptr(role)}); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkExportCSV(b *testing.B) {
	svc := benchService(b, 200)
	people := svc.GetWorking(context.Background())
	for b.Loop() {
		if _, err := ExportCSV(people); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkSnapshotSaveLoad(b *testing.B) {
	svc := benchService(b, 200)
	for b.Loop() {
		if err := svc.SaveSnapshot(context.Background(), "bench"); err != nil {
			b.Fatal(err)
		}
		if _, err := svc.LoadSnapshot(context.Background(), "bench"); err != nil {
			b.Fatal(err)
		}
		if err := svc.DeleteSnapshot(context.Background(), "bench"); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkGetOrgHandler(b *testing.B) {
	svc := benchService(b, 200)
	router := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())
	for b.Loop() {
		req := httptest.NewRequest(http.MethodGet, "/api/org", nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			b.Fatalf("expected 200, got %d", rec.Code)
		}
	}
}

func BenchmarkMoveChain_50(b *testing.B) {
	csvData := generateLargeCSV(200)
	for b.Loop() {
		svc := NewOrgService(NewMemorySnapshotStore())
		resp, err := svc.Upload(context.Background(), "bench.csv", csvData)
		if err != nil || resp.Status != UploadReady {
			b.Fatal("setup failed")
		}
		data := svc.GetOrg(context.Background())
		targetDir := findByName(data.Working, "Person-10")
		if targetDir == nil {
			b.Fatal("Person-10 not found")
		}
		for i := 25; i < 75; i++ {
			p := findByName(data.Working, fmt.Sprintf("Person-%d", i))
			if p == nil {
				b.Fatalf("Person-%d not found", i)
			}
			if _, err := svc.Move(context.Background(), p.Id, targetDir.Id, ""); err != nil {
				b.Fatal(err)
			}
		}
	}
}

func BenchmarkBulkUpdate_175(b *testing.B) {
	csvData := generateLargeCSV(200)
	for b.Loop() {
		svc := NewOrgService(NewMemorySnapshotStore())
		resp, err := svc.Upload(context.Background(), "bench.csv", csvData)
		if err != nil || resp.Status != UploadReady {
			b.Fatal("setup failed")
		}
		data := svc.GetOrg(context.Background())
		for i := 25; i < 200; i++ {
			p := findByName(data.Working, fmt.Sprintf("Person-%d", i))
			if p == nil {
				b.Fatalf("Person-%d not found", i)
			}
			newRole := fmt.Sprintf("Senior Engineer %d", i)
			if _, err := svc.Update(context.Background(), p.Id, PersonUpdate{Role: ptr(newRole)}); err != nil {
				b.Fatal(err)
			}
		}
	}
}

func BenchmarkDeleteRestore_50(b *testing.B) {
	csvData := generateLargeCSV(200)
	for b.Loop() {
		svc := NewOrgService(NewMemorySnapshotStore())
		resp, err := svc.Upload(context.Background(), "bench.csv", csvData)
		if err != nil || resp.Status != UploadReady {
			b.Fatal("setup failed")
		}
		data := svc.GetOrg(context.Background())
		var ids []string
		for i := 150; i < 200; i++ {
			p := findByName(data.Working, fmt.Sprintf("Person-%d", i))
			if p == nil {
				b.Fatalf("Person-%d not found", i)
			}
			ids = append(ids, p.Id)
			if _, err := svc.Delete(context.Background(), p.Id); err != nil {
				b.Fatal(err)
			}
		}
		for _, id := range ids {
			if _, err := svc.Restore(context.Background(), id); err != nil {
				b.Fatal(err)
			}
		}
	}
}

func BenchmarkInferMapping(b *testing.B) {
	headers := []string{"Full Name", "Job Title", "Department", "Reports To", "Function", "Employment Status"}
	for b.Loop() {
		InferMapping(headers)
	}
}

func BenchmarkReorder(b *testing.B) {
	svc := benchService(b, 200)
	org := svc.GetOrg(context.Background())
	ids := make([]string, len(org.Working))
	for i, p := range org.Working {
		ids[i] = p.Id
	}
	// Reverse the order for each iteration to ensure actual work
	reversed := make([]string, len(ids))
	for i, id := range ids {
		reversed[len(ids)-1-i] = id
	}
	toggle := false
	for b.Loop() {
		order := ids
		if toggle {
			order = reversed
		}
		toggle = !toggle
		if _, err := svc.Reorder(context.Background(), order); err != nil {
			b.Fatal(err)
		}
	}
}
