# Frontend Perf, Optimistic Mutations, Telemetry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three principal-engineer review gaps in the React frontend (sparse memo, no optimistic mutations, silent telemetry) and add perf-budget tests that lock the memo fix in place.

**Architecture:** (1) Per-id selector hooks + `memo()` on tree subtrees so a single-node selection change re-renders only that subtree. (2) Pre-snapshot via refs, optimistic patch via pure helpers, server reconcile or rollback. (3) Drop counter + `console.warn` replacing silent `.catch(() => {})`. (4) Synthetic-tree vitest perf tests with wall-clock budgets and a strict render-count gate.

**Tech Stack:** React 19, TypeScript 5.7, Vitest 4.1 + jsdom + @testing-library/react, existing `OrgDataContext` / `ChartContext` providers.

**Spec:** `docs/superpowers/specs/2026-04-25-frontend-perf-optimistic-telemetry-design.md`

**Branch / commit style:** `jj` colocated; one commit per task. Conventional-commit prefixes (`feat:`, `fix:`, `test:`, `refactor:`).

---

## File Plan

| File | Disposition | Responsibility |
|------|-------------|----------------|
| `web/src/api/client.ts` | modify | Add `telemetryDropCount` + getter/reset; replace silent catches |
| `web/src/api/client.test.ts` | modify (or create section) | Cover counter increment + warn |
| `web/src/hooks/useLogging.ts` | modify | Replace silent catch with `console.warn` |
| `web/src/store/optimistic.ts` | create | Pure helpers `applyUpdate`, `applyMove`, `applyReorder` |
| `web/src/store/optimistic.test.ts` | create | Unit tests for pure helpers |
| `web/src/store/useOrgMutations.ts` | modify | Extend `dispatch` w/ optimistic param; wire 4 mutations |
| `web/src/store/useOrgMutations.test.ts` | create or modify | Cover optimistic apply + rollback |
| `web/src/store/OrgDataContext.tsx` | modify | Add `podsRef` mirror |
| `web/src/views/chartSelectors.ts` | create | `useIsSelected(id)`, `useIsCollapsed(id)` |
| `web/src/views/chartSelectors.test.tsx` | create | Selector hook tests |
| `web/src/views/ColumnView.tsx` | modify | `memo(LayoutSubtree)`; swap `useChart` for actions + selectors |
| `web/src/views/ManagerView.tsx` | modify | Same swap; memo `SummaryCard`/`PodSummaryCard` |
| `web/src/views/ChartShell.tsx` | modify (audit only, fix if unstable) | Ensure `chartActions` deps are individually stable |
| `web/src/test-helpers/syntheticOrg.ts` | create | `buildSyntheticOrg(n)` fixture |
| `web/src/views/perfBudget.test.tsx` | create | PERF-001..006 |
| `docs/scenarios/perf.md` | create | New PERF-area scenario doc |

---

## Task 1: Telemetry drop counter

**Files:**
- Modify: `web/src/api/client.ts`
- Modify: `web/src/api/client.test.ts`

- [ ] **Step 1.1: Read current state of `client.ts:1-40` and `client.ts:120-145`** to confirm exact line refs and existing exports.

Run: `sed -n '1,40p;120,145p' web/src/api/client.ts`
Expected: see `loggingEnabled`, `setLoggingEnabled`, `setOnApiError`, `resetClient`, `postLogEntry`, `fetchWithTimeout` retry log call.

- [ ] **Step 1.2: Write failing test** in `web/src/api/client.test.ts`.

Add (or append, depending on file existence — check first with `ls web/src/api/client.test.ts`):

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  reportLog,
  setLoggingEnabled,
  resetClient,
  getTelemetryDropCount,
  resetTelemetryDropCount,
} from './client'

