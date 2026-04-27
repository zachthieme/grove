# Create Scenarios

---

# Scenario: Start from scratch

**ID**: CREATE-001
**Area**: create
**Tests**:
- `internal/org/service_test.go` → "TestOrgService_Create"
- `internal/httpapi/handlers_test.go` → "TestCreateHandler"
- `web/src/components/UploadPrompt.test.tsx` → "[CREATE-001]"

## Behavior
User clicks "Start from scratch" on the landing page, enters a name, and an org is created with one active person. The chart view loads immediately with the new person's sidebar open.

## Invariants
- Original and working slices both contain exactly one person
- The person has a UUID, the given name, status "Active", and all other fields blank
- Recycled list is empty after fresh creation
- Snapshots are cleared
- Autosave is cleared
- disciplineOrder is an empty array `[]` (never null) in the returned settings
- The new person is auto-selected after creation (sidebar opens immediately)

---

# Scenario: Add parent to root node

**ID**: CREATE-002
**Area**: create
**Tests**:
- `internal/org/service_test.go` → "TestOrgService_AddParent"
- `internal/httpapi/handlers_test.go` → "TestAddParentHandler"

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
- `internal/org/service_test.go` → "TestOrgService_AddParent_ChildHasManager"
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
- `internal/org/service_test.go` → "TestOrgService_Create_EmptyName"
- `internal/org/service_test.go` → "TestOrgService_AddParent_EmptyName"
- `internal/httpapi/handlers_test.go` → "TestCreateHandler_EmptyName"
- `internal/httpapi/handlers_test.go` → "TestAddParentHandler_EmptyName"

## Behavior
Both create and add-parent endpoints reject empty names with a 422 ValidationError.

## Invariants
- Empty name → ValidationError
- Whitespace-only name → ValidationError
- Service state is not modified on validation failure

## Edge cases
- Person not found → NotFoundError (404)
- Name is whitespace-only → treated as empty, returns ValidationError

---

# Scenario: Add direct report to leaf node

**ID**: CREATE-005
**Area**: create
**Tests**:
- `web/src/components/PersonNode.test.tsx` → "[CREATE-005]"
- `web/src/store/ViewDataContext.test.tsx` → "[CREATE-005]"

## Behavior
Every person node (manager or IC/leaf) shows a "+" button on hover when the add-report action is available. Clicking "+" on a leaf node adds a direct report to that person, promoting them to a manager. The newly created person has status "Active" and name "New Person".

## Invariants
- The "+" button appears on hover for both managers and ICs when onAdd is provided
- Clicking "+" on an IC node calls handleAddReport with that person's ID
- handleAddReport creates a new person with name "New Person" and the IC's team

## Edge cases
- If the parent is not found in working, handleAddReport is a no-op
