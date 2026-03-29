# B+ Grade Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the three B+ areas from the principal engineer code review: performance latency assertions (#49), centralized frontend error handling (#50), and reduced frontend state complexity (#51).

**Architecture:** Three independent workstreams. Performance adds timing assertions to existing Go stress tests. Error handling adds a centralized error callback to the API client and removes silent swallowing. State complexity migrates useOrg() consumers to granular hooks and replaces the autosave suppression ref with an explicit state.

**Tech Stack:** Go 1.25 (testing), React 19, TypeScript 5.7, Vitest

---

## Workstream 1: Performance Latency Assertions (#49)

### Task 1: Add timing assertions to stress tests

**Files:**
- Modify: `internal/api/stress_test.go`
- Modify: `docs/scenarios/concurrency.md`

The existing stress tests verify correctness but not speed. We'll add wall-clock timing assertions using Go's `time` package. Thresholds are generous (10x the benchmark baseline on M4 Pro) so they pass on CI (Ubuntu, slower) without being useless.

Baseline reference from `testdata/bench-baseline.txt`:
- Upload 200: ~150ms → threshold 2s
- Move: ~9ms → threshold 100ms per op
- Update: ~9ms → threshold 100ms per op
- Export CSV 200: ~40ms → threshold 500ms
- Snapshot save+load: ~20ms → threshold 500ms

- [ ] **Step 1: Add timing assertions to stress tests**

Add `time` to imports and wrap each test's hot path with timing:

```go
// At top of file, add "time" to imports
import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"strings"
	"testing"
	"time"
)
```

Add timing assertion to `TestLargeOrg_Upload`:

After `svc := uploadLargeOrg(t, 200)`, the upload already happened inside the helper. To time it, we need to inline the upload:

Replace `TestLargeOrg_Upload` with:

```go
func TestLargeOrg_Upload(t *testing.T) {
	svc := NewOrgService(NewMemorySnapshotStore())
	csvData := generateLargeCSV(200)
	start := time.Now()
	resp, err := svc.Upload(context.Background(), "test.csv", csvData)
	elapsed := time.Since(start)
	if err != nil {
		t.Fatalf("upload failed: %v", err)
	}
	if resp.Status != UploadReady {
		t.Fatalf("expected status 'ready', got '%s'", resp.Status)
	}
	if elapsed > 2*time.Second {
		t.Errorf("upload 200 people took %v, want < 2s", elapsed)
	}
	data := svc.GetOrg(context.Background())
	if data == nil {
		t.Fatal("expected org data after upload")
	}
	if len(data.Original) != 200 {
		t.Errorf("expected 200 original people, got %d", len(data.Original))
	}
	if len(data.Working) != 200 {
		t.Errorf("expected 200 working people, got %d", len(data.Working))
	}
}
```

Add timing to `TestLargeOrg_MoveChain` — wrap the move loop:

```go
// In TestLargeOrg_MoveChain, before the move loop:
start := time.Now()
// (existing move loop)
elapsed := time.Since(start)
if elapsed > 5*time.Second {
    t.Errorf("50 moves on 200-person org took %v, want < 5s", elapsed)
}
```

Add timing to `TestLargeOrg_BulkUpdate` — wrap the update loop:

```go
// In TestLargeOrg_BulkUpdate, before the update loop:
start := time.Now()
// (existing update loop)
elapsed := time.Since(start)
if elapsed > 10*time.Second {
    t.Errorf("175 updates on 200-person org took %v, want < 10s", elapsed)
}
```

Add timing to `TestLargeOrg_ExportCSV` — wrap the export call:

```go
// In TestLargeOrg_ExportCSV, before export call:
start := time.Now()
exported, err := ExportCSV(working)
elapsed := time.Since(start)
// (existing error check)
if elapsed > 500*time.Millisecond {
    t.Errorf("export 200 people to CSV took %v, want < 500ms", elapsed)
}
```

Add timing to `TestLargeOrg_SnapshotRoundTrip` — wrap save + load:

