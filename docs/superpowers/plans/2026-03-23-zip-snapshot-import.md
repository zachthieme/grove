# ZIP Snapshot Import/Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import a ZIP of CSV/XLSX files as ordered snapshots with round-trip support. Update export to use numeric prefixes.

**Architecture:** Export change is frontend-only (reorder entries, add numeric prefix to filenames in `useSnapshotExport`). Import is a new `POST /api/upload/zip` endpoint with `parseZipEntries` helper that reuses existing `extractRows` + parser + `ConvertOrg` pipeline. The existing `ConfirmMapping` endpoint handles both single-file and ZIP pending state via a `pendingIsZip` flag. Frontend detects `.zip` extension and routes to the new endpoint.

**Tech Stack:** Go `archive/zip` (stdlib) for server-side ZIP reading. No new frontend dependencies (JSZip already installed for export).

**Spec:** `docs/superpowers/specs/2026-03-23-zip-snapshot-import-design.md`

---

### Task 1: Update export filenames with numeric prefixes

**Files:**
- Modify: `web/src/hooks/useSnapshotExport.ts`
- Modify: `web/src/utils/snapshotExportUtils.test.ts`

- [ ] **Step 1: Update the entries array in useSnapshotExport**

In `web/src/hooks/useSnapshotExport.ts`, change the entries array (around line 38-42) from:

```typescript
    const entries = [
      { name: '__working__', label: 'working' },
      { name: '__original__', label: 'original' },
      ...snapshots.map((s) => ({ name: s.name, label: s.name })),
    ]
```

To (original first at index 0, working second at index 1, snapshots sorted by timestamp ascending):

```typescript
    const sortedSnapshots = [...snapshots].sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp)
    )
    const entries = [
      { name: '__original__', label: 'original' },
      { name: '__working__', label: 'working' },
      ...sortedSnapshots.map((s) => ({ name: s.name, label: s.name })),
    ]
```

- [ ] **Step 2: Add numeric prefix to filenames**

Change the filename construction (around line 64) from:

```typescript
        const filename = `${filenames[i]}.${ext}`
```

To:

```typescript
        const filename = `${i}-${filenames[i]}.${ext}`
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /home/zach/code/grove/web && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Run all frontend tests**

Run: `cd /home/zach/code/grove/web && npx vitest run`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
cd /home/zach/code/grove && git add web/src/hooks/useSnapshotExport.ts
git commit -m "feat: add numeric prefixes to snapshot export filenames for round-tripping

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Add UploadResponse.Snapshots field + pendingIsZip flag

**Files:**
- Modify: `internal/api/model.go`
- Modify: `internal/api/service.go` (OrgService struct)
- Modify: `web/src/api/types.ts`

- [ ] **Step 1: Add Snapshots field to UploadResponse in Go**

In `internal/api/model.go`, add `Snapshots` to `UploadResponse`:

```go
type UploadResponse struct {
	Status    string                  `json:"status"`
	OrgData   *OrgData                `json:"orgData,omitempty"`
	Headers   []string                `json:"headers,omitempty"`
	Mapping   map[string]MappedColumn `json:"mapping,omitempty"`
	Preview   [][]string              `json:"preview,omitempty"`
	Snapshots []SnapshotInfo          `json:"snapshots,omitempty"`
}
```

- [ ] **Step 2: Add pendingIsZip to OrgService struct**

In `internal/api/service.go`, add the field to `OrgService`:

```go
type OrgService struct {
	mu              sync.RWMutex
	original        []Person
	working         []Person
	recycled        []Person
	snapshots       map[string]snapshotData
	pendingFile     []byte
	pendingFilename string
	pendingIsZip    bool
}
```

Also in the `Upload` method (around line 46-48), clear the new field:

```go
	s.pendingFile = nil
	s.pendingFilename = ""
	s.pendingIsZip = false
	s.snapshots = nil
```

And in `ConfirmMapping` (around line 114-115), clear it:

```go
	s.pendingFile = nil
	s.pendingFilename = ""
	s.pendingIsZip = false
