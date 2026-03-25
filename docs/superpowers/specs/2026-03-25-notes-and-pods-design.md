# Notes & Pods Design

## Summary

Add a notes feature (public/private) at the person and pod level. Introduce pods as a first-class entity — auto-seeded from existing team groupings under a manager, with their own identity, notes, and summary view.

## Motivation

The org chart currently has no way to annotate people or team groupings with context. Notes give users a place to capture planning context, status updates, and working notes. Making pods a real entity (rather than implicit team headers) gives structure to the sub-groups under a manager and makes them interactive and annotatable.

## Data Model

### Pod Entity

**Go domain (`internal/model/`):**

```go
type Pod struct {
    Name        string
    Team        string
    ManagerName string // pre-UUID resolution, used only during CSV import
    PublicNote  string
    PrivateNote string
}
```

**API layer (`internal/api/model.go`):**

```go
type Pod struct {
    Id          string `json:"id"`
    Name        string `json:"name"`
    Team        string `json:"team"`
    ManagerId   string `json:"managerId"`
    PublicNote  string `json:"publicNote,omitempty"`
    PrivateNote string `json:"privateNote,omitempty"`
}
```

**TypeScript (`web/src/api/types.ts`):**

```typescript
interface Pod {
    id: string
    name: string
    team: string
    managerId: string
    publicNote?: string
    privateNote?: string
}
```

### Pod ID Generation

Pod IDs are UUIDs generated at auto-seed time. They are stored in autosave and snapshot data alongside the pod objects. On CSV/ZIP import, IDs are always freshly generated (the sidecar matches by `(podName, managerName)`, not by ID). The frontend must not persist pod IDs across sessions independently of autosave.

### Pod Conversion (Domain → API)

A `ConvertPods` function converts domain `[]model.Pod` to API `[]Pod`:
- Generates a UUID for each pod
- Resolves `ManagerName` to `ManagerId` using the same name→UUID map built during person conversion (`BuildIDMap`)
- For duplicate manager names, resolution follows the same first-occurrence strategy as person manager resolution (existing known limitation)

For ZIP import, pod sidecar matching uses `(podName, managerName)` as the key. With duplicate manager names, the first match wins — same trade-off as person manager resolution.

### Person Additions

New fields added at **all three layers**:

**Go domain (`internal/model/model.go`) — add to `Person` struct:**
- `Pod string`
- `PublicNote string`
- `PrivateNote string`

**API layer (`internal/api/model.go`) — add to `Person` struct:**
- `Pod string` with `json:"pod,omitempty"`
- `PublicNote string` with `json:"publicNote,omitempty"`
- `PrivateNote string` with `json:"privateNote,omitempty"`

**TypeScript (`web/src/api/types.ts`) — add to `Person` interface:**
- `pod?: string`
- `publicNote?: string`
- `privateNote?: string`

### Conversion Updates

`ConvertOrg` / `ConvertOrgWithIDMap` in `convert.go` must copy the three new fields (`Pod`, `PublicNote`, `PrivateNote`) from `model.Person` to `api.Person`, same as all other fields.

### Parser Updates

`BuildPeopleWithMapping` in `parser.go` must handle three new mapping cases:
- `"pod"` → `p.Pod = get("pod")`
- `"publicNote"` → `p.PublicNote = get("publicNote")`
- `"privateNote"` → `p.PrivateNote = get("privateNote")`

### CSV Columns

Three new columns on person rows: `Pod`, `Public Note`, `Private Note`.

These are person-level fields only. Pod-level notes do not appear in flat CSV/XLSX exports.

### Column Inference

Add entries to `infer.go` for the three new fields:
- `pod`: exact match `"Pod"`, synonyms `"pod name"`, `"sub-team"`, `"subteam"`
- `publicNote`: exact match `"Public Note"`, synonyms `"note"`, `"notes"`, `"public notes"`
- `privateNote`: exact match `"Private Note"`, synonyms `"private notes"`

These fields are optional (like `role`, `discipline`) — missing columns are fine.

### Note Length Limits

Person notes and pod notes use a dedicated limit of 2000 characters, defined as `maxNoteLen`. This is separate from the existing 500-character `maxFieldLen` for name/role/team fields.

In the `Update` method, `publicNote`, `privateNote`, and `pod` keys must be extracted from the `fields` map **before** calling `validateFieldLengths`, which enforces the 500-char limit on all remaining fields. The extracted note values are then validated against `maxNoteLen` in their respective `case` branches. The `UpdatePod` handler validates pod notes the same way.