```go
// In TestLargeOrg_SnapshotRoundTrip, wrap snapshot save:
start := time.Now()
if err := svc.SaveSnapshot(context.Background(), "before-mutations"); err != nil {
    t.Fatalf("save snapshot failed: %v", err)
}
saveElapsed := time.Since(start)
if saveElapsed > 500*time.Millisecond {
    t.Errorf("snapshot save took %v, want < 500ms", saveElapsed)
}

// Wrap snapshot load (after mutation block):
loadStart := time.Now()
_, err := svc.LoadSnapshot(context.Background(), "before-mutations")
loadElapsed := time.Since(loadStart)
// (existing error check)
if loadElapsed > 500*time.Millisecond {
    t.Errorf("snapshot load took %v, want < 500ms", loadElapsed)
}
```

Add timing to `TestLargeOrg_500People` — wrap the whole operation block:

```go
// In TestLargeOrg_500People, wrap the combined operation block:
start := time.Now()
// (existing 20 moves + 30 updates)
elapsed := time.Since(start)
if elapsed > 5*time.Second {
    t.Errorf("50 mutations on 500-person org took %v, want < 5s", elapsed)
}
```

- [ ] **Step 2: Run stress tests to verify they pass**

Run: `cd /home/zach/code/grove && go test ./internal/api/ -run TestLargeOrg -v -count=1`
Expected: All tests PASS with timing well under thresholds.

- [ ] **Step 3: Update scenario documentation**

In `docs/scenarios/concurrency.md`, update the CONC-002 scenario:

Change `## Behavior` to:
```markdown
## Behavior
Operations complete within defined time budgets on large orgs (200-500 people):
- Upload 200 people: < 2s
- 50 moves on 200-person org: < 5s
- 175 updates on 200-person org: < 10s
- CSV export 200 people: < 500ms
- Snapshot save/load: < 500ms each
- 50 mutations on 500-person org: < 5s

## Invariants
- Upload, move, update, reorder, export all complete within time budgets
- State remains consistent after bulk operations
- Thresholds are 10x benchmark baselines to accommodate CI environments
```

- [ ] **Step 4: Run check-scenarios**

Run: `cd /home/zach/code/grove && make check-scenarios`
Expected: All scenarios pass.

- [ ] **Step 5: Commit**

```bash
jj new -m "feat: add latency assertions to stress tests (#49)"
```

---

## Workstream 2: Centralize Frontend Error Handling (#50)

### Task 2: Add centralized error callback to API client

**Files:**
- Modify: `web/src/api/client.ts`
- Create: `web/src/api/client.test.ts` (if not exists, otherwise modify)

The API client currently throws errors that each caller catches independently. We'll add a global `onApiError` callback that fires on every API error, giving a single place to hook error display. Individual callers can still catch for local handling.

- [ ] **Step 1: Write the failing test**

Create or modify `web/src/api/client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setOnApiError } from './client'

describe('API error callback', () => {
  // CLIENT-ERR-001
  it('calls onApiError when an API request fails', async () => {
    const handler = vi.fn()
    const cleanup = setOnApiError(handler)

    // Mock a failing fetch
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => 'validation failed',
    }))

    const { movePerson } = await import('./client')
    await expect(
      movePerson({ personId: 'a', newManagerId: 'b', newTeam: 'c' })
    ).rejects.toThrow('API 422')

    expect(handler).toHaveBeenCalledWith('API 422: validation failed')

    cleanup()
    vi.unstubAllGlobals()
  })

  it('does not call onApiError after cleanup', async () => {
    const handler = vi.fn()
    const cleanup = setOnApiError(handler)
    cleanup()

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'server error',
    }))

    const { movePerson } = await import('./client')
    await expect(
      movePerson({ personId: 'a', newManagerId: 'b', newTeam: 'c' })
    ).rejects.toThrow()

    expect(handler).not.toHaveBeenCalled()

    vi.unstubAllGlobals()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/zach/code/grove/web && npx vitest run src/api/client.test.ts`
Expected: FAIL — `setOnApiError` is not exported.

- [ ] **Step 3: Add the onApiError hook to client.ts**

In `web/src/api/client.ts`, add near the top (after the `loggingEnabled` block):

```typescript
let onApiError: ((message: string) => void) | null = null

/** Register a global callback for API errors. Returns a cleanup function. */
export function setOnApiError(handler: (message: string) => void): () => void {
  onApiError = handler
  return () => { if (onApiError === handler) onApiError = null }
}
```

Then modify the `json<T>` function to call it:

```typescript
async function json<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    const text = await resp.text()
    const msg = `API ${resp.status}: ${text}`
    onApiError?.(msg)
    throw new Error(msg)
  }
  return resp.json() as Promise<T>
}
```

