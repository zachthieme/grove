# Create Org from Scratch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to create an org chart from scratch (without importing a file) and add parent nodes above existing root people.

**Architecture:** Three backend changes (relax validation, add `POST /api/create`, add `POST /api/people/add-parent`) and two frontend changes (UploadPrompt "Start from scratch" flow, PersonNode up-arrow-plus icon for add-parent). All new endpoints follow the existing `jsonHandlerCtx` pattern and map typed errors to HTTP status codes.

**Tech Stack:** Go (net/http, testing), React (TypeScript, vitest, CSS modules)

---

### Task 1: Write scenarios

**Files:**
- Create: `docs/scenarios/create.md`

- [ ] **Step 1: Write the scenario file**

```markdown
# Create Scenarios

---

# Scenario: Start from scratch

**ID**: CREATE-001
**Area**: create
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_Create"
- `internal/api/handlers_test.go` → "TestCreateHandler"
- `web/src/components/UploadPrompt.test.tsx` → "[CREATE-001]"

## Behavior
User clicks "Start from scratch" on the landing page, enters a name, and an org is created with one active person. The chart view loads immediately.

## Invariants
- Original and working slices both contain exactly one person
- The person has a UUID, the given name, status "Active", and all other fields blank
- Recycled list is empty
- Snapshots are cleared
- Autosave is cleared

---

# Scenario: Add parent to root node

**ID**: CREATE-002
**Area**: create
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_AddParent"
- `internal/api/handlers_test.go` → "TestAddParentHandler"

## Behavior
User clicks the up-arrow-plus icon on a root-level person (no manager), enters a name. A new parent person is created with status "Active" and blank fields, and the child's managerId is set to the new parent's ID.

## Invariants
- New parent is added to working set only (not original)
- Child's managerId points to the new parent
- New parent has no managerId (is itself a root)
- Diff mode shows the new parent as "added"

---

# Scenario: Add parent blocked for non-root

**ID**: CREATE-003
**Area**: create
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_AddParent_ChildHasManager"
- `web/src/components/PersonNode.test.tsx` → "[CREATE-003]"

## Behavior
The up-arrow-plus icon is only visible on root-level nodes (people with no managerId). Attempting to add a parent to a non-root person via API returns 409 Conflict.

## Invariants
- API returns ConflictError when child already has a manager
- Frontend does not render the icon for non-root people

---

# Scenario: Validation — empty name rejected

**ID**: CREATE-004
**Area**: create
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_Create_EmptyName"
- `internal/api/service_test.go` → "TestOrgService_AddParent_EmptyName"
- `internal/api/handlers_test.go` → "TestCreateHandler_EmptyName"
- `internal/api/handlers_test.go` → "TestAddParentHandler_EmptyName"

## Behavior
Both create and add-parent endpoints reject empty names with a 422 ValidationError.

## Invariants
- Empty name → ValidationError
- Whitespace-only name → ValidationError
- Service state is not modified on validation failure
```

- [ ] **Step 2: Commit**

```bash
jj describe -m "docs: add CREATE scenarios for org creation from scratch"
jj new
```

---

### Task 2: Relax backend validation (model + service)

**Files:**
- Modify: `internal/model/model.go:60-86`
- Modify: `internal/model/model_test.go`
- Modify: `internal/api/service_test.go` (Add test)

- [ ] **Step 1: Write the failing model test**

Add to `internal/model/model_test.go`:

```go
func TestNewOrg_ActiveAllowsBlankRoleDisciplineTeam(t *testing.T) {
	t.Parallel()
	people := []Person{
		{Name: "Alice", Role: "", Discipline: "", Manager: "", Team: "", Status: "Active"},
	}
	org, err := NewOrg(people)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(org.Warnings) != 0 {
		t.Errorf("expected 0 warnings, got %d: %v", len(org.Warnings), org.Warnings)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/model/ -run TestNewOrg_ActiveAllowsBlankRoleDisciplineTeam -v`
Expected: FAIL — warnings for missing Team, Role, Discipline

- [ ] **Step 3: Update NewOrg validation**

In `internal/model/model.go`, replace the validation block (lines 65-86) with:

```go
		if p.Name == "" {
			issues = append(issues, "missing Name")
		}
		if p.Status == "" {
			issues = append(issues, "missing Status")
		} else if !ValidStatuses[p.Status] {
			issues = append(issues, fmt.Sprintf("invalid status '%s'", p.Status))
		}
```

This removes the Team required check, the `blankAllowed` block, and the Role/Discipline required checks entirely. Only Name and Status remain required.

- [ ] **Step 4: Fix existing model tests that expect warnings for missing fields**

Update `TestNewOrg_MissingFieldWarns` — this test creates a person with blank Role and expects a warning. After relaxation, blank Role is allowed, so this test needs updating. Replace it:

