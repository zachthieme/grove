# ZIP Snapshot Import/Export with Ordering

Import a ZIP of CSV/XLSX files as ordered snapshots. Update export to use numeric prefixes so round-tripping preserves ordering.

## Problem

Users want to share org chart snapshots between Grove sessions. The export produces a ZIP, but there's no way to import one back. Additionally, the current export doesn't encode snapshot ordering, so import can't reconstruct the sequence.

## Export Change

Update `useSnapshotExport` to prefix filenames with numeric order:

```
grove-snapshots.zip
├── 0-original.csv
├── 1-working.csv
├── 2-Q1-Plan.csv
└── 3-Reorg-v2.csv
```

This applies to all formats (CSV, XLSX, PNG, SVG). The prefix is `{index}-{sanitized-name}.{ext}`.

Index assignment:
- 0 = original
- 1 = working
- 2+ = named snapshots in the order they appear in the snapshots list

## Import

### Backend: ZIP upload endpoint

**Endpoint**: `POST /api/upload/zip`

Accepts a ZIP file via multipart form (same pattern as existing `POST /api/upload`). Max size 50MB (same limit).

Processing:
1. Open ZIP archive
2. Filter to `.csv` and `.xlsx` files only (ignore PNG, SVG, other files)
3. Sort files by numeric prefix (e.g. `0-original.csv` → 0, `2-Q1-Plan.csv` → 2). Files without a numeric prefix are sorted after prefixed files, in alphabetical order.
4. Run column inference (`InferMapping`) on the first file's headers
5. If `AllRequiredHigh(mapping)`:
   - Parse all files using the inferred mapping
   - `0-*` file → original state
   - Highest-prefix file → working state
   - All others → named snapshots (strip `{N}-` prefix and file extension for the snapshot name)
   - Clear existing snapshots, store new ones
   - Return `UploadResponse` with `status: "ready"` and `orgData`
6. If not all required columns matched:
   - Store the ZIP as pending (same pattern as single-file `pendingFile`)
   - Return `UploadResponse` with `status: "needs_mapping"`, headers, mapping, and preview from the first file

**Endpoint**: `POST /api/upload/zip/confirm`

Same as existing `POST /api/upload/confirm` but processes the pending ZIP instead of a single file. Accepts the user-provided mapping and applies it to all files in the ZIP.

### Service changes

New methods on `OrgService`:

`UploadZip(data []byte) (*UploadResponse, error)`:
- Opens ZIP, filters/sorts files
- Runs inference on first file
- If ready: parses all files, sets original/working/snapshots
- If needs_mapping: stores pending ZIP data
- Returns `UploadResponse`

`ConfirmZipMapping(mapping map[string]string) (*OrgData, error)`:
- Reads pending ZIP, parses all files with provided mapping
- Sets original/working/snapshots
- Returns `OrgData`

Helper: `parseZipFiles(data []byte, mapping map[string]string) (original []Person, working []Person, snapshots map[string]snapshotData, error)`:
- Shared logic for both auto and confirmed paths
- Opens ZIP, sorts entries, parses each file
- Assigns roles based on prefix ordering

### Frontend changes

Extend the file input in `Toolbar.tsx` to accept `.zip`:
```
accept=".csv,.xlsx,.zip"
```

In `OrgContext.tsx`, update the `upload` action to detect ZIP files (by extension) and call the new endpoint instead of the existing one. The rest of the flow (column mapping modal, state updates) works as-is since the response shape is the same.

Add `uploadZipFile` and `confirmZipMapping` to `api/client.ts`.

## Filename parsing

Import parses filenames as: `{optional-number}-{name}.{ext}`

- `0-original.csv` → prefix=0, name="original"
- `2-Q1 Plan.csv` → prefix=2, name="Q1 Plan"
- `report.csv` → prefix=Infinity (sorted last), name="report"

The regex: `/^(\d+)-(.+)\.(csv|xlsx)$/i` with fallback for unprefixed files.

## Error handling

- ZIP with no CSV/XLSX files → error "ZIP contains no CSV or XLSX files"
- ZIP with only one file → treat as single-file upload (original = working, no snapshots)
- Mixed CSV and XLSX in same ZIP → allowed (each parsed by its own extension)
- Column mismatch between files → all files use the same inferred/confirmed mapping; if a file has fewer columns, missing ones default to empty string
- Corrupt file in ZIP → skip it, log warning, continue with remaining files. Error only if zero files parse successfully.

## Testing

- **Go service test**: upload ZIP with 3 CSV files, verify original/working/snapshots set correctly
- **Go service test**: upload ZIP needing mapping, confirm mapping, verify state
- **Go service test**: ZIP with no CSV files returns error
- **Go service test**: ZIP with single file works (no snapshots)
- **Go service test**: files without numeric prefix sorted after prefixed files
- **Go handler test**: POST /api/upload/zip with valid ZIP returns 200
- **Go handler test**: POST /api/upload/zip/confirm works after needs_mapping
- **Frontend**: verify .zip extension routes to new endpoint