## Existing Type Changes

### OrgData

```go
type OrgData struct {
    Original           []Person `json:"original"`
    Working            []Person `json:"working"`
    Pods               []Pod    `json:"pods,omitempty"`     // NEW — working pods
    PersistenceWarning string   `json:"persistenceWarning,omitempty"`
}
```

Pods are included in `OrgData` and returned from all endpoints that return `OrgData`: `GET /api/org`, `POST /api/upload` (via `UploadResponse.OrgData`), `POST /api/upload/confirm`, `POST /api/snapshots/load`, `POST /api/reset`.

### UploadResponse

No separate `Pods` field needed — pods are carried inside `UploadResponse.OrgData.Pods`.

### AutosaveData

```go
type AutosaveData struct {
    Original     []Person `json:"original"`
    Working      []Person `json:"working"`
    Recycled     []Person `json:"recycled"`
    Pods         []Pod    `json:"pods,omitempty"`         // NEW — working pods
    OriginalPods []Pod    `json:"originalPods,omitempty"` // NEW — original pods (preserves pod notes)
    SnapshotName string   `json:"snapshotName,omitempty"`
    Timestamp    string   `json:"timestamp"`              // NOTE: string, matches existing code
}
```

Note: `Timestamp` is `string` to match the existing `AutosaveData` in both Go and TypeScript. The new `Pods` field is additive — existing autosave files without it will deserialize with `Pods` as nil, which is handled gracefully (pods are re-derived from people).

### snapshotData

```go
type snapshotData struct {
    People    []Person  `json:"people"`
    Pods      []Pod     `json:"pods,omitempty"`    // NEW
    Timestamp time.Time `json:"timestamp"`
}
```

### OrgService

```go
type OrgService struct {
    // existing fields...
    pods         []Pod    // NEW — working pods (mutable)
    originalPods []Pod    // NEW — pods derived from original data (immutable after load)
}
```

Two pod lists: `originalPods` (derived from original data at load time, used as reset baseline) and `pods` (working set, mutated by pod operations). Diff mode compares a person's `pod` field in working vs original — pod-level entity diffing is not needed.

Pod copying: Pods contain only string fields (no slices), so a simple `copy()` into a new slice suffices — no `deepCopyPods` needed.

### Snapshot Save/Load

- `SaveSnapshot` captures both `s.working` people and `s.pods` into `snapshotData{People, Pods, Timestamp}`.
- `LoadSnapshot` restores both `s.working` from `snapshotData.People` and `s.pods` from `snapshotData.Pods`. Clears recycled. Returns `OrgData` with `Pods` populated.
- Existing snapshots without `Pods` deserialize with `Pods` as nil — on load, pods are re-derived from the snapshot's people via auto-seeding.

## Pod Auto-Seeding

When data is loaded (upload or import):

1. Group people by `(managerId, team)` pairs
2. Each group becomes a Pod — name defaults to team name, UUID generated
3. Each person's `pod` field is set to the pod name
4. If a `Pod` column exists in the CSV, that value overrides the default name
5. If a `pods.csv` sidecar exists in a ZIP import, pod notes are restored by matching `(podName, managerName)`
6. Root nodes (no managerId) do not get pod membership

## Pod Lifecycle

- Pods are auto-created when a new `(managerId, team)` grouping appears (e.g., a person moves to a new team under their manager)
- Pods with zero members are removed automatically after any mutation that changes membership
- Renaming a pod updates the `pod` field on all its members
- Moving a person to a different manager removes them from their current pod; they land in the default pod for their team under the new manager (auto-created if needed)
- Adding a person to a specific pod sets their team to match the pod's team
- A manager with one team = one pod (named after the team, editable)
- A person with no manager (root node) = no pod membership
- Resetting to original: deep-copies `originalPods` to `pods`, deep-copies `original` to `working` (which includes the original `pod` fields on each person). Returns `OrgData` with restored pods.
- **Delete:** deleting a person removes them from their pod. If they were the last member, the pod is removed.
- **Restore:** restoring a person from the recycle bin places them into the matching pod under their manager (by team). If the pod no longer exists, it is auto-created.

## Pod Team — Source of Truth

