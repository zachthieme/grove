# Notes & Pods Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add public/private notes to people and pods, and promote team groupings under managers to first-class "pod" entities with their own identity, notes, and summary views.

**Architecture:** Pods are a new backend entity stored on OrgService alongside people. They are auto-seeded from `(managerId, team)` groupings on upload/import. Person gets three new fields: `pod`, `publicNote`, `privateNote`. All mutation endpoints change from returning bare `[]Person` to `{"working": []Person, "pods": []Pod}`. Frontend gains pod selection, pod editing in DetailSidebar, and pod headers replacing team headers in views.

**Tech Stack:** Go backend, React/TypeScript frontend, vitest for frontend tests, Go testing for backend tests.

**Spec:** `docs/superpowers/specs/2026-03-25-notes-and-pods-design.md`

---

## File Map

### New Files
- `internal/api/pods.go` — Pod auto-seeding, CRUD, lifecycle management, `SeedPods`, `UpdatePod`, `CreatePod`, `findPodByNameAndManager`, `cleanupEmptyPods`, `reassignPersonPod`
- `internal/api/pods_test.go` — Tests for all pod operations
- `web/src/components/PodSidebar.tsx` — Pod editing form (name, team read-only, notes, member count)
- `web/src/components/PodSidebar.module.css` — Styles for pod sidebar

### Modified Files
- `internal/model/model.go` — Add `Pod`, `PublicNote`, `PrivateNote` fields to `Person` struct
- `internal/api/model.go` — Add `Pod` type, `PodInfo` type, add fields to `Person`, `OrgData`, `AutosaveData`, `snapshotData`
- `internal/api/convert.go` — Copy new person fields in `ConvertOrgWithIDMap`; add `ConvertPods` function
- `internal/api/service.go` — Add `pods`/`originalPods` to `OrgService`; add `maxNoteLen`; update `Update` to handle `pod`/`publicNote`/`privateNote` with note-length validation; update `Move`/`Add`/`Delete`/`Restore`/`ResetToOriginal` to return pods and cascade membership
- `internal/api/handlers.go` — Register pod endpoints; change response shapes for move/update/reorder/add/delete/restore to include pods
- `internal/api/snapshots.go` — Save/load pods in snapshot data; update `persistedSnapshot`
- `internal/api/snapshot_store.go` — Update `persistedSnapshot` to include pods
- `internal/api/export.go` — Add `Pod`, `Public Note`, `Private Note` to export headers and `personToRow`
- `internal/api/infer.go` — Add inference entries for `pod`, `publicNote`, `privateNote`
- `internal/parser/parser.go` — Add `pod`, `publicNote`, `privateNote` to `BuildPeopleWithMapping`
- `internal/api/zipimport.go` — Filter `pods.csv` sidecar; auto-seed pods after parse; export `pods.csv` sidecar in ZIP
- `web/src/api/types.ts` — Add `Pod` interface; update `Person`, `OrgData`, `AutosaveData`, response types
- `web/src/api/client.ts` — Update return types for move/update/reorder; add pod API functions
- `web/src/store/orgTypes.ts` — Add `pods` to state; add `selectedPodId` to selection; add pod actions
- `web/src/store/OrgDataContext.tsx` — Add pods to state; update all mutation handlers; add pod actions
- `web/src/store/OrgContext.tsx` — Wire pod state/actions through
- `web/src/store/SelectionContext.tsx` — Add `selectedPodId`, `selectPod`
- `web/src/hooks/useAutosave.ts` — Include `pods`/`originalPods` in autosave payload
- `web/src/hooks/useOrgDiff.ts` — Add `'pod'` change type for pod field changes
- `web/src/components/PersonNode.tsx` — Show truncated public note below role line
- `web/src/components/DetailSidebar.tsx` — Add pod dropdown, note textareas for person; delegate to PodSidebar when pod selected
- `web/src/views/ColumnView.tsx` — Replace `TeamHeaderNode` with pod headers; clickable; show pod note subtitle
- `web/src/views/ManagerView.tsx` — Replace team summary cards with pod summary cards; show pod note

---

## Task 1: Domain & API Model — Person Fields

Add `pod`, `publicNote`, `privateNote` fields to Person at all layers.

**Files:**
- Modify: `internal/model/model.go:29-41`
- Modify: `internal/api/model.go:3-17`
- Test: `internal/api/convert_test.go`

- [ ] **Step 1: Add fields to domain model Person**

In `internal/model/model.go`, add three fields to the `Person` struct after `NewTeam`:

```go
type Person struct {
	Name            string
	Role            string
	Discipline      string
	Manager         string
	Team            string
	AdditionalTeams []string
	Status          string
	EmploymentType  string
	NewRole         string
	NewTeam         string
	Warning         string // non-empty if this row had validation issues
	Pod             string
	PublicNote      string
	PrivateNote     string
}
```

- [ ] **Step 2: Add fields to API model Person**

In `internal/api/model.go`, add three fields to the API `Person` struct after `NewTeam`:

```go
Pod         string `json:"pod,omitempty"`
PublicNote  string `json:"publicNote,omitempty"`
PrivateNote string `json:"privateNote,omitempty"`
```

- [ ] **Step 3: Copy new fields in ConvertOrgWithIDMap**

In `internal/api/convert.go`, add to the `Person` literal in `ConvertOrgWithIDMap` (after `NewTeam`):

```go
Pod:         p.Pod,
PublicNote:  p.PublicNote,
PrivateNote: p.PrivateNote,
```

- [ ] **Step 4: Run existing tests to verify nothing broke**

Run: `go test ./...`
Expected: All existing tests pass.

- [ ] **Step 5: Commit**

```
feat(model): add pod, publicNote, privateNote fields to Person
```

---

## Task 2: Pod Entity & API Types

Add the Pod type and update OrgData, AutosaveData, snapshotData.

**Files:**
- Modify: `internal/api/model.go`
- Modify: `internal/api/snapshots.go:9-12`
- Modify: `internal/api/snapshot_store.go:31-34`

- [ ] **Step 1: Add Pod, PodInfo types and update existing types in model.go**

In `internal/api/model.go`, add after the `Person` struct:

```go
type Pod struct {
	Id          string `json:"id"`
	Name        string `json:"name"`
	Team        string `json:"team"`
	ManagerId   string `json:"managerId"`
	PublicNote  string `json:"publicNote,omitempty"`
	PrivateNote string `json:"privateNote,omitempty"`
}

type PodInfo struct {
	Pod
	MemberCount int `json:"memberCount"`
}
```

Update `OrgData`:

```go
type OrgData struct {
	Original           []Person `json:"original"`
	Working            []Person `json:"working"`
	Pods               []Pod    `json:"pods,omitempty"`
	PersistenceWarning string   `json:"persistenceWarning,omitempty"`
}
```

Update `AutosaveData`:

```go
type AutosaveData struct {
	Original     []Person `json:"original"`
	Working      []Person `json:"working"`
	Recycled     []Person `json:"recycled"`
	Pods         []Pod    `json:"pods,omitempty"`
	OriginalPods []Pod    `json:"originalPods,omitempty"`
	SnapshotName string   `json:"snapshotName"`
	Timestamp    string   `json:"timestamp"`
}
```

- [ ] **Step 2: Update snapshotData in snapshots.go**

In `internal/api/snapshots.go`, update `snapshotData`:

```go
type snapshotData struct {
	People    []Person
	Pods      []Pod
	Timestamp time.Time
}
```

- [ ] **Step 3: Update persistedSnapshot in snapshot_store.go**

