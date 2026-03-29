# Typed Update Structs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `map[string]string` in person/pod update flows with typed Go structs, update frontend to send native JSON types, and add contract tests for the update payloads.

**Architecture:** Define `PersonUpdate` and `PodUpdate` structs with pointer fields (nil = not sent). Rewrite `Update()` and `UpdatePod()` to use nil-checks instead of map+switch. Update the `PersonService`/`PodService` interfaces. Change frontend to send `boolean`/`number` instead of stringified values. Add contract tests.

**Tech Stack:** Go 1.22, React/TypeScript, vitest

---

### Task 1: Add PersonUpdate and PodUpdate structs to model.go

**Files:**
- Modify: `internal/api/model.go`

- [ ] **Step 1: Add PersonUpdate struct**

Add after the `Person` struct in `internal/api/model.go`:

```go
// PersonUpdate carries optional field updates for a person.
// Pointer fields: nil = not sent, zero value = set to empty/zero/false.
type PersonUpdate struct {
	Name            *string `json:"name,omitempty"`
	Role            *string `json:"role,omitempty"`
	Discipline      *string `json:"discipline,omitempty"`
	Team            *string `json:"team,omitempty"`
	ManagerId       *string `json:"managerId,omitempty"`
	Status          *string `json:"status,omitempty"`
	EmploymentType  *string `json:"employmentType,omitempty"`
	AdditionalTeams *string `json:"additionalTeams,omitempty"`
	NewRole         *string `json:"newRole,omitempty"`
	NewTeam         *string `json:"newTeam,omitempty"`
	Level           *int    `json:"level,omitempty"`
	Pod             *string `json:"pod,omitempty"`
	PublicNote      *string `json:"publicNote,omitempty"`
	PrivateNote     *string `json:"privateNote,omitempty"`
	Private         *bool   `json:"private,omitempty"`
}
```

- [ ] **Step 2: Add PodUpdate struct**

Add after the `Pod` struct:

```go
// PodUpdate carries optional field updates for a pod.
type PodUpdate struct {
	Name        *string `json:"name,omitempty"`
	PublicNote  *string `json:"publicNote,omitempty"`
	PrivateNote *string `json:"privateNote,omitempty"`
}
```

- [ ] **Step 3: Verify it compiles**

Run: `go build ./internal/api/`
Expected: Success

- [ ] **Step 4: Commit**

```
feat: add PersonUpdate and PodUpdate typed structs
```

---

### Task 2: Add contract tests for update structs

**Files:**
- Modify: `internal/api/contract_test.go`

- [ ] **Step 1: Add TestContractPersonUpdateFields**

Add after `TestContractSettingsFields` in `contract_test.go`:

```go
func TestContractPersonUpdateFields(t *testing.T) {
	t.Parallel()
	// TypeScript PersonUpdatePayload interface fields
	expected := []string{
		"additionalTeams",
		"discipline",
		"employmentType",
		"level",
		"managerId",
		"name",
		"newRole",
		"newTeam",
		"pod",
		"private",
		"privateNote",
		"publicNote",
		"role",
		"status",
		"team",
	}
	sort.Strings(expected)

	got := jsonFieldNames(PersonUpdate{})
	assertFieldsMatch(t, "PersonUpdate", expected, got)
}

func TestContractPodUpdateFields(t *testing.T) {
	t.Parallel()
	// TypeScript PodUpdatePayload interface fields
	expected := []string{
		"name",
		"privateNote",
		"publicNote",
	}
	sort.Strings(expected)

	got := jsonFieldNames(PodUpdate{})
	assertFieldsMatch(t, "PodUpdate", expected, got)
}
```

- [ ] **Step 2: Run contract tests**

Run: `go test ./internal/api/ -run TestContract -v`
Expected: All PASS (structs defined in Task 1 have matching field names)

- [ ] **Step 3: Commit**

```
test: add contract tests for PersonUpdate and PodUpdate structs
```

---

### Task 3: Update interfaces, handler, and service — PersonUpdate

This is the core change. Update the `PersonService` interface, handler request type, and `OrgService.Update()` implementation to use `PersonUpdate` instead of `map[string]string`.

**Files:**
- Modify: `internal/api/interfaces.go`
- Modify: `internal/api/handlers.go`
- Modify: `internal/api/service_people.go`
- Modify: `internal/api/validate.go`

- [ ] **Step 1: Update PersonService interface**