```

- [ ] **Step 3: Add snapshots field to TypeScript UploadResponse**

In `web/src/api/types.ts`, add to the `UploadResponse` interface:

```typescript
export interface UploadResponse {
  status: 'ready' | 'needs_mapping'
  orgData?: OrgData
  headers?: string[]
  mapping?: Record<string, MappedColumn>
  preview?: string[][]
  snapshots?: SnapshotInfo[]
}
```

- [ ] **Step 4: Verify everything compiles**

Run: `cd /home/zach/code/grove && go build ./internal/... && cd web && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
cd /home/zach/code/grove && git add internal/api/model.go internal/api/service.go web/src/api/types.ts
git commit -m "feat: add Snapshots to UploadResponse, pendingIsZip flag to OrgService

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: parseZipEntries helper + UploadZip service method

**Files:**
- Create: `internal/api/zipimport.go`
- Test: `internal/api/zipimport_test.go`

- [ ] **Step 1: Create test helper to build in-memory ZIPs**

Create `internal/api/zipimport_test.go`:

```go
package api

import (
	"archive/zip"
	"bytes"
	"testing"
	"time"
)

type zipFile struct {
	name    string
	content string
}

// buildTestZip creates an in-memory ZIP with entries in the given order.
func buildTestZip(t *testing.T, files []zipFile) []byte {
	t.Helper()
	var buf bytes.Buffer
	w := zip.NewWriter(&buf)
	for _, f := range files {
		entry, err := w.Create(f.name)
		if err != nil {
			t.Fatalf("creating zip entry %s: %v", f.name, err)
		}
		if _, err := entry.Write([]byte(f.content)); err != nil {
			t.Fatalf("writing zip entry %s: %v", f.name, err)
		}
	}
	if err := w.Close(); err != nil {
		t.Fatalf("closing zip: %v", err)
	}
	return buf.Bytes()
}

const testCSVContent = "Name,Role,Discipline,Manager,Team,Additional Teams,Status\nAlice,VP,Eng,,Eng,,Active\nBob,Engineer,Eng,Alice,Platform,,Active\n"
const testCSVContent2 = "Name,Role,Discipline,Manager,Team,Additional Teams,Status\nAlice,VP,Eng,,Eng,,Active\nBob,Senior Engineer,Eng,Alice,Platform,,Active\n"
const testCSVContent3 = "Name,Role,Discipline,Manager,Team,Additional Teams,Status\nAlice,Director,Eng,,Eng,,Active\nBob,Senior Engineer,Eng,Alice,Platform,,Active\nCarol,Intern,Eng,Bob,Platform,,Active\n"
```

- [ ] **Step 2: Write failing tests for UploadZip**

Add to `internal/api/zipimport_test.go`:

```go
func TestUploadZip_ThreeFiles(t *testing.T) {
	svc := NewOrgService()
	data := buildTestZip(t, []zipFile{
		{"0-original.csv", testCSVContent},
		{"1-working.csv", testCSVContent2},
		{"2-snapshot.csv", testCSVContent3},
	})

	resp, err := svc.UploadZip(data)
	if err != nil {
		t.Fatalf("UploadZip failed: %v", err)
	}
	if resp.Status != "ready" {
		t.Fatalf("expected ready, got %s", resp.Status)
	}
	if resp.OrgData == nil {
		t.Fatal("expected orgData")
	}
	// Original should have 2 people (from testCSVContent)
	if len(resp.OrgData.Original) != 2 {
		t.Errorf("expected 2 original people, got %d", len(resp.OrgData.Original))
	}
	// Working should have 2 people (from testCSVContent2)
	if len(resp.OrgData.Working) != 2 {
		t.Errorf("expected 2 working people, got %d", len(resp.OrgData.Working))
	}
	// Should have 1 snapshot
	if len(resp.Snapshots) != 1 {
		t.Errorf("expected 1 snapshot, got %d", len(resp.Snapshots))
	}
	if len(resp.Snapshots) > 0 && resp.Snapshots[0].Name != "snapshot" {
		t.Errorf("expected snapshot name 'snapshot', got '%s'", resp.Snapshots[0].Name)
	}
}

func TestUploadZip_SingleFile(t *testing.T) {
	svc := NewOrgService()
	data := buildTestZip(t, []zipFile{
		{"org.csv", testCSVContent},
	})

	resp, err := svc.UploadZip(data)
	if err != nil {
		t.Fatalf("UploadZip failed: %v", err)
	}
	if resp.Status != "ready" {
		t.Fatalf("expected ready, got %s", resp.Status)
	}
	// Single file: original = working
	if len(resp.OrgData.Original) != len(resp.OrgData.Working) {
		t.Error("expected original and working to be the same for single file")
	}
	if len(resp.Snapshots) != 0 {
		t.Errorf("expected 0 snapshots for single file, got %d", len(resp.Snapshots))
	}
}

func TestUploadZip_NoCSVFiles(t *testing.T) {
	svc := NewOrgService()
	data := buildTestZip(t, []zipFile{
		{"image.png", "not a csv"},
	})

	_, err := svc.UploadZip(data)
	if err == nil {
		t.Error("expected error for ZIP with no CSV files")
	}
}

func TestUploadZip_UnprefixedFiles(t *testing.T) {
	svc := NewOrgService()
	data := buildTestZip(t, []zipFile{
		{"beta.csv", testCSVContent},
		{"alpha.csv", testCSVContent2},
	})

	resp, err := svc.UploadZip(data)
	if err != nil {
		t.Fatalf("UploadZip failed: %v", err)
	}
	// Unprefixed files sorted alphabetically: alpha first (original), beta last (working)
	if resp.Status != "ready" {
		t.Fatalf("expected ready, got %s", resp.Status)
	}
}

func TestUploadZip_IgnoresNonCSV(t *testing.T) {
	svc := NewOrgService()
	data := buildTestZip(t, []zipFile{
		{"0-original.csv", testCSVContent},
		{"1-working.csv", testCSVContent2},
		{"chart.png", "binary data"},
		{"README.md", "ignore me"},
	})

	resp, err := svc.UploadZip(data)
	if err != nil {
		t.Fatalf("UploadZip failed: %v", err)
	}
	if resp.Status != "ready" {
		t.Fatalf("expected ready, got %s", resp.Status)
	}
	// Only CSV files should be processed
	if len(resp.Snapshots) != 0 {
		t.Errorf("expected 0 snapshots (only original+working), got %d", len(resp.Snapshots))
	}
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd /home/zach/code/grove && go test ./internal/api/ -run TestUploadZip -v`
Expected: FAIL — `svc.UploadZip` undefined

- [ ] **Step 4: Implement parseZipEntries and UploadZip**

Create `internal/api/zipimport.go`:

```go
package api

import (
	"archive/zip"
	"bytes"
	"fmt"
	"io"
	"log"
	"math"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/zachthieme/grove/internal/parser"
)

const maxDecompressedSize = 200 << 20 // 200 MB

var prefixRegex = regexp.MustCompile(`^(\d+)-(.+)$`)

type zipEntry struct {
	prefix   int
	name     string // display name (no prefix, no extension)
	filename string // original filename for extension detection
	data     []byte
}

func parseZipFileList(data []byte) ([]zipEntry, error) {
	r, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, fmt.Errorf("opening zip: %w", err)
	}

	var entries []zipEntry
	var totalSize int64

	for _, f := range r.File {
		base := filepath.Base(f.Name)
		ext := strings.ToLower(filepath.Ext(base))
		if ext != ".csv" && ext != ".xlsx" {
			continue
		}

		rc, err := f.Open()
		if err != nil {
			log.Printf("skipping zip entry %s: %v", f.Name, err)
			continue
		}
		content, err := io.ReadAll(io.LimitReader(rc, maxDecompressedSize-totalSize+1))
		rc.Close()
		if err != nil {
			log.Printf("skipping zip entry %s: %v", f.Name, err)
			continue
		}
		totalSize += int64(len(content))
		if totalSize > maxDecompressedSize {
			return nil, fmt.Errorf("ZIP contents too large (max %d MB)", maxDecompressedSize>>20)
		}

		nameNoExt := strings.TrimSuffix(base, filepath.Ext(base))
		prefix := math.MaxInt
		displayName := nameNoExt

		if m := prefixRegex.FindStringSubmatch(nameNoExt); m != nil {
			fmt.Sscanf(m[1], "%d", &prefix)
			displayName = m[2]
		}

		entries = append(entries, zipEntry{
			prefix:   prefix,
			name:     displayName,
			filename: base,
			data:     content,
		})
	}

	if len(entries) == 0 {
		return nil, fmt.Errorf("ZIP contains no CSV or XLSX files")
	}

	sort.SliceStable(entries, func(i, j int) bool {
		if entries[i].prefix != entries[j].prefix {
			return entries[i].prefix < entries[j].prefix
		}
		return entries[i].filename < entries[j].filename
	})

	return entries, nil
}

func parseZipEntries(entries []zipEntry, mapping map[string]string) (original []Person, working []Person, snaps map[string]snapshotData, err error) {
	snaps = make(map[string]snapshotData)
	var parsed []struct {
		entry  zipEntry
		people []Person
	}

	for _, e := range entries {
		header, dataRows, err := extractRows(e.filename, e.data)
		if err != nil {
			log.Printf("skipping zip entry %s: %v", e.filename, err)
			continue
		}

		org, err := parser.BuildPeopleWithMapping(header, dataRows, mapping)
		if err != nil {
			log.Printf("skipping zip entry %s: %v", e.filename, err)
			continue
		}

		people := ConvertOrg(org)
		parsed = append(parsed, struct {
			entry  zipEntry
			people []Person
		}{entry: e, people: people})
	}

	if len(parsed) == 0 {
		return nil, nil, nil, fmt.Errorf("no files in ZIP could be parsed")
	}

	if len(parsed) == 1 {
		people := parsed[0].people
		return people, deepCopyPeople(people), nil, nil
	}

	// Find original (prefix 0) and working (prefix 1)
	originalIdx := 0  // fallback: first file
	workingIdx := len(parsed) - 1  // fallback: last file

	for i, p := range parsed {
		if p.entry.prefix == 0 {
			originalIdx = i
		}
		if p.entry.prefix == 1 {
			workingIdx = i
		}
	}

	original = parsed[originalIdx].people
	working = parsed[workingIdx].people

	// Everything else becomes a snapshot
	now := time.Now()
	for i, p := range parsed {
		if i == originalIdx || i == workingIdx {
			continue
		}
		snaps[p.entry.name] = snapshotData{
			People:    p.people,
			Timestamp: now.Add(time.Duration(i) * time.Millisecond),
		}
	}

	return original, working, snaps, nil
}

func (s *OrgService) UploadZip(data []byte) (*UploadResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.pendingFile = nil
	s.pendingFilename = ""
	s.pendingIsZip = false
	s.snapshots = nil

	entries, err := parseZipFileList(data)
	if err != nil {
		return nil, err
	}

	// Use the first file for column inference
	first := entries[0]
	header, dataRows, err := extractRows(first.filename, first.data)
	if err != nil {
		return nil, fmt.Errorf("parsing first file: %w", err)
	}

	mapping := InferMapping(header)
	if AllRequiredHigh(mapping) {
		simpleMapping := make(map[string]string, len(mapping))
		for field, mc := range mapping {
			simpleMapping[field] = mc.Column
		}

		orig, work, snaps, err := parseZipEntries(entries, simpleMapping)
		if err != nil {
			return nil, fmt.Errorf("parsing zip: %w", err)
		}

		s.original = orig
		s.working = deepCopyPeople(work)
		s.recycled = nil
		s.snapshots = snaps

		return &UploadResponse{
			Status:    "ready",
			OrgData:   &OrgData{Original: deepCopyPeople(s.original), Working: deepCopyPeople(s.working)},
			Snapshots: s.ListSnapshotsUnlocked(),
		}, nil
	}

	// Needs mapping — store ZIP as pending
	s.pendingFile = data
	s.pendingFilename = "upload.zip"
	s.pendingIsZip = true
	preview := [][]string{header}
	for i, row := range dataRows {
		if i >= 3 {
			break
		}
		preview = append(preview, row)
	}
	return &UploadResponse{
		Status:  "needs_mapping",
		Headers: header,
		Mapping: mapping,
		Preview: preview,
	}, nil
}
```