The pod's `team` field is stored on the Pod entity and is the source of truth. Members must match. When a person is added to a pod, their `team` field is set to the pod's team. Changing a person's team directly (via the update endpoint) is a pod-reassignment — they leave their current pod and join (or auto-create) the pod matching their new `(managerId, team)`.

The pod's `team` field is not directly editable via `POST /api/pods/update`. To change a pod's team, reassign its members. This is intentional — the pod's team reflects its members' team, and changing it independently would break the invariant.

## API Endpoints

### New Pod Endpoints

**`GET /api/pods`** — returns `[]PodInfo`:
```go
type PodInfo struct {
    Pod                          // embedded Pod fields
    MemberCount int `json:"memberCount"`
}
```
```json
[{"id": "...", "name": "...", "team": "...", "managerId": "...", "publicNote": "...", "privateNote": "...", "memberCount": 3}]
```

**`POST /api/pods/update`** — update pod fields. Request: `{podId, fields: {name?, publicNote?, privateNote?}}`. Response: `{"working": []Person, "pods": []Pod}`. Renaming a pod cascades to all members' `pod` field, so the response includes updated working people.

**`POST /api/pods/create`** — create a new empty pod under a manager. Request: `{managerId, name, team}`. Response: `{"working": []Person, "pods": []Pod}`. If a pod already exists for that `(managerId, team)`, returns an error (use rename instead).

No delete endpoint — pods with zero members are removed automatically.

### Mutation Response Shape Changes

Endpoints that currently return a bare `[]Person` must now return a wrapper object to include pods. This is a breaking change to the API contract. All affected endpoints and their new response shapes:

| Endpoint | Current Response | New Response |
|----------|-----------------|--------------|
| `POST /api/move` | `[]Person` | `{"working": []Person, "pods": []Pod}` |
| `POST /api/update` | `[]Person` | `{"working": []Person, "pods": []Pod}` |
| `POST /api/reorder` | `[]Person` | `{"working": []Person, "pods": []Pod}` |
| `POST /api/add` | `{"created": Person, "working": []Person}` | `{"created": Person, "working": []Person, "pods": []Pod}` |
| `POST /api/delete` | `{"working": []Person, "recycled": []Person}` | `{"working": []Person, "recycled": []Person, "pods": []Pod}` |
| `POST /api/restore` | `{"working": []Person, "recycled": []Person}` | `{"working": []Person, "recycled": []Person, "pods": []Pod}` |

The frontend API client (`OrgDataContext.tsx`) must be updated for all these endpoints to destructure the new response shape.

### Modified Endpoints

- `GET /api/org` — returns `OrgData` which now includes `Pods`.
- `POST /api/update` — accepts new fields: `pod`, `publicNote`, `privateNote`. These require new `case` branches in the `Update` method's switch statement (the existing `default` case rejects unknown field names). When `pod` is set to a non-empty value, the backend looks up the pod **by name under the person's current manager**. The person's `team` is updated to match the pod's team. Setting `pod` to a non-existent name returns an error. Setting `pod` to `""` (empty string) re-derives the person's pod from their current `(managerId, team)`. When `team` is changed directly, this triggers pod reassignment. When `managerId` is changed (used by the frontend's `reparent` callback), this also triggers pod reassignment — the person leaves their old pod and joins the default pod for their team under the new manager.
- `POST /api/move` — person leaves current pod on manager change; joins default pod for their team under the new manager (auto-created if needed).
- `POST /api/add` — accepts optional `pod` field. Pod is resolved by `(pod name, managerId)` — both `pod` and `managerId` must be provided together. If `pod` is set, person inherits the pod's team (any `team` field in the request is ignored). If `pod` is not set, person is auto-assigned to the pod matching their `(managerId, team)`.
- `POST /api/reset` — restores `originalPods` to `pods`, returns `OrgData` with restored pods.
- `POST /api/snapshots/load` — restores pods from snapshot data, returns `OrgData` with restored pods.
- `POST /api/snapshots/save` — saves current pods alongside working people.

### OrgService Changes

- `OrgService` gains `pods []Pod` and `originalPods []Pod` fields
- Pod auto-seeding runs after any upload/import
- Zero-member pod cleanup runs after any mutation that changes membership (move, delete, restore, team change)

## Persistence

### Autosave & Snapshots

Pod entities (including notes) are stored in `AutosaveData` and `snapshotData` alongside people. `originalPods` are also stored in `AutosaveData` to preserve pod-level notes from the original import (re-deriving from people would lose pod notes). The `useAutosave` hook must include both `pods` and `originalPods` from state in the autosave payload.