In `internal/api/interfaces.go`, change the `Update` method in the `PersonService` interface:

```go
// FROM:
Update(ctx context.Context, personId string, fields map[string]string) (*MoveResult, error)

// TO:
Update(ctx context.Context, personId string, fields PersonUpdate) (*MoveResult, error)
```

- [ ] **Step 2: Add validation methods to validate.go**

Add to `internal/api/validate.go`:

```go
// validatePersonUpdate checks field lengths on non-nil string fields.
// Short fields (name, role, etc.) use maxFieldLen (500).
// Note fields (publicNote, privateNote) use maxNoteLen (2000).
func validatePersonUpdate(u *PersonUpdate) error {
	shortFields := []*string{
		u.Name, u.Role, u.Discipline, u.Team, u.ManagerId,
		u.Status, u.EmploymentType, u.AdditionalTeams,
		u.NewRole, u.NewTeam, u.Pod,
	}
	for _, v := range shortFields {
		if v != nil && len(*v) > maxFieldLen {
			return errValidation("field value too long (max %d characters)", maxFieldLen)
		}
	}
	noteFields := []*string{u.PublicNote, u.PrivateNote}
	for _, v := range noteFields {
		if v != nil && len(*v) > maxNoteLen {
			return errValidation("note too long (max %d characters)", maxNoteLen)
		}
	}
	return nil
}
```

- [ ] **Step 3: Update handleUpdate request type**

In `internal/api/handlers.go`, change the `handleUpdate` function's request struct:

```go
func handleUpdate(svc PersonService) http.HandlerFunc {
	type req struct {
		PersonId string       `json:"personId"`
		Fields   PersonUpdate `json:"fields"`
	}
	return jsonHandlerCtx(func(ctx context.Context, r req) (*WorkingResponse, error) {
		result, err := svc.Update(ctx, r.PersonId, r.Fields)
		if err != nil {
			return nil, err
		}
		return &WorkingResponse{Working: result.Working, Pods: result.Pods}, nil
	})
}
```

- [ ] **Step 4: Rewrite OrgService.Update()**

Replace the entire `Update` method in `internal/api/service_people.go`:

```go
func (s *OrgService) Update(ctx context.Context, personId string, fields PersonUpdate) (*MoveResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := validatePersonUpdate(&fields); err != nil {
		return nil, err
	}

	_, p := s.findWorking(personId)
	if p == nil {
		return nil, errNotFound("person %s not found", personId)
	}

	// Clear warning on any edit — the user is actively fixing the data
	p.Warning = ""

	// Simple fields — direct assignment, nil = skip
	if fields.Name != nil {
		p.Name = *fields.Name
	}
	if fields.Role != nil {
		p.Role = *fields.Role
	}
	if fields.Discipline != nil {
		p.Discipline = *fields.Discipline
	}
	if fields.EmploymentType != nil {
		p.EmploymentType = *fields.EmploymentType
	}
	if fields.NewRole != nil {
		p.NewRole = *fields.NewRole
	}
	if fields.NewTeam != nil {
		p.NewTeam = *fields.NewTeam
	}
	if fields.AdditionalTeams != nil {
		p.AdditionalTeams = parseAdditionalTeams(*fields.AdditionalTeams)
	}
	if fields.Private != nil {
		p.Private = *fields.Private
	}
	if fields.Level != nil {
		p.Level = *fields.Level
	}

	// Status — requires validation
	if fields.Status != nil {
		if !model.ValidStatuses[*fields.Status] {
			return nil, errValidation("invalid status '%s'", *fields.Status)
		}
		p.Status = *fields.Status
	}

	// Notes — length validated by validatePersonUpdate above
	if fields.PublicNote != nil {
		p.PublicNote = *fields.PublicNote
	}
	if fields.PrivateNote != nil {
		p.PrivateNote = *fields.PrivateNote
	}

	// Manager change — requires cycle detection and team inheritance
	if fields.ManagerId != nil {
		if err := s.applyManagerChange(p, personId, *fields.ManagerId, fields.Team != nil); err != nil {
			return nil, err
		}
	}

	// Team change — cascades to ICs of front-line managers
	if fields.Team != nil {
		s.applyTeamChange(p, personId, *fields.Team)
	}

	// Pod change — may auto-create pod
	if fields.Pod != nil {
		s.applyPodChange(p, *fields.Pod)
	}

	return &MoveResult{Working: deepCopyPeople(s.working), Pods: CopyPods(s.podMgr.GetPods())}, nil
}
```

