# Upload Scenarios

---

# Scenario: CSV upload with standard headers

**ID**: UPLOAD-001
**Area**: upload
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_Upload"
- `internal/api/service_test.go` → "TestOrgService_Upload_AutoProceed"
- `internal/api/handlers_test.go` → "TestUploadHandler"
- `web/e2e/smoke.spec.ts` → "upload CSV and see org chart"
- `web/src/store/OrgDataContext.test.tsx` → "calls uploadFile API and sets working/original state"

## Behavior
User selects a CSV file with standard headers (Name, Role, Discipline, Manager, Team, Status). The file is parsed, column mapping is inferred with high confidence, and the org chart loads immediately.

## Invariants
- Original and working slices both populated with the same people
- Each person has a stable UUID
- Recycled list is empty after fresh upload
- Pods are seeded from any Pod column values
- Settings derive discipline order from the data
- Previous snapshots are cleared

## Edge cases
- File with BOM marker (UPLOAD-010)
- File with mixed line endings (UPLOAD-011)
- Unicode in names (UPLOAD-012)

---

# Scenario: CSV upload requiring column mapping

**ID**: UPLOAD-002
**Area**: upload
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_Upload_NeedsMapping"
- `internal/api/handlers_test.go` → "TestConfirmMappingHandler"
- `web/e2e/features.spec.ts` → "column mapping modal"
- `web/src/store/OrgDataContext.test.tsx` → "handles needs_mapping response without loading data"

## Behavior
User uploads a CSV with non-standard headers. The system shows a column mapping modal with inferred mappings. User confirms or adjusts the mapping, then the org loads.

## Invariants
- Pending upload is stored until confirmed or replaced
- Preview shows header + up to 3 data rows
- Confirming mapping loads org with correct field assignments
- Cancelling mapping returns to upload state without side effects

## Edge cases
- Confirm with no pending file returns error (UPLOAD-003)
- Headers with only "name" mapped still proceeds (UPLOAD-004)

---

# Scenario: Confirm mapping with no pending file

**ID**: UPLOAD-003
**Area**: upload
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_ConfirmMapping_NoPending"
- `internal/api/handlers_test.go` → "TestConfirmMappingHandler_NoPending"

## Behavior
Client calls confirm-mapping without a prior upload. The server returns a validation error.

## Invariants
- No state mutation occurs
- HTTP 422 is returned

## Edge cases
- None

---

# Scenario: Column inference — only name required

**ID**: UPLOAD-004
**Area**: upload
**Tests**:
- `internal/api/infer_test.go` → "TestAllRequiredHigh_OnlyNameRequired"
- `internal/api/infer_test.go` → "TestAllRequiredHigh_True"
- `internal/api/infer_test.go` → "TestAllRequiredHigh_MissingName"
- `internal/api/infer_test.go` → "TestAllRequiredHigh_NameMediumConfidence"

## Behavior
Column inference proceeds automatically when the "name" column is matched with high confidence. All other columns are optional.

## Invariants
- AllRequiredHigh returns true only when "name" has high confidence
- Exact match > synonym match > fuzzy match in priority
- First match wins when multiple columns match

## Edge cases
- Duplicate headers (UPLOAD-013)
- Level column inference (UPLOAD-005)

---

# Scenario: Column inference tiers

**ID**: UPLOAD-005
**Area**: upload
**Tests**:
- `internal/api/infer_test.go` → "TestInferMapping_ExactMatch"
- `internal/api/infer_test.go` → "TestInferMapping_CaseInsensitive"
- `internal/api/infer_test.go` → "TestInferMapping_SynonymMatch"
- `internal/api/infer_test.go` → "TestInferMapping_FuzzyMatch"
- `internal/api/infer_test.go` → "TestInferMapping_UnmatchedHeaders"
- `internal/api/infer_test.go` → "TestInferMapping_FirstMatchWins"
- `internal/api/infer_test.go` → "TestInferMapping_PodAndNotes"
- `internal/api/infer_test.go` → "TestInferMapping_Level"

## Behavior
Column inference uses three tiers: exact match, synonym match, fuzzy keyword match. Each tier assigns a confidence level (high, medium, none).

## Invariants
- Exact match always wins over synonym or fuzzy
- First match within a tier wins
- Longer fuzzy keywords are tried first
- Pod and note columns are inferred like any other field

## Edge cases
- Same-tier tie-breaking (first match wins)
- Fuzzy match ordering by keyword length

---

# Scenario: ZIP upload with multiple files

**ID**: UPLOAD-006
**Area**: upload
**Tests**:
- `internal/api/zipimport_test.go` → "TestUploadZip_ThreeFiles"
- `internal/api/zipimport_test.go` → "TestUploadZip_SingleFile"
- `internal/api/zipimport_test.go` → "TestUploadZip_SharedIDsAcrossFiles"
- `internal/api/zipimport_test.go` → "TestUploadZip_SnapshotSharedIDs"
- `internal/api/handlers_test.go` → "TestUploadZipHandler"
- `web/src/store/OrgDataContext.test.tsx` → "calls uploadZipFile for .zip files"
- `web/src/store/OrgDataContext.test.tsx` → "sets snapshots from ZIP upload response"

## Behavior
User uploads a ZIP containing CSV/XLSX files. Files with numeric prefixes (0-original, 1-working, 2+-snapshots) are parsed in order. IDs are stable across files via the original file's ID map.

## Invariants
- Prefix 0 = original, prefix 1 = working, 2+ = snapshots
- Unprefixed files sort alphabetically after prefixed
- Single-file ZIP uses same data for original and working
- Shared IDs across files enable diff mode
- Non-CSV/XLSX files are ignored