```go
func TestNewOrg_MissingFieldWarns(t *testing.T) {
	t.Parallel()
	// After validation relaxation, only Name and Status are required.
	// Missing Name should still produce a warning.
	people := []Person{
		{Name: "", Role: "VP", Discipline: "Eng", Manager: "", Team: "Eng", Status: "Active"},
	}
	org, err := NewOrg(people)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(org.Warnings) != 1 {
		t.Fatalf("expected 1 warning, got %d: %v", len(org.Warnings), org.Warnings)
	}
}
```

Also update `TestNewOrg_MultipleWarnings` — currently expects "missing Name", "missing Team", and "invalid status". After relaxation, Team is no longer required. Update the expected substrings:

```go
func TestNewOrg_MultipleWarnings(t *testing.T) {
	t.Parallel()
	people := []Person{
		{Name: "", Role: "Eng", Discipline: "Eng", Manager: "", Team: "", Status: "Bogus"},
	}
	org, err := NewOrg(people)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(org.Warnings) != 1 {
		t.Fatalf("expected 1 warning (covering multiple issues), got %d", len(org.Warnings))
	}
	w := org.People[0].Warning
	if w == "" {
		t.Fatal("expected non-empty warning on person")
	}
	for _, substr := range []string{"missing Name", "invalid status"} {
		if !contains(w, substr) {
			t.Errorf("expected warning to contain %q, got: %s", substr, w)
		}
	}
}
```

- [ ] **Step 5: Run all model tests**

Run: `go test ./internal/model/ -v`
Expected: All PASS

- [ ] **Step 6: Run all API tests to check for regressions**

Run: `go test ./internal/api/ -v -count=1`
Expected: All PASS (the validation relaxation should not break existing tests since all existing CSV test data includes all fields)

- [ ] **Step 7: Commit**

```bash
jj describe -m "feat: relax validation — only name and status required, team/role/discipline optional"
jj new
```

---

### Task 3: Add `Create` service method and `POST /api/create` endpoint

**Files:**
- Modify: `internal/api/service.go` (add `Create` method)
- Modify: `internal/api/interfaces.go` (add to `OrgStateService`)
- Modify: `internal/api/handlers.go` (add route + handler)
- Modify: `internal/api/service_test.go` (add tests)
- Modify: `internal/api/handlers_test.go` (add tests)

- [ ] **Step 1: Write the failing service test**

Add to `internal/api/service_test.go`:

```go
// Scenarios: CREATE-001
func TestOrgService_Create(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())

	data, err := svc.Create(context.Background(), "Alice")
	if err != nil {
		t.Fatalf("create failed: %v", err)
	}
	if len(data.Original) != 1 {
		t.Errorf("expected 1 original, got %d", len(data.Original))
	}
	if len(data.Working) != 1 {
		t.Errorf("expected 1 working, got %d", len(data.Working))
	}
	p := data.Working[0]
	if p.Name != "Alice" {
		t.Errorf("expected name Alice, got %s", p.Name)
	}
	if p.Status != "Active" {
		t.Errorf("expected status Active, got %s", p.Status)
	}
	if p.Id == "" {
		t.Error("expected non-empty ID")
	}
	if p.Role != "" || p.Discipline != "" || p.Team != "" {
		t.Error("expected blank role, discipline, and team")
	}
}

// Scenarios: CREATE-004
func TestOrgService_Create_EmptyName(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())

	_, err := svc.Create(context.Background(), "")
	if err == nil {
		t.Fatal("expected error for empty name")
	}
	if !isValidation(err) {
		t.Errorf("expected ValidationError, got %T: %v", err, err)
	}
}

// Scenarios: CREATE-004
func TestOrgService_Create_WhitespaceName(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())

	_, err := svc.Create(context.Background(), "   ")
	if err == nil {
		t.Fatal("expected error for whitespace-only name")
	}
	if !isValidation(err) {
		t.Errorf("expected ValidationError, got %T: %v", err, err)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/api/ -run "TestOrgService_Create" -v`
Expected: FAIL — `svc.Create` doesn't exist

- [ ] **Step 3: Add `Create` to `OrgStateService` interface**

In `internal/api/interfaces.go`, add to the `OrgStateService` interface:

```go
type OrgStateService interface {
	GetOrg(ctx context.Context) *OrgData
	GetWorking(ctx context.Context) []Person
	GetRecycled(ctx context.Context) []Person
	ResetToOriginal(ctx context.Context) *OrgData
	RestoreState(ctx context.Context, data AutosaveData)
	Create(ctx context.Context, name string) (*OrgData, error)
}
```

- [ ] **Step 4: Implement `Create` method**

Add to `internal/api/service.go`:

```go
func (s *OrgService) Create(ctx context.Context, name string) (*OrgData, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, errValidation("name is required")
	}
	if len(name) > maxFieldLen {
		return nil, errValidation("name too long (max %d characters)", maxFieldLen)
	}

	p := Person{
		Id:     uuid.NewString(),
		Name:   name,
		Status: "Active",
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	people := []Person{p}
	if err := s.snaps.DeleteStore(); err != nil {
		// Non-fatal: log but proceed
	}
	s.resetState(people, people, nil)
	s.settings = Settings{DisciplineOrder: nil}

	return &OrgData{
		Original: deepCopyPeople(s.original),
		Working:  deepCopyPeople(s.working),
		Pods:     CopyPods(s.podMgr.GetPods()),
		Settings: &s.settings,
	}, nil
}
```

Note: Add `"strings"` to the import list in `service.go` if not already present (it is — already imported on line 6).

- [ ] **Step 5: Run service tests**

Run: `go test ./internal/api/ -run "TestOrgService_Create" -v`
Expected: All PASS

- [ ] **Step 6: Write the failing handler test**

Add to `internal/api/handlers_test.go`:

```go
// Scenarios: CREATE-001
func TestCreateHandler(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())

	body := strings.NewReader(`{"name":"Alice"}`)
	req := httptest.NewRequest("POST", "/api/create", body)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var data OrgData
	if err := json.NewDecoder(rec.Body).Decode(&data); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if len(data.Working) != 1 {
		t.Errorf("expected 1 working person, got %d", len(data.Working))
	}
	if data.Working[0].Name != "Alice" {
		t.Errorf("expected Alice, got %s", data.Working[0].Name)
	}
}

// Scenarios: CREATE-004
func TestCreateHandler_EmptyName(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())

	body := strings.NewReader(`{"name":""}`)
	req := httptest.NewRequest("POST", "/api/create", body)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("expected 422, got %d: %s", rec.Code, rec.Body.String())
	}
}
```

- [ ] **Step 7: Run handler test to verify it fails**

Run: `go test ./internal/api/ -run "TestCreateHandler" -v`
Expected: FAIL — route not registered

- [ ] **Step 8: Add the route and handler**

In `internal/api/handlers.go`, add the route inside `NewRouter` (after the `POST /api/reset` line):

```go
	mux.HandleFunc("POST /api/create", handleCreate(svcs.Org))
```

Add the handler function:

```go
func handleCreate(svc OrgStateService) http.HandlerFunc {
	type req struct {
		Name string `json:"name"`
	}
	return jsonHandlerCtx(func(ctx context.Context, r req) (*OrgData, error) {
		return svc.Create(ctx, r.Name)
	})
}
```

- [ ] **Step 9: Run handler tests**

Run: `go test ./internal/api/ -run "TestCreateHandler" -v`
Expected: All PASS

- [ ] **Step 10: Run full test suite to check for regressions**

Run: `go test ./internal/api/ -count=1`
Expected: All PASS

- [ ] **Step 11: Commit**

```bash
jj describe -m "feat: add POST /api/create endpoint for org creation from scratch"
jj new
```

---

### Task 4: Add `AddParent` service method and `POST /api/people/add-parent` endpoint

**Files:**
- Modify: `internal/api/service_people.go` (add `AddParent` method)
- Modify: `internal/api/interfaces.go` (add to `PersonService`)
- Modify: `internal/api/handlers.go` (add route + handler)
- Modify: `internal/api/service_test.go` (add tests)
- Modify: `internal/api/handlers_test.go` (add tests)

- [ ] **Step 1: Write the failing service tests**

Add to `internal/api/service_test.go`:

```go
// Scenarios: CREATE-002
func TestOrgService_AddParent(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	alice := findByName(data.Working, "Alice")

	parent, working, pods, err := svc.AddParent(context.Background(), alice.Id, "CEO")
	if err != nil {
		t.Fatalf("add parent failed: %v", err)
	}
	if parent.Name != "CEO" {
		t.Errorf("expected parent name CEO, got %s", parent.Name)
	}
	if parent.Status != "Active" {
		t.Errorf("expected status Active, got %s", parent.Status)
	}
	if parent.Id == "" {
		t.Error("expected non-empty parent ID")
	}
	if parent.ManagerId != "" {
		t.Error("expected parent to have no manager")
	}
	// Alice should now report to the new parent
	updatedAlice := findById(working, alice.Id)
	if updatedAlice.ManagerId != parent.Id {
		t.Errorf("expected Alice's manager to be %s, got %s", parent.Id, updatedAlice.ManagerId)
	}
	// New parent should be in working but NOT in original
	if len(working) != 4 {
		t.Errorf("expected 4 working people, got %d", len(working))
	}
	orig := svc.GetOrg(context.Background()).Original
	if len(orig) != 3 {
		t.Errorf("expected 3 original people (unchanged), got %d", len(orig))
	}
	_ = pods
}

// Scenarios: CREATE-003
func TestOrgService_AddParent_ChildHasManager(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	bob := findByName(data.Working, "Bob") // Bob reports to Alice

	_, _, _, err := svc.AddParent(context.Background(), bob.Id, "CEO")
	if err == nil {
		t.Fatal("expected error when child already has a manager")
	}
	if !isConflict(err) {
		t.Errorf("expected ConflictError, got %T: %v", err, err)
	}
}

// Scenarios: CREATE-004
func TestOrgService_AddParent_EmptyName(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	data := svc.GetOrg(context.Background())
	alice := findByName(data.Working, "Alice")

	_, _, _, err := svc.AddParent(context.Background(), alice.Id, "")
	if err == nil {
		t.Fatal("expected error for empty name")
	}
	if !isValidation(err) {
		t.Errorf("expected ValidationError, got %T: %v", err, err)
	}
}

// Scenarios: CREATE-004
func TestOrgService_AddParent_ChildNotFound(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)

	_, _, _, err := svc.AddParent(context.Background(), "nonexistent", "CEO")
	if err == nil {
		t.Fatal("expected error for nonexistent child")
	}
	if !isNotFound(err) {
		t.Errorf("expected NotFoundError, got %T: %v", err, err)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/api/ -run "TestOrgService_AddParent" -v`