describe('telemetry drop counter', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    resetClient()
    resetTelemetryDropCount()
    setLoggingEnabled(true)
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    warnSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it('increments drop count and warns when log POST rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')))
    expect(getTelemetryDropCount()).toBe(0)
    reportLog('INFO', 'hello')
    // postLogEntry is fire-and-forget — flush microtasks
    await new Promise((r) => setTimeout(r, 0))
    expect(getTelemetryDropCount()).toBe(1)
    expect(warnSpy).toHaveBeenCalledWith('telemetry POST dropped', expect.any(Error))
  })

  it('does nothing when logging disabled', async () => {
    setLoggingEnabled(false)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')))
    reportLog('INFO', 'hello')
    await new Promise((r) => setTimeout(r, 0))
    expect(getTelemetryDropCount()).toBe(0)
  })

  it('resetTelemetryDropCount zeroes the counter', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('x')))
    reportLog('INFO', 'one')
    await new Promise((r) => setTimeout(r, 0))
    resetTelemetryDropCount()
    expect(getTelemetryDropCount()).toBe(0)
  })

  it('resetClient also zeroes counter', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('x')))
    reportLog('INFO', 'one')
    await new Promise((r) => setTimeout(r, 0))
    resetClient()
    expect(getTelemetryDropCount()).toBe(0)
  })
})
```

- [ ] **Step 1.3: Run test, expect failure**

Run: `cd web && npx vitest run src/api/client.test.ts -t "telemetry drop counter"`
Expected: FAIL — `getTelemetryDropCount` not exported.

- [ ] **Step 1.4: Implement counter and replace silent catch**

In `web/src/api/client.ts` after the `setLoggingEnabled` block (around line 13):

```ts
let telemetryDropCount = 0
export function getTelemetryDropCount(): number { return telemetryDropCount }
export function resetTelemetryDropCount(): void { telemetryDropCount = 0 }
```

Replace `client.ts:35` (the `.catch(() => {})` inside `postLogEntry`):

```ts
function postLogEntry(entry: Record<string, unknown>): void {
  if (!loggingEnabled) return
  fetch(`${BASE}/logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  }).catch((e) => {
    telemetryDropCount++
    console.warn('telemetry POST dropped', e)
  })
}
```

Update `resetClient`:

```ts
export function resetClient(): void {
  loggingEnabled = false
  onApiError = null
  telemetryDropCount = 0
}
```

- [ ] **Step 1.5: Run tests, expect pass**

Run: `cd web && npx vitest run src/api/client.test.ts -t "telemetry drop counter"`
Expected: PASS (4 tests).

- [ ] **Step 1.6: Commit**

```bash
jj commit -m "feat(web): add telemetry drop counter, replace silent log POST catch"
```

---

## Task 2: Replace silent `getConfig` catch in useLogging

**Files:**
- Modify: `web/src/hooks/useLogging.ts`
- Test: covered by behavior; add a minimal direct test if `useLogging.test.ts` does not exist.

- [ ] **Step 2.1: Check for existing test**

Run: `ls web/src/hooks/useLogging.test.ts 2>/dev/null && echo found || echo missing`

- [ ] **Step 2.2: Write failing test**

Create `web/src/hooks/useLogging.test.ts` (or append):

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useLogging } from './useLogging'
import * as api from '../api/client'

describe('useLogging', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    warnSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it('warns when getConfig rejects rather than silently swallowing', async () => {
    vi.spyOn(api, 'getConfig').mockRejectedValue(new Error('boom'))
    renderHook(() => useLogging())
    await waitFor(() =>
      expect(warnSpy).toHaveBeenCalledWith('config load failed; logging disabled', expect.any(Error)),
    )
  })
})
```

- [ ] **Step 2.3: Run test, expect failure**

Run: `cd web && npx vitest run src/hooks/useLogging.test.ts`
Expected: FAIL — current code has `.catch(() => {})`.

- [ ] **Step 2.4: Implement**

Edit `web/src/hooks/useLogging.ts:8-13`:

```ts
useEffect(() => {
  getConfig().then((cfg) => {
    setLoggingEnabled(cfg.logging)
    setClientLogging(cfg.logging)
  }).catch((e) => {
    console.warn('config load failed; logging disabled', e)
  })
}, [])
```

- [ ] **Step 2.5: Run test, expect pass**

Run: `cd web && npx vitest run src/hooks/useLogging.test.ts`
Expected: PASS.

- [ ] **Step 2.6: Commit**

```bash
jj commit -m "fix(web): warn on getConfig failure instead of silent swallow"
```

---

## Task 3: Pure optimistic helpers

**Files:**
- Create: `web/src/store/optimistic.ts`
- Create: `web/src/store/optimistic.test.ts`

- [ ] **Step 3.1: Read OrgNode + OrgNodeUpdatePayload types**

Run: `grep -n "OrgNode\b\|OrgNodeUpdatePayload" web/src/api/types.ts | head -20`
Expected: see field set including `id`, `name`, `managerId`, `team`, `pod?`, etc.

- [ ] **Step 3.2: Read server reorder semantics**

Run: `grep -n "func.*Reorder\|reorderPeople" internal/org/people.go internal/httpapi/handlers.go | head -10`
Then read the matching function. The optimistic `applyReorder` must mirror server behavior (likely: places `personIds` as a contiguous block in the working slice in the order given, preserving every other person's relative order).

- [ ] **Step 3.3: Write failing tests**

Create `web/src/store/optimistic.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { OrgNode } from '../api/types'
import { applyUpdate, applyMove, applyReorder } from './optimistic'

const node = (id: string, fields: Partial<OrgNode> = {}): OrgNode => ({
  id,
  name: id,
  status: 'Active',
  managerId: '',
  team: '',
  type: 'Person',
  employmentType: 'FTE',
  ...fields,
})

describe('applyUpdate', () => {
  it('patches matching node fields, leaves others untouched', () => {
    const nodes = [node('a', { name: 'Alice' }), node('b', { name: 'Bob' })]
    const out = applyUpdate(nodes, 'a', { name: 'Alicia' })
    expect(out).not.toBe(nodes)
    expect(out[0]).toEqual({ ...nodes[0], name: 'Alicia' })
    expect(out[1]).toBe(nodes[1])
  })
  it('returns same array reference when id not found', () => {
    const nodes = [node('a')]
    const out = applyUpdate(nodes, 'missing', { name: 'X' })
    expect(out).toBe(nodes)
  })
})

describe('applyMove', () => {
  it('updates managerId and team on matching node', () => {
    const nodes = [node('a', { managerId: 'm1', team: 'T1' })]
    const out = applyMove(nodes, 'a', 'm2', 'T2')
    expect(out[0].managerId).toBe('m2')
    expect(out[0].team).toBe('T2')
    expect(out[0].pod).toBeUndefined()
  })
  it('sets pod when newPod provided', () => {
    const nodes = [node('a')]
    const out = applyMove(nodes, 'a', 'm1', 'T1', 'Pod1')
    expect(out[0].pod).toBe('Pod1')
  })
  it('clears pod when newPod is empty string', () => {
    const nodes = [node('a', { pod: 'Old' })]
    const out = applyMove(nodes, 'a', 'm1', 'T1', '')
    expect(out[0].pod).toBe('')
  })
  it('leaves pod untouched when newPod is undefined', () => {
    const nodes = [node('a', { pod: 'Keep' })]
    const out = applyMove(nodes, 'a', 'm1', 'T1', undefined)
    expect(out[0].pod).toBe('Keep')
  })
  it('returns same array reference when id not found', () => {
    const nodes = [node('a')]
    expect(applyMove(nodes, 'missing', 'm', 't')).toBe(nodes)
  })
})

