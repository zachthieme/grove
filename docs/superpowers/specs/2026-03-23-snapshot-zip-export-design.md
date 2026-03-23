# Snapshot ZIP Export

Export all snapshots as a single ZIP download in any supported format (CSV, XLSX, PNG, SVG).

## Problem

Users create multiple named snapshots representing different org chart versions (e.g. "Q1 Plan", "Reorg v2"). There's no way to export all of them at once. The current export only works on the active working state.

## Solution

A frontend-driven ZIP builder that iterates all snapshots, exports each in the requested format, and packs them into a single downloadable ZIP.

### Why frontend-driven

PNG/SVG export requires DOM rendering (via html-to-image). The server has no DOM. Rather than split into two code paths (server ZIP for data, frontend ZIP for images), a single frontend ZIP builder handles all formats uniformly.

## Components

### Backend: Per-snapshot export endpoint

**Endpoint**: `GET /api/export/snapshot?name={name}&format={format}`

Uses query parameters (not path segments) because snapshot names can contain spaces, slashes, and other URL-unfriendly characters. The frontend passes `encodeURIComponent(name)` and the Go handler reads `r.URL.Query().Get("name")`.

- `name`: snapshot name, or `__working__` for current working state, or `__original__` for original import data
- `format`: `csv` or `xlsx`
- Returns file bytes with appropriate content-type and disposition headers
- **404** if snapshot not found; **400** if format unsupported

**Service method**: `ExportSnapshot(name string) ([]Person, error)`

- RLock, look up snapshot by name, return deep copy
- `__working__` returns `deepCopyPeople(s.working)`
- `__original__` returns `deepCopyPeople(s.original)`
- Error if snapshot not found
- Unlike `LoadSnapshot`, this is **read-only** and does not mutate `s.working` or `s.recycled`. Serialization (CSV/XLSX encoding) happens outside the lock on the deep-copied data.

**Snapshot name validation**: `SaveSnapshot` rejects reserved names `__working__` and `__original__` with an error, preventing collisions with sentinel values.

### Frontend: JSZip dependency

`npm install jszip` in `web/`. No other new dependencies.

### Frontend: `useSnapshotExport` hook

`web/src/hooks/useSnapshotExport.ts`

**Inputs**:
- Snapshots list (from OrgContext)
- Chart container ref (for DOM capture)
- `loadSnapshot` action (from OrgContext)

**Returns**: `{ exportAllSnapshots: (format) => Promise<void>, exporting: boolean }`

**Algorithm**:
1. Build export list: current working state + original + all named snapshots
2. For each entry:
   - **CSV/XLSX**: `fetch(/api/export/snapshot?name={name}&format={format})` → blob
   - **PNG/SVG**: Auto-save current working state to a temp snapshot (`__export_temp__`) before the loop begins. Then for each snapshot: `loadSnapshot(name)` → wait for re-render (requestAnimationFrame + small delay) → temporarily clear `hiddenEmploymentTypes` and `headPersonId` so the full chart is captured → capture DOM via html-to-image → blob. After the loop, restore from temp snapshot and delete it.
3. Pack all blobs into ZIP via `JSZip` with filenames `{sanitized-name}.{ext}`
4. Deduplicate filenames: if two snapshots produce the same sanitized name, append `-2`, `-3`, etc.
5. Generate ZIP blob, trigger download as `grove-snapshots.zip`
6. Suppress autosave during the export cycle to avoid polluting autosave with intermediate snapshot states.

**Filename sanitization**: replace `[/\\:*?"<>|]` with `-`, collapse consecutive dashes, trim leading/trailing dashes.

### Frontend: Toolbar integration

In the export dropdown (`Toolbar.tsx`), when `snapshots.length > 0`, add after the existing export items:

```
--- separator ---
All Snapshots (CSV)
All Snapshots (XLSX)
All Snapshots (PNG)
All Snapshots (SVG)
```

Each calls `exportAllSnapshots(format)`. Disabled while `exporting` is true.

### Frontend: Export overlay

While `exporting` is true, show a semi-transparent overlay on the chart area with progress text: "Exporting snapshot 3 of 7..." (counter updates as each snapshot completes). This explains the chart flicker during PNG/SVG export.

## ZIP structure

```
grove-snapshots.zip
├── working.csv
├── original.csv
├── Q1-Plan.csv
└── Reorg-v2.csv
```

Or with PNG:
```
grove-snapshots.zip
├── working.png
├── original.png
├── Q1-Plan.png
└── Reorg-v2.png
```

## Error handling

- If any individual snapshot export fails, skip it and continue. Log a warning to console.
- If ALL exports fail, show an error via the existing error banner.
- If no snapshots exist, the menu items are hidden (no error path).

## Testing

- **Go handler test**: upload data, save 2 snapshots, hit `/api/export/snapshot?name={name}&format=csv`, verify response is valid CSV
- **Go handler test**: verify 404 for missing snapshot, 400 for unsupported format
- **Go service test**: verify `ExportSnapshot` returns deep copies, handles `__working__` and `__original__`, errors on missing snapshots
- **Go service test**: verify `SaveSnapshot` rejects reserved names
- **Frontend**: unit test for filename sanitization and deduplication