And modify `jsonWithLog<T>` similarly — add `onApiError?.(...)` before the throw:

```typescript
  if (!resp.ok) {
    const text = await resp.text()
    postLogEntry({ /* existing */ })
    const msg = `API ${resp.status}: ${text}`
    onApiError?.(msg)
    throw new Error(msg)
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/zach/code/grove/web && npx vitest run src/api/client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
jj new -m "feat: add global onApiError callback to API client (#50)"
```

### Task 3: Wire onApiError to UIContext in OrgDataContext

**Files:**
- Modify: `web/src/store/OrgDataContext.tsx`
- Modify: `web/src/store/OrgDataContext.test.tsx` (if testing the wiring)

- [ ] **Step 1: Write the failing test**

In `web/src/store/OrgDataContext.test.tsx`, add a test that verifies API errors reach the error state (this may already be tested via existing integration tests; check first). If coverage already exists, skip to step 3.

- [ ] **Step 2: Wire setOnApiError in OrgDataContext**

In `web/src/store/OrgDataContext.tsx`, import and wire the callback:

```typescript
import { setOnApiError } from '../api/client'
```

Inside the `OrgDataProvider` component, add an effect that registers the callback:

```typescript
useEffect(() => {
  return setOnApiError((msg) => setError(msg))
}, [setError])
```

This ensures ALL API errors (including from hooks that catch locally like `useExport`) also propagate to the global error banner. The individual `try/catch` blocks in `useOrgMutations` will still fire `handleError` first (which is fine — it's the same `setError` call, and setting the same value twice is a no-op in React).

- [ ] **Step 3: Run existing tests**

Run: `cd /home/zach/code/grove/web && npx vitest run`
Expected: All tests pass. The new callback is additive — existing error handling still works.

- [ ] **Step 4: Commit**

```bash
jj new -m "feat: wire global API error callback to UIContext (#50)"
```

### Task 4: Remove silent error swallowing in initialization

**Files:**
- Modify: `web/src/store/OrgDataContext.tsx`

The init block in `OrgDataContext` silently swallows errors when loading autosave, org data, and snapshots. These should log a warning but not crash the app (the current behavior is correct for initialization), BUT now that we have the global `onApiError` callback, API-level failures will surface automatically. The only remaining issue is the `restoreAutosave` backend sync.

- [ ] **Step 1: Fix restoreAutosave to surface backend sync failure**

In `web/src/store/OrgDataContext.tsx`, find the `restoreAutosave` function. Change the `.catch` on `api.restoreState()` from `console.warn` to also set a non-blocking warning:

```typescript
api.restoreState(ad).catch(() => {
  console.warn('Failed to sync restored state to backend')
  // Don't setError — this is non-fatal. The data is displayed and mutations
  // will still work via the in-memory state. Server will pick up state on
  // next autosave cycle.
})
```

Actually — this is already correct behavior. The `restoreState` call syncs local state to the server, and if it fails, the next autosave (2s later) will retry. This is not a silent failure — it's graceful degradation. Leave it as-is.

- [ ] **Step 2: Audit and document the intentional silent catches**

Add comments to the init block explaining why each `catch {}` is intentional:

In the init `useEffect`, annotate each catch:

```typescript
// Autosave from localStorage — may be corrupted or missing, not an error
try { /* ... */ } catch { /* localStorage parse failure — expected on first run */ }

// Server autosave check — server may not have data yet, not an error
try { /* ... */ } catch { /* No server autosave — expected on fresh start */ }

// Initial org data load — no data means show upload prompt
try { /* ... */ } catch { /* No existing org — show upload prompt */ }

// Snapshot list — optional, UI works without it
try { /* ... */ } catch { /* Snapshots unavailable — non-fatal */ }
```

- [ ] **Step 3: Run tests**

Run: `cd /home/zach/code/grove/web && npx vitest run`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
jj new -m "docs: annotate intentional silent catches in OrgDataContext init (#50)"
```

### Task 5: Surface export errors to global error state

**Files:**
- Modify: `web/src/hooks/useExport.ts`
- Modify: `web/src/hooks/useExport.test.ts`

Currently `useExport` sets a local `exportError` state and also logs to `console.error`. With the global `onApiError` callback, API-level export failures already surface. But the `html-to-image` library failures (non-API) still only show locally. This is already correct — the export error banner in App.tsx displays `exportError`. No change needed here.

The `useSnapshotExport` partial failures (individual snapshots failing within a batch) only log to `console.warn`. These should aggregate into a single warning message.

**Files:**
- Modify: `web/src/hooks/useSnapshotExport.ts`
- Modify: `web/src/hooks/useSnapshotExport.test.ts` (if it exists)

- [ ] **Step 1: Write a test for partial export failure warning**

```typescript
// In useSnapshotExport.test.ts (create if needed)
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSnapshotExport } from './useSnapshotExport'

