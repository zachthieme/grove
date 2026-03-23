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
- 2+ = named snapshots in timestamp-ascending order (oldest snapshot = lowest index, so prefix numbers reflect chronological creation order)

Entry array order change: currently `useSnapshotExport` lists `__working__` first, `__original__` second. Swap to `__original__` first (index 0), `__working__` second (index 1), then snapshots sorted by timestamp ascending.

## Import

### Convention

The round-trip convention is explicit:
- Prefix `0` = original state (always)
- Prefix `1` = working state (always)
- Prefix `2+` = named snapshots in chronological order

On import, files are assigned by this convention, NOT by "highest prefix." This ensures round-tripping is lossless.

### Backend: ZIP upload endpoint

**Endpoint**: `POST /api/upload/zip`

Accepts a ZIP file via multipart form (same pattern as existing `POST /api/upload`). Max size 50MB (same limit as single upload).

**Security**: Enforce a maximum total decompressed size of 200MB to protect against ZIP bombs. Use only the basename of each entry (ignore directory paths) to prevent path traversal.

Processing:
1. Open ZIP archive
2. Filter to `.csv` and `.xlsx` files only (ignore PNG, SVG, other files). Use basename only (strip directory paths).
3. Sort files by numeric prefix (e.g. `0-original.csv` → 0, `2-Q1-Plan.csv` → 2). Files without a numeric prefix are sorted after prefixed files, in alphabetical order.
4. Run column inference (`InferMapping`) on the first file's headers
5. If `AllRequiredHigh(mapping)`:
   - Parse all files using the inferred mapping
   - Prefix `0` file → original state
   - Prefix `1` file → working state
   - All other files → named snapshots (strip `{N}-` prefix and file extension for the snapshot name)
   - If no prefix-0 file: first file becomes original
   - If no prefix-1 file: last file becomes working (fallback for non-Grove ZIPs)
   - Clear existing snapshots and recycled bin, store new snapshots
   - Return `UploadResponse` with `status: "ready"`, `orgData`, and `snapshots` list
6. If not all required columns matched:
   - Store the ZIP as pending
   - Return `UploadResponse` with `status: "needs_mapping"`, headers, mapping, and preview from the first file

**Pending state management**: Add a `pendingIsZip bool` field to `OrgService`. When a ZIP is uploaded and needs mapping, set `pendingFile = zipBytes`, `pendingFilename = "upload.zip"`, `pendingIsZip = true`. The existing `ConfirmMapping` method checks `pendingIsZip`: if true, delegates to the ZIP parsing path; if false, uses the existing single-file path. This avoids needing a separate `/api/upload/zip/confirm` endpoint — the existing confirm endpoint handles both cases.

### Service changes

New method on `OrgService`:

`UploadZip(data []byte) (*UploadResponse, error)`:
- Opens ZIP, filters/sorts files
- Runs inference on first file
- If ready: parses all files, sets original/working/snapshots, clears recycled
- If needs_mapping: stores pending ZIP data with `pendingIsZip = true`
- Returns `UploadResponse`

Updated method:

`ConfirmMapping(mapping map[string]string) (*OrgData, error)`:
- Check `pendingIsZip`: if true, parse ZIP; if false, parse single file (existing behavior)
- Both paths: set original/working/snapshots, clear recycled

Helper: `parseZipEntries(data []byte, mapping map[string]string) (original []Person, working []Person, snapshots map[string]snapshotData, error)`:
- Shared logic for both auto and confirmed paths
- Opens ZIP, sorts entries by prefix
- Parses each file using `extractRows` + `parser.BuildPeopleWithMapping` + `ConvertOrg`
- Assigns roles based on prefix convention (0=original, 1=working, 2+=snapshots)
- All files use the same column mapping (from the first file's inference or user confirmation)
- Files with headers that don't match the mapping are skipped with a log warning

### UploadResponse change

Add `Snapshots []SnapshotInfo` field to `UploadResponse` in `model.go`. Populate it on ZIP upload so the frontend can set the snapshot list immediately. For single-file uploads, this field is nil (no change to existing behavior).

### Frontend changes

Extend the file input in `Toolbar.tsx` to accept `.zip`:
```
accept=".csv,.xlsx,.zip"
```

In `OrgContext.tsx`, update the `upload` action:
- Detect ZIP files by extension (`.zip`)
- Call new `uploadZipFile` API function instead of `uploadFile`
- When response has `snapshots`, set them in state
- The column mapping flow works as-is — `confirmMapping` hits the same endpoint which now handles both ZIP and single-file pending data

Add `uploadZipFile` to `api/client.ts`:
```typescript
export async function uploadZipFile(file: File): Promise<UploadResponse> {
  const form = new FormData()
  form.append('file', file)
  const resp = await fetch(`${BASE}/upload/zip`, { method: 'POST', body: form })
  return json<UploadResponse>(resp)
}
```

The existing `confirmMapping` client function works for both cases (same endpoint).

## Filename parsing

Import parses filenames as: `{optional-number}-{name}.{ext}`

Uses the basename only (strips directory paths from ZIP entries).

- `0-original.csv` → prefix=0, name="original"
- `1-working.csv` → prefix=1, name="working"
- `2-Q1 Plan.csv` → prefix=2, name="Q1 Plan"
- `report.csv` → prefix=Infinity (sorted last), name="report"

The regex: `/^(\d+)-(.+)$/` applied to the filename without extension. Fallback for unprefixed: use the full filename (without extension) as the name.

## Error handling

- ZIP with no CSV/XLSX files → error "ZIP contains no CSV or XLSX files"
- ZIP with only one file → original = working (same data), no snapshots
- Mixed CSV and XLSX in same ZIP → allowed (each parsed by its own extension)
- Files with mismatched headers → skipped with log warning (all files must match the mapping from the first file)
- Corrupt file in ZIP → skip it, log warning, continue with remaining files. Error only if zero files parse successfully.
- Total decompressed size > 200MB → error "ZIP contents too large"
- ZIP bomb detection: track cumulative bytes read, abort if limit exceeded

## Testing

- **Go service test**: upload ZIP with 3 CSV files (prefix 0,1,2), verify original/working/snapshots set correctly
- **Go service test**: upload ZIP needing mapping, confirm mapping, verify state
- **Go service test**: ZIP with no CSV files returns error
- **Go service test**: ZIP with single file works (original=working, no snapshots)
- **Go service test**: files without numeric prefix sorted after prefixed files
- **Go service test**: round-trip test — export snapshots, re-import ZIP, verify identical state
- **Go handler test**: POST /api/upload/zip with valid ZIP returns 200 with snapshots
- **Go handler test**: POST /api/upload/zip needs_mapping → POST /api/upload/confirm works
- **Frontend**: verify .zip extension routes to new endpoint