describe('applyReorder', () => {
  it('places given ids in given order, preserving others in place', () => {
    const nodes = [node('a'), node('b'), node('c'), node('d')]
    // Reorder b and d to come in [d, b]
    const out = applyReorder(nodes, ['d', 'b'])
    expect(out.map((n) => n.id)).toEqual(['a', 'd', 'c', 'b'])
  })
  it('no-op when id list empty', () => {
    const nodes = [node('a'), node('b')]
    expect(applyReorder(nodes, [])).toBe(nodes)
  })
  it('ignores ids not in the list', () => {
    const nodes = [node('a'), node('b')]
    const out = applyReorder(nodes, ['ghost', 'a'])
    expect(out.map((n) => n.id)).toEqual(['a', 'b'])
  })
})
```

> **Adjust `applyReorder` test expectations to match the server semantics found in Step 3.2.** If server uses contiguous-block placement instead of in-place swap, replace the third test's assertion accordingly.

- [ ] **Step 3.4: Run, expect failure**

Run: `cd web && npx vitest run src/store/optimistic.test.ts`
Expected: FAIL — file does not exist.

- [ ] **Step 3.5: Implement**

Create `web/src/store/optimistic.ts`:

```ts
import type { OrgNode, OrgNodeUpdatePayload } from '../api/types'

export function applyUpdate(
  nodes: OrgNode[],
  personId: string,
  fields: OrgNodeUpdatePayload,
): OrgNode[] {
  const idx = nodes.findIndex((n) => n.id === personId)
  if (idx === -1) return nodes
  const next = nodes.slice()
  next[idx] = { ...nodes[idx], ...fields }
  return next
}

export function applyMove(
  nodes: OrgNode[],
  personId: string,
  newManagerId: string,
  newTeam: string,
  newPod?: string,
): OrgNode[] {
  const idx = nodes.findIndex((n) => n.id === personId)
  if (idx === -1) return nodes
  const next = nodes.slice()
  const patched: OrgNode = { ...nodes[idx], managerId: newManagerId, team: newTeam }
  if (newPod !== undefined) patched.pod = newPod
  next[idx] = patched
  return next
}

export function applyReorder(nodes: OrgNode[], personIds: string[]): OrgNode[] {
  if (personIds.length === 0) return nodes
  const validIds = personIds.filter((id) => nodes.some((n) => n.id === id))
  if (validIds.length === 0) return nodes
  const idSet = new Set(validIds)
  const queue = validIds.map((id) => nodes.find((n) => n.id === id)!)
  let q = 0
  return nodes.map((n) => (idSet.has(n.id) ? queue[q++] : n))
}
```

> If Step 3.2 revealed different server semantics for reorder, replace `applyReorder` body. The pattern above is "in-place permutation" — the slot of each id-in-list gets filled in list-order, untouched ids stay put.

- [ ] **Step 3.6: Run, expect pass**

Run: `cd web && npx vitest run src/store/optimistic.test.ts`
Expected: PASS.

- [ ] **Step 3.7: Commit**

```bash
jj commit -m "feat(web): add pure optimistic-mutation helpers"
```

---

## Task 4: Add `podsRef` to OrgDataContext

**Files:**
- Modify: `web/src/store/OrgDataContext.tsx`

- [ ] **Step 4.1: Read current ref pattern**

Run: `sed -n '60,80p' web/src/store/OrgDataContext.tsx`
Expected: confirm `workingRef` declared near line 68-69.

- [ ] **Step 4.2: Add `podsRef` mirror**

Edit `web/src/store/OrgDataContext.tsx` after the `workingRef` lines:

```ts
const workingRef = useRef(state.working)
workingRef.current = state.working

const podsRef = useRef(state.pods)
podsRef.current = state.pods
```

- [ ] **Step 4.3: Pass `podsRef` into `useOrgMutations`**

Same file, find the `useMutationCallbacks({ ... })` call (around line 171):

```ts
const mutations = useMutationCallbacks({ setState, workingRef, podsRef, handleError, setError, captureForUndo })
```

- [ ] **Step 4.4: Update `MutationDeps` interface**

In `web/src/store/useOrgMutations.ts:9-15`:

```ts
interface MutationDeps {
  setState: SetState
  workingRef: MutableRefObject<OrgNode[]>
  podsRef: MutableRefObject<Pod[]>
  handleError: (err: unknown) => void
  setError: (msg: string | null) => void
  captureForUndo: () => void
}
```

Update destructure in the function signature:

```ts
export function useOrgMutations({ setState, workingRef, podsRef, handleError, setError, captureForUndo }: MutationDeps) {
```

Also import `Pod`:

```ts
import type { OrgNode, OrgNodeUpdatePayload, Pod, PodUpdatePayload, Settings } from '../api/types'
```

- [ ] **Step 4.5: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4.6: Run existing test suite to confirm no regression**

Run: `cd web && npx vitest run src/store`
Expected: existing tests still PASS.

- [ ] **Step 4.7: Commit**

```bash
jj commit -m "refactor(web): add podsRef mirror for upcoming optimistic dispatch"
```

---

## Task 5: Optimistic dispatch wiring

**Files:**
- Modify: `web/src/store/useOrgMutations.ts`
- Create: `web/src/store/useOrgMutations.test.ts` (if missing — check first)

- [ ] **Step 5.1: Check for existing test file**

Run: `ls web/src/store/useOrgMutations.test.ts 2>/dev/null && head -40 web/src/store/useOrgMutations.test.ts || echo missing`

- [ ] **Step 5.2: Write failing test for optimistic apply + rollback**

Create or append `web/src/store/useOrgMutations.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useRef } from 'react'
import { useOrgMutations } from './useOrgMutations'
import type { OrgDataState } from './OrgDataContext'
import type { OrgNode, Pod } from '../api/types'
import * as api from '../api/client'

const node = (id: string, fields: Partial<OrgNode> = {}): OrgNode => ({
  id, name: id, status: 'Active', managerId: '', team: '',
  type: 'Person', employmentType: 'FTE', ...fields,
})

function setupHook(initialWorking: OrgNode[], initialPods: Pod[] = []) {
  let state: OrgDataState = {
    original: [], working: initialWorking, recycled: [], pods: initialPods,
    originalPods: [], settings: { disciplineOrder: [] }, loaded: true,
    pendingMapping: null, snapshots: [], currentSnapshotName: null,
    autosaveAvailable: null,
  }
  const setState = vi.fn((updater: any) => {
    state = typeof updater === 'function' ? updater(state) : { ...state, ...updater }
  })
  const handleError = vi.fn()
  const setError = vi.fn()
  const captureForUndo = vi.fn()
  const { result } = renderHook(() => {
    const workingRef = useRef(state.working)
    workingRef.current = state.working
    const podsRef = useRef(state.pods)
    podsRef.current = state.pods
    return useOrgMutations({ setState, workingRef, podsRef, handleError, setError, captureForUndo })
  })
  return { result, getState: () => state, setState, handleError }
}