Expected: FAIL — `svc.AddParent` doesn't exist

- [ ] **Step 3: Add `AddParent` to `PersonService` interface**

In `internal/api/interfaces.go`, add to the `PersonService` interface:

```go
type PersonService interface {
	Move(ctx context.Context, personId, newManagerId, newTeam string, newPod ...string) (*MoveResult, error)
	Update(ctx context.Context, personId string, fields PersonUpdate) (*MoveResult, error)
	Add(ctx context.Context, p Person) (Person, []Person, []Pod, error)
	AddParent(ctx context.Context, childId, name string) (Person, []Person, []Pod, error)
	Delete(ctx context.Context, personId string) (*MutationResult, error)
	Restore(ctx context.Context, personId string) (*MutationResult, error)
	EmptyBin(ctx context.Context) []Person
	Reorder(ctx context.Context, personIds []string) (*MoveResult, error)
}
```

- [ ] **Step 4: Implement `AddParent` method**

Add to `internal/api/service_people.go`:

```go
func (s *OrgService) AddParent(ctx context.Context, childId, name string) (Person, []Person, []Pod, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return Person{}, nil, nil, errValidation("name is required")
	}
	if len(name) > maxFieldLen {
		return Person{}, nil, nil, errValidation("name too long (max %d characters)", maxFieldLen)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	_, child := s.findWorking(childId)
	if child == nil {
		return Person{}, nil, nil, errNotFound("person %s not found", childId)
	}
	if child.ManagerId != "" {
		return Person{}, nil, nil, errConflict("person %s already has a manager", childId)
	}

	parent := Person{
		Id:     uuid.NewString(),
		Name:   name,
		Status: "Active",
	}
	child.ManagerId = parent.Id
	s.working = append(s.working, parent)
	s.rebuildIndex()
	return parent, deepCopyPeople(s.working), CopyPods(s.podMgr.GetPods()), nil
}
```

Note: `strings` is already imported in `service_people.go` (line 4). `uuid` is also already imported (line 7).

- [ ] **Step 5: Run service tests**

Run: `go test ./internal/api/ -run "TestOrgService_AddParent" -v`
Expected: All PASS

- [ ] **Step 6: Write the failing handler tests**

Add to `internal/api/handlers_test.go`:

```go
// Scenarios: CREATE-002
func TestAddParentHandler(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())
	data := uploadCSV(t, handler)
	alice := findByName(data.Working, "Alice")

	body := strings.NewReader(fmt.Sprintf(`{"childId":"%s","name":"CEO"}`, alice.Id))
	req := httptest.NewRequest("POST", "/api/people/add-parent", body)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp AddResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if resp.Created.Name != "CEO" {
		t.Errorf("expected created name CEO, got %s", resp.Created.Name)
	}
	updatedAlice := findByName(resp.Working, "Alice")
	if updatedAlice.ManagerId != resp.Created.Id {
		t.Errorf("expected Alice's manager to be %s, got %s", resp.Created.Id, updatedAlice.ManagerId)
	}
}

// Scenarios: CREATE-004
func TestAddParentHandler_EmptyName(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())
	data := uploadCSV(t, handler)
	alice := findByName(data.Working, "Alice")

	body := strings.NewReader(fmt.Sprintf(`{"childId":"%s","name":""}`, alice.Id))
	req := httptest.NewRequest("POST", "/api/people/add-parent", body)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("expected 422, got %d: %s", rec.Code, rec.Body.String())
	}
}

// Scenarios: CREATE-003
func TestAddParentHandler_ChildHasManager(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	handler := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())
	data := uploadCSV(t, handler)
	bob := findByName(data.Working, "Bob") // Bob reports to Alice

	body := strings.NewReader(fmt.Sprintf(`{"childId":"%s","name":"CEO"}`, bob.Id))
	req := httptest.NewRequest("POST", "/api/people/add-parent", body)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusConflict {
		t.Errorf("expected 409, got %d: %s", rec.Code, rec.Body.String())
	}
}
```

