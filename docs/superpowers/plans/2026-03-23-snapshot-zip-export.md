# Snapshot ZIP Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export all snapshots as a single ZIP download in any format (CSV, XLSX, PNG, SVG).

**Architecture:** New read-only `ExportSnapshot` service method + query-param-based handler for per-snapshot data export. Frontend-driven ZIP assembly using JSZip — fetches CSV/XLSX from server, captures PNG/SVG via html-to-image after loading each snapshot into the DOM. Autosave suppressed during image export cycle.

**Tech Stack:** Go stdlib `archive/zip` not needed (frontend-driven). JSZip (npm), html-to-image (existing). Go: new service method + handler.

**Spec:** `docs/superpowers/specs/2026-03-23-snapshot-zip-export-design.md`

---

### Task 1: ExportSnapshot service method + reserved name validation

**Files:**
- Modify: `internal/api/snapshots.go`
- Test: `internal/api/service_test.go`

- [ ] **Step 1: Write failing tests for ExportSnapshot**

Add to `internal/api/service_test.go`:

```go
func TestOrgService_ExportSnapshot(t *testing.T) {
	svc := newTestService(t)
	svc.SaveSnapshot("snap1")

	t.Run("returns working for __working__", func(t *testing.T) {
		people, err := svc.ExportSnapshot("__working__")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(people) != 3 {
			t.Errorf("expected 3 people, got %d", len(people))
		}
	})

	t.Run("returns original for __original__", func(t *testing.T) {
		people, err := svc.ExportSnapshot("__original__")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(people) != 3 {
			t.Errorf("expected 3 people, got %d", len(people))
		}
	})

	t.Run("returns named snapshot", func(t *testing.T) {
		people, err := svc.ExportSnapshot("snap1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(people) != 3 {
			t.Errorf("expected 3 people, got %d", len(people))
		}
	})

	t.Run("errors on missing snapshot", func(t *testing.T) {
		_, err := svc.ExportSnapshot("nonexistent")
		if err == nil {
			t.Error("expected error for missing snapshot")
		}
	})

	t.Run("returns deep copy", func(t *testing.T) {
		people, _ := svc.ExportSnapshot("snap1")
		people[0].Name = "MUTATED"
		original, _ := svc.ExportSnapshot("snap1")
		if original[0].Name == "MUTATED" {
			t.Error("ExportSnapshot should return a deep copy")
		}
	})
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/zach/code/grove && go test ./internal/api/ -run TestOrgService_ExportSnapshot -v`
Expected: FAIL — `svc.ExportSnapshot` undefined

- [ ] **Step 3: Implement ExportSnapshot**

Add to `internal/api/snapshots.go`:

```go
// ExportSnapshot returns a read-only deep copy of a snapshot's people.
// Accepts "__working__" for current working state, "__original__" for original import data,
// or any named snapshot. Does not mutate service state.
func (s *OrgService) ExportSnapshot(name string) ([]Person, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	switch name {
	case "__working__":
		return deepCopyPeople(s.working), nil
	case "__original__":
		return deepCopyPeople(s.original), nil
	default:
		snap, ok := s.snapshots[name]
		if !ok {
			return nil, fmt.Errorf("snapshot '%s' not found", name)
		}
		return deepCopyPeople(snap.People), nil
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/zach/code/grove && go test ./internal/api/ -run TestOrgService_ExportSnapshot -v`
Expected: PASS (all 5 subtests)

- [ ] **Step 5: Write failing test for reserved name rejection**

Add to `internal/api/service_test.go`:

```go
func TestOrgService_SaveSnapshot_RejectsReservedNames(t *testing.T) {
	svc := newTestService(t)

	for _, name := range []string{"__working__", "__original__"} {
		t.Run(name, func(t *testing.T) {
			err := svc.SaveSnapshot(name)
			if err == nil {
				t.Errorf("expected error for reserved name %q", name)
			}
		})
	}
}
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd /home/zach/code/grove && go test ./internal/api/ -run TestOrgService_SaveSnapshot_RejectsReservedNames -v`
Expected: FAIL — `SaveSnapshot` doesn't return error

