# Import/Export Scenarios

---

# Scenario: Export CSV

**ID**: EXPORT-001
**Area**: import-export
**Tests**:
- `internal/api/export_test.go` → "TestExportCSV_RoundTrip"
- `internal/api/export_test.go` → "TestExportCSV_IncludesNewFields"
- `internal/api/export_test.go` → "TestExportCSV_IncludesLevel"
- `internal/api/handlers_test.go` → "TestExportHandler_CSV"

## Behavior
User exports the working org as a CSV file. All person fields are included with manager names (not IDs).

## Invariants
- Headers: Name, Role, Discipline, Manager, Team, Additional Teams, Status, Employment Type, New Role, New Team, Level, Pod, Public Note, Private Note
- Manager column contains manager's name (looked up from ID)
- Level 0 exported as empty string
- Content-Type is text/csv

## Edge cases
- Empty org returns 400

---

# Scenario: Export XLSX

**ID**: EXPORT-002
**Area**: import-export
**Tests**:
- `internal/api/handlers_test.go` → "TestExportHandler_XLSX"

## Behavior
User exports the working org as an XLSX file. Same data as CSV but in Excel format.

## Invariants
- Same headers and data as CSV export
- Content-Type is application/vnd.openxmlformats-officedocument.spreadsheetml.sheet

## Edge cases
- Unsupported format returns 400 (EXPORT-003)

---

# Scenario: Unsupported export format

**ID**: EXPORT-003
**Area**: import-export
**Tests**:
- `internal/api/handlers_test.go` → "TestExportHandler_UnsupportedFormat"
- `internal/api/handlers_test.go` → "TestExportHandler_EmptyOrg"

## Behavior
Requesting an unsupported export format or exporting with no loaded data returns an error.

## Invariants
- Unsupported format → 400
- No data loaded → 400

## Edge cases
- None

---

# Scenario: Export pods sidecar CSV

**ID**: EXPORT-004
**Area**: import-export
**Tests**:
- `internal/api/export_test.go` → "TestExportPodsSidecarCSV"

## Behavior
Exports pod metadata (name, manager, team, notes) as a CSV sidecar file for ZIP round-trip.

## Invariants
- Headers: Pod Name, Manager, Team, Public Note, Private Note
- Manager column uses name (not ID)
- Returns 204 No Content when no pods exist

## Edge cases
- None

---

# Scenario: Convert org with stable IDs

**ID**: EXPORT-005
**Area**: import-export
**Tests**:
- `internal/api/convert_test.go` → "TestConvertOrg_AssignsIDs"
- `internal/api/convert_test.go` → "TestConvertOrg_PreservesFields"

## Behavior
Internal model.Org is converted to API Person structs with generated UUIDs. Manager references are resolved from names to IDs.

## Invariants
- Each person gets a unique UUID
- Manager name resolved to manager's UUID
- All fields (role, discipline, team, status, etc.) preserved
- Additional teams parsed from source data

## Edge cases
- Dangling manager references (name not found) leave managerId empty

---

# Scenario: Snapshot filename utilities

**ID**: EXPORT-006
**Area**: import-export
**Tests**:
- `web/src/utils/snapshotExportUtils.test.ts` → "sanitizeFilename"
- `web/src/utils/snapshotExportUtils.test.ts` → "deduplicateFilenames"

## Behavior
Snapshot names are sanitized for use as filenames in ZIP exports. Duplicate names get numeric suffixes.

## Invariants
- Unsafe characters replaced with dashes
- Consecutive dashes collapsed
- Leading/trailing dashes trimmed
- Duplicate names get -2, -3, etc. suffixes

## Edge cases
- Clean names pass through unchanged
