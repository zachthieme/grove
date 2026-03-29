# Typed Update Request Structs

**Issue:** #45
**Scope:** Replace `map[string]string` in person and pod update flows with typed Go structs; update frontend to send native JSON types; add contract tests.

## Problem

The `Update` handler receives field changes as `map[string]string`. Field names are magic strings scattered across the codebase. Booleans are encoded as `"true"/"false"` strings, integers as string-encoded numbers. Typos in field names are invisible until runtime. The `Update()` method has a cyclomatic complexity ~12 switch statement dispatching on these magic strings.

## Design

### Go: PersonUpdate struct

New struct in `internal/api/model.go`:

```go
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

Pointer fields: nil = "not sent", zero value = "set to empty/zero/false".

### Go: PodUpdate struct

New struct in `internal/api/model.go`:

```go
type PodUpdate struct {
    Name        *string `json:"name,omitempty"`
    PublicNote  *string `json:"publicNote,omitempty"`
    PrivateNote *string `json:"privateNote,omitempty"`
}
```

### Interface changes

```go
// PersonService (in interfaces.go)
Update(ctx context.Context, personId string, fields PersonUpdate) (*MoveResult, error)

// PodService (in interfaces.go)
UpdatePod(ctx context.Context, podID string, fields PodUpdate) (*MoveResult, error)
```

### Handler changes

`handleUpdate` request struct changes from:
```go
type req struct {
    PersonId string            `json:"personId"`
    Fields   map[string]string `json:"fields"`
}
```
to:
```go
type req struct {
    PersonId string       `json:"personId"`
    Fields   PersonUpdate `json:"fields"`
}
```

Same pattern for `handleUpdatePod` with `PodUpdate`.

### Service implementation: OrgService.Update()

Replace the switch statement with direct nil-check field application. Pseudostructure:

```go
func (s *OrgService) Update(ctx context.Context, personId string, fields PersonUpdate) (*MoveResult, error) {
    s.mu.Lock()
    defer s.mu.Unlock()

    _, p := s.findWorking(personId)
    if p == nil { return nil, errNotFound(...) }

    p.Warning = ""

    // Validate string field lengths on non-nil string fields
    if err := fields.validateLengths(); err != nil { return nil, err }

    // Apply simple fields (direct assignment, nil = skip)
    if fields.Name != nil { p.Name = *fields.Name }
    if fields.Role != nil { p.Role = *fields.Role }
    if fields.Discipline != nil { p.Discipline = *fields.Discipline }
    if fields.EmploymentType != nil { p.EmploymentType = *fields.EmploymentType }
    if fields.NewRole != nil { p.NewRole = *fields.NewRole }
    if fields.NewTeam != nil { p.NewTeam = *fields.NewTeam }
    if fields.AdditionalTeams != nil { p.AdditionalTeams = parseAdditionalTeams(*fields.AdditionalTeams) }
    if fields.Private != nil { p.Private = *fields.Private }
    if fields.Level != nil { p.Level = *fields.Level }

    // Special fields with validation/side effects
    if fields.Status != nil { validate + apply }
    if fields.PublicNote != nil { validate note length + apply }
    if fields.PrivateNote != nil { validate note length + apply }
    if fields.ManagerId != nil { validate + apply manager change }
    if fields.Team != nil { apply team change with cascade }
    if fields.Pod != nil { apply pod change }

    return &MoveResult{...}, nil
}
```

This eliminates `applySimpleField`, the switch statement, and `longValueFields`.

### Service implementation: PodManager.UpdatePod()

Same pattern — nil-check instead of map iteration + switch.

### Validation helper

Add a `validateLengths()` method on `PersonUpdate` that checks all non-nil string fields against `maxFieldLen` (500) except notes which check against `maxNoteLen` (2000):

```go
func (u *PersonUpdate) validateLengths() error {
    for _, v := range u.shortFields() {
        if v != nil && len(*v) > maxFieldLen {
            return errValidation("field value too long (max %d characters)", maxFieldLen)
        }
    }
    for _, v := range u.noteFields() {
        if v != nil && len(*v) > maxNoteLen {
            return errValidation("note too long (max %d characters)", maxNoteLen)
        }
    }
    return nil
}
```

### Frontend: TypeScript type changes

In `web/src/api/types.ts`:

```typescript
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
    level?: number       // was string
    pod?: string
    publicNote?: string
    privateNote?: string
    private?: boolean    // was string
}

// PodUpdatePayload unchanged (already all optional strings)
```

### Frontend: DetailSidebar changes

- Stop converting `private` to `"true"/"false"` — send `true`/`false` directly
- Stop converting `level` to string — send as number (`parseInt(form.level)` or `Number(form.level)`)
- Remove `as Record<string, string>` type assertions in batch edit path

### Contract tests

Add to `internal/api/contract_test.go`:

- `TestContractPersonUpdateFields`: Validates `PersonUpdate` JSON field names match TypeScript `PersonUpdatePayload` keys
- `TestContractPodUpdateFields`: Validates `PodUpdate` JSON field names match TypeScript `PodUpdatePayload` keys
- Uses same `jsonFieldNames()` reflection helper

### What gets deleted

- `applySimpleField()` function in `service_people.go`
- `longValueFields` map in `service_people.go`
- The switch statement body in `Update()` (replaced by nil-checks)
- The switch statement body in `PodManager.UpdatePod()` (replaced by nil-checks)
- `as Record<string, string>` type assertions in DetailSidebar batch edit

## Files changed

| File | Change |
|------|--------|
| `internal/api/model.go` | Add PersonUpdate, PodUpdate structs |
| `internal/api/interfaces.go` | Update PersonService.Update and PodService.UpdatePod signatures |
| `internal/api/handlers.go` | Update handleUpdate and handleUpdatePod request types |
| `internal/api/service_people.go` | Rewrite Update() with nil-checks, add validateLengths(), delete applySimpleField and longValueFields |
| `internal/api/pod_manager.go` | Rewrite UpdatePod() with nil-checks |
| `internal/api/service_pods.go` | Update UpdatePod() signature passthrough |
| `internal/api/contract_test.go` | Add TestContractPersonUpdateFields, TestContractPodUpdateFields |
| `internal/api/handlers_test.go` | Update test payloads from map to struct |
| `internal/api/service_test.go` | Update test payloads |
| `internal/api/adversarial_test.go` | Update test payloads |
| `web/src/api/types.ts` | Change level to number, private to boolean |
| `web/src/components/DetailSidebar.tsx` | Remove string encoding for private/level, remove Record casts |

## Not in scope

- Changing the `Add` handler to use a typed struct (it already accepts a `Person`)
- Changing the `Move` handler (it already has typed parameters)
- Changing pod `CreatePod` (already typed)