describe('useSnapshotExport', () => {
  it('returns warning when some snapshots fail', async () => {
    let callCount = 0
    const mockLoadSnapshot = vi.fn().mockImplementation(async () => {
      callCount++
      if (callCount === 2) throw new Error('load failed')
    })
    const mockSaveSnapshot = vi.fn()
    const mockDeleteSnapshot = vi.fn()

    const { result } = renderHook(() =>
      useSnapshotExport({
        snapshots: [],
        mainRef: { current: null },
        loadSnapshot: mockLoadSnapshot,
        saveSnapshot: mockSaveSnapshot,
        deleteSnapshot: mockDeleteSnapshot,
        showAllEmploymentTypes: vi.fn(),
        setHead: vi.fn(),
      })
    )

    // CSV export doesn't need mainRef or loadSnapshot for non-image formats
    // so this is testing the warning aggregation, not the full flow
    expect(result.current.exporting).toBe(false)
  })
})
```

This test is lightweight — the real validation is that the function returns `exportWarnings`. Let me reconsider — the snapshot export is deeply coupled to DOM and async state. Instead of unit-testing it, let's just add the warning aggregation and rely on e2e tests.

- [ ] **Step 2: Add warning aggregation to useSnapshotExport**

In `web/src/hooks/useSnapshotExport.ts`, collect warnings during export:

After `let successCount = 0`:
```typescript
const warnings: string[] = []
```

In the per-snapshot catch block, push to warnings:
```typescript
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  console.warn(`Snapshot export failed for "${entry.label}":`, err)
  warnings.push(`${entry.label}: ${msg}`)
}
```

Same for sidecar catches:
```typescript
} catch {
  console.warn('Failed to export pods sidecar')
  warnings.push('pods sidecar')
}
// ...
} catch {
  console.warn('Failed to export settings sidecar')
  warnings.push('settings sidecar')
}
```

Add `exportWarnings` to state:
```typescript
const [exportWarnings, setExportWarnings] = useState<string[]>([])
```

After the zip download, before finally:
```typescript
if (warnings.length > 0) {
  setExportWarnings(warnings)
}
```

Clear on new export start:
```typescript
setExportWarnings([])
```

Return it:
```typescript
return { exportAllSnapshots, exporting, progress, suppressAutosaveRef, exportWarnings, clearExportWarnings: () => setExportWarnings([]) }
```

- [ ] **Step 3: Display export warnings in App.tsx**

In `web/src/App.tsx`, destructure `exportWarnings` and `clearExportWarnings` from `useSnapshotExport`, and add a warning banner:

```typescript
const { exportAllSnapshots, exporting: snapshotExporting, progress: snapshotProgress, suppressAutosaveRef, exportWarnings, clearExportWarnings } = useSnapshotExport({ /* ... */ })
```

After the export error banner:
```typescript
{exportWarnings.length > 0 && (
  <div className={styles.warnBanner} role="alert">
    <span className={styles.warnText}>
      Some snapshots failed to export: {exportWarnings.join(', ')}
    </span>
    <button onClick={clearExportWarnings} className={styles.errorClose}>×</button>
  </div>
)}
```

- [ ] **Step 4: Run all frontend tests**

Run: `cd /home/zach/code/grove/web && npx vitest run`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
jj new -m "feat: surface partial snapshot export warnings to UI (#50)"
```

---

## Workstream 3: Reduce Frontend State Complexity (#51)

### Task 6: Migrate useOrg() consumers to granular hooks