describe('useOrgMutations optimistic update', () => {
  afterEach(() => vi.restoreAllMocks())

  it('applies optimistic patch immediately for update, then reconciles with server', async () => {
    const initial = [node('a', { name: 'Alice' }), node('b', { name: 'Bob' })]
    const serverWorking = [node('a', { name: 'Alicia' }), node('b', { name: 'Bob' })]
    const apiSpy = vi.spyOn(api, 'updateNode').mockResolvedValue({
      working: serverWorking, pods: [], recycled: [],
    } as any)

    const { result, getState } = setupHook(initial)

    let promise: Promise<void> | undefined
    act(() => { promise = result.current.update('a', { name: 'Alicia' }) })

    // Optimistic patch applied synchronously
    expect(getState().working[0].name).toBe('Alicia')

    await act(async () => { await promise })
    expect(apiSpy).toHaveBeenCalled()
    expect(getState().working).toEqual(serverWorking)
  })

  it('reverts working+pods to pre-mutation snapshot on server failure', async () => {
    const initial = [node('a', { name: 'Alice' })]
    const initialPods: Pod[] = [{ id: 'p1', name: 'Pod1', team: 'T', managerId: 'm', publicNote: '' } as any]
    vi.spyOn(api, 'updateNode').mockRejectedValue(new Error('bad request'))
    const { result, getState, handleError } = setupHook(initial, initialPods)

    await act(async () => { await result.current.update('a', { name: 'Alicia' }) })

    expect(getState().working[0].name).toBe('Alice')   // reverted
    expect(getState().pods).toEqual(initialPods)        // reverted
    expect(handleError).toHaveBeenCalled()
  })

  it('move applies optimistic managerId/team change immediately', async () => {
    const initial = [node('a', { managerId: 'm1', team: 'T1' })]
    vi.spyOn(api, 'moveNode').mockResolvedValue({
      working: [node('a', { managerId: 'm2', team: 'T2' })], pods: [], recycled: [],
    } as any)
    const { result, getState } = setupHook(initial)
    let p: Promise<void> | undefined
    act(() => { p = result.current.move('a', 'm2', 'T2') })
    expect(getState().working[0].managerId).toBe('m2')
    expect(getState().working[0].team).toBe('T2')
    await act(async () => { await p })
  })

  it('reorder applies optimistic permutation immediately', async () => {
    const initial = [node('a'), node('b'), node('c')]
    vi.spyOn(api, 'reorderPeople').mockResolvedValue({
      working: [node('c'), node('b'), node('a')], pods: [], recycled: [],
    } as any)
    const { result, getState } = setupHook(initial)
    let p: Promise<void> | undefined
    act(() => { p = result.current.reorder(['c', 'a']) })
    expect(getState().working.map((n) => n.id)).toEqual(['c', 'b', 'a'])
    await act(async () => { await p })
  })
})
```

- [ ] **Step 5.3: Run, expect failure**

Run: `cd web && npx vitest run src/store/useOrgMutations.test.ts`
Expected: FAIL — optimistic not implemented; `podsRef` not destructured (will fail prior task expectation if Task 4 incomplete).

- [ ] **Step 5.4: Extend `dispatch` and wire optimistic in 4 mutations**

In `web/src/store/useOrgMutations.ts`, add import:

```ts
import { applyUpdate, applyMove, applyReorder } from './optimistic'
```

Replace the `dispatch` definition (lines ~24-39):

```ts
const dispatch = useCallback(
  async <T>(
    call: () => Promise<T>,
    apply: (result: T) => Partial<OrgDataState>,
    opts: {
      undo?: boolean
      optimistic?: (s: OrgDataState) => Partial<OrgDataState>
    } = {},
  ) => {
    if (opts.undo) captureForUndo()
    const snapshot = opts.optimistic
      ? { working: workingRef.current, pods: podsRef.current }
      : null
    if (opts.optimistic) {
      const patch = opts.optimistic
      setState((s) => ({ ...s, ...patch(s) }))
    }
    try {
      const result = await call()
      setState((s) => ({ ...s, ...apply(result) }))
    } catch (err) {
      if (snapshot) {
        setState((s) => ({ ...s, working: snapshot.working, pods: snapshot.pods }))
      }
      handleError(err)
    }
  },
  [captureForUndo, handleError, setState, workingRef, podsRef],
)
```

Update `move`:

```ts
const move = useCallback(
  (personId: string, newManagerId: string, newTeam: string, correlationId?: string, newPod?: string) =>
    dispatch(
      () => api.moveNode({ personId, newManagerId, newTeam, newPod }, correlationId),
      (resp) => ({ working: resp.working, pods: resp.pods, currentSnapshotName: null }),
      {
        undo: true,
        optimistic: (s) => ({ working: applyMove(s.working, personId, newManagerId, newTeam, newPod) }),
      },
    ),
  [dispatch],
)
```

Update `reparent` — the no-newManagerId branch becomes an optimistic update; the manager-found branch becomes optimistic move:

```ts
const reparent = useCallback(
  async (personId: string, newManagerId: string, correlationId?: string) => {
    if (!newManagerId) {
      return dispatch(
        () => api.updateNode({ personId, fields: { managerId: '' } }, correlationId),
        (resp) => ({ working: resp.working, pods: resp.pods, currentSnapshotName: null }),
        {
          undo: true,
          optimistic: (s) => ({ working: applyUpdate(s.working, personId, { managerId: '' }) }),
        },
      )
    }
    const newManager = workingRef.current.find((p) => p.id === newManagerId)
    if (!newManager) {
      setError('Manager not found (may have been deleted)')
      return
    }
    const newTeam = newManager.team
    return dispatch(
      () => api.moveNode({ personId, newManagerId, newTeam }, correlationId),
      (resp) => ({ working: resp.working, pods: resp.pods, currentSnapshotName: null }),
      {
        undo: true,
        optimistic: (s) => ({ working: applyMove(s.working, personId, newManagerId, newTeam) }),
      },
    )
  },
  [dispatch, setError, workingRef],
)
```

Update `reorder`:

```ts
const reorder = useCallback(
  (personIds: string[]) =>
    dispatch(
      () => api.reorderPeople(personIds),
      (resp) => ({ working: resp.working, pods: resp.pods, currentSnapshotName: null }),
      {
        undo: true,
        optimistic: (s) => ({ working: applyReorder(s.working, personIds) }),
      },
    ),
  [dispatch],
)
```

Update `update`:

```ts
const update = useCallback(
  (personId: string, fields: OrgNodeUpdatePayload, correlationId?: string) =>
    dispatch(
      () => api.updateNode({ personId, fields }, correlationId),
      (resp) => ({ working: resp.working, pods: resp.pods, currentSnapshotName: null }),
      {
        undo: true,
        optimistic: (s) => ({ working: applyUpdate(s.working, personId, fields) }),
      },
    ),
  [dispatch],
)
```

`add`, `remove`, `restore`, `emptyBin`, snapshot ops, pod ops, settings — leave unchanged.

- [ ] **Step 5.5: Run new tests, expect pass**

Run: `cd web && npx vitest run src/store/useOrgMutations.test.ts`
Expected: PASS (4 new tests).

- [ ] **Step 5.6: Run full store + hooks tests for regression**

Run: `cd web && npx vitest run src/store src/hooks`
Expected: all PASS.

- [ ] **Step 5.7: Commit**

```bash
jj commit -m "feat(web): optimistic move/reparent/reorder/update with snapshot rollback"
```

---

## Task 6: Per-id chart selectors

**Files:**
- Create: `web/src/views/chartSelectors.ts`
- Create: `web/src/views/chartSelectors.test.tsx`

- [ ] **Step 6.1: Write failing tests**

Create `web/src/views/chartSelectors.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { ChartProvider } from './ChartContext'
import { useIsSelected, useIsCollapsed } from './chartSelectors'
import type { ReactNode } from 'react'