Note: `ListSnapshotsUnlocked` is a new helper needed since we're already holding the lock. Add it to `internal/api/snapshots.go`:

```go
// ListSnapshotsUnlocked returns snapshot info without acquiring the lock.
// Must be called with s.mu held.
func (s *OrgService) ListSnapshotsUnlocked() []SnapshotInfo {
	var list []SnapshotInfo
	for name, snap := range s.snapshots {
		list = append(list, SnapshotInfo{
			Name:      name,
			Timestamp: snap.Timestamp.Format(time.RFC3339Nano),
		})
	}
	sort.Slice(list, func(i, j int) bool {
		return list[i].Timestamp > list[j].Timestamp
	})
	return list
}
```

And refactor `ListSnapshots` to use it:

```go
func (s *OrgService) ListSnapshots() []SnapshotInfo {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.ListSnapshotsUnlocked()
}
```

- [ ] **Step 5: Run tests**

Run: `cd /home/zach/code/grove && go test ./internal/api/ -run TestUploadZip -v`
Expected: PASS (all 5 tests)

- [ ] **Step 6: Run all Go tests**

Run: `cd /home/zach/code/grove && go test ./internal/... -count=1`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd /home/zach/code/grove && git add internal/api/zipimport.go internal/api/zipimport_test.go internal/api/snapshots.go
git commit -m "feat: add parseZipEntries helper and UploadZip service method

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Update ConfirmMapping for ZIP pending state

**Files:**
- Modify: `internal/api/service.go`
- Test: `internal/api/zipimport_test.go`

- [ ] **Step 1: Write failing test for ZIP confirm mapping**

Add to `internal/api/zipimport_test.go`:

```go
func TestUploadZip_NeedsMapping_ThenConfirm(t *testing.T) {
	svc := NewOrgService()
	// CSV with non-standard headers
	csvContent := "Full Name,Title,Dept,Reports To,Group,Extra Teams,State\nAlice,VP,Eng,,Eng,,Active\nBob,Engineer,Eng,Alice,Platform,,Active\n"
	data := buildTestZip(t, []zipFile{
		{"0-original.csv", csvContent},
		{"1-working.csv", csvContent},
	})

	resp, err := svc.UploadZip(data)
	if err != nil {
		t.Fatalf("UploadZip failed: %v", err)
	}
	if resp.Status != "needs_mapping" {
		t.Fatalf("expected needs_mapping, got %s", resp.Status)
	}

	// Confirm with explicit mapping
	orgData, err := svc.ConfirmMapping(map[string]string{
		"name": "Full Name", "role": "Title", "discipline": "Dept",
		"manager": "Reports To", "team": "Group", "additionalTeams": "Extra Teams",
		"status": "State",
	})
	if err != nil {
		t.Fatalf("ConfirmMapping failed: %v", err)
	}
	if len(orgData.Original) != 2 {
		t.Errorf("expected 2 original people, got %d", len(orgData.Original))
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/zach/code/grove && go test ./internal/api/ -run TestUploadZip_NeedsMapping -v`
Expected: FAIL — ConfirmMapping tries to parse ZIP as single file

- [ ] **Step 3: Update ConfirmMapping to handle ZIP**

In `internal/api/service.go`, replace the `ConfirmMapping` method:

```go
func (s *OrgService) ConfirmMapping(mapping map[string]string) (*OrgData, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.pendingFile == nil {
		return nil, fmt.Errorf("no pending file to confirm")
	}

	if s.pendingIsZip {
		entries, err := parseZipFileList(s.pendingFile)
		if err != nil {
			return nil, fmt.Errorf("parsing pending zip: %w", err)
		}
		orig, work, snaps, err := parseZipEntries(entries, mapping)
		if err != nil {
			return nil, fmt.Errorf("parsing pending zip: %w", err)
		}
		s.original = orig
		s.working = deepCopyPeople(work)
		s.recycled = nil
		s.snapshots = snaps
		s.pendingFile = nil
		s.pendingFilename = ""
		s.pendingIsZip = false
		return &OrgData{Original: deepCopyPeople(s.original), Working: deepCopyPeople(s.working)}, nil
	}

	header, dataRows, err := extractRows(s.pendingFilename, s.pendingFile)
	if err != nil {
		return nil, fmt.Errorf("parsing pending file: %w", err)
	}

	org, err := parser.BuildPeopleWithMapping(header, dataRows, mapping)
	if err != nil {
		return nil, fmt.Errorf("building org: %w", err)
	}

	people := ConvertOrg(org)
	s.original = people
	s.working = deepCopyPeople(people)
	s.recycled = nil
	s.pendingFile = nil
	s.pendingFilename = ""
	s.pendingIsZip = false
	return &OrgData{Original: deepCopyPeople(s.original), Working: deepCopyPeople(s.working)}, nil
}
```

- [ ] **Step 4: Run all Go tests**

Run: `cd /home/zach/code/grove && go test ./internal/... -count=1`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /home/zach/code/grove && git add internal/api/service.go internal/api/zipimport_test.go
git commit -m "feat: update ConfirmMapping to handle ZIP pending state

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: ZIP upload HTTP handler

**Files:**
- Modify: `internal/api/handlers.go`
- Test: `internal/api/handlers_test.go`

- [ ] **Step 1: Write failing handler test**

Add to `internal/api/handlers_test.go`:

```go
func TestUploadZipHandler(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc)

	csvContent := "Name,Role,Discipline,Manager,Team,Additional Teams,Status\nAlice,VP,Eng,,Eng,,Active\nBob,Engineer,Eng,Alice,Platform,,Active\n"
	csvContent2 := "Name,Role,Discipline,Manager,Team,Additional Teams,Status\nAlice,VP,Eng,,Eng,,Active\nBob,Senior Engineer,Eng,Alice,Platform,,Active\n"

	// Build ZIP
	var zipBuf bytes.Buffer
	zw := zip.NewWriter(&zipBuf)
	f1, _ := zw.Create("0-original.csv")
	f1.Write([]byte(csvContent))
	f2, _ := zw.Create("1-working.csv")
	f2.Write([]byte(csvContent2))
	f3, _ := zw.Create("2-reorg.csv")
	f3.Write([]byte(csvContent))
	zw.Close()

	// Upload ZIP via multipart
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	part, _ := writer.CreateFormFile("file", "test.zip")
	part.Write(zipBuf.Bytes())
	writer.Close()

	req := httptest.NewRequest("POST", "/api/upload/zip", &buf)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp UploadResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.Status != "ready" {
		t.Fatalf("expected ready, got %s", resp.Status)
	}
	if len(resp.Snapshots) != 1 {
		t.Errorf("expected 1 snapshot, got %d", len(resp.Snapshots))
	}
}
```

Note: you'll need to add `"archive/zip"` to the imports in `handlers_test.go`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/zach/code/grove && go test ./internal/api/ -run TestUploadZipHandler -v`
Expected: FAIL — route not found

- [ ] **Step 3: Add route and handler**

Add route to `NewRouter` in `internal/api/handlers.go` (after the existing upload routes):

```go
mux.HandleFunc("POST /api/upload/zip", handleUploadZip(svc))
```

Add handler:

```go
func handleUploadZip(svc *OrgService) http.HandlerFunc {
	const maxUploadSize = 50 << 20
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)
		file, _, err := r.FormFile("file")
		if err != nil {
			writeError(w, http.StatusBadRequest, "missing file field or file too large (max 50MB)")
			return
		}
		defer func() { _ = file.Close() }()

		data, err := io.ReadAll(file)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "reading file")
			return
		}

		resp, err := svc.UploadZip(data)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, resp)
	}
}
```