### CSV/XLSX Export

Person rows include `Pod`, `Public Note`, `Private Note` columns. Pod-level notes are not included in flat CSV/XLSX. Export header order adds these three after the existing columns.

### ZIP Export

Person CSVs include the same three columns. A single `pods.csv` sidecar file is added for the **working** pod set only, with columns: `Pod Name`, `Manager`, `Team`, `Public Note`, `Private Note`. The sidecar captures the current working state.

**Known limitation:** ZIP export does not include pod-level notes for snapshots. Snapshot person rows preserve the `Pod` column (person-level), but pod entity notes (publicNote/privateNote on the Pod object) for snapshots are only preserved in `snapshots.json` on disk, not in the ZIP. A full-fidelity round-trip for snapshot pod notes requires the `snapshots.json` file to be present on the server.

### ZIP Import

The `parseZipFileList` function filters out `pods.csv` from the normal entry list (it is not treated as a person data file). If `pods.csv` is present, pod notes are restored by matching `(podName, managerName)` after person data is parsed. If absent, pods are auto-seeded from person data with empty notes.

## Frontend

### State (OrgDataState in OrgDataContext.tsx)

- Add `pods: Pod[]` to `OrgDataState` interface
- New actions on `OrgDataContextValue`: `updatePod(podId, fields)`, `createPod(managerId, name, team)`
- All mutation handlers (move, update, add, delete, restore) destructure `pods` from the new response shape and update state
- The `useAutosave` hook includes `pods` in the autosave payload

### Selection (SelectionContext)

Add `selectedPodId: string | null` to `SelectionContextValue`. New actions: `selectPod(podId)`, which clears person selection (`selectedIds`). Existing `toggleSelect` clears `selectedPodId`. Pod selection is single-select only.

### PersonNode Card

- Public note shows as a truncated one-liner (max ~60 chars) below the role line (only when non-empty)
- Cards without public notes are unchanged

### DetailSidebar

**Person selected:** existing fields plus `Pod` dropdown (pods under that person's manager), `Public Note` textarea, `Private Note` textarea.

**Pod selected:** pod name (editable), team (read-only, stored on pod entity), public note, private note, member count.

### ColumnView

- Team headers become pod headers — show pod name instead of raw team name
- Pod headers are clickable (selects pod for sidebar editing)
- Pod public note shows as a subtle subtitle under the pod header (truncated)
- Pod ordering: alphabetical by pod name within a manager's children

### ManagerView

- Pod summary cards replace team summary cards
- Each pod card shows: pod name, discipline/status breakdown, public note preview
- Clicking a pod card selects the pod for sidebar editing

### Diff Mode

- Pod name changes on a person are detected (person's `pod` field in working vs original)
- If a pod is renamed, all members show as changed — this is a known trade-off (acceptable since pod renames are intentional)
- Person-level notes are not diffed

## Testing

### Go Backend

- Pod auto-seeding from `(managerId, team)` groupings
- Pod ID generation (UUIDs, stable within session)
- Pod conversion (domain → API, manager name resolution)
- Pod CRUD operations on OrgService
- Person move/add/delete/restore cascading to pod membership
- Zero-member pod cleanup
- Pod rename cascading to member `pod` fields
- Person team change triggering pod reassignment
- CSV/XLSX export with new columns, CSV import with `Pod` column
- ZIP export/import with `pods.csv` sidecar round-trip
- `pods.csv` filtered from normal ZIP entry parsing
- Pod cleanup when last member leaves
- Note length limit enforcement (2000 chars)
- Column inference for new fields
- Snapshot save/load preserves pods
- Backward compatibility: old snapshots/autosaves without pods field

### Frontend

- Pod state management (create, update, membership changes)
- DetailSidebar rendering pod fields vs person fields
- Pod selection interaction (clears person selection and vice versa)
- Public note truncation on PersonNode cards
- ManagerView pod summary cards
- Mutation response destructuring (new wrapper shapes)

### Integration

- Full round-trip: upload CSV with Pod column, edit pod notes, export ZIP, re-import ZIP, verify pod notes restored
- Auto-seeding: upload plain CSV (no Pod column), verify pods derived from team groupings
- Backward compatibility: load old autosave without pods, verify pods auto-derived