- [ ] **Step 7: Run handler test to verify it fails**

Run: `go test ./internal/api/ -run "TestAddParentHandler" -v`
Expected: FAIL — route not registered

- [ ] **Step 8: Add the route and handler**

In `internal/api/handlers.go`, add the route inside `NewRouter` (after the `POST /api/add` line):

```go
	mux.HandleFunc("POST /api/people/add-parent", handleAddParent(svcs.People))
```

Add the handler function:

```go
func handleAddParent(svc PersonService) http.HandlerFunc {
	type req struct {
		ChildId string `json:"childId"`
		Name    string `json:"name"`
	}
	return jsonHandlerCtx(func(ctx context.Context, r req) (*AddResponse, error) {
		created, working, pods, err := svc.AddParent(ctx, r.ChildId, r.Name)
		if err != nil {
			return nil, err
		}
		return &AddResponse{Created: created, Working: working, Pods: pods}, nil
	})
}
```

- [ ] **Step 9: Run handler tests**

Run: `go test ./internal/api/ -run "TestAddParentHandler" -v`
Expected: All PASS

- [ ] **Step 10: Run full Go test suite**

Run: `go test ./... -count=1`
Expected: All PASS

- [ ] **Step 11: Commit**

```bash
jj describe -m "feat: add POST /api/people/add-parent endpoint"
jj new
```

---

### Task 5: Frontend API client + types

**Files:**
- Modify: `web/src/api/client.ts` (add `createOrg`, `addParent`)
- Modify: `web/src/api/types.ts` (add `AddParentPayload`)

- [ ] **Step 1: Add `AddParentPayload` type**

In `web/src/api/types.ts`, add after the `DeletePayload` interface:

```typescript
export interface AddParentPayload {
  childId: string
  name: string
}
```

- [ ] **Step 2: Add `createOrg` API function**

In `web/src/api/client.ts`, add after the `uploadFile` function:

```typescript
export async function createOrg(name: string, correlationId?: string): Promise<OrgData> {
  const cid = correlationId ?? generateCorrelationId()
  const startTime = Date.now()
  const resp = await fetchWithTimeout(`${BASE}/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
    correlationId: cid,
  })
  return jsonWithLog<OrgData>(resp, {
    method: 'POST', path: '/api/create', correlationId: cid, requestBody: { name }, startTime,
  })
}
```

- [ ] **Step 3: Add `addParent` API function**

In `web/src/api/client.ts`, add after the `addPerson` function:

```typescript
export async function addParent(payload: AddParentPayload, correlationId?: string): Promise<AddResponse> {
  const cid = correlationId ?? generateCorrelationId()
  const startTime = Date.now()
  const resp = await fetchWithTimeout(`${BASE}/people/add-parent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    correlationId: cid,
  })
  return jsonWithLog<AddResponse>(resp, {
    method: 'POST', path: '/api/people/add-parent', correlationId: cid, requestBody: payload, startTime,
  })
}
```

Add `AddParentPayload` to the import at the top of client.ts.

- [ ] **Step 4: Run frontend type check**

Run: `cd web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
jj describe -m "feat: add createOrg and addParent API client functions"
jj new
```

---

### Task 6: Wire `createOrg` into OrgDataContext and UploadPrompt

**Files:**
- Modify: `web/src/store/orgTypes.ts` (add `createOrg` to `OrgDataContextValue`)
- Modify: `web/src/store/OrgDataContext.tsx` (add `createOrg` callback)
- Modify: `web/src/components/UploadPrompt.tsx` (add "Start from scratch" UI)
- Modify: `web/src/components/UploadPrompt.module.css` (add styles)

- [ ] **Step 1: Add `createOrg` to `OrgDataContextValue`**

In `web/src/store/orgTypes.ts`, add to the `OrgDataContextValue` interface after `upload`:

```typescript
  createOrg: (name: string) => Promise<void>
```

- [ ] **Step 2: Add `createOrg` callback to `OrgDataContext`**

In `web/src/store/OrgDataContext.tsx`, add after the `upload` callback:

```typescript
  const createOrg = useCallback(async (name: string) => {
    try {
      const data = await api.createOrg(name)
      applyOrgData(data)
    } catch (err) {
      setError(`Create failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [setError, applyOrgData])
```

Add `createOrg` to the `value` useMemo object (after `upload`):

```typescript
    upload,
    createOrg,
```

Add `createOrg` to the useMemo dependency array:

```typescript
  ], [
    state, upload, createOrg, mutations,
    confirmMapping, cancelMapping,
    restoreAutosave, dismissAutosave,
  ])
```

- [ ] **Step 3: Update UploadPrompt with "Start from scratch" UI**

Replace `web/src/components/UploadPrompt.tsx`:

```typescript
import { useState, useCallback, useRef, type ChangeEvent, type FormEvent } from 'react'
import { useOrgData } from '../store/OrgContext'
import styles from './UploadPrompt.module.css'

