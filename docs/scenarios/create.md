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
- Recycled list is empty after fresh creation
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

## Edge cases
- Person not found → NotFoundError (404)
- Name is whitespace-only → treated as empty, returns ValidationError