**Files:**
- Modify: `web/src/views/TableView.tsx` — replace `useOrg()` with `useOrgData()` + `useSelection()`
- Modify: `web/src/views/ChartShell.tsx` — replace `useOrg()` with `useSelection()`
- Modify: `web/src/components/Toolbar.tsx` — replace `useOrg()` with `useOrgData()` + `useUI()`
- Modify: `web/src/components/SnapshotsDropdown.tsx` — replace `useOrg()` with `useOrgData()`
- Modify: `web/src/hooks/useDragDrop.ts` — replace `useOrg()` with `useOrgData()` + `useSelection()`
- Modify: `web/src/components/SettingsModal.tsx` — replace `useOrg()` with `useOrgData()`
- Modify: `web/src/components/EmploymentTypeFilter.tsx` — replace `useOrg()` with `useOrgData()` + `useUI()`
- Modify: `web/src/components/PodSidebar.tsx` — replace `useOrg()` with `useOrgData()` + `useSelection()`

NOT migrating (require cross-context setBinOpen or too many contexts):
- `App.tsx` — orchestrator, needs all three contexts
- `DetailSidebar.tsx` — already uses useUI() alongside useOrg()
- `RecycleBinDrawer.tsx` — needs `setBinOpen` cross-context behavior

- [ ] **Step 1: Migrate TableView.tsx**

Change:
```typescript
import { useOrg } from '../store/OrgContext'
```
To:
```typescript
import { useOrgData, useSelection } from '../store/OrgContext'
```

Change:
```typescript
const { update, remove, toggleSelect, selectedIds, clearSelection, working, add } = useOrg()
```
To:
```typescript
const { update, remove, working, add } = useOrgData()
const { toggleSelect, selectedIds, clearSelection } = useSelection()
```

- [ ] **Step 2: Migrate ChartShell.tsx**

Change import from `useOrg` to `useSelection`:
```typescript
import { useSelection } from '../store/OrgContext'
```

Change:
```typescript
const { selectedIds, batchSelect, selectPod } = useOrg()
```
To:
```typescript
const { selectedIds, batchSelect, selectPod } = useSelection()
```

- [ ] **Step 3: Migrate Toolbar.tsx**

Change import:
```typescript
import { useOrgData, useUI } from '../store/OrgContext'
```

Change the destructure:
```typescript
const { upload } = useOrgData()
const { loaded, viewMode, dataView, setViewMode, setDataView, reflow } = useUI()
```

- [ ] **Step 4: Migrate SnapshotsDropdown.tsx**

Change import:
```typescript
import { useOrgData } from '../store/OrgContext'
```

Change:
```typescript
const { snapshots, currentSnapshotName, saveSnapshot, loadSnapshot, deleteSnapshot } = useOrgData()
```

- [ ] **Step 5: Migrate useDragDrop.ts**

Change import:
```typescript
import { useOrgData, useSelection } from '../store/OrgContext'
```

Change:
```typescript
const { move, reparent, pods } = useOrgData()
const { selectedIds } = useSelection()
```

- [ ] **Step 6: Migrate SettingsModal.tsx, EmploymentTypeFilter.tsx, PodSidebar.tsx**

SettingsModal:
```typescript
import { useOrgData } from '../store/OrgContext'
const { working, settings, updateSettings } = useOrgData()
```

EmploymentTypeFilter:
```typescript
import { useOrgData, useUI } from '../store/OrgContext'
const { working } = useOrgData()
const { hiddenEmploymentTypes, toggleEmploymentTypeFilter, showAllEmploymentTypes, hideAllEmploymentTypes } = useUI()
```

PodSidebar:
```typescript
import { useOrgData, useSelection } from '../store/OrgContext'
const { pods, working, updatePod } = useOrgData()
const { selectedPodId, selectPod } = useSelection()
```

- [ ] **Step 7: Run all frontend tests**

Run: `cd /home/zach/code/grove/web && npx vitest run`
Expected: All tests pass. These are pure refactors — same data, different import path.

- [ ] **Step 8: Run e2e tests to verify no regressions**

Run: `cd /home/zach/code/grove && make e2e`
Expected: All e2e tests pass.

- [ ] **Step 9: Commit**

```bash
jj new -m "refactor: migrate 8 consumers from useOrg() to granular hooks (#51)"
```

### Task 7: Replace autosave suppression ref with explicit export state

**Files:**
- Modify: `web/src/hooks/useSnapshotExport.ts`
- Modify: `web/src/hooks/useAutosave.ts`
- Modify: `web/src/App.tsx`

The current pattern uses a mutable `useRef(false)` passed from `useSnapshotExport` → `App.tsx` → `useAutosave`. We'll replace it with a simple boolean state that `useAutosave` receives directly.

