# Create Org from Scratch

## Problem

Grove currently requires a CSV/XLSX/ZIP import to create an org chart. There is no way to start from scratch or add parent nodes above existing root people.

## Solution

Add a lightweight "create from scratch" flow and an "add parent" action, with relaxed field validation to support incremental org building.

## 1. Validation Changes

Relax required field rules across the backend:

- **Name**: always required
- **Status**: always required, must be a valid value
- **Team, Role, Discipline**: optional for all statuses (blank allowed)

This affects:
- `internal/model/model.go` — `NewOrg` validation
- `internal/api/validate.go` — `validateFieldLengths` (max lengths still enforced when present)
- `internal/api/service_people.go` — `Add` method validation

## 2. Backend "Create" Endpoint

`POST /api/create`

**Request:**
```json
{ "name": "string" }
```

**Behavior:**
- Validates name is non-empty
- Creates a single Person: new UUID, given name, status="Active", all other fields blank
- Calls `resetState` with this person as both original and working
- Clears snapshots and autosave (fresh start)

**Response:** Same `OrgData` shape as upload (original, working, empty pods, default settings)

**Errors:** Empty name -> 422

## 3. Backend "Add Parent" Endpoint

`POST /api/people/add-parent`

**Request:**
```json
{ "childId": "string", "name": "string" }
```

**Behavior:**
- Validates child exists and has no manager (is a root node)
- Creates new Person: UUID, name, status="Active", blank fields
- Sets child's `ManagerId` to new person's ID
- Inserts new person into working set only (not original — consistent with existing `Add` behavior, so diff mode shows it as a new addition)

**Response:** Updated `OrgData`

**Errors:**
- Child not found -> 404
- Child already has manager -> 409
- Empty name -> 422

## 4. Frontend — Landing Page

On `UploadPrompt`:
- Add a "Start from scratch" button below "Choose File" (visually secondary — outlined or text-style)
- Clicking shows an inline text input for root person's name + "Create" button
- On submit: `POST /api/create` -> `applyOrgData` -> transitions to loaded chart view

No "new org" button in the Toolbar for now — users can refresh or upload a new file to start over.

## 5. Frontend — Add Parent Action

On `PersonNode`:
- Up-arrow-plus icon in hover actions, visible only on root-level nodes (no `ManagerId`)
- Clicking triggers a small name input popover
- On submit: `POST /api/people/add-parent` -> re-render with new parent above

## 6. Scenarios & Tests

### Scenarios (in `docs/scenarios/`)

| ID | Description |
|----|-------------|
| CREATE-001 | Start from scratch: enter name on landing page, org created with one active person, chart loads |
| CREATE-002 | Add parent to root node: click up-arrow-plus, enter name, new parent appears above |
| CREATE-003 | Add parent blocked for non-root: icon not visible on people with a manager |
| CREATE-004 | Validation: empty name rejected for both create and add-parent |

### Go Tests

- Validation relaxation: update existing tests to allow blank team/role/discipline
- `POST /api/create`: happy path, empty name rejection
- `POST /api/people/add-parent`: happy path, child-not-found, child-has-manager, empty name
- Integration test: create -> add person -> add parent flow

### Frontend Tests

- UploadPrompt renders "Start from scratch" button, submits name, transitions to loaded state
- PersonNode shows up-arrow-plus only on root nodes
- Add-parent flow: click icon, enter name, parent appears