In `internal/api/snapshot_store.go`, update `persistedSnapshot`:

```go
type persistedSnapshot struct {
	People    []Person  `json:"people"`
	Pods      []Pod     `json:"pods,omitempty"`
	Timestamp time.Time `json:"timestamp"`
}
```

- [ ] **Step 4: Run tests to verify nothing broke**

Run: `go test ./...`
Expected: All pass. The new fields are additive with `omitempty` so existing JSON round-trips are unaffected.

- [ ] **Step 5: Commit**

```
feat(model): add Pod entity, update OrgData/AutosaveData/snapshotData
```

---

## Task 3: Parser, Inference & Export — Person Fields

Add the three new fields to CSV parsing, column inference, and export.

**Files:**
- Modify: `internal/parser/parser.go:59-69`
- Modify: `internal/api/infer.go`
- Modify: `internal/api/export.go`
- Test: `internal/api/infer_test.go`
- Test: `internal/api/export_test.go`

- [ ] **Step 1: Write failing test for export with new columns**

In `internal/api/export_test.go`, add a test that verifies new columns appear in CSV export:

```go
func TestExportCSV_IncludesNewFields(t *testing.T) {
	people := []Person{
		{Id: "1", Name: "Alice", Role: "VP", Team: "Eng", Status: "Active",
		 Pod: "Core", PublicNote: "leads platform", PrivateNote: "promo Q3"},
	}
	data, err := ExportCSV(people)
	if err != nil {
		t.Fatal(err)
	}
	csv := string(data)
	if !strings.Contains(csv, "Pod") {
		t.Error("expected Pod header in CSV")
	}
	if !strings.Contains(csv, "Core") {
		t.Error("expected pod value in CSV")
	}
	if !strings.Contains(csv, "leads platform") {
		t.Error("expected public note in CSV")
	}
	if !strings.Contains(csv, "promo Q3") {
		t.Error("expected private note in CSV")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/api/ -run TestExportCSV_IncludesNewFields -v`
Expected: FAIL — headers and values missing.

- [ ] **Step 3: Update export.go**

In `internal/api/export.go`, update `exportHeaders`:

```go
var exportHeaders = []string{"Name", "Role", "Discipline", "Manager", "Team", "Additional Teams", "Status", "Employment Type", "New Role", "New Team", "Pod", "Public Note", "Private Note"}
```

Update `personToRow` to append the three new fields:

```go
func personToRow(p Person, idToName map[string]string) []string {
	managerName := idToName[p.ManagerId]
	return []string{
		p.Name, p.Role, p.Discipline, managerName, p.Team,
		strings.Join(p.AdditionalTeams, ","), p.Status, p.EmploymentType,
		p.NewRole, p.NewTeam, p.Pod, p.PublicNote, p.PrivateNote,
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/api/ -run TestExportCSV_IncludesNewFields -v`
Expected: PASS

- [ ] **Step 5: Write failing test for inference**

In `internal/api/infer_test.go`, add:

```go
func TestInferMapping_PodAndNotes(t *testing.T) {
	headers := []string{"Name", "Team", "Pod", "Public Note", "Private Note"}
	m := InferMapping(headers)
	if mc, ok := m["pod"]; !ok || mc.Column != "Pod" {
		t.Errorf("expected pod mapped to Pod, got %+v", m["pod"])
	}
	if mc, ok := m["publicNote"]; !ok || mc.Column != "Public Note" {
		t.Errorf("expected publicNote mapped, got %+v", m["publicNote"])
	}
	if mc, ok := m["privateNote"]; !ok || mc.Column != "Private Note" {
		t.Errorf("expected privateNote mapped, got %+v", m["privateNote"])
	}
}
```

- [ ] **Step 6: Run test to verify it fails**

Run: `go test ./internal/api/ -run TestInferMapping_PodAndNotes -v`
Expected: FAIL

- [ ] **Step 7: Update infer.go**

Add to `exactMatches`:
```go
"pod":          "pod",
"public note":  "publicNote",
"private note": "privateNote",
```

Add to `synonyms`:
```go
"pod name":      "pod",
"sub-team":      "pod",
"subteam":       "pod",
"note":          "publicNote",
"notes":         "publicNote",
"public notes":  "publicNote",
"private notes": "privateNote",
```

- [ ] **Step 8: Run inference test**

Run: `go test ./internal/api/ -run TestInferMapping_PodAndNotes -v`
Expected: PASS

- [ ] **Step 9: Update parser.go**

In `internal/parser/parser.go`, in the `BuildPeopleWithMapping` function, add after the `NewTeam` assignment in the `Person` literal:

```go
Pod:         get("pod"),
PublicNote:  get("publicNote"),
PrivateNote: get("privateNote"),
```

- [ ] **Step 10: Run all tests**

Run: `go test ./...`
Expected: All pass.

- [ ] **Step 11: Commit**

```
feat: add pod/note fields to parser, inference, and export
```

---

## Task 4: Pod Auto-Seeding & Core Pod Logic

The core pod engine: seeding from people, CRUD operations, lifecycle management.

**Files:**
- Create: `internal/api/pods.go`
- Create: `internal/api/pods_test.go`

- [ ] **Step 1: Write failing tests for pod auto-seeding**

Create `internal/api/pods_test.go`:

```go
package api

import (
	"testing"
)

func TestSeedPods_GroupsByManagerAndTeam(t *testing.T) {
	people := []Person{
		{Id: "m1", Name: "Alice", Team: "Eng", Status: "Active"},
		{Id: "p1", Name: "Bob", ManagerId: "m1", Team: "Platform", Status: "Active"},
		{Id: "p2", Name: "Carol", ManagerId: "m1", Team: "Platform", Status: "Active"},
		{Id: "p3", Name: "Dave", ManagerId: "m1", Team: "Infra", Status: "Active"},
	}
	pods := SeedPods(people)
	if len(pods) != 2 {
		t.Fatalf("expected 2 pods, got %d", len(pods))
	}
	// Verify each person got a pod field set
	byName := map[string]Person{}
	for _, p := range people {
		byName[p.Name] = p
	}
	if byName["Bob"].Pod != "Platform" {
		t.Errorf("Bob pod = %q, want Platform", byName["Bob"].Pod)
	}
	if byName["Dave"].Pod != "Infra" {
		t.Errorf("Dave pod = %q, want Infra", byName["Dave"].Pod)
	}
}

func TestSeedPods_RootNodesSkipped(t *testing.T) {
	people := []Person{
		{Id: "m1", Name: "Alice", Team: "Eng", Status: "Active"},
	}
	pods := SeedPods(people)
	if len(pods) != 0 {
		t.Errorf("expected 0 pods for root-only, got %d", len(pods))
	}
	if people[0].Pod != "" {
		t.Errorf("root node should have empty pod, got %q", people[0].Pod)
	}
}

func TestSeedPods_PreservesExistingPodNames(t *testing.T) {
	people := []Person{
		{Id: "m1", Name: "Alice", Team: "Eng", Status: "Active"},
		{Id: "p1", Name: "Bob", ManagerId: "m1", Team: "Platform", Pod: "Alpha Pod", Status: "Active"},
		{Id: "p2", Name: "Carol", ManagerId: "m1", Team: "Platform", Pod: "Alpha Pod", Status: "Active"},
	}
	pods := SeedPods(people)
	if len(pods) != 1 {
		t.Fatalf("expected 1 pod, got %d", len(pods))
	}
	if pods[0].Name != "Alpha Pod" {
		t.Errorf("pod name = %q, want Alpha Pod", pods[0].Name)
	}
}

func TestCleanupEmptyPods(t *testing.T) {
	pods := []Pod{
		{Id: "pod1", Name: "A", Team: "Eng", ManagerId: "m1"},
		{Id: "pod2", Name: "B", Team: "Infra", ManagerId: "m1"},
	}
	people := []Person{
		{Id: "p1", Name: "Bob", ManagerId: "m1", Team: "Eng", Pod: "A"},
		// No one in pod B
	}
	cleaned := CleanupEmptyPods(pods, people)
	if len(cleaned) != 1 {
		t.Fatalf("expected 1 pod after cleanup, got %d", len(cleaned))
	}
	if cleaned[0].Name != "A" {
		t.Errorf("expected pod A to survive, got %q", cleaned[0].Name)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `go test ./internal/api/ -run "TestSeedPods|TestCleanupEmptyPods" -v`
Expected: FAIL — functions don't exist.

- [ ] **Step 3: Implement pods.go**

Create `internal/api/pods.go`:

```go
package api