- [ ] **Step 5: Update applyManagerChange signature**

The old `applyManagerChange` takes `fields map[string]string` to check if "team" is present. Change to a boolean parameter. In `internal/api/service_people.go`:

```go
// FROM:
func (s *OrgService) applyManagerChange(p *Person, personId, newManagerId string, fields map[string]string) error {

// TO:
func (s *OrgService) applyManagerChange(p *Person, personId, newManagerId string, hasTeamField bool) error {
```

And update the body — change the `fields["team"]` check:

```go
// FROM:
if _, hasTeam := fields["team"]; !hasTeam {

// TO:
if !hasTeamField {
```

- [ ] **Step 6: Delete applySimpleField and longValueFields**

Remove the `longValueFields` variable and the `applySimpleField` function from `service_people.go`. These are no longer used.

- [ ] **Step 7: Delete old validateFieldLengths calls**

In `validate.go`, the `validateFieldLengths` function is no longer called by `Update`. Keep it if it's still used by `Add` — check with grep. If only used by `Add`, keep it. If unused entirely, delete it.

- [ ] **Step 8: Verify it compiles**

Run: `go build ./internal/api/`
Expected: Will fail because tests still pass `map[string]string` — that's expected. Verify the non-test code compiles.

- [ ] **Step 9: Commit**

```
refactor: rewrite Update() to use typed PersonUpdate struct

Replaces map[string]string with PersonUpdate pointer fields.
Eliminates applySimpleField, longValueFields, and the switch statement.
Refs: #45
```

---

### Task 4: Update interfaces, handler, and service — PodUpdate

**Files:**
- Modify: `internal/api/interfaces.go`
- Modify: `internal/api/handlers.go`
- Modify: `internal/api/service_pods.go`
- Modify: `internal/api/pod_manager.go`

- [ ] **Step 1: Update PodService interface**

In `internal/api/interfaces.go`, change the `UpdatePod` method:

```go
// FROM:
UpdatePod(ctx context.Context, podID string, fields map[string]string) (*MoveResult, error)

// TO:
UpdatePod(ctx context.Context, podID string, fields PodUpdate) (*MoveResult, error)
```

- [ ] **Step 2: Update handleUpdatePod request type**

In `internal/api/handlers.go`:

```go
func handleUpdatePod(svc PodService) http.HandlerFunc {
	type req struct {
		PodId  string    `json:"podId"`
		Fields PodUpdate `json:"fields"`
	}
	return jsonHandlerCtx(func(ctx context.Context, r req) (*WorkingResponse, error) {
		result, err := svc.UpdatePod(ctx, r.PodId, r.Fields)
		if err != nil {
			return nil, err
		}
		return &WorkingResponse{Working: result.Working, Pods: result.Pods}, nil
	})
}
```

- [ ] **Step 3: Update OrgService.UpdatePod()**

In `internal/api/service_pods.go`:

```go
func (s *OrgService) UpdatePod(ctx context.Context, podID string, fields PodUpdate) (*MoveResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.podMgr.UpdatePod(podID, fields, s.working); err != nil {
		return nil, err
	}
	return &MoveResult{Working: deepCopyPeople(s.working), Pods: CopyPods(s.podMgr.GetPods())}, nil
}
```

- [ ] **Step 4: Rewrite PodManager.UpdatePod()**

In `internal/api/pod_manager.go`:

```go
func (pm *PodManager) UpdatePod(podID string, fields PodUpdate, working []Person) error {
	pod := findPodByID(pm.pods, podID)
	if pod == nil {
		return errNotFound("pod %s not found", podID)
	}
	if fields.Name != nil {
		if err := RenamePod(pm.pods, working, podID, *fields.Name); err != nil {
			return err
		}
	}
	if fields.PublicNote != nil {
		if err := validateNoteLen(*fields.PublicNote); err != nil {
			return err
		}
		pod.PublicNote = *fields.PublicNote
	}
	if fields.PrivateNote != nil {
		if err := validateNoteLen(*fields.PrivateNote); err != nil {
			return err
		}
		pod.PrivateNote = *fields.PrivateNote
	}
	return nil
}
```

- [ ] **Step 5: Verify non-test code compiles**

Run: `go build ./internal/api/`
Expected: Success

- [ ] **Step 6: Commit**

```
refactor: rewrite UpdatePod() to use typed PodUpdate struct

Refs: #45
```