export default function UploadPrompt() {
  const { upload, createOrg } = useOrgData()
  const inputRef = useRef<HTMLInputElement>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')

  const handleChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        await upload(file)
      }
    },
    [upload],
  )

  const handleCreate = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      const trimmed = name.trim()
      if (trimmed) {
        await createOrg(trimmed)
      }
    },
    [name, createOrg],
  )

  return (
    <div className={styles.container}>
      <img
        src="/grove-icon.svg"
        alt="Grove"
        className={styles.icon}
      />
      <p className={styles.titleLine}>
        grove
        <span className={styles.pronunciation}>
          /&#x261;ro&#x28A;v/
        </span>
        <span className={styles.partOfSpeech}>
          n.
        </span>
      </p>

      <p className={styles.definition}>
        a small group of trees, deliberately planted and carefully tended.
      </p>

      <div className={styles.divider} />

      <p className={styles.tagline}>
        Org planning for people who think in structures, not spreadsheets.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.zip"
        onChange={handleChange}
        style={{ display: 'none' }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        className={styles.uploadBtn}
        data-tour="upload-prompt"
      >
        Choose File
      </button>

      {!showCreate ? (
        <button
          onClick={() => setShowCreate(true)}
          className={styles.scratchBtn}
        >
          or start from scratch
        </button>
      ) : (
        <form onSubmit={handleCreate} className={styles.createForm}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name of the first person"
            className={styles.createInput}
            autoFocus
          />
          <button type="submit" className={styles.createBtn} disabled={!name.trim()}>
            Create
          </button>
        </form>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Add styles for the new elements**

Append to `web/src/components/UploadPrompt.module.css`:

```css
.scratchBtn {
  margin-top: 16px;
  padding: 8px 20px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 6px;
  border: 1px solid var(--border-medium);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  letter-spacing: 0.02em;
  transition: border-color var(--transition-fast), color var(--transition-fast);
}

.scratchBtn:hover {
  border-color: var(--text-tertiary);
  color: var(--text-primary);
}

.createForm {
  margin-top: 16px;
  display: flex;
  gap: 8px;
  align-items: center;
}

.createInput {
  padding: 8px 12px;
  font-size: 13px;
  border-radius: 6px;
  border: 1px solid var(--border-medium);
  background: var(--bg-primary);
  color: var(--text-primary);
  width: 220px;
}

.createInput:focus {
  outline: none;
  border-color: var(--grove-green);
}

.createBtn {
  padding: 8px 20px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 6px;
  border: 1px solid var(--grove-green);
  background: var(--grove-green);
  color: #fff;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.createBtn:hover:not(:disabled) {
  background: var(--grove-green-light);
}

.createBtn:disabled {
  opacity: 0.5;
  cursor: default;
}
```

- [ ] **Step 5: Run type check**

Run: `cd web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
jj describe -m "feat: add 'Start from scratch' flow to UploadPrompt"
jj new
```

---

### Task 7: Wire `addParent` into OrgDataContext and PersonNode

**Files:**
- Modify: `web/src/store/orgTypes.ts` (add `addParent` to `OrgDataContextValue`)
- Modify: `web/src/store/useOrgMutations.ts` (add `addParent` mutation)
- Modify: `web/src/components/NodeActions.tsx` (add `showAddParent` + `onAddParent`)
- Modify: `web/src/components/PersonNode.tsx` (pass `onAddParent` when root)

- [ ] **Step 1: Add `addParent` to `OrgDataContextValue`**

In `web/src/store/orgTypes.ts`, add after `add`:

```typescript
  addParent: (childId: string, name: string) => Promise<void>
```

- [ ] **Step 2: Add `addParent` mutation**

In `web/src/store/useOrgMutations.ts`, add after the `add` callback:

```typescript
  const addParent = useCallback(async (childId: string, name: string) => {
    try {
      const resp = await api.addParent({ childId, name })
      setState((s) => ({ ...s, working: resp.working, pods: resp.pods, currentSnapshotName: null }))
    } catch (err) { handleError(err) }
  }, [handleError, setState])
```

Add `addParent` to the returned useMemo object and its dependency array:

```typescript
  return useMemo(() => ({
    move, reparent, reorder, update, add, addParent, remove, restore, emptyBin,
    saveSnapshot, loadSnapshot, deleteSnapshot, updatePod, createPod, updateSettings,
  }), [
    move, reparent, reorder, update, add, addParent, remove, restore, emptyBin,
    saveSnapshot, loadSnapshot, deleteSnapshot, updatePod, createPod, updateSettings,
  ])
```

Add `addParent` import — add `AddParentPayload` to the type import from `'../api/types'` (it's not needed directly since `api.addParent` handles it, but ensure `addParent` is exported from client.ts).

- [ ] **Step 3: Add `showAddParent` and `onAddParent` to NodeActions**

In `web/src/components/NodeActions.tsx`, update the Props interface and component:

```typescript
interface Props {
  showAdd: boolean
  showAddParent?: boolean
  showInfo: boolean
  showFocus?: boolean
  showEdit?: boolean
  showDelete?: boolean
  onAdd: (e: React.MouseEvent) => void
  onAddParent?: (e: React.MouseEvent) => void
  onDelete: (e: React.MouseEvent) => void
  onEdit: (e: React.MouseEvent) => void
  onInfo: (e: React.MouseEvent) => void
  onFocus?: (e: React.MouseEvent) => void
}

export default function NodeActions({ showAdd, showAddParent, showInfo, showFocus, showEdit = true, showDelete = true, onAdd, onAddParent, onDelete, onEdit, onInfo, onFocus }: Props) {
  return (
    <div className={styles.actions}>
      {showAddParent && onAddParent && (
        <button className={styles.btn} onClick={onAddParent} title="Add manager above" aria-label="Add manager above">{'\u2191+'}</button>
      )}
      {showFocus && onFocus && (
        <button className={styles.btn} onClick={onFocus} title="Focus on subtree" aria-label="Focus on subtree">{'\u2299'}</button>
      )}
      {showAdd && (
        <button className={styles.btn} onClick={onAdd} title="Add direct report" aria-label="Add direct report">+</button>
      )}
      {showInfo && (
        <button className={styles.btn} onClick={onInfo} title="Org metrics" aria-label="Org metrics">{'\u2139'}</button>
      )}
      {showEdit && (
        <button className={styles.btn} onClick={onEdit} title="Edit" aria-label="Edit">{'\u270E'}</button>
      )}
      {showDelete && (
        <button className={`${styles.btn} ${styles.danger}`} onClick={onDelete} title="Delete" aria-label="Delete">{'\u00D7'}</button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Add `onAddParent` prop to PersonNode**

In `web/src/components/PersonNode.tsx`, update the Props interface to add:

```typescript
  onAddParent?: () => void
```

Update the destructured props in `PersonNodeInner` to include `onAddParent`:

```typescript
function PersonNodeInner({ person, selected, ghost, changes, showTeam, isManager, onAdd, onAddParent, onDelete, onInfo, onFocus, onClick }: Props) {
```

Update the `showActions` line to include `onAddParent`:

```typescript
  const showActions = !ghost && !isPlaceholder && (onAdd || onAddParent || onDelete || onInfo || onFocus)
```

Update the `<NodeActions>` call to pass `showAddParent` and `onAddParent`:

```typescript
        <NodeActions
          showAdd={!!isManager}
          showAddParent={!!onAddParent}
          showInfo={!!onInfo}
          showFocus={!!onFocus}
          onAdd={(e) => { e.stopPropagation(); onAdd?.() }}
          onAddParent={onAddParent ? (e) => { e.stopPropagation(); onAddParent() } : undefined}
          onDelete={(e) => { e.stopPropagation(); onDelete?.() }}
          onEdit={(e) => { e.stopPropagation(); onClick?.(e) }}
          onInfo={(e) => { e.stopPropagation(); onInfo?.() }}
          onFocus={onFocus ? (e) => { e.stopPropagation(); onFocus() } : undefined}
        />
```

- [ ] **Step 5: Wire `onAddParent` through ChartContext and views**

Three files need changes to thread the callback from the context to the node:

**5a.** In `web/src/views/ChartContext.tsx`, add to `ChartContextValue`:

```typescript
  onAddParent?: (childId: string) => void
```

**5b.** In `web/src/views/shared.tsx`, add `onAddParent` prop to `DraggableNode`:

```typescript
export function DraggableNode({ person, selected, changes, showTeam, isManager, onAdd, onAddParent, onDelete, onInfo, onFocus, onSelect, nodeRef }: {
  // ...existing props...
  onAddParent?: () => void
  // ...
}) {
```

And pass it to `PersonNode`:

```typescript
        <PersonNode
          person={person}
          selected={selected}
          changes={changes}
          showTeam={showTeam}
          isManager={isManager}
          onAdd={onAdd}
          onAddParent={onAddParent}
          onDelete={onDelete}
          onInfo={onInfo}
          onFocus={onFocus}
          onClick={onSelect}
        />
```

**5c.** The view components (`ColumnView.tsx`, `ManagerView.tsx`) render `DraggableNode` and plumb callbacks from `useChart()`. Find where `DraggableNode` is rendered and add:

```typescript
onAddParent={!person.managerId && ctx.onAddParent ? () => ctx.onAddParent!(person.id) : undefined}
```

Where `ctx` is the value from `useChart()`.

**5d.** In the top-level view setup (wherever `ChartProvider` is created with its value — likely in `ColumnView.tsx` and `ManagerView.tsx`), wire `onAddParent`:

```typescript
onAddParent: (childId: string) => {
  const name = window.prompt('Name of the new manager')
  if (name?.trim()) {
    addParent(childId, name.trim())
  }
}
```

Where `addParent` comes from `useOrgData()`. This uses `window.prompt()` for simplicity — can be refined to a popover later.

- [ ] **Step 6: Run type check**

Run: `cd web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
jj describe -m "feat: add 'add parent' action to root-level person nodes"
jj new
```

---

### Task 8: Frontend tests

**Files:**
- Create or modify: `web/src/components/UploadPrompt.test.tsx`
- Modify existing PersonNode tests if they exist

- [ ] **Step 1: Write UploadPrompt tests**

Create `web/src/components/UploadPrompt.test.tsx` (or add to existing):

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UploadPrompt from './UploadPrompt'

// Mock the OrgContext
const mockUpload = vi.fn()
const mockCreateOrg = vi.fn()

vi.mock('../store/OrgContext', () => ({
  useOrgData: () => ({
    upload: mockUpload,
    createOrg: mockCreateOrg,
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('UploadPrompt', () => {
  it('[CREATE-001] shows "start from scratch" button', () => {
    render(<UploadPrompt />)
    expect(screen.getByText('or start from scratch')).toBeInTheDocument()
  })

  it('[CREATE-001] clicking "start from scratch" shows name input', async () => {
    render(<UploadPrompt />)
    await userEvent.click(screen.getByText('or start from scratch'))
    expect(screen.getByPlaceholderText('Name of the first person')).toBeInTheDocument()
    expect(screen.getByText('Create')).toBeInTheDocument()
  })

  it('[CREATE-001] submitting name calls createOrg', async () => {
    render(<UploadPrompt />)
    await userEvent.click(screen.getByText('or start from scratch'))
    await userEvent.type(screen.getByPlaceholderText('Name of the first person'), 'Alice')
    await userEvent.click(screen.getByText('Create'))
    expect(mockCreateOrg).toHaveBeenCalledWith('Alice')
  })

  it('[CREATE-004] Create button is disabled with empty name', async () => {
    render(<UploadPrompt />)
    await userEvent.click(screen.getByText('or start from scratch'))
    expect(screen.getByText('Create')).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run the tests**

Run: `cd web && npx vitest run src/components/UploadPrompt.test.tsx`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
jj describe -m "test: add UploadPrompt tests for create-from-scratch flow"
jj new
```

---

### Task 9: Integration test — create, add person, add parent

**Files:**
- Modify: `internal/api/service_test.go`

- [ ] **Step 1: Write the integration test**

Add to `internal/api/service_test.go`:

```go
// Scenarios: CREATE-001, CREATE-002
func TestOrgService_CreateThenAddThenAddParent(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())

	// Step 1: Create from scratch
	data, err := svc.Create(context.Background(), "Alice")
	if err != nil {
		t.Fatalf("create failed: %v", err)
	}
	alice := data.Working[0]

	// Step 2: Add a direct report
	bob, working, _, err := svc.Add(context.Background(), Person{
		Name: "Bob", Status: "Active", ManagerId: alice.Id,
	})
	if err != nil {
		t.Fatalf("add failed: %v", err)
	}
	if len(working) != 2 {
		t.Errorf("expected 2 working, got %d", len(working))
	}

	// Step 3: Add parent above Alice
	ceo, working, _, err := svc.AddParent(context.Background(), alice.Id, "CEO")
	if err != nil {
		t.Fatalf("add parent failed: %v", err)
	}
	if len(working) != 3 {
		t.Errorf("expected 3 working, got %d", len(working))
	}

	// Verify hierarchy: CEO -> Alice -> Bob
	updatedAlice := findById(working, alice.Id)
	if updatedAlice.ManagerId != ceo.Id {
		t.Errorf("Alice should report to CEO")
	}
	updatedBob := findById(working, bob.Id)
	if updatedBob.ManagerId != alice.Id {
		t.Errorf("Bob should still report to Alice")
	}
	ceoEntry := findById(working, ceo.Id)
	if ceoEntry.ManagerId != "" {
		t.Errorf("CEO should be root (no manager)")
	}
}
```

- [ ] **Step 2: Run the test**

Run: `go test ./internal/api/ -run "TestOrgService_CreateThenAddThenAddParent" -v`
Expected: PASS

- [ ] **Step 3: Run the full test suite**

Run: `go test ./... -count=1 && cd web && npx vitest run`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
jj describe -m "test: add integration test for create -> add -> add-parent flow"
jj new
```

---

### Task 10: Run scenario check and verify

**Files:** None (verification only)

- [ ] **Step 1: Run `make check-scenarios`**

Run: `make check-scenarios`
Expected: All CREATE scenarios have matching test IDs

- [ ] **Step 2: Run full CI**

Run: `make ci`
Expected: All PASS

- [ ] **Step 3: Commit any fixes if needed**

If `check-scenarios` fails because the scenario IDs aren't found in test names, update the test names to include the IDs (they should already be referenced in comments, but verify the check tool's matching strategy).