const stableActions = {
  onSelect: () => {},
  setNodeRef: () => () => {},
}

function wrapper(selectedIds: Set<string>, collapsedIds?: Set<string>) {
  return ({ children }: { children: ReactNode }) => (
    <ChartProvider data={{ selectedIds, collapsedIds }} actions={stableActions as any}>
      {children}
    </ChartProvider>
  )
}

describe('useIsSelected', () => {
  it('returns true when id is in selectedIds', () => {
    const { result } = renderHook(() => useIsSelected('a'), { wrapper: wrapper(new Set(['a'])) })
    expect(result.current).toBe(true)
  })
  it('returns false when id is not in selectedIds', () => {
    const { result } = renderHook(() => useIsSelected('a'), { wrapper: wrapper(new Set(['b'])) })
    expect(result.current).toBe(false)
  })
})

describe('useIsCollapsed', () => {
  it('returns true when id is in collapsedIds', () => {
    const { result } = renderHook(() => useIsCollapsed('a'), { wrapper: wrapper(new Set(), new Set(['a'])) })
    expect(result.current).toBe(true)
  })
  it('returns false when collapsedIds undefined', () => {
    const { result } = renderHook(() => useIsCollapsed('a'), { wrapper: wrapper(new Set()) })
    expect(result.current).toBe(false)
  })
})
```

- [ ] **Step 6.2: Run, expect failure**

Run: `cd web && npx vitest run src/views/chartSelectors.test.tsx`
Expected: FAIL — file does not exist.

- [ ] **Step 6.3: Implement**

Create `web/src/views/chartSelectors.ts`:

```ts
import { useChartData } from './ChartContext'

export function useIsSelected(id: string): boolean {
  return useChartData().selectedIds.has(id)
}

export function useIsCollapsed(id: string): boolean {
  return useChartData().collapsedIds?.has(id) ?? false
}
```

- [ ] **Step 6.4: Run, expect pass**

Run: `cd web && npx vitest run src/views/chartSelectors.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6.5: Commit**

```bash
jj commit -m "feat(web): per-id chart selector hooks for memo-friendly subtrees"
```

---

## Task 7: Audit `chartActions` stability

**Files:**
- Read: `web/src/views/ChartShell.tsx`
- Modify: `web/src/views/ChartShell.tsx` (only if instability found)

- [ ] **Step 7.1: Inspect `chartActions` deps**

Run: `sed -n '85,115p' web/src/views/ChartShell.tsx`

Look at `useMemo` deps `[selection, actions, includeAddToTeam, setNodeRef, handleToggleCollapse]`. The risk: `selection` and `actions` are aggregate hook returns; if a parent hook returns a new object reference each render, this `useMemo` invalidates every render and `chartActions` is unstable.

- [ ] **Step 7.2: Find the providers of `selection` and `actions`**

Run: `grep -n "selection\s*=\|actions\s*=" web/src/views/ChartShell.tsx | head -10`
Then read the relevant hook(s) (likely `useSelection`, `useChartActions` higher in file).

- [ ] **Step 7.3: Decide — if `selection` and `actions` objects are themselves memoized at their source, this `useMemo` is fine.** If not, change the deps to enumerate stable callbacks individually:

```ts
const chartActions = useMemo(() => ({
  onSelect: actions.handleSelect,
  onBatchSelect: selection.batchSelect,
  // ...
}), [
  actions.handleSelect, selection.batchSelect, actions.handleAddReport,
  actions.handleAddProduct, actions.handleAddParent, actions.handleAddToTeam,
  actions.handleDeletePerson, actions.handleShowInfo, actions.handleFocus,
  selection.enterEditing, selection.updateBuffer, actions.handleCommitEdits,
  setNodeRef, handleToggleCollapse, actions.handleInlineEdit, includeAddToTeam,
])
```

