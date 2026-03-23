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

**Endpoint**: `GET /api/export/snapshot/{name}/{format}`

- `name`: snapshot name, or `__working__` for current working state
- `format`: `csv` or `xlsx`
- Returns file bytes with appropriate content-type and disposition headers
- 400 if snapshot not found or format unsupported

**Service method**: `ExportSnapshot(name string) ([]Person, error)`

- RLock, look up snapshot by name, return deep copy
- `__working__` returns current working state
- Error if snapshot not found

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
1. Build export list: current working state + all named snapshots
2. For each entry:
   - **CSV/XLSX**: `fetch(/api/export/snapshot/{name}/{format})` → blob
   - **PNG/SVG**: `loadSnapshot(name)` → wait for re-render (requestAnimationFrame + small delay) → capture DOM via html-to-image → blob
3. Pack all blobs into ZIP via `JSZip` with filenames `{sanitized-name}.{ext}`
4. Generate ZIP blob, trigger download as `grove-snapshots.zip`
5. For PNG/SVG: restore the original working state after iteration

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

While `exporting` is true, show a semi-transparent overlay on the chart area with "Exporting snapshots..." text. This explains the chart flicker during PNG/SVG export (each snapshot is loaded and rendered in sequence).

## ZIP structure

```
grove-snapshots.zip
├── working.csv
├── Q1-Plan.csv
└── Reorg-v2.csv
```

Or with PNG:
```
grove-snapshots.zip
├── working.png
├── Q1-Plan.png
└── Reorg-v2.png
```

## Error handling

- If any individual snapshot export fails, skip it and continue. Log a warning to console.
- If ALL exports fail, show an error via the existing error banner.
- If no snapshots exist, the menu items are hidden (no error path).

## Testing

- **Go handler test**: upload data, save 2 snapshots, hit `/api/export/snapshot/{name}/csv`, verify response is valid CSV
- **Go service test**: verify `ExportSnapshot` returns deep copies and errors on missing snapshots
- **Frontend**: unit test for filename sanitization function