import (
	"fmt"

	"github.com/google/uuid"
)

const maxNoteLen = 2000

// SeedPods derives pods from people by grouping on (managerId, team).
// Modifies people in-place to set their Pod field. Returns the generated pods.
// Root nodes (no managerId) are skipped.
func SeedPods(people []Person) []Pod {
	type podKey struct {
		managerID string
		team      string
	}

	// Group people by (managerId, team)
	groups := map[podKey][]int{} // key -> indices into people
	for i := range people {
		if people[i].ManagerId == "" {
			continue
		}
		k := podKey{managerID: people[i].ManagerId, team: people[i].Team}
		groups[k] = append(groups[k], i)
	}

	var pods []Pod
	for k, indices := range groups {
		// Determine pod name: use existing Pod field if all members agree, else default to team
		podName := ""
		for _, idx := range indices {
			if people[idx].Pod != "" {
				if podName == "" {
					podName = people[idx].Pod
				}
				// Use first non-empty pod name found
				break
			}
		}
		if podName == "" {
			podName = k.team
		}

		pod := Pod{
			Id:        uuid.NewString(),
			Name:      podName,
			Team:      k.team,
			ManagerId: k.managerID,
		}
		pods = append(pods, pod)

		// Set pod field on all members
		for _, idx := range indices {
			people[idx].Pod = podName
		}
	}

	return pods
}

// CleanupEmptyPods removes pods that have no members.
func CleanupEmptyPods(pods []Pod, people []Person) []Pod {
	// Build set of (managerID, podName) that have members
	type podKey struct {
		managerID string
		podName   string
	}
	active := map[podKey]bool{}
	for _, p := range people {
		if p.ManagerId != "" && p.Pod != "" {
			active[podKey{managerID: p.ManagerId, podName: p.Pod}] = true
		}
	}

	var result []Pod
	for _, pod := range pods {
		if active[podKey{managerID: pod.ManagerId, podName: pod.Name}] {
			result = append(result, pod)
		}
	}
	return result
}

// FindPod finds a pod by name under a specific manager.
func FindPod(pods []Pod, name, managerID string) *Pod {
	for i := range pods {
		if pods[i].Name == name && pods[i].ManagerId == managerID {
			return &pods[i]
		}
	}
	return nil
}

// FindPodByID finds a pod by its UUID.
func FindPodByID(pods []Pod, id string) *Pod {
	for i := range pods {
		if pods[i].Id == id {
			return &pods[i]
		}
	}
	return nil
}

// RenamePod renames a pod and updates all members' Pod field.
func RenamePod(pods []Pod, people []Person, podID, newName string) error {
	pod := FindPodByID(pods, podID)
	if pod == nil {
		return fmt.Errorf("pod %s not found", podID)
	}
	oldName := pod.Name
	pod.Name = newName
	for i := range people {
		if people[i].ManagerId == pod.ManagerId && people[i].Pod == oldName {
			people[i].Pod = newName
		}
	}
	return nil
}

// ReassignPersonPod moves a person to the correct pod based on their (managerId, team).
// Auto-creates a new pod if needed. Returns updated pods slice.
func ReassignPersonPod(pods []Pod, person *Person) []Pod {
	if person.ManagerId == "" {
		person.Pod = ""
		return pods
	}
	existing := FindPod(pods, person.Team, person.ManagerId)
	if existing != nil {
		person.Pod = existing.Name
		return pods
	}
	// Auto-create pod
	newPod := Pod{
		Id:        uuid.NewString(),
		Name:      person.Team,
		Team:      person.Team,
		ManagerId: person.ManagerId,
	}
	person.Pod = newPod.Name
	return append(pods, newPod)
}

// CopyPods makes a shallow copy of a pod slice (pods have no slice fields).
func CopyPods(src []Pod) []Pod {
	if src == nil {
		return nil
	}
	dst := make([]Pod, len(src))
	copy(dst, src)
	return dst
}