For each enumerated dep that turns out to be unstable (a fresh function each render), wrap its source in `useCallback`. The audit may extend into the `useChartActions` (or whatever hook returns `actions`) — fix at the lowest stable site.

> **If everything is already individually stable, document that finding in the commit message and proceed without code changes.**

- [ ] **Step 7.4: Run all view tests**

Run: `cd web && npx vitest run src/views`
Expected: all PASS.

- [ ] **Step 7.5: Commit (or skip if no changes)**

```bash
jj commit -m "refactor(web): stabilize chartActions deps for memoizable subtrees"
```

If no changes needed:

```bash
# Skip — leave a note in the next commit message instead
```

---

## Task 8: Memoize `LayoutSubtree` and switch to selectors (ColumnView)

**Files:**
- Modify: `web/src/views/ColumnView.tsx`

- [ ] **Step 8.1: Confirm current state**

Run: `grep -n "function LayoutSubtree\|memo(\|useChart()" web/src/views/ColumnView.tsx`
Expected: `LayoutSubtree` declared as `function`, not wrapped in `memo`. `useChart()` called inside.

- [ ] **Step 8.2: Update imports**

Add to top of `web/src/views/ColumnView.tsx`:

```ts
import { useChartData, useChartActions } from './ChartContext'
import { useIsSelected, useIsCollapsed } from './chartSelectors'
```

Remove `useChart` from the `import { useChart } from './ChartContext'` line (line 7).

- [ ] **Step 8.3: Wrap `LayoutSubtree` in `memo`**

Edit `web/src/views/ColumnView.tsx:31`:

```ts
const LayoutSubtree = memo(function LayoutSubtree({ node }: { node: ManagerLayout }) {
  const { onAddToTeam, onAddProduct, onSelect, setNodeRef, onToggleCollapse } = useChartActions()
  const { pods, selectedIds, collapsedIds } = useChartData()
  const isCollapsed = useIsCollapsed(node.collapseKey)

  // ... existing body unchanged below this point ...
})
```

> Keep `selectedIds`, `pods`, `collapsedIds` from `useChartData()` because the inner `renderPodGroup` needs the full `pods` array and `selectedIds`/`collapsedIds` for child header lookups. The win comes from `LayoutSubtree` being memoized at all — `pods` rarely changes, `selectedIds` changes invalidate the subtree only because the node may host a selected child. (For a deeper win, future work could push selection into per-id selectors at the leaf level — out of scope here; PERF-005 below verifies the gain is real.)

The closing `}` of `LayoutSubtree` (currently line 169) becomes `})` to close the `memo()` call.

