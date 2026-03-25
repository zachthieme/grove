# Team Sorting Design

## Summary

Add automatic sorting of people within pods: FTEs first, then non-FTEs, sorted by a configurable discipline order, then by seniority level (senior first). Add a `level` field to Person and a global discipline order setting with a settings modal UI.

## Motivation

People within pods currently display in import order. There's no way to visually organize them by employment type, discipline, or seniority. This makes it hard to quickly scan a pod and understand its composition.

## Data Model

### Person: Level Field

New field at **all three layers**:

**Go domain (`internal/model/model.go`):**
- `Level int`

**API layer (`internal/api/model.go`):**
- `Level int `json:"level,omitempty"``

**TypeScript (`web/src/api/types.ts`):**
- `level?: number`

Higher number = more senior. Default 0 (unset/unknown). CSV column: `Level`.

### Conversion Updates

`ConvertOrgWithIDMap` in `convert.go` must copy `Level` from `model.Person` to `api.Person`.

### Parser Updates

`BuildPeopleWithMapping` in `parser.go` must parse the level field. Since CSV values are strings and Level is an int, use `strconv.Atoi`:

```go
if raw := get("level"); raw != "" {
    if n, err := strconv.Atoi(raw); err == nil {
        p.Level = n
    }
}
```

### Export Updates

Add `"Level"` to `exportHeaders` in `export.go`. Update `personToRow` to include `strconv.Itoa(p.Level)` (or `""` when 0).

### Column Inference

Add to `infer.go`:
- Exact match: `"level"`
- Synonyms: `"seniority"`, `"grade"`, `"job level"`

### Update Handler

Add `case "level"` to the `Update` method's switch in `service.go`:
```go
case "level":
    n, err := strconv.Atoi(v)
    if err != nil {
        return nil, fmt.Errorf("invalid level: %s", v)
    }
    p.Level = n
```

### Settings Type

New type in `internal/api/model.go`:

```go
type Settings struct {
    DisciplineOrder []string `json:"disciplineOrder"`
}
```

Stored as `settings Settings` on `OrgService`. Default: alphabetical from unique disciplines found in the data.

## API Endpoints

### New Settings Endpoints

- `GET /api/settings` — returns `Settings`
- `POST /api/settings` — accepts `Settings`, stores on OrgService, returns updated settings. Uses `limitBody`.

### OrgService Changes

- Add `settings Settings` field to `OrgService`
- On upload/import: always derive default discipline order from the new data (alphabetical from unique disciplines). This resets settings on new upload, consistent with how snapshots are cleared.
- Settings included in autosave and snapshot data

## Sorting Logic

### Frontend `useSortedPeople` Hook

Takes `people: Person[]`, `disciplineOrder: string[]`. Returns a new sorted `Person[]`. Does not mutate state.

Sort is applied per group of people sharing the same `managerId` and `team` (matching the existing pod grouping key). Within each group, the sort key is a 3-level tuple:

1. **Employment tier**: FTE and Intern = 0, everything else = 1 (lower sorts first)
2. **Discipline rank**: index in `disciplineOrder` array. Unknown disciplines sort to the end, alphabetically among themselves.
3. **Level**: descending (higher level = more senior = sorts first). Level 0 (unset) sorts below any set level.

Ties at all three levels preserve existing `sortIndex` order (stable sort).

Applied in `ColumnView` and `ManagerView` before rendering. The underlying `working` state is not mutated — sorting is a view concern only.

### Interaction with Manual Reorder

Auto-sort takes precedence over `sortIndex`. The `sortIndex` field serves only as a tiebreaker within the same (employment tier, discipline, level) tuple. The existing `Reorder` API endpoint remains functional but its effect is only visible when people share identical sort keys. This is an intentional design choice — the auto-sort provides a consistent baseline, and `sortIndex` handles fine-grained ordering within that structure.

## Persistence

### Autosave & Snapshots

`Settings` stored alongside existing autosave/snapshot data. Add `Settings` field to `AutosaveData` and `snapshotData`.

- `SaveSnapshot` captures `s.settings` into `snapshotData`.
- `LoadSnapshot` restores `s.settings` from `snapshotData`. If the snapshot has no settings (backward compat), derives default from people.
- Frontend receives settings via `OrgData` (see below) when loading snapshots.

### OrgData

Add `Settings *Settings `json:"settings,omitempty"`` to `OrgData`. This way settings are returned alongside people/pods from upload, loadSnapshot, resetToOriginal, and confirmMapping — no separate fetch needed, no race condition.

The frontend still uses `GET /api/settings` for the settings modal and `POST /api/settings` for updates, but initial load and snapshot changes come through `OrgData`.

### ZIP Export

`settings.csv` sidecar file with one column `Discipline Order` and one row per discipline (one discipline per row, not comma-separated — avoids issues with discipline names containing commas).

### ZIP Import

`settings.csv` filtered from normal ZIP entry parsing (same pattern as `pods.csv`). If present, discipline order is parsed and applied to `OrgService.settings`. If absent, default discipline order is derived from data.

### CSV/XLSX Export

`Level` column added to person rows (after existing columns, before Pod/notes columns or at the end). Settings are not included in flat CSV/XLSX.

## Frontend

### State

Add `settings: Settings` to `OrgDataState` and `OrgDataContextValue`. Populated from `OrgData.settings` on upload, loadSnapshot, resetToOriginal, confirmMapping, and autosave restore. Updated via `updateSettings` action which calls `POST /api/settings`.

### Settings Modal

Accessible from a gear icon in the toolbar. Contains a "Discipline Order" section with a draggable list of all unique disciplines found in the current `working` data. User drags to reorder. Changes saved immediately via `POST /api/settings`.

### View Integration

`ColumnView` and `ManagerView` call `useSortedPeople(people, settings.disciplineOrder)` and render the sorted result instead of the raw `working` array.

## Testing

### Go Backend

- Level field in parser (string-to-int conversion), export (int-to-string), inference
- Level field in Update handler (valid int, invalid string)
- Level field in ConvertOrg (copied through)
- Settings CRUD on OrgService
- Settings persistence in autosave/snapshots
- Settings included in OrgData responses
- Default discipline order derivation (alphabetical)
- Settings reset on new upload
- `settings.csv` sidecar filtering and round-trip in ZIP
- Backward compat: old snapshots/autosaves without settings

### Frontend

- `useSortedPeople`: FTE-first sorting, discipline order, level descending, stable sort on ties
- `useSortedPeople`: unknown disciplines sort to end alphabetically
- `useSortedPeople`: unset levels (0) sort below set levels
- `useSortedPeople`: people with no managerId (root nodes) are not sorted
- Settings modal renders disciplines from data, saves on reorder
- Settings loaded from OrgData on upload/snapshot load