// validateNoteLen checks a note value against maxNoteLen.
func validateNoteLen(value string) error {
	if len(value) > maxNoteLen {
		return fmt.Errorf("note too long (max %d characters)", maxNoteLen)
	}
	return nil
}
```

- [ ] **Step 4: Run tests**

Run: `go test ./internal/api/ -run "TestSeedPods|TestCleanupEmptyPods" -v`
Expected: All PASS.

- [ ] **Step 5: Run full test suite**

Run: `go test ./...`
Expected: All pass.

- [ ] **Step 6: Commit**

```
feat: add pod auto-seeding, lifecycle, and CRUD helpers
```

---

## Task 5: OrgService Pod Integration

Wire pods into OrgService: add fields, update Upload/Move/Update/Add/Delete/Restore/Reset/Snapshots to manage pods.

**Files:**
- Modify: `internal/api/service.go`
- Modify: `internal/api/snapshots.go`
- Test: `internal/api/service_test.go`

- [ ] **Step 1: Write failing test for upload seeding pods**

In `internal/api/service_test.go`, add:

```go
func TestUpload_SeedsPods(t *testing.T) {
	svc := NewOrgService()
	csv := "Name,Role,Discipline,Manager,Team,Status\nAlice,VP,Eng,,Eng,Active\nBob,Engineer,Eng,Alice,Platform,Active\nCarol,Engineer,Eng,Alice,Infra,Active\n"
	resp, err := svc.Upload("test.csv", []byte(csv))
	if err != nil {
		t.Fatal(err)
	}
	if resp.OrgData == nil {
		t.Fatal("expected orgData")
	}
	if len(resp.OrgData.Pods) == 0 {
		t.Fatal("expected pods to be seeded")
	}
	// Bob and Carol have different teams under Alice => 2 pods
	if len(resp.OrgData.Pods) != 2 {
		t.Errorf("expected 2 pods, got %d", len(resp.OrgData.Pods))
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/api/ -run TestUpload_SeedsPods -v`
Expected: FAIL — `OrgData.Pods` is nil/empty.

- [ ] **Step 3: Add pods/originalPods fields to OrgService**

In `internal/api/service.go`, add to `OrgService` struct:

```go
pods         []Pod
originalPods []Pod
```

- [ ] **Step 4: Update Upload to seed pods**

In `service.go`, in the `Upload` method, after `s.working = deepCopyPeople(people)`, add:

```go
s.pods = SeedPods(s.working)
s.originalPods = CopyPods(s.pods)
// Re-seed original people too so their pod fields match
_ = SeedPods(s.original)
```

Update the `OrgData` return to include `Pods`:

```go
return &UploadResponse{
	Status:  "ready",
	OrgData: &OrgData{
		Original: deepCopyPeople(s.original),
		Working:  deepCopyPeople(s.working),
		Pods:     CopyPods(s.pods),
	},
	PersistenceWarning: persistWarn,
}, nil
```

- [ ] **Step 5: Update GetOrg to include pods**

In `service.go`, update `GetOrg`:

```go
func (s *OrgService) GetOrg() *OrgData {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.original == nil {
		return nil
	}
	return &OrgData{
		Original: deepCopyPeople(s.original),
		Working:  deepCopyPeople(s.working),
		Pods:     CopyPods(s.pods),
	}
}
```

- [ ] **Step 6: Run test**

Run: `go test ./internal/api/ -run TestUpload_SeedsPods -v`
Expected: PASS.

- [ ] **Step 7: Write failing test for move with pod reassignment**

```go
func TestMove_ReassignsPod(t *testing.T) {
	svc := NewOrgService()
	csv := "Name,Role,Discipline,Manager,Team,Status\nAlice,VP,Eng,,Eng,Active\nBob,Dir,Eng,Alice,Platform,Active\nCarol,Engineer,Eng,Bob,Platform,Active\n"
	resp, err := svc.Upload("test.csv", []byte(csv))
	if err != nil {
		t.Fatal(err)
	}
	carol := findByName(resp.OrgData.Working, "Carol")
	alice := findByName(resp.OrgData.Working, "Alice")
	if carol == nil || alice == nil {
		t.Fatal("missing people")
	}
	result, err := svc.Move(carol.Id, alice.Id, "Eng")
	if err != nil {
		t.Fatal(err)
	}
	movedCarol := findByName(result.Working, "Carol")
	if movedCarol.Pod == "" {
		t.Error("Carol should have a pod after move")
	}
	if result.Pods == nil {
		t.Error("Move should return pods")
	}
}

func findByName(people []Person, name string) *Person {
	for i := range people {
		if people[i].Name == name {
			return &people[i]
		}
	}
	return nil
}
```

- [ ] **Step 8: Update Move to return MutationResult with pods**

Change `Move` return type from `([]Person, error)` to `(*MoveResult, error)` with:

```go
type MoveResult struct {
	Working []Person
	Pods    []Pod
}
```

After updating the person's manager and team, call `ReassignPersonPod` and `CleanupEmptyPods`:

```go
s.pods = ReassignPersonPod(s.pods, p)
s.pods = CleanupEmptyPods(s.pods, s.working)
return &MoveResult{
	Working: deepCopyPeople(s.working),
	Pods:    CopyPods(s.pods),
}, nil
```

- [ ] **Step 9: Update Update method for new fields and pod reassignment**

Add `maxNoteLen` constant (already in pods.go). In `Update`, before `validateFieldLengths`, extract note/pod fields:

```go
// Extract note fields before general validation (they have different length limits)
noteFields := map[string]string{}
for _, key := range []string{"publicNote", "privateNote", "pod"} {
	if v, ok := fields[key]; ok {
		noteFields[key] = v
		delete(fields, key)
	}
}
if err := validateFieldLengths(fields); err != nil {
	return nil, err
}
// Re-add for processing in the switch
for k, v := range noteFields {
	fields[k] = v
}
```

Add new cases to the switch:

```go
case "publicNote":
	if err := validateNoteLen(v); err != nil {
		return nil, err
	}
	p.PublicNote = v
case "privateNote":
	if err := validateNoteLen(v); err != nil {
		return nil, err
	}
	p.PrivateNote = v
case "pod":
	if v == "" {
		s.pods = ReassignPersonPod(s.pods, p)
	} else {
		pod := FindPod(s.pods, v, p.ManagerId)
		if pod == nil {
			return nil, fmt.Errorf("pod %q not found under this manager", v)
		}
		p.Pod = v
		p.Team = pod.Team
	}
```

Update the existing `"team"` case to trigger pod reassignment:

```go
case "team":
	p.Team = v
	s.pods = ReassignPersonPod(s.pods, p)
	s.pods = CleanupEmptyPods(s.pods, s.working)
```

Update the existing `"managerId"` case to trigger pod reassignment after manager change:

```go
case "managerId":
	// ... existing validation ...
	p.ManagerId = v
	s.pods = ReassignPersonPod(s.pods, p)
	s.pods = CleanupEmptyPods(s.pods, s.working)
```

Change `Update` return type to include pods (similar pattern to `Move`).

- [ ] **Step 10: Update Add to include pods**

After `s.working = append(s.working, p)`, add:

```go
if p.Pod != "" {
	pod := FindPod(s.pods, p.Pod, p.ManagerId)
	if pod != nil {
		p.Team = pod.Team
	}
} else {
	s.pods = ReassignPersonPod(s.pods, &s.working[len(s.working)-1])
}
```

Return pods in the response.

- [ ] **Step 11: Update Delete to include pods**

After removing from working, add:

```go
s.pods = CleanupEmptyPods(s.pods, s.working)
```

Return pods in MutationResult.

- [ ] **Step 12: Update Restore to include pods**

After restoring to working, add:

```go
s.pods = ReassignPersonPod(s.pods, &person)
```

Return pods in MutationResult.

- [ ] **Step 13: Update ResetToOriginal to restore pods**

```go
func (s *OrgService) ResetToOriginal() *OrgData {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.working = deepCopyPeople(s.original)
	s.recycled = nil
	s.pods = CopyPods(s.originalPods)
	return &OrgData{
		Original: deepCopyPeople(s.original),
		Working:  deepCopyPeople(s.working),
		Pods:     CopyPods(s.pods),
	}
}
```

- [ ] **Step 14: Update Reorder to return pods**

Change return type to include pods.

- [ ] **Step 15: Update SaveSnapshot to include pods**

```go
s.snapshots[name] = snapshotData{
	People:    deepCopyPeople(s.working),
	Pods:      CopyPods(s.pods),
	Timestamp: time.Now(),
}
```

- [ ] **Step 16: Update LoadSnapshot to restore pods**

```go
func (s *OrgService) LoadSnapshot(name string) (*OrgData, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	snap, ok := s.snapshots[name]
	if !ok {
		return nil, fmt.Errorf("snapshot '%s' not found", name)
	}
	s.working = deepCopyPeople(snap.People)
	if snap.Pods != nil {
		s.pods = CopyPods(snap.Pods)
	} else {
		// Backward compat: old snapshots without pods
		s.pods = SeedPods(s.working)
	}
	s.recycled = nil
	return &OrgData{
		Original: deepCopyPeople(s.original),
		Working:  deepCopyPeople(s.working),
		Pods:     CopyPods(s.pods),
	}, nil
}
```

- [ ] **Step 17: Run all tests**

Run: `go test ./internal/api/ -v`
Expected: Existing tests will need minor updates for changed return types. Fix any compilation errors from the return type changes.

- [ ] **Step 18: Run full suite**

Run: `go test ./...`
Expected: All pass.

- [ ] **Step 19: Commit**

```
feat: wire pods into OrgService mutations and snapshots
```

---

## Task 6: Handler Response Shape Changes

Update HTTP handlers for new return types that include pods.

**Files:**
- Modify: `internal/api/handlers.go`
- Test: `internal/api/handlers_test.go`

- [ ] **Step 1: Write failing test for move response shape**

In `internal/api/handlers_test.go`, add a test that POSTs to `/api/move` and verifies the response contains both `working` and `pods` keys:

```go
func TestMoveHandler_ReturnsPods(t *testing.T) {
	svc := NewOrgService()
	csv := "Name,Role,Discipline,Manager,Team,Status\nAlice,VP,Eng,,Eng,Active\nBob,Dir,Eng,Alice,Platform,Active\nCarol,Engineer,Eng,Bob,Platform,Active\n"
	svc.Upload("test.csv", []byte(csv))
	org := svc.GetOrg()
	carol := findByName(org.Working, "Carol")
	alice := findByName(org.Working, "Alice")

	body := fmt.Sprintf(`{"personId":"%s","newManagerId":"%s","newTeam":"Eng"}`, carol.Id, alice.Id)
	req := httptest.NewRequest("POST", "/api/move", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	NewRouter(svc, nil).ServeHTTP(w, req)

	if w.Code != 200 {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		Working []Person `json:"working"`
		Pods    []Pod    `json:"pods"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Working) == 0 {
		t.Error("expected working people in response")
	}
	if resp.Pods == nil {
		t.Error("expected pods in response")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/api/ -run TestMoveHandler_ReturnsPods -v`
Expected: FAIL — response is a bare array, not an object.

- [ ] **Step 3: Update all handlers for new response shapes**

Update `handleMove`:
```go
result, err := svc.Move(req.PersonId, req.NewManagerId, req.NewTeam)
// ...
writeJSON(w, http.StatusOK, map[string]any{
	"working": result.Working,
	"pods":    result.Pods,
})
```

Apply the same pattern to `handleUpdate`, `handleReorder`, `handleAdd` (add `"pods"` key), `handleDelete` (add `"pods"` key), `handleRestore` (add `"pods"` key).

Register new pod endpoints in `NewRouter`:
```go
mux.HandleFunc("GET /api/pods", handleListPods(svc))
mux.HandleFunc("POST /api/pods/update", handleUpdatePod(svc))
mux.HandleFunc("POST /api/pods/create", handleCreatePod(svc))
```

Implement the three new handlers:

```go
func handleListPods(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pods := svc.ListPods()
		writeJSON(w, http.StatusOK, pods)
	}
}

func handleUpdatePod(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limitBody(w, r)
		var req struct {
			PodId  string            `json:"podId"`
			Fields map[string]string `json:"fields"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		result, err := svc.UpdatePod(req.PodId, req.Fields)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"working": result.Working,
			"pods":    result.Pods,
		})
	}
}

func handleCreatePod(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limitBody(w, r)
		var req struct {
			ManagerId string `json:"managerId"`
			Name      string `json:"name"`
			Team      string `json:"team"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		result, err := svc.CreatePod(req.ManagerId, req.Name, req.Team)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"working": result.Working,
			"pods":    result.Pods,
		})
	}
}
```

- [ ] **Step 4: Add ListPods, UpdatePod, CreatePod to OrgService**

Add to `internal/api/service.go` (or `pods.go`):

```go
func (s *OrgService) ListPods() []PodInfo {
	s.mu.RLock()
	defer s.mu.RUnlock()
	// Count members per pod
	counts := map[string]int{}
	for _, p := range s.working {
		if p.Pod != "" && p.ManagerId != "" {
			key := p.ManagerId + ":" + p.Pod
			counts[key]++
		}
	}
	result := make([]PodInfo, len(s.pods))
	for i, pod := range s.pods {
		result[i] = PodInfo{
			Pod:         pod,
			MemberCount: counts[pod.ManagerId+":"+pod.Name],
		}
	}
	return result
}

func (s *OrgService) UpdatePod(podID string, fields map[string]string) (*MoveResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	pod := FindPodByID(s.pods, podID)
	if pod == nil {
		return nil, fmt.Errorf("pod %s not found", podID)
	}
	for k, v := range fields {
		switch k {
		case "name":
			if err := RenamePod(s.pods, s.working, podID, v); err != nil {
				return nil, err
			}
		case "publicNote":
			if err := validateNoteLen(v); err != nil {
				return nil, err
			}
			pod.PublicNote = v
		case "privateNote":
			if err := validateNoteLen(v); err != nil {
				return nil, err
			}
			pod.PrivateNote = v
		default:
			return nil, fmt.Errorf("unknown pod field: %s", k)
		}
	}
	return &MoveResult{
		Working: deepCopyPeople(s.working),
		Pods:    CopyPods(s.pods),
	}, nil
}

func (s *OrgService) CreatePod(managerID, name, team string) (*MoveResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	// Check if any pod already exists for this (managerID, team) combination
	for _, p := range s.pods {
		if p.ManagerId == managerID && p.Team == team {
			return nil, fmt.Errorf("pod already exists for this manager and team (use rename instead)")
		}
	}
	pod := Pod{
		Id:        uuid.NewString(),
		Name:      name,
		Team:      team,
		ManagerId: managerID,
	}
	s.pods = append(s.pods, pod)
	return &MoveResult{
		Working: deepCopyPeople(s.working),
		Pods:    CopyPods(s.pods),
	}, nil
}
```

- [ ] **Step 5: Run the handler test**

Run: `go test ./internal/api/ -run TestMoveHandler_ReturnsPods -v`
Expected: PASS.

- [ ] **Step 6: Fix all existing handler tests for new response shapes**

Many existing tests expect bare `[]Person` responses from move/update/reorder. Update them to parse `{"working": [...], "pods": [...]}` instead.

- [ ] **Step 7: Run full test suite**

Run: `go test ./...`
Expected: All pass.

- [ ] **Step 8: Commit**

```
feat: update handler response shapes to include pods; add pod endpoints
```

---

## Task 7: ZIP Import — Pods Sidecar Filtering & Note Restoration

Filter `pods.csv` from ZIP import, parse it separately, seed pods, and restore pod notes from sidecar.

**Files:**
- Modify: `internal/api/zipimport.go`
- Test: `internal/api/zipimport_test.go`

- [ ] **Step 1: Write failing test for pods.csv filtering**

In `internal/api/zipimport_test.go`:

```go
func TestUploadZip_FiltersPodsSidecar(t *testing.T) {
	svc := NewOrgService()
	podsCsvContent := "Pod Name,Manager,Team,Public Note,Private Note\nPlatform,Alice,Platform,pod note,secret\n"
	data := buildTestZip(t, []zipFile{
		{"0-original.csv", testCSVContent},
		{"1-working.csv", testCSVContent2},
		{"pods.csv", podsCsvContent},
	})

	resp, err := svc.UploadZip(data)
	if err != nil {
		t.Fatalf("UploadZip failed: %v", err)
	}
	if resp.Status != "ready" {
		t.Fatalf("expected ready, got %s", resp.Status)
	}
	// Should still parse correctly — pods.csv should not be treated as person data
	if len(resp.OrgData.Original) != 2 {
		t.Errorf("expected 2 original people, got %d", len(resp.OrgData.Original))
	}
}

func TestUploadZip_SeedsPods(t *testing.T) {
	svc := NewOrgService()
	data := buildTestZip(t, []zipFile{
		{"0-original.csv", testCSVContent},
		{"1-working.csv", testCSVContent2},
	})

	resp, err := svc.UploadZip(data)
	if err != nil {
		t.Fatalf("UploadZip failed: %v", err)
	}
	if len(resp.OrgData.Pods) == 0 {
		t.Error("expected pods to be seeded from ZIP import")
	}
}

func TestUploadZip_RestoresPodNotesFromSidecar(t *testing.T) {
	svc := NewOrgService()
	podsCsvContent := "Pod Name,Manager,Team,Public Note,Private Note\nPlatform,Alice,Platform,pod note,secret note\n"
	data := buildTestZip(t, []zipFile{
		{"0-original.csv", testCSVContent},
		{"1-working.csv", testCSVContent2},
		{"pods.csv", podsCsvContent},
	})

	resp, err := svc.UploadZip(data)
	if err != nil {
		t.Fatalf("UploadZip failed: %v", err)
	}
	// Find the Platform pod and verify notes were restored
	found := false
	for _, pod := range resp.OrgData.Pods {
		if pod.Name == "Platform" {
			found = true
			if pod.PublicNote != "pod note" {
				t.Errorf("expected public note 'pod note', got %q", pod.PublicNote)
			}
			if pod.PrivateNote != "secret note" {
				t.Errorf("expected private note 'secret note', got %q", pod.PrivateNote)
			}
		}
	}
	if !found {
		t.Error("Platform pod not found")
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `go test ./internal/api/ -run "TestUploadZip_FiltersPodsSidecar|TestUploadZip_SeedsPods|TestUploadZip_RestoresPodNotesFromSidecar" -v`
Expected: FAIL.

- [ ] **Step 3: Update parseZipFileList to separate pods.csv sidecar**

In `internal/api/zipimport.go`, change `parseZipFileList` to return both entries and an optional `podsSidecar []byte`:

```go
func parseZipFileList(data []byte) ([]zipEntry, []byte, error) {
```

Inside the loop, before the normal entry processing, check for `pods.csv`:

```go
nameNoExt := strings.TrimSuffix(base, filepath.Ext(base))
if strings.ToLower(nameNoExt) == "pods" && ext == ".csv" {
	// This is the pods sidecar — store separately, don't treat as person data
	podsSidecar = content
	continue
}
```

Return `podsSidecar` alongside entries. Update all callers (`UploadZip`, `ConfirmMapping`) to accept the new return value.

- [ ] **Step 4: Add parsePodsSidecar function**

In `internal/api/zipimport.go`, add a function to parse the sidecar and return pod notes keyed by `(podName, managerName)`:

```go
type podSidecarEntry struct {
	podName     string
	managerName string
	team        string
	publicNote  string
	privateNote string
}

func parsePodsSidecar(data []byte) []podSidecarEntry {
	reader := csv.NewReader(bytes.NewReader(data))
	records, err := reader.ReadAll()
	if err != nil || len(records) < 2 {
		return nil
	}
	// Find column indices from header
	header := records[0]
	idx := map[string]int{}
	for i, h := range header {
		idx[strings.ToLower(strings.TrimSpace(h))] = i
	}
	get := func(row []string, key string) string {
		if i, ok := idx[key]; ok && i < len(row) {
			return strings.TrimSpace(row[i])
		}
		return ""
	}
	var entries []podSidecarEntry
	for _, row := range records[1:] {
		entries = append(entries, podSidecarEntry{
			podName:     get(row, "pod name"),
			managerName: get(row, "manager"),
			team:        get(row, "team"),
			publicNote:  get(row, "public note"),
			privateNote: get(row, "private note"),
		})
	}
	return entries
}
```

- [ ] **Step 5: Add applyPodSidecarNotes function**

```go
// applyPodSidecarNotes matches sidecar entries to seeded pods by (podName, managerName)
// and applies their notes. Uses the idToName map to resolve pod managerIds back to names.
func applyPodSidecarNotes(pods []Pod, sidecar []podSidecarEntry, idToName map[string]string) {
	for i := range pods {
		mgrName := idToName[pods[i].ManagerId]
		for _, entry := range sidecar {
			if entry.podName == pods[i].Name && entry.managerName == mgrName {
				pods[i].PublicNote = entry.publicNote
				pods[i].PrivateNote = entry.privateNote
				break
			}
		}
	}
}
```

- [ ] **Step 6: Update UploadZip to seed pods and restore sidecar notes**

Update `parseZipFileList` calls to handle the new return value. After seeding pods, if sidecar data exists, parse it and apply notes:

```go
s.pods = SeedPods(s.working)
s.originalPods = CopyPods(s.pods)
_ = SeedPods(s.original)

if podsSidecar != nil {
	sidecarEntries := parsePodsSidecar(podsSidecar)
	if len(sidecarEntries) > 0 {
		idToName := buildIDToName(s.working)
		applyPodSidecarNotes(s.pods, sidecarEntries, idToName)
		applyPodSidecarNotes(s.originalPods, sidecarEntries, idToName)
	}
}
```

Update the response to include pods:

```go
resp := &UploadResponse{
	Status: "ready",
	OrgData: &OrgData{
		Original: deepCopyPeople(s.original),
		Working:  deepCopyPeople(s.working),
		Pods:     CopyPods(s.pods),
	},
	Snapshots: s.ListSnapshotsUnlocked(),
}
```

- [ ] **Step 7: Update ConfirmMapping for both ZIP and CSV paths**

In `ConfirmMapping`, update both code paths:
- **ZIP path** (when `s.pendingIsZip`): same pod seeding and sidecar handling as UploadZip.
- **CSV path** (regular file): seed pods after converting people, include pods in OrgData response.

- [ ] **Step 8: Run tests**

Run: `go test ./internal/api/ -run "TestUploadZip_FiltersPodsSidecar|TestUploadZip_SeedsPods|TestUploadZip_RestoresPodNotesFromSidecar" -v`
Expected: All PASS.

- [ ] **Step 9: Run full suite**

Run: `go test ./...`
Expected: All pass.

- [ ] **Step 10: Commit**

```
feat: filter pods.csv sidecar in ZIP import, seed pods, restore pod notes
```

---

## Task 7b: ZIP Export — Pods Sidecar

Export `pods.csv` sidecar file in ZIP exports.

**Files:**
- Modify: `internal/api/export.go`
- Modify: `web/src/hooks/useSnapshotExport.ts`
- Modify: `web/src/api/client.ts`
- Test: `internal/api/export_test.go`

- [ ] **Step 1: Write failing test for ExportPodsSidecar**

In `internal/api/export_test.go`:

```go
func TestExportPodsSidecar(t *testing.T) {
	people := []Person{
		{Id: "m1", Name: "Alice", Team: "Eng"},
		{Id: "p1", Name: "Bob", ManagerId: "m1", Team: "Platform"},
	}
	pods := []Pod{
		{Id: "pod1", Name: "Platform", Team: "Platform", ManagerId: "m1",
		 PublicNote: "owns pipeline", PrivateNote: "needs headcount"},
	}
	data, err := ExportPodsSidecarCSV(pods, people)
	if err != nil {
		t.Fatal(err)
	}
	csv := string(data)
	if !strings.Contains(csv, "Pod Name") {
		t.Error("expected Pod Name header")
	}
	if !strings.Contains(csv, "Alice") {
		t.Error("expected manager name Alice")
	}
	if !strings.Contains(csv, "owns pipeline") {
		t.Error("expected public note")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/api/ -run TestExportPodsSidecar -v`
Expected: FAIL.

- [ ] **Step 3: Implement ExportPodsSidecarCSV in export.go**

```go
var podSidecarHeaders = []string{"Pod Name", "Manager", "Team", "Public Note", "Private Note"}

func ExportPodsSidecarCSV(pods []Pod, people []Person) ([]byte, error) {
	idToName := buildIDToName(people)
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	if err := w.Write(podSidecarHeaders); err != nil {
		return nil, fmt.Errorf("writing pod sidecar headers: %w", err)
	}
	for _, pod := range pods {
		row := []string{
			pod.Name,
			idToName[pod.ManagerId],
			pod.Team,
			pod.PublicNote,
			pod.PrivateNote,
		}
		if err := w.Write(row); err != nil {
			return nil, fmt.Errorf("writing pod sidecar row: %w", err)
		}
	}
	w.Flush()
	return buf.Bytes(), w.Error()
}
```

- [ ] **Step 4: Run test**

Run: `go test ./internal/api/ -run TestExportPodsSidecar -v`
Expected: PASS.

- [ ] **Step 5: Add backend endpoint for pods sidecar export**

Add `GET /api/export/pods-sidecar` handler that returns the pods sidecar CSV for the working pod set:

```go
mux.HandleFunc("GET /api/export/pods-sidecar", handleExportPodsSidecar(svc))
```

```go
func handleExportPodsSidecar(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		svc.mu.RLock()
		pods := CopyPods(svc.pods)
		people := deepCopyPeople(svc.working)
		svc.mu.RUnlock()

		data, err := ExportPodsSidecarCSV(pods, people)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", "attachment; filename=pods.csv")
		w.Write(data)
	}
}
```

- [ ] **Step 6: Add client function for pods sidecar export**

In `web/src/api/client.ts`:

```typescript
export async function exportPodsSidecarBlob(): Promise<Blob> {
  const resp = await fetchWithTimeout(`${BASE}/export/pods-sidecar`)
  if (!resp.ok) throw new Error(`Export pods sidecar failed: ${resp.status}`)
  return resp.blob()
}
```

- [ ] **Step 7: Update useSnapshotExport to include pods.csv sidecar**

In `web/src/hooks/useSnapshotExport.ts`, after all snapshot entries are added to the ZIP (after the loop, before `zip.generateAsync`), add:

```typescript
// Add pods.csv sidecar for the working pod set
try {
  const podsSidecar = await exportPodsSidecarBlob()
  zip.file('pods.csv', podsSidecar)
} catch {
  console.warn('Failed to export pods sidecar')
}
```

- [ ] **Step 8: Run frontend tests**

Run: `cd web && npm test -- --run`
Expected: All pass.

- [ ] **Step 9: Run full backend suite**

Run: `go test ./...`
Expected: All pass.

- [ ] **Step 10: Commit**

```
feat: export pods.csv sidecar in ZIP exports
```

---

## Task 8: Frontend Types & API Client

Update TypeScript types and API client for new response shapes and pod endpoints.

**Files:**
- Modify: `web/src/api/types.ts`
- Modify: `web/src/api/client.ts`

- [ ] **Step 1: Update types.ts**

Add `Pod` interface, update `Person`, `OrgData`, `AutosaveData`, and response types:

```typescript
export interface Pod {
  id: string
  name: string
  team: string
  managerId: string
  publicNote?: string
  privateNote?: string
}

export interface PodInfo extends Pod {
  memberCount: number
}
```

Add to `Person`:
```typescript
pod?: string
publicNote?: string
privateNote?: string
```

Update `OrgData`:
```typescript
export interface OrgData {
  original: Person[]
  working: Person[]
  pods?: Pod[]
  persistenceWarning?: string
}
```

Update `AutosaveData`:
```typescript
export interface AutosaveData {
  original: Person[]
  working: Person[]
  recycled: Person[]
  pods?: Pod[]
  originalPods?: Pod[]
  snapshotName: string
  timestamp: string
}
```

Add new response types:
```typescript
export interface MutationResponse {
  working: Person[]
  pods: Pod[]
}

export interface AddResponse {
  created: Person
  working: Person[]
  pods: Pod[]
}

export interface DeleteResponse {
  working: Person[]
  recycled: Person[]
  pods: Pod[]
}

export interface RestoreResponse {
  working: Person[]
  recycled: Person[]
  pods: Pod[]
}
```

- [ ] **Step 2: Update client.ts**

Change `movePerson` return type from `Person[]` to `MutationResponse`.
Change `updatePerson` return type from `Person[]` to `MutationResponse`.
Change `reorderPeople` return type from `Person[]` to `MutationResponse`.
Update `AddResponse`, `DeleteResponse`, `RestoreResponse` imports.

Add pod API functions:

```typescript
export async function listPods(): Promise<PodInfo[]> {
  return json<PodInfo[]>(await fetchWithTimeout(`${BASE}/pods`))
}

export async function updatePod(podId: string, fields: Record<string, string>): Promise<MutationResponse> {
  const resp = await fetchWithTimeout(`${BASE}/pods/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ podId, fields }),
  })
  return json<MutationResponse>(resp)
}

export async function createPod(managerId: string, name: string, team: string): Promise<MutationResponse> {
  const resp = await fetchWithTimeout(`${BASE}/pods/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ managerId, name, team }),
  })
  return json<MutationResponse>(resp)
}
```

- [ ] **Step 3: Run frontend tests to check compilation**

Run: `cd web && npx tsc --noEmit`
Expected: Type errors in OrgDataContext.tsx and other files that consume the old response shapes. This is expected — we fix them in the next task.

- [ ] **Step 4: Commit**

```
feat(web): update TypeScript types and API client for pods
```

---

## Task 9: Frontend State — OrgDataContext & Selection

Wire pods into OrgDataContext state, update all mutation handlers, add pod selection.

**Files:**
- Modify: `web/src/store/orgTypes.ts`
- Modify: `web/src/store/OrgDataContext.tsx`
- Modify: `web/src/store/SelectionContext.tsx`
- Modify: `web/src/store/OrgContext.tsx`
- Modify: `web/src/hooks/useAutosave.ts`
- Modify: `web/src/hooks/useOrgDiff.ts`

- [ ] **Step 1: Update orgTypes.ts**

Add `pods: Pod[]` and `originalPods: Pod[]` to `OrgDataContextValue` and `OrgState`.
Add `selectedPodId: string | null` and `selectPod: (id: string | null) => void` to `SelectionContextValue`.
Add `updatePod` and `createPod` actions to `OrgDataContextValue`.

- [ ] **Step 2: Update OrgDataContext.tsx**

Add `pods: []` and `originalPods: []` to initial state.
Update `upload` callback to extract `resp.orgData.pods`.
Update `move` — destructure `{ working, pods }` from response instead of bare array.
Update `reparent` — same destructuring.
Update `reorder` — same.
Update `update` — same.
Update `add` — destructure `{ working, pods }` from response.
Update `remove` — destructure `{ working, recycled, pods }`.
Update `restore` — same.
Update `loadSnapshot` — extract pods from OrgData.
Update `confirmMapping` — extract pods.
Update `restoreAutosave` — extract `pods` and `originalPods` from autosave data into state.

Add `updatePod` and `createPod` callbacks.

Include `pods` and `originalPods` in the memoized value.

Note: `originalPods` is stored in the frontend state so it can be included in autosave payloads. It is set on upload/import (from the backend response — the backend seeds both `pods` and `originalPods`) and on autosave restore. It is not mutated by normal operations.

- [ ] **Step 3: Update SelectionContext.tsx**

Add `selectedPodId` state, `selectPod` function that clears person selection. Update `toggleSelect` to clear `selectedPodId`.

- [ ] **Step 4: Update useAutosave.ts**

Add `pods` and `originalPods` to the state parameter and include them in the `AutosaveData` payload:

```typescript
export function useAutosave(state: {
  original: Person[]
  working: Person[]
  recycled: Person[]
  pods: Pod[]
  originalPods: Pod[]
  currentSnapshotName: string | null
  loaded: boolean
  suppressAutosaveRef?: React.RefObject<boolean>
}) {
```

Include in data:
```typescript
const data: AutosaveData = {
  ...existing,
  pods: state.pods,
  originalPods: state.originalPods,
}
```

- [ ] **Step 5: Update useOrgDiff.ts**

Add `'pod'` to `ChangeType`:
```typescript
export type ChangeType = 'added' | 'removed' | 'reporting' | 'title' | 'reorg' | 'pod'
```

Add pod comparison in the diff logic:
```typescript
if ((w.pod ?? '') !== (o.pod ?? '')) types.add('pod')
```

- [ ] **Step 6: Run frontend tests**

Run: `cd web && npm test -- --run`
Expected: Some tests may fail due to state shape changes. Fix as needed.

- [ ] **Step 7: Verify TypeScript compilation**

Run: `cd web && npx tsc --noEmit`
Expected: Clean.

- [ ] **Step 8: Commit**

```
feat(web): wire pods into OrgDataContext, selection, autosave, and diff
```

---

## Task 10: Frontend UI — PersonNode Notes

Show truncated public note on person cards.

**Files:**
- Modify: `web/src/components/PersonNode.tsx`
- Modify: `web/src/components/PersonNode.module.css`
- Test: `web/src/components/PersonNode.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
it('shows truncated public note when present', () => {
  render(<PersonNode person={{ ...basePerson, publicNote: 'This is a public note for testing' }} />)
  expect(screen.getByText(/This is a public note/)).toBeInTheDocument()
})

it('does not show note line when publicNote is empty', () => {
  const { container } = render(<PersonNode person={basePerson} />)
  expect(container.querySelector('.notePreview')).toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run --reporter=verbose -- PersonNode.test`
Expected: FAIL.

- [ ] **Step 3: Add note preview to PersonNode**

In `PersonNode.tsx`, after the role/employment line, add:

```tsx
{person.publicNote && (
  <div className={styles.notePreview}>
    {person.publicNote.length > 60
      ? person.publicNote.slice(0, 57) + '...'
      : person.publicNote}
  </div>
)}
```

Add CSS in `PersonNode.module.css`:
```css
.notePreview {
  font-size: 0.7rem;
  color: var(--text-secondary, #6b7280);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  margin-top: 2px;
}
```

- [ ] **Step 4: Run test**

Run: `cd web && npx vitest run --reporter=verbose -- PersonNode.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```
feat(web): show truncated public note on person cards
```

---

## Task 11: Frontend UI — DetailSidebar Notes & Pod Dropdown

Add pod dropdown and note textareas to the person edit sidebar. Add PodSidebar for pod editing.

**Files:**
- Modify: `web/src/components/DetailSidebar.tsx`
- Create: `web/src/components/PodSidebar.tsx`
- Create: `web/src/components/PodSidebar.module.css`

- [ ] **Step 1: Add pod/note fields to DetailSidebar FormFields**

In `DetailSidebar.tsx`, extend `FormFields`:

```typescript
interface FormFields {
  // ...existing...
  pod: string
  publicNote: string
  privateNote: string
}
```

Update `blankForm` with empty strings for the new fields.

- [ ] **Step 2: Add pod dropdown and note textareas to the form JSX**

After the manager dropdown, add a pod dropdown populated from `pods.filter(p => p.managerId === person.managerId)`.

After existing fields, add `Public Note` and `Private Note` textareas.

Include the new fields in `handleSave`.

- [ ] **Step 3: Create PodSidebar component**

Create `web/src/components/PodSidebar.tsx` — a form for editing a selected pod: name input, team (read-only), public note textarea, private note textarea, member count display. Calls `updatePod` on save.

- [ ] **Step 4: Wire pod selection into DetailSidebar**

When `selectedPodId` is set and no person is selected, render `PodSidebar` instead of the person form.

- [ ] **Step 5: Run frontend tests**

Run: `cd web && npm test -- --run`
Expected: All pass.

- [ ] **Step 6: Commit**

```
feat(web): add pod dropdown and notes to DetailSidebar, add PodSidebar
```

---

## Task 12: Frontend UI — ColumnView Pod Headers

Replace team headers with pod headers. Make them clickable for pod selection.

**Files:**
- Modify: `web/src/views/ColumnView.tsx`
- Modify: `web/src/views/ColumnView.module.css`

- [ ] **Step 1: Update TeamHeaderNode to PodHeaderNode**

Rename `TeamHeaderNode` to `PodHeaderNode`. Add props for `podId`, `publicNote`, `onClick`. Show pod name, truncated public note subtitle, and member count. Make the whole header clickable to trigger `selectPod(podId)`.

- [ ] **Step 2: Update SubtreeNode to use pods**

Where children are grouped by team and `TeamHeaderNode` is rendered, switch to using pod data. Look up pods from context by `(managerId, team)` to get the pod name and ID. Render `PodHeaderNode` instead.

- [ ] **Step 3: Add CSS for pod note subtitle**

```css
.podNote {
  font-size: 0.7rem;
  color: var(--text-secondary, #6b7280);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

- [ ] **Step 4: Run frontend tests**

Run: `cd web && npm test -- --run`
Expected: All pass.

- [ ] **Step 5: Commit**

```
feat(web): replace team headers with pod headers in ColumnView
```

---

## Task 13: Frontend UI — ManagerView Pod Summary Cards

Replace team summary cards with pod summary cards.

**Files:**
- Modify: `web/src/views/ManagerView.tsx`
- Modify: `web/src/views/ManagerView.module.css`

- [ ] **Step 1: Update SummaryCard to be pod-aware**

Add `podName`, `podNote`, `podId`, `onPodClick` props to `SummaryCard`. Show pod name as header, discipline/status breakdown below, and truncated public note at the bottom.

- [ ] **Step 2: Update ManagerSubtree to group by pod**

Where direct reports are grouped for summary cards, group by pod name instead of team. Look up pod data from context to get notes and IDs.

- [ ] **Step 3: Make pod cards clickable**

Clicking a pod card calls `selectPod(podId)` to open it in the sidebar.

- [ ] **Step 4: Run frontend tests**

Run: `cd web && npm test -- --run`
Expected: All pass.

- [ ] **Step 5: Commit**

```
feat(web): replace team summary cards with pod summary cards in ManagerView
```

---

## Task 14: Integration Tests & Final Verification

End-to-end verification of the complete feature.

**Files:**
- Modify: `internal/api/zipimport_test.go`
- Modify: `internal/api/service_test.go`

- [ ] **Step 1: Add integration test for CSV round-trip with pod column**

Upload CSV with Pod column, verify pods are seeded with correct names, export to CSV, verify Pod column appears.

- [ ] **Step 2: Add integration test for note length validation**

Send a note longer than 2000 chars via update, verify it's rejected.

- [ ] **Step 3: Add integration test for pod rename cascading**

Rename a pod, verify all member Pod fields are updated.

- [ ] **Step 4: Add integration test for backward compat**

Load a snapshot that has no Pods field, verify pods are auto-derived.

- [ ] **Step 5: Run full backend test suite**

Run: `go test ./... -v`
Expected: All pass.

- [ ] **Step 6: Run full frontend test suite**

Run: `cd web && npm test -- --run`
Expected: All pass.

- [ ] **Step 7: Build and smoke test**

Run: `make clean && make build`
Expected: Clean build.

- [ ] **Step 8: Commit**

```
test: add integration tests for notes and pods feature
```