- [ ] **Step 7: Update SaveSnapshot to reject reserved names and return error**

Modify `internal/api/snapshots.go` — change `SaveSnapshot` signature from `func (s *OrgService) SaveSnapshot(name string)` to:

```go
var reservedSnapshotNames = map[string]bool{
	"__working__":  true,
	"__original__": true,
}

func (s *OrgService) SaveSnapshot(name string) error {
	if reservedSnapshotNames[name] {
		return fmt.Errorf("snapshot name %q is reserved", name)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.snapshots == nil {
		s.snapshots = make(map[string]snapshotData)
	}
	s.snapshots[name] = snapshotData{
		People:    deepCopyPeople(s.working),
		Timestamp: time.Now(),
	}
	return nil
}
```

Then update `internal/api/handlers.go` `handleSaveSnapshot` to handle the error:

```go
func handleSaveSnapshot(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Name string `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		if err := svc.SaveSnapshot(req.Name); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, svc.ListSnapshots())
	}
}
```

Update all `SaveSnapshot` call sites in `internal/api/snapshots_test.go` to handle the new error return. Every bare `svc.SaveSnapshot("name")` call must become:

```go
if err := svc.SaveSnapshot("name"); err != nil {
    t.Fatalf("save snapshot: %v", err)
}
```

There are 8 call sites to update at lines 11, 13, 35, 65, 66, 77, 98 of `snapshots_test.go`. Also update `TestOrgService_ExportSnapshot` in `service_test.go` (the `svc.SaveSnapshot("snap1")` call added in Step 1 above).

- [ ] **Step 8: Run all Go tests**

Run: `cd /home/zach/code/grove && go test ./internal/... -count=1`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add internal/api/snapshots.go internal/api/handlers.go internal/api/service_test.go internal/api/snapshots_test.go
git commit -m "feat: add ExportSnapshot method and reject reserved snapshot names"
```

---

### Task 2: Per-snapshot export HTTP handler

**Files:**
- Modify: `internal/api/handlers.go`
- Test: `internal/api/handlers_test.go`

- [ ] **Step 1: Write failing handler tests**

Add to `internal/api/handlers_test.go`:

```go
func TestExportSnapshotHandler(t *testing.T) {
	svc := NewOrgService()
	handler := NewRouter(svc)
	uploadCSV(t, handler)

	// Save a snapshot
	body, _ := json.Marshal(map[string]any{"name": "snap1"})
	req := httptest.NewRequest("POST", "/api/snapshots/save", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	t.Run("exports working as CSV", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/export/snapshot?name=__working__&format=csv", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", rec.Code)
		}
		if rec.Header().Get("Content-Type") != "text/csv" {
			t.Errorf("expected text/csv, got %s", rec.Header().Get("Content-Type"))
		}
	})

	t.Run("exports named snapshot as CSV", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/export/snapshot?name=snap1&format=csv", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", rec.Code)
		}
	})

	t.Run("404 for missing snapshot", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/export/snapshot?name=nope&format=csv", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", rec.Code)
		}
	})

	t.Run("400 for unsupported format", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/export/snapshot?name=__working__&format=pdf", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", rec.Code)
		}
	})
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/zach/code/grove && go test ./internal/api/ -run TestExportSnapshotHandler -v`
Expected: FAIL — 404 (route not registered)

- [ ] **Step 3: Implement the handler**

Add route to `NewRouter` in `internal/api/handlers.go` (after the existing export route):

```go
mux.HandleFunc("GET /api/export/snapshot", handleExportSnapshot(svc))
```

Add handler function:

```go
func handleExportSnapshot(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := r.URL.Query().Get("name")
		format := r.URL.Query().Get("format")

		people, err := svc.ExportSnapshot(name)
		if err != nil {
			writeError(w, http.StatusNotFound, err.Error())
			return
		}

		var (
			data        []byte
			contentType string
			filename    string
		)

		switch format {
		case "csv":
			data, err = ExportCSV(people)
			contentType = "text/csv"
			filename = "snapshot.csv"
		case "xlsx":
			data, err = ExportXLSX(people)
			contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
			filename = "snapshot.xlsx"
		default:
			writeError(w, http.StatusBadRequest, "unsupported export format")
			return
		}

		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		w.Header().Set("Content-Type", contentType)
		w.Header().Set("Content-Disposition", "attachment; filename="+filename)
		w.Header().Set("Content-Length", strconv.Itoa(len(data)))
		if _, err := w.Write(data); err != nil {
			log.Printf("snapshot export write error: %v", err)
		}
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/zach/code/grove && go test ./internal/api/ -run TestExportSnapshotHandler -v`
Expected: PASS

- [ ] **Step 5: Run all Go tests**

Run: `cd /home/zach/code/grove && go test ./internal/... -count=1`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add internal/api/handlers.go internal/api/handlers_test.go
git commit -m "feat: add per-snapshot export endpoint GET /api/export/snapshot"
```

---

### Task 3: Install JSZip + add API client function + filename sanitization utility

**Files:**
- Modify: `web/package.json` (via npm install)
- Modify: `web/src/api/client.ts`
- Create: `web/src/utils/snapshotExportUtils.ts`
- Create: `web/src/utils/snapshotExportUtils.test.ts`

- [ ] **Step 1: Install JSZip**

Run: `cd /home/zach/code/grove/web && npm install jszip`

- [ ] **Step 2: Add API client function for snapshot export**

Add to `web/src/api/client.ts`:

```typescript
export async function exportSnapshotBlob(name: string, format: 'csv' | 'xlsx'): Promise<Blob> {
  const resp = await fetch(`${BASE}/export/snapshot?name=${encodeURIComponent(name)}&format=${format}`)
  if (!resp.ok) {
    throw new Error(`Export snapshot failed: ${resp.status}`)
  }
  return resp.blob()
}
```

- [ ] **Step 3: Write failing tests for filename sanitization and deduplication**

Create `web/src/utils/snapshotExportUtils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { sanitizeFilename, deduplicateFilenames } from './snapshotExportUtils'

describe('sanitizeFilename', () => {
  it('replaces unsafe characters with dashes', () => {
    expect(sanitizeFilename('Q1/Plan')).toBe('Q1-Plan')
    expect(sanitizeFilename('foo\\bar:baz')).toBe('foo-bar-baz')
    expect(sanitizeFilename('a*b?c"d<e>f|g')).toBe('a-b-c-d-e-f-g')
  })

  it('collapses consecutive dashes', () => {
    expect(sanitizeFilename('a//b')).toBe('a-b')
  })

  it('trims leading and trailing dashes', () => {
    expect(sanitizeFilename('/hello/')).toBe('hello')
  })

  it('passes through clean names', () => {
    expect(sanitizeFilename('Q1-Plan')).toBe('Q1-Plan')
    expect(sanitizeFilename('Reorg v2')).toBe('Reorg v2')
  })
})