## Edge cases
- ZIP with no CSV/XLSX files returns error (UPLOAD-007)
- ZIP needing column mapping (UPLOAD-008)
- Pods sidecar in ZIP (UPLOAD-009)
- Settings sidecar in ZIP (UPLOAD-015)

---

# Scenario: ZIP with no valid files

**ID**: UPLOAD-007
**Area**: upload
**Tests**:
- `internal/api/zipimport_test.go` → "TestUploadZip_NoCSVFiles"
- `internal/api/zipimport_test.go` → "TestUploadZip_IgnoresNonCSV"

## Behavior
User uploads a ZIP containing no CSV or XLSX files. The system returns an error.

## Invariants
- No state mutation occurs
- Error message indicates no valid files found

## Edge cases
- None

---

# Scenario: ZIP needing column mapping then confirm

**ID**: UPLOAD-008
**Area**: upload
**Tests**:
- `internal/api/zipimport_test.go` → "TestUploadZip_NeedsMapping_ThenConfirm"
- `internal/api/service_test.go` → "TestOrgService_ConfirmMapping_NonZip"

## Behavior
User uploads a ZIP where the first file has non-standard headers. The system shows a mapping modal. After confirmation, all ZIP entries are parsed with the provided mapping.

## Invariants
- Pending upload stores the full ZIP data
- Confirm mapping applies the mapping to all entries in the ZIP
- Snapshots from the ZIP are loaded after confirmation

## Edge cases
- None

---

# Scenario: ZIP with pods sidecar

**ID**: UPLOAD-009
**Area**: upload
**Tests**:
- `internal/api/zipimport_test.go` → "TestUploadZip_FiltersPodsSidecar"
- `internal/api/zipimport_test.go` → "TestUploadZip_SeedsPods"
- `internal/api/zipimport_test.go` → "TestUploadZip_NoPodFieldNoPods"
- `internal/api/zipimport_test.go` → "TestUploadZip_RestoresPodNotesFromSidecar"

## Behavior
A ZIP may contain a `pods.csv` sidecar file with pod notes. This file is not treated as person data — its notes are applied to matching pods after seeding.

## Invariants
- pods.csv is excluded from the person-data entries
- Pod notes are matched by pod name + manager name
- Pods are seeded from person data Pod field, not from the sidecar

## Edge cases
- ZIP with Pod field but no sidecar (pods created, no notes)
- ZIP with no Pod field (no pods created)

---

# Scenario: Adversarial CSV inputs

**ID**: UPLOAD-010
**Area**: upload
**Tests**:
- `internal/api/adversarial_test.go` → "TestAdversarial_BOMMarker"
- `internal/api/adversarial_test.go` → "TestAdversarial_MixedLineEndings"
- `internal/api/adversarial_test.go` → "TestAdversarial_UnicodeNames"
- `internal/api/adversarial_test.go` → "TestAdversarial_XSSInFields"
- `internal/api/adversarial_test.go` → "TestAdversarial_SQLInjectionStrings"
- `internal/api/adversarial_test.go` → "TestAdversarial_CommasInQuotedFields"
- `internal/api/adversarial_test.go` → "TestAdversarial_NewlinesInQuotedFields"
- `internal/api/adversarial_test.go` → "TestAdversarial_DuplicateHeaders"

## Behavior
The system handles malformed, adversarial, and edge-case CSV inputs without crashing or producing incorrect data.

## Invariants
- BOM markers are handled transparently
- Unicode names are preserved
- XSS/SQL injection strings are stored as-is (no execution)
- Quoted fields with commas/newlines parse correctly
- Duplicate headers don't crash inference

## Edge cases
- Empty CSV (UPLOAD-011)
- Header-only CSV (UPLOAD-012)
- Oversized fields (UPLOAD-013)

---

# Scenario: Invalid upload inputs

**ID**: UPLOAD-011
**Area**: upload
**Tests**:
- `internal/api/adversarial_test.go` → "TestAdversarial_EmptyCSV"
- `internal/api/adversarial_test.go` → "TestAdversarial_HeaderOnlyCSV"
- `internal/api/service_test.go` → "TestOrgService_Upload_UnsupportedFormat"
- `internal/api/service_test.go` → "TestOrgService_Upload_InvalidCSV"
- `internal/api/handlers_test.go` → "TestUploadHandler_NoFile"
- `internal/api/handlers_test.go` → "TestUploadHandler_UnsupportedFormat"
- `web/e2e/negative.spec.ts` → "uploading an invalid file shows error or mapping modal"
- `web/e2e/negative.spec.ts` → "uploading empty file does not crash"

## Behavior
The system returns clear errors for unsupported formats, empty files, header-only files, and missing file fields.

## Invariants
- No state mutation on failed upload
- Error message identifies the problem
- Unsupported format (.txt, .pdf, etc.) returns an error

## Edge cases
- Network timeout during upload (tested in e2e)

---

# Scenario: ZIP with settings sidecar

**ID**: UPLOAD-015
**Area**: upload
**Tests**:
- `internal/api/zipimport_test.go` → "TestUploadZip_RestoresSettingsFromSidecar"

## Behavior
A ZIP may contain a `settings.csv` sidecar with discipline ordering. This overrides the auto-derived discipline order.

## Invariants
- settings.csv is excluded from person-data entries
- Discipline order from sidecar takes precedence over auto-derived
- Empty sidecar rows are skipped

## Edge cases
- None
