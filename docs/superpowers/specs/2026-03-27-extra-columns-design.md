# Extra Columns Preservation

**Date**: 2026-03-27
**Issues**: #15, #21

## Problem

When users upload CSV/XLSX files with columns that don't map to Grove's standard fields (e.g. CostCenter, Location, StartDate), that data is silently dropped at parse time. It does not survive a round-trip import → export.

## Solution

Add an `Extra map[string]string` field to both `model.Person` and `api.Person`. The parser captures any unmapped columns into this map. Export appends extra columns after the standard headers. The frontend displays them as read-only columns in the table view.

## Scope

Read-only. Extra columns are preserved, displayed, and exported but not editable within Grove.

## Data Model

### Go model (`internal/model/model.go`)

Add to `Person` struct:

```go
Extra map[string]string // unmapped spreadsheet columns, keyed by original header name
```

### API model (`internal/api/model.go`)

Add to `Person` struct:

```go
Extra map[string]string `json:"extra,omitempty"`
```

### Frontend (`web/src/api/types.ts`)

Add to `Person` type:

```ts
extra?: Record<string, string>
```

## Parser (`internal/parser/parser.go`)

In `BuildPeopleWithMapping`, after building the mapped column indices:

1. Compute the set of header indices that are targets of a mapping (the "consumed" indices).
2. The remaining header indices are "extra" columns.
3. For each row, populate `p.Extra` with `header[i] → row[i]` for each extra index, skipping empty values.

## Convert (`internal/api/convert.go`)

Copy `Extra` from `model.Person` to `api.Person` in `ConvertOrgWithIDMap`.

## Export (`internal/api/export.go`)

1. Collect the union of all extra keys across all people.
2. Sort alphabetically for stable column order.
3. Append to `exportHeaders` (dynamically, per-export — don't mutate the global).
4. `personToRow` appends extra values in the same key order.

Both `ExportCSV` and `ExportXLSX` use the same logic.

## Frontend Table View

Extra columns are not part of the static `TABLE_COLUMNS` array. Instead:

1. Compute the union of all `extra` keys across loaded people.
2. Sort alphabetically.
3. Render them as additional read-only text columns after the standard columns.
4. These columns participate in the column visibility toggle and sorting/filtering.

No changes to DetailSidebar, ColumnView, or ManagerView.

## Column Mapping Modal

No changes needed. Unmapped columns are not shown as app fields. They silently flow into `Extra`. The preview table already shows all columns from the spreadsheet.

## ZIP Import

Uses the same parser per-file, so extras carry through automatically.

## Snapshots & Autosave

`Extra` is serialized as part of the `Person` JSON. Snapshots and autosave serialize `[]Person`, so extra data is preserved automatically via `json:"extra,omitempty"`.

## Testing

- Parser test: upload CSV with extra columns, verify `Extra` map is populated
- Export test: round-trip CSV with extra columns, verify they appear in output
- Convert test: verify `Extra` is copied through
- Frontend: table view renders extra columns as read-only
- Golden tests: update as needed