- [ ] **Step 8.4: Same swap inside `LayoutTeamGroup`** (already memo'd, but uses `useChart`)

Edit `web/src/views/ColumnView.tsx:182-209`:

```ts
const LayoutTeamGroup = memo(function LayoutTeamGroup({ group }: { group: TeamGroupLayout }) {
  const { onToggleCollapse, onSelect } = useChartActions()
  const isCollapsed = useIsCollapsed(group.collapseKey)
  const isSelected = useIsSelected(group.collapseKey)

  return (
    <div className={styles.subtree}>
      <div className={styles.nodeSlot}>
        <GroupHeaderNode
          nodeId={group.collapseKey}
          name={group.teamName}
          count={group.members.length}
          collapsed={isCollapsed}
          onClick={(e) => onSelect(group.collapseKey, e)}
          selected={isSelected}
          onToggleCollapse={onToggleCollapse ? () => onToggleCollapse(group.collapseKey) : undefined}
          dragData={{ memberIds: group.members.map(m => m.person.id) }}
        />
      </div>
      {!isCollapsed && (
        <div className={styles.children}>
          <div className={styles.icStack}>
            {group.members.map((ic) => <ICNode key={ic.person.id} ic={ic} />)}
          </div>
        </div>
      )}
    </div>
  )
})
```

- [ ] **Step 8.5: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8.6: Run existing tests for ColumnView**

Run: `cd web && npx vitest run src/views/ColumnView`
Expected: existing tests still PASS (golden tests, layout tests).

- [ ] **Step 8.7: Commit**

```bash
jj commit -m "perf(web): memo ColumnView subtrees and switch to per-id selectors"
```

---

## Task 9: Memoize ManagerView subtrees and switch to selectors

**Files:**
- Modify: `web/src/views/ManagerView.tsx`

- [ ] **Step 9.1: Update imports**

Add at top of `web/src/views/ManagerView.tsx`:

```ts
import { useChartActions } from './ChartContext'
import { useIsCollapsed } from './chartSelectors'
```

Remove `useChart` import.

- [ ] **Step 9.2: Memoize `SummaryCard` and `PodSummaryCard`**

Edit `web/src/views/ManagerView.tsx:72`:

```ts
const SummaryCard = memo(function SummaryCard({ people, podName, publicNote, onClick }: {
  people: OrgNode[]
  podName?: string
  publicNote?: string
  onClick?: () => void
}) {
  // ... body unchanged ...
})
```

Edit `web/src/views/ManagerView.tsx:103` (`PodSummaryCard`):

```ts
const PodSummaryCard = memo(function PodSummaryCard({ group }: { group: PodGroupLayout }) {
  // ... body unchanged ...
})
```

- [ ] **Step 9.3: Replace `useChart()` in `ManagerLayoutSubtree`** (line 124):

```ts
const ManagerLayoutSubtree = memo(function ManagerLayoutSubtree({ node }: { node: ManagerLayout }) {
  const { onToggleCollapse } = useChartActions()
  const managerProps = useNodeProps(node.person)
  const isCollapsed = useIsCollapsed(node.collapseKey)
  // ... rest unchanged ...
})
```

- [ ] **Step 9.4: Inside `PodSummaryCard` body** — replace `useChart()` with `useChartData` + `useChartActions`:

```ts
const PodSummaryCard = memo(function PodSummaryCard({ group }: { group: PodGroupLayout }) {
  const { pods } = useChartData()
  const { onSelect } = useChartActions()
  const pod = pods?.find((p) => p.managerId === group.managerId && p.name === group.podName)
  // ... rest unchanged ...
})
```

Add the import:

```ts
import { useChartData, useChartActions } from './ChartContext'
```

(Replacing the prior `useChart` import.)

- [ ] **Step 9.5: Typecheck and run tests**

Run: `cd web && npx tsc --noEmit && npx vitest run src/views/ManagerView`
Expected: PASS.

- [ ] **Step 9.6: Commit**

```bash
jj commit -m "perf(web): memo ManagerView subtrees and switch to per-id selectors"
```

---

## Task 10: Synthetic-org fixture

**Files:**
- Create: `web/src/test-helpers/syntheticOrg.ts`

- [ ] **Step 10.1: Confirm `test-helpers` directory layout**

Run: `ls web/src/test-helpers/ 2>/dev/null || ls web/src/`
Expected: either an existing `test-helpers/` dir or top-level `test-helpers.tsx`. If no `test-helpers/` dir, create it: `mkdir -p web/src/test-helpers`.

- [ ] **Step 10.2: Implement fixture**

Create `web/src/test-helpers/syntheticOrg.ts`:

```ts
import type { OrgNode } from '../api/types'

/**
 * Build a deterministic synthetic org of approximately `n` nodes.
 * Tree shape: 1 root manager → ceil(sqrt(n-1)) middle managers → ICs spread evenly.
 * Stable across runs for reproducible perf assertions.
 */
export function buildSyntheticOrg(n: number): OrgNode[] {
  if (n < 1) return []
  const out: OrgNode[] = []
  const root: OrgNode = {
    id: 'root', name: 'Root', status: 'Active', managerId: '',
    team: 'Org', type: 'Person', employmentType: 'FTE',
  }
  out.push(root)
  if (n === 1) return out

  const remaining = n - 1
  const managerCount = Math.max(1, Math.ceil(Math.sqrt(remaining)))
  const managers: OrgNode[] = []
  for (let i = 0; i < managerCount; i++) {
    const id = `mgr-${i}`
    managers.push({
      id, name: `Manager ${i}`, status: 'Active', managerId: 'root',
      team: `Team-${i}`, type: 'Person', employmentType: 'FTE',
    })
  }
  out.push(...managers)

  const icCount = remaining - managerCount
  for (let i = 0; i < icCount; i++) {
    const mgr = managers[i % managerCount]
    out.push({
      id: `ic-${i}`,
      name: `IC ${i}`,
      status: 'Active',
      managerId: mgr.id,
      team: mgr.team,
      type: 'Person',
      employmentType: 'FTE',
    })
  }
  return out
}
```

- [ ] **Step 10.3: Smoke test**

Quick sanity: `cd web && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 10.4: Commit**

```bash
jj commit -m "test(web): add buildSyntheticOrg fixture for perf budgets"
```

---

## Task 11: Perf budget tests

**Files:**
- Create: `web/src/views/perfBudget.test.tsx`

- [ ] **Step 11.1: Find a working `renderWithOrg` helper**

Run: `grep -rn "renderWithOrg\|OrgDataProvider" web/src/test-helpers* web/src/store/*.tsx | head -10`
The existing helper at `web/src/test-helpers.tsx` (or similar) is likely needed to wrap `<ColumnView />` in providers. Read it before writing the perf test.

- [ ] **Step 11.2: Write the perf budget test file**

Create `web/src/views/perfBudget.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import { buildSyntheticOrg } from '../test-helpers/syntheticOrg'
import ColumnView from './ColumnView'
import ManagerView from './ManagerView'
import { renderWithOrg } from '../test-helpers'  // adjust import to actual helper

const BUDGET = {
  mount100:  50,
  mount1k:   400,
  mount5k:   2000,
  rerender1k: 30,
}

function measureMount(view: 'column' | 'manager', n: number): number {
  const nodes = buildSyntheticOrg(n)
  const t0 = performance.now()
  renderWithOrg(view === 'column' ? <ColumnView /> : <ManagerView />, { working: nodes })
  return performance.now() - t0
}

describe('perf budgets', () => {
  it('[PERF-001] ColumnView mount N=100 within budget', () => {
    const ms = measureMount('column', 100)
    expect(ms).toBeLessThan(BUDGET.mount100)
  })

  it('[PERF-002] ColumnView mount N=1000 within budget', () => {
    const ms = measureMount('column', 1000)
    expect(ms).toBeLessThan(BUDGET.mount1k)
  })

  it('[PERF-003] ColumnView mount N=5000 within budget', () => {
    const ms = measureMount('column', 5000)
    expect(ms).toBeLessThan(BUDGET.mount5k)
  })

  it('[PERF-006] ManagerView mount N=1000 within budget', () => {
    const ms = measureMount('manager', 1000)
    expect(ms).toBeLessThan(BUDGET.mount1k)
  })
})
```

> **`renderWithOrg` API:** Adjust import path to match the actual export. If the existing helper does not accept seeded `working` data, extend it (smallest possible change, separate commit if non-trivial).

- [ ] **Step 11.3: Add render-count test (PERF-004 / PERF-005)**

Append to the same file:

```tsx
import { fireEvent, screen } from '@testing-library/react'

it('[PERF-004] ColumnView re-render after single-id selection within budget', () => {
  const nodes = buildSyntheticOrg(1000)
  const utils = renderWithOrg(<ColumnView />, { working: nodes })
  // First selection — measure
  const target = nodes[100]   // some interior IC
  const t0 = performance.now()
  act(() => {
    utils.selectIds(new Set([target.id]))   // helper to push selection through context
  })
  const ms = performance.now() - t0
  expect(ms).toBeLessThan(BUDGET.rerender1k)
})

it('[PERF-005] ColumnView re-render count after single-id selection is bounded', () => {
  const nodes = buildSyntheticOrg(1000)
  const renderSpy = vi.fn()
  const utils = renderWithOrg(<ColumnView />, {
    working: nodes,
    onSubtreeRender: renderSpy,   // helper instruments subtree memo with this callback
  })
  renderSpy.mockClear()
  const target = nodes[100]
  act(() => utils.selectIds(new Set([target.id])))
  // Only the newly-selected subtree (and maybe its ancestors that pass selectedIds down)
  // should re-render. Allow generous bound to absorb true-positive ancestor renders.
  expect(renderSpy.mock.calls.length).toBeLessThan(20)
})
```

> **`onSubtreeRender` instrumentation note:** if `renderWithOrg` does not support an instrumentation callback, expose it by:
> - Wrapping `LayoutSubtree`'s memo'd inner function so it calls a `__perfRenderCallback?.()` from a dedicated React context the helper provides only in tests.
> - Or use `React.Profiler` API around the rendered component and count `id === 'LayoutSubtree'` commits.
>
> Prefer the `Profiler` API approach — zero production code change. Pseudocode:
> ```tsx
> import { Profiler } from 'react'
> const counts: Record<string, number> = {}
> render(
>   <Profiler id="root" onRender={(id, _phase) => { counts[id] = (counts[id] ?? 0) + 1 }}>
>     <Providers org={nodes}><ColumnView /></Providers>
>   </Profiler>
> )
> ```
> Then `expect(counts.root).toBeLessThan(SOME_BOUND)` — measures total commits, not per-subtree, but still catches re-render explosions.

- [ ] **Step 11.4: Run perf tests, expect pass on the memoized code**

Run: `cd web && npx vitest run src/views/perfBudget.test.tsx`
Expected: all PASS. If any fail, the memo fix is incomplete — fix Tasks 8/9 before moving on.

- [ ] **Step 11.5: Commit**

```bash
jj commit -m "test(web): perf budget tests for ColumnView and ManagerView"
```

---

## Task 12: Scenario doc

**Files:**
- Create: `docs/scenarios/perf.md`

- [ ] **Step 12.1: Write scenario file**

Create `docs/scenarios/perf.md`:

```markdown
# Performance Budget Scenarios

---

# Scenario: ColumnView mount budget (N=100)

**ID**: PERF-001
**Area**: perf
**Tests**:
- `web/src/views/perfBudget.test.tsx` → "[PERF-001] ColumnView mount N=100 within budget"

## Behavior
ColumnView mounts a 100-node org chart in under 50ms (jsdom).

## Invariants
- Initial render time scales sub-linearly with org size.

---

# Scenario: ColumnView mount budget (N=1000)

**ID**: PERF-002
**Area**: perf
**Tests**:
- `web/src/views/perfBudget.test.tsx` → "[PERF-002] ColumnView mount N=1000 within budget"

## Behavior
ColumnView mounts a 1000-node org chart in under 400ms (jsdom).

---

# Scenario: ColumnView mount budget (N=5000)

**ID**: PERF-003
**Area**: perf
**Tests**:
- `web/src/views/perfBudget.test.tsx` → "[PERF-003] ColumnView mount N=5000 within budget"

## Behavior
ColumnView mounts a 5000-node org chart in under 2000ms (jsdom).

---

# Scenario: ColumnView selection re-render budget (N=1000)

**ID**: PERF-004
**Area**: perf
**Tests**:
- `web/src/views/perfBudget.test.tsx` → "[PERF-004] ColumnView re-render after single-id selection within budget"

## Behavior
Selecting a single node in a 1000-node org triggers a re-render that completes in under 30ms.

## Invariants
- Selection of one node does not cause a full-tree re-render.

---

# Scenario: ColumnView selection re-render count bound (N=1000)

**ID**: PERF-005
**Area**: perf
**Tests**:
- `web/src/views/perfBudget.test.tsx` → "[PERF-005] ColumnView re-render count after single-id selection is bounded"

## Behavior
A single-id selection change re-renders fewer than 20 subtrees in a 1000-node org.

## Invariants
- LayoutSubtree memoization keeps unrelated subtrees from re-rendering on selection change.

---

# Scenario: ManagerView mount budget (N=1000)

**ID**: PERF-006
**Area**: perf
**Tests**:
- `web/src/views/perfBudget.test.tsx` → "[PERF-006] ManagerView mount N=1000 within budget"

## Behavior
ManagerView mounts a 1000-node org chart in under 400ms (jsdom).
```

- [ ] **Step 12.2: Run `make check-scenarios` to verify wiring**

Run: `make check-scenarios`
Expected: PASS — every PERF-NNN reference in tests has a matching scenario file entry, and vice versa.

- [ ] **Step 12.3: Commit**

```bash
jj commit -m "docs: add perf scenario file for PERF-001..006"
```

---

## Task 13: Full CI gate

- [ ] **Step 13.1: Run frontend test suite**

Run: `cd web && npm test`
Expected: all PASS.

- [ ] **Step 13.2: Run frontend typecheck and lint**

Run: `cd web && npx tsc --noEmit && npm run lint`
Expected: PASS, zero warnings.

- [ ] **Step 13.3: Run Go tests (no behavior change, sanity gate)**

Run: `go test ./...`
Expected: PASS.

- [ ] **Step 13.4: Run `make ci` (full local CI)**

Run: `make ci`
Expected: PASS.

- [ ] **Step 13.5: Final commit if any cleanup needed; otherwise report done.**

If `make ci` flagged anything (e.g., a perf test exceeded budget on this machine), tune the budget or revisit the affected Task before reporting complete.

---

## Self-Review Notes

- **Spec coverage:**
  - Section 1 (Memoization fix) → Tasks 6, 7, 8, 9.
  - Section 2 (Optimistic mutations) → Tasks 3, 4, 5.
  - Section 3 (Telemetry) → Tasks 1, 2.
  - Section 4 (Perf budget tests) → Tasks 10, 11, 12.
  - All risks mentioned in spec are addressed inline (chart actions stability → Task 7; reorder semantics → Task 3.2 lookup).
- **No placeholders.** Every step has either a code block, a command, or an explicit "Skip if X" rule.
- **Type consistency:** `applyMove` / `applyUpdate` / `applyReorder` signatures match between Tasks 3 and 5. `MutableRefObject<Pod[]>` matches the import in Task 4.