- [ ] **Step 1: Change useSnapshotExport to export exporting state (already exists)**

`useSnapshotExport` already exports `exporting` as a boolean state. The `suppressAutosaveRef` is redundant — we can just pass `exporting` to `useAutosave`.

Remove `suppressAutosaveRef` from `useSnapshotExport.ts`:

```typescript
// Remove this line:
const suppressAutosaveRef = useRef(false)

// Remove these lines from exportAllSnapshots:
suppressAutosaveRef.current = true  // (line 36)
suppressAutosaveRef.current = false  // (line 142)

// Remove from return:
return { exportAllSnapshots, exporting, progress }
```

- [ ] **Step 2: Change useAutosave to accept suppressAutosave boolean**

In `web/src/hooks/useAutosave.ts`, change the parameter:

```typescript
export function useAutosave(state: {
  original: Person[]
  working: Person[]
  recycled: Person[]
  pods: Pod[]
  originalPods: Pod[]
  settings: Settings
  currentSnapshotName: string | null
  loaded: boolean
  suppressAutosave?: boolean  // Changed from RefObject<boolean>
}) {
```

Change the guard check:
```typescript
if (!state.loaded || state.working.length === 0 || state.suppressAutosave) return
```

Add `state.suppressAutosave` to the effect dependency array:
```typescript
}, [state.original, state.working, state.recycled, state.pods, state.originalPods, state.settings, state.currentSnapshotName, state.loaded, state.suppressAutosave])
```

- [ ] **Step 3: Update App.tsx wiring**

In `web/src/App.tsx`:

Change the destructure:
```typescript
const { exportAllSnapshots, exporting: snapshotExporting, progress: snapshotProgress } = useSnapshotExport({ /* ... */ })
```

Change the useAutosave call:
```typescript
const { serverSaveError } = useAutosave({ original, working, recycled, pods, originalPods, settings, currentSnapshotName, loaded, suppressAutosave: snapshotExporting })
```

- [ ] **Step 4: Update useAutosave tests**

In `web/src/hooks/useAutosave.test.ts`, find any tests referencing `suppressAutosaveRef` and change to `suppressAutosave: true/false`.

- [ ] **Step 5: Run all tests**

Run: `cd /home/zach/code/grove/web && npx vitest run`
Expected: All tests pass.

- [ ] **Step 6: Run e2e tests**

Run: `cd /home/zach/code/grove && make e2e`
Expected: All e2e tests pass.

- [ ] **Step 7: Commit**

```bash
jj new -m "refactor: replace autosave suppression ref with boolean prop (#51)"
```

### Task 8: Add deprecation comment to useOrg()

**Files:**
- Modify: `web/src/store/OrgContext.tsx`

- [ ] **Step 1: Add deprecation JSDoc**

In `web/src/store/OrgContext.tsx`, add a deprecation notice to `useOrg()`:

```typescript
/**
 * @deprecated Use granular hooks instead: useOrgData(), useUI(), useSelection().
 * This mega-hook causes unnecessary re-renders — every property change triggers
 * all consumers. Only use in components that genuinely need all three contexts
 * (App.tsx, RecycleBinDrawer).
 */
export function useOrg(): OrgContextValue {
```

- [ ] **Step 2: Run lint to verify no issues**

Run: `cd /home/zach/code/grove/web && npx eslint src/ --max-warnings 0`
Expected: No warnings.

- [ ] **Step 3: Commit**

```bash
jj new -m "docs: deprecate useOrg() in favor of granular hooks (#51)"
```

---

## Final Verification

### Task 9: Full test suite

- [ ] **Step 1: Run Go tests with race detector**

Run: `cd /home/zach/code/grove && go test -race -count=1 ./...`
Expected: All pass.

- [ ] **Step 2: Run frontend tests**

Run: `cd /home/zach/code/grove/web && npx vitest run`
Expected: All pass.

- [ ] **Step 3: Run e2e tests**

Run: `cd /home/zach/code/grove && make e2e`
Expected: All pass.

- [ ] **Step 4: Run check-scenarios**

Run: `cd /home/zach/code/grove && make check-scenarios`
Expected: All pass.

- [ ] **Step 5: Run lint**

Run: `cd /home/zach/code/grove && make lint`
Expected: Clean.