describe('deduplicateFilenames', () => {
  it('returns names unchanged when no duplicates', () => {
    expect(deduplicateFilenames(['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
  })

  it('appends suffix for duplicates', () => {
    expect(deduplicateFilenames(['a', 'a', 'a'])).toEqual(['a', 'a-2', 'a-3'])
  })

  it('handles mixed duplicates', () => {
    expect(deduplicateFilenames(['x', 'y', 'x'])).toEqual(['x', 'y', 'x-2'])
  })
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd /home/zach/code/grove/web && npx vitest run src/utils/snapshotExportUtils.test.ts`
Expected: FAIL — module not found

- [ ] **Step 5: Implement the utilities**

Create `web/src/utils/snapshotExportUtils.ts`:

```typescript
const UNSAFE_CHARS = /[/\\:*?"<>|]/g

export function sanitizeFilename(name: string): string {
  return name
    .replace(UNSAFE_CHARS, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function deduplicateFilenames(names: string[]): string[] {
  const counts = new Map<string, number>()
  return names.map((name) => {
    const count = (counts.get(name) ?? 0) + 1
    counts.set(name, count)
    return count > 1 ? `${name}-${count}` : name
  })
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd /home/zach/code/grove/web && npx vitest run src/utils/snapshotExportUtils.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add web/package.json web/package-lock.json web/src/api/client.ts web/src/utils/snapshotExportUtils.ts web/src/utils/snapshotExportUtils.test.ts
git commit -m "feat: add JSZip, snapshot export API client, filename sanitization utils"
```

---

### Task 4: useSnapshotExport hook

**Files:**
- Create: `web/src/hooks/useSnapshotExport.ts`
- Modify: `web/src/hooks/useAutosave.ts` (add suppression flag)

- [ ] **Step 1: Add autosave suppression support**

Modify `web/src/hooks/useAutosave.ts` to accept an optional `suppress` flag. Add a parameter to the input:

```typescript
export function useAutosave(state: {
  original: Person[]
  working: Person[]
  recycled: Person[]
  currentSnapshotName: string | null
  loaded: boolean
  suppressAutosave?: boolean
}) {
```

Then wrap the autosave effect body with a guard and add `state.suppressAutosave` to the dependency array:

```typescript
useEffect(() => {
    if (!state.loaded || state.working.length === 0 || state.suppressAutosave) return
    // ... rest unchanged
  }, [state.original, state.working, state.recycled, state.currentSnapshotName, state.loaded, state.suppressAutosave])
```

- [ ] **Step 2: Create useSnapshotExport hook**

Create `web/src/hooks/useSnapshotExport.ts`:

```typescript
import { useCallback, useState } from 'react'
import { toPng, toSvg } from 'html-to-image'
import JSZip from 'jszip'
import type { SnapshotInfo } from '../api/types'
import { exportSnapshotBlob } from '../api/client'
import { sanitizeFilename, deduplicateFilenames } from '../utils/snapshotExportUtils'

type ExportFormat = 'csv' | 'xlsx' | 'png' | 'svg'

interface UseSnapshotExportOptions {
  snapshots: SnapshotInfo[]
  mainRef: React.RefObject<HTMLElement | null>
  loadSnapshot: (name: string) => Promise<void>
  saveSnapshot: (name: string) => Promise<void>
  deleteSnapshot: (name: string) => Promise<void>
  showAllEmploymentTypes: () => void
  setHead: (id: string | null) => void
}

export function useSnapshotExport({
  snapshots,
  mainRef,
  loadSnapshot,
  saveSnapshot,
  deleteSnapshot,
  showAllEmploymentTypes,
  setHead,
}: UseSnapshotExportOptions) {
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [suppressAutosave, setSuppressAutosave] = useState(false)

  const exportAllSnapshots = useCallback(async (format: ExportFormat) => {
    if (exporting) return
    setExporting(true)
    setSuppressAutosave(true)

    const entries = [
      { name: '__working__', label: 'working' },
      { name: '__original__', label: 'original' },
      ...snapshots.map((s) => ({ name: s.name, label: s.name })),
    ]

    setProgress({ current: 0, total: entries.length })
    const ext = format === 'xlsx' ? 'xlsx' : format === 'csv' ? 'csv' : format === 'png' ? 'png' : 'svg'
    const isImage = format === 'png' || format === 'svg'
    const zip = new JSZip()

    // For image export: save current state, clear filters
    if (isImage) {
      try { await saveSnapshot('__export_temp__') } catch { /* best effort */ }
      showAllEmploymentTypes()
      setHead(null)
    }

    const rawNames = entries.map((e) => sanitizeFilename(e.label))
    const filenames = deduplicateFilenames(rawNames)
    let successCount = 0

    try {
      for (let i = 0; i < entries.length; i++) {
        setProgress({ current: i + 1, total: entries.length })
        const entry = entries[i]
        const filename = `${filenames[i]}.${ext}`

        try {
          let blob: Blob
          if (isImage) {
            // Load snapshot into DOM for image capture.
            // __working__: load our temp snapshot (saved before the loop).
            // __original__: calls resetToOriginal() on server — this is a
            // server-side mutation but we restore from __export_temp__ after the loop.
            // Named snapshots: load directly.
            if (entry.name === '__working__') {
              await loadSnapshot('__export_temp__')
            } else {
              await loadSnapshot(entry.name)
            }
            // Wait for DOM to settle
            await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 300)))

            if (!mainRef.current) throw new Error('Chart container not found')
            const dataUrl = format === 'png'
              ? await toPng(mainRef.current, { backgroundColor: '#ffffff' })
              : await toSvg(mainRef.current, { backgroundColor: '#ffffff' })

            const resp = await fetch(dataUrl)
            blob = await resp.blob()
          } else {
            blob = await exportSnapshotBlob(entry.name, format as 'csv' | 'xlsx')
          }
          zip.file(filename, blob)
          successCount++
        } catch (err) {
          console.warn(`Snapshot export failed for "${entry.label}":`, err)
        }
      }

      if (successCount === 0) {
        throw new Error('All snapshot exports failed')
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'grove-snapshots.zip'
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      // Restore state for image export
      if (isImage) {
        try {
          await loadSnapshot('__export_temp__')
          await deleteSnapshot('__export_temp__')
        } catch { /* best effort */ }
      }
      setSuppressAutosave(false)
      setExporting(false)
      setProgress({ current: 0, total: 0 })
    }
  }, [exporting, snapshots, mainRef, loadSnapshot, saveSnapshot, deleteSnapshot, showAllEmploymentTypes, setHead])

  return { exportAllSnapshots, exporting, progress, suppressAutosave }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /home/zach/code/grove/web && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add web/src/hooks/useSnapshotExport.ts web/src/hooks/useAutosave.ts
git commit -m "feat: add useSnapshotExport hook with autosave suppression"
```

---

### Task 5: Toolbar integration + export overlay + App wiring

**Files:**
- Modify: `web/src/components/Toolbar.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/App.module.css`

- [ ] **Step 1: Update Toolbar to accept snapshot export callbacks**

Modify `web/src/components/Toolbar.tsx`. Add to `ToolbarProps`:

```typescript
interface ToolbarProps {
  onExportPng?: () => void
  onExportSvg?: () => void
  exporting?: boolean
  hasSnapshots?: boolean
  onExportAllSnapshots?: (format: 'csv' | 'xlsx' | 'png' | 'svg') => void
  snapshotExportProgress?: { current: number; total: number }
}
```

Update the function signature:

```typescript
export default function Toolbar({ onExportPng, onExportSvg, exporting, hasSnapshots, onExportAllSnapshots, snapshotExportProgress }: ToolbarProps) {
```

Add after the XLSX button (before the closing `</div>` of `exportMenu`):

```typescript
{hasSnapshots && onExportAllSnapshots && (
  <>
    <div className={styles.exportSeparator} />
    <button className={styles.exportMenuItem} disabled={exporting}
      onClick={() => { onExportAllSnapshots('csv'); setExportOpen(false) }}>
      All Snapshots (CSV)
    </button>
    <button className={styles.exportMenuItem} disabled={exporting}
      onClick={() => { onExportAllSnapshots('xlsx'); setExportOpen(false) }}>
      All Snapshots (XLSX)
    </button>
    <button className={styles.exportMenuItem} disabled={exporting}
      onClick={() => { onExportAllSnapshots('png'); setExportOpen(false) }}>
      All Snapshots (PNG)
    </button>
    <button className={styles.exportMenuItem} disabled={exporting}
      onClick={() => { onExportAllSnapshots('svg'); setExportOpen(false) }}>
      All Snapshots (SVG)
    </button>
  </>
)}
```

Add `.exportSeparator` to `web/src/components/Toolbar.module.css`:

```css
.exportSeparator {
  height: 1px;
  background: var(--border-default, #e0d6cc);
  margin: 4px 0;
}
```

- [ ] **Step 2: Wire up in App.tsx**

In `web/src/App.tsx`, add the import:

```typescript
import { useSnapshotExport } from './hooks/useSnapshotExport'
```

In `AppContent`, destructure additional values from `useOrg()`:

```typescript
const { ..., snapshots, saveSnapshot, loadSnapshot, deleteSnapshot, showAllEmploymentTypes, setHead } = useOrg()
```

Add the hook call after `useExport`:

```typescript
const { exportAllSnapshots, exporting: snapshotExporting, progress: snapshotProgress, suppressAutosave } = useSnapshotExport({
  snapshots,
  mainRef,
  loadSnapshot,
  saveSnapshot,
  deleteSnapshot,
  showAllEmploymentTypes,
  setHead,
})
```

Pass `suppressAutosave` to `useAutosave`:

```typescript
const { serverSaveError } = useAutosave({ original, working, recycled, currentSnapshotName, loaded, suppressAutosave })
```

Update the `Toolbar` props:

```typescript
<Toolbar
  onExportPng={exportPng}
  onExportSvg={exportSvg}
  exporting={exporting || snapshotExporting}
  hasSnapshots={snapshots.length > 0}
  onExportAllSnapshots={exportAllSnapshots}
  snapshotExportProgress={snapshotProgress}
/>
```

Add the export overlay inside the `<main>` tag (after the view components, before `</main>`):

```typescript
{snapshotExporting && (
  <div className={styles.exportOverlay}>
    <div className={styles.exportOverlayText}>
      Exporting snapshot {snapshotProgress.current} of {snapshotProgress.total}...
    </div>
  </div>
)}
```

- [ ] **Step 3: Add overlay CSS**

Add to `web/src/App.module.css`:

```css
.exportOverlay {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.exportOverlayText {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  background: var(--surface-raised, #fff);
  padding: 16px 24px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
```

Also add `position: relative` to `.main` in `App.module.css` (needed for the absolute-positioned overlay):

```css
.main {
  /* existing rules: flex: 1; overflow: auto; */
  position: relative;
}
```

- [ ] **Step 4: Verify TypeScript compiles and all tests pass**

Run: `cd /home/zach/code/grove/web && npx tsc --noEmit && npx vitest run`
Expected: no type errors, all tests pass

- [ ] **Step 5: Commit**

```bash
git add web/src/components/Toolbar.tsx web/src/components/Toolbar.module.css web/src/App.tsx web/src/App.module.css
git commit -m "feat: wire up snapshot ZIP export in toolbar with progress overlay"
```

---

### Task 6: Manual smoke test + final verification

- [ ] **Step 1: Run all Go tests**

Run: `cd /home/zach/code/grove && go test ./internal/... -count=1`
Expected: PASS

- [ ] **Step 2: Run all frontend tests**

Run: `cd /home/zach/code/grove/web && npx vitest run`
Expected: PASS

- [ ] **Step 3: TypeScript check**

Run: `cd /home/zach/code/grove/web && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Build frontend**

Run: `cd /home/zach/code/grove && make frontend`
Expected: success (web/dist/ populated)

- [ ] **Step 5: Commit any remaining changes**

If the build produced any changes, commit them.