- [ ] **Step 4: Run all Go tests**

Run: `cd /home/zach/code/grove && go test ./internal/... -count=1`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /home/zach/code/grove && git add internal/api/handlers.go internal/api/handlers_test.go
git commit -m "feat: add POST /api/upload/zip handler

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Frontend — API client + upload routing + state handling

**Files:**
- Modify: `web/src/api/client.ts`
- Modify: `web/src/store/OrgContext.tsx`
- Modify: `web/src/components/Toolbar.tsx`

- [ ] **Step 1: Add uploadZipFile to API client**

Add to `web/src/api/client.ts`:

```typescript
export async function uploadZipFile(file: File): Promise<UploadResponse> {
  const form = new FormData()
  form.append('file', file)
  const resp = await fetch(`${BASE}/upload/zip`, { method: 'POST', body: form })
  return json<UploadResponse>(resp)
}
```

- [ ] **Step 2: Update OrgContext upload action to detect ZIP**

In `web/src/store/OrgContext.tsx`, update the `upload` callback (around line 192):

```typescript
  const upload = useCallback(async (file: File) => {
    const isZip = file.name.toLowerCase().endsWith('.zip')
    let resp: Awaited<ReturnType<typeof api.uploadFile>>
    try {
      resp = isZip ? await api.uploadZipFile(file) : await api.uploadFile(file)
    } catch (err) {
      setState((s) => ({ ...s, error: `Upload failed: ${err instanceof Error ? err.message : String(err)}` }))
      return
    }
    if (resp.status === 'ready' && resp.orgData) {
      setState((s) => ({
        ...s,
        original: resp.orgData!.original,
        working: resp.orgData!.working,
        recycled: [],
        loaded: true,
        pendingMapping: null,
        snapshots: resp.snapshots ?? s.snapshots,
      }))
    } else if (resp.status === 'needs_mapping') {
      setState((s) => ({
        ...s,
        pendingMapping: {
          headers: resp.headers!,
          mapping: resp.mapping!,
          preview: resp.preview!,
        },
      }))
    }
  }, [])
```

- [ ] **Step 3: Update Toolbar file input to accept .zip**

In `web/src/components/Toolbar.tsx`, change the `accept` attribute (around line 62):

```typescript
        accept=".csv,.xlsx,.zip"
```

- [ ] **Step 4: Also update snapshots after confirmMapping**

In `web/src/store/OrgContext.tsx`, update `confirmMappingAction` to refresh snapshots after confirming (since a ZIP confirm creates snapshots):

```typescript
  const confirmMappingAction = useCallback(async (mapping: Record<string, string>) => {
    const data = await api.confirmMapping(mapping)
    const snapshots = await api.listSnapshots()
    setState((s) => ({
      ...s,
      original: data.original,
      working: data.working,
      recycled: [],
      loaded: true,
      pendingMapping: null,
      snapshots,
    }))
  }, [])
```

- [ ] **Step 5: Verify TypeScript compiles and all tests pass**

Run: `cd /home/zach/code/grove/web && npx tsc --noEmit && npx vitest run`
Expected: no errors, all tests pass

- [ ] **Step 6: Commit**

```bash
cd /home/zach/code/grove && git add web/src/api/client.ts web/src/store/OrgContext.tsx web/src/components/Toolbar.tsx
git commit -m "feat: frontend ZIP upload routing and snapshot state handling

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Final verification

- [ ] **Step 1: Run all Go tests**

Run: `cd /home/zach/code/grove && go test ./internal/... -count=1`
Expected: PASS

- [ ] **Step 2: Run all frontend tests**

Run: `cd /home/zach/code/grove/web && npx vitest run`
Expected: PASS

- [ ] **Step 3: TypeScript check**

Run: `cd /home/zach/code/grove/web && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Build frontend**

Run: `cd /home/zach/code/grove && make frontend`
Expected: success