---

### Task 5: Update all Go test files

Update every test that calls `Update()` or `UpdatePod()` with `map[string]string` to use the typed structs instead. Also update handler tests that send JSON payloads.

**Files:**
- Modify: `internal/api/service_test.go`
- Modify: `internal/api/handlers_test.go`
- Modify: `internal/api/adversarial_test.go`
- Modify: `internal/api/concurrent_test.go`
- Modify: `internal/api/bench_test.go`
- Modify: `internal/api/fuzz_test.go`
- Modify: `integration_test.go`

- [ ] **Step 1: Add a helper function for string pointers**

Add at the top of `internal/api/service_test.go` (or a shared test helper file):

```go
// ptr returns a pointer to the given value. Useful for building typed update structs in tests.
func ptr[T any](v T) *T { return &v }
```

This helper is needed because Go doesn't allow `&"string literal"`.

- [ ] **Step 2: Update service_test.go Update() calls**

Replace all `map[string]string{...}` in `svc.Update()` calls. Examples:

```go
// FROM:
svc.Update(context.Background(), bob.Id, map[string]string{"role": "Senior Engineer", "discipline": "SRE"})

// TO:
svc.Update(context.Background(), bob.Id, PersonUpdate{Role: ptr("Senior Engineer"), Discipline: ptr("SRE")})

// FROM:
svc.Update(context.Background(), bob.Id, map[string]string{"private": "true"})

// TO:
svc.Update(context.Background(), bob.Id, PersonUpdate{Private: ptr(true)})

// FROM:
svc.Update(context.Background(), bob.Id, map[string]string{"additionalTeams": "Platform, Eng"})

// TO:
svc.Update(context.Background(), bob.Id, PersonUpdate{AdditionalTeams: ptr("Platform, Eng")})
```

For the "unknown field" test — this test no longer applies since there are no unknown fields in a typed struct. Delete the `TestOrgService_Update_UnknownField` test, or repurpose it to test that JSON with unknown keys is silently ignored (which is standard Go JSON behavior).

For the `private` tests that test `"1"` and `"yes"` — these string encodings no longer exist. Delete the tests for `"1"` and `"yes"` and keep only `ptr(true)` and `ptr(false)`.

- [ ] **Step 3: Update service_test.go UpdatePod() calls**

```go
// FROM:
svc.UpdatePod(context.Background(), podId, map[string]string{"publicNote": "hello"})

// TO:
svc.UpdatePod(context.Background(), podId, PodUpdate{PublicNote: ptr("hello")})
```

Delete the `TestOrgService_UpdatePod_UnknownField` test (unknown fields are impossible with typed structs).

- [ ] **Step 4: Update handlers_test.go payloads**

Handler tests send JSON via HTTP. Change the `map[string]string` in `json.Marshal` payloads:

```go
// FROM:
body, _ := json.Marshal(map[string]any{
    "personId": bob.Id,
    "fields":   map[string]string{"role": "Senior Engineer"},
})

// TO:
body, _ := json.Marshal(map[string]any{
    "personId": bob.Id,
    "fields":   map[string]any{"role": "Senior Engineer"},
})
```

Note: handler tests send JSON that gets decoded into the request struct. The JSON wire format for string fields is unchanged — `{"role": "Senior Engineer"}` works the same. Only `private` and `level` change:

```go
// Private field — now sends boolean
"fields": map[string]any{"private": true}

// Level field — now sends number
"fields": map[string]any{"level": 7}
```

- [ ] **Step 5: Update adversarial_test.go**

Same pattern — replace `map[string]string` with `PersonUpdate{...}` for direct service calls.

- [ ] **Step 6: Update concurrent_test.go**

```go
// FROM:
_, _ = svc.Update(context.Background(), bobID, map[string]string{"role": role})

// TO:
_, _ = svc.Update(context.Background(), bobID, PersonUpdate{Role: ptr(role)})
```

- [ ] **Step 7: Update bench_test.go**

```go
// FROM:
svc.Update(context.Background(), personID, map[string]string{"role": role})

// TO:
svc.Update(context.Background(), personID, PersonUpdate{Role: ptr(role)})
```

- [ ] **Step 8: Update fuzz_test.go**

The fuzz test that calls `svc.Update` with arbitrary field/value pairs needs rethinking since we can no longer construct arbitrary field names. Change it to fuzz the string values in a typed struct:

```go
// Fuzz string fields on PersonUpdate
f.Fuzz(func(t *testing.T, name, role, disc string) {
    svc := NewOrgService(NewMemorySnapshotStore())
    // ... upload CSV ...
    _, _ = svc.Update(context.Background(), people[0].Id, PersonUpdate{
        Name: &name, Role: &role, Discipline: &disc,
    })
})
```

- [ ] **Step 9: Update integration_test.go**

Update any `/api/update` or `/api/pods/update` JSON payloads to use the new format.

- [ ] **Step 10: Run full test suite**

Run: `go test ./... -count=1`
Expected: All PASS

- [ ] **Step 11: Commit**

```
test: update all Go tests to use typed PersonUpdate/PodUpdate structs

Refs: #45
```

---

### Task 6: Update frontend types and DetailSidebar

**Files:**
- Modify: `web/src/api/types.ts`
- Modify: `web/src/components/DetailSidebar.tsx`

- [ ] **Step 1: Update PersonUpdatePayload types**

In `web/src/api/types.ts`, change:

```typescript
// FROM:
export interface PersonUpdatePayload {
  name?: string
  role?: string
  discipline?: string
  team?: string
  managerId?: string
  status?: string
  employmentType?: string
  additionalTeams?: string
  newRole?: string
  newTeam?: string
  level?: string
  pod?: string
  publicNote?: string
  privateNote?: string
  private?: string
}

// TO:
export interface PersonUpdatePayload {
  name?: string
  role?: string
  discipline?: string
  team?: string
  managerId?: string
  status?: string
  employmentType?: string
  additionalTeams?: string
  newRole?: string
  newTeam?: string
  level?: number
  pod?: string
  publicNote?: string
  privateNote?: string
  private?: boolean
}
```

Only `level` (string → number) and `private` (string → boolean) change. `PodUpdatePayload` is unchanged.

- [ ] **Step 2: Update DetailSidebar single-person save**

In `web/src/components/DetailSidebar.tsx`, update the single-person save flow. Change the `private` and `level` field encoding:

```typescript
// FROM (around line 193):
if (form.level !== String(person.level ?? 0)) fields.level = form.level

// TO:
if (form.level !== String(person.level ?? 0)) fields.level = parseInt(form.level, 10) || 0

// FROM (around line 197):
if (form.private !== (person.private ?? false)) fields.private = form.private ? 'true' : 'false'

// TO:
if (form.private !== (person.private ?? false)) fields.private = form.private
```

- [ ] **Step 3: Update DetailSidebar batch edit**

In the batch edit path, remove the `Record<string, string>` type assertions and fix the private encoding:

```typescript
// FROM (around line 164):
if (val !== MIXED_VALUE) (fields as Record<string, string>)[apiKey] = String(val)

// TO:
if (val !== MIXED_VALUE) {
  if (apiKey === 'level') {
    (fields as Record<string, string | number>)[apiKey] = parseInt(String(val), 10) || 0
  } else {
    (fields as Record<string, string>)[apiKey] = String(val)
  }
}

// FROM (around line 166):
if (batchDirty.has('private')) { (fields as Record<string, string>).private = form.private ? 'true' : 'false' }

// TO:
if (batchDirty.has('private')) { fields.private = form.private }
```

- [ ] **Step 4: Run frontend tests**

Run: `cd web && npm test`
Expected: All PASS (or update any test that asserts on `"true"/"false"` string values)

- [ ] **Step 5: Run full stack test**

Run: `go test ./... && cd web && npm test`
Expected: All PASS

- [ ] **Step 6: Commit**

```
feat: update frontend to send native types for private/level fields

private sends boolean instead of "true"/"false" string.
level sends number instead of string-encoded number.
Refs: #45
```

---

### Task 7: Final cleanup and verification

- [ ] **Step 1: Verify no remaining map[string]string in update paths**

Run: `grep -rn 'map\[string\]string' internal/api/service_people.go internal/api/pod_manager.go internal/api/service_pods.go internal/api/handlers.go internal/api/interfaces.go`
Expected: No matches in these files (may still appear in other files like `service_import.go` for column mapping — that's fine, not in scope)

- [ ] **Step 2: Run make build**

Run: `make build`
Expected: Success — produces `./grove` binary

- [ ] **Step 3: Run make test-everything (if available)**

Run: `make test-everything` or `go test ./... && cd web && npm test`
Expected: All PASS

- [ ] **Step 4: Commit any remaining cleanup**

Only if needed.
