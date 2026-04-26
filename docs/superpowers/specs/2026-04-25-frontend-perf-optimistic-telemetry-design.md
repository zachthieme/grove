# Frontend Perf, Optimistic Mutations, Telemetry Observability

Date: 2026-04-25
Status: Approved (brainstorm) — pending implementation plan

## Motivation

Principal-engineer code review of Grove (2026-04-25) graded the Go backend at A and the React frontend at A-. Three concrete gaps held the frontend back:

1. **Sparse memoization** — `LayoutSubtree` (`web/src/views/ColumnView.tsx:31`) is not wrapped in `memo()`. It calls `useChart()` which merges Data and Actions contexts, so any selection or collapse change anywhere produces a new merged value and re-renders every subtree. The child memos (`ICNode`, `ProductNode`) are therefore ineffective. `ManagerLayoutSubtree` (`web/src/views/ManagerView.tsx:123`) has the same `useChart()` dependency despite being wrapped in `memo`.
2. **No optimistic updates** — every mutation in `web/src/store/useOrgMutations.ts` waits for the server response before updating local state. UX feels laggy on slow links.
3. **Silent telemetry swallow** — `web/src/api/client.ts:35` and `web/src/hooks/useLogging.ts:12` use `.catch(() => {})`, dropping log POST failures and config-load failures with zero observability.

There are also no perf-budget tests gating regressions in the above.

## Scope

- Memoization fix for `ColumnView` and `ManagerView` subtree components.
- Optimistic updates for `move`, `reparent`, `reorder`, `update` only. `add`, `remove`, snapshot ops, and pod/settings mutations remain server-blocking.
- Telemetry drop counter + `console.warn` in place of silent catches.
- Synthetic perf-budget tests in vitest, with mount-time and re-render-count budgets.

Out of scope:
- Optimistic `add`/`remove` (temp-id swapping and cascade complexity not justified).
- Playwright real-browser perf tests (deferred until vitest budgets prove insufficient).
- Telemetry dead-letter queue or retry buffer.
- Refactoring `ChartContext` further — current Data/Actions split is sufficient.

## Design

### 1. Memoization fix

**Files touched:** `web/src/views/ColumnView.tsx`, `web/src/views/ManagerView.tsx`, new `web/src/views/chartSelectors.ts`.

**Cause:** Both subtree components consume `useChart()`, which is `{ ...useChartData(), ...useChartActions() }`. Every Data ctx change creates a new merged object → `memo` on the subtree won't help because hook output isn't a prop.

**Fix:**

1. Wrap `LayoutSubtree` (ColumnView) in `memo()` — currently a plain function component.
2. `ManagerLayoutSubtree` (ManagerView) is already `memo`-wrapped; replace its `useChart()` consumption.
3. Inside both subtrees, replace `useChart()` with:
   - `useChartActions()` for the stable callback bag (does not re-render on selection/collapse changes since `ChartActionsCtx` value is intended to be stable).
   - New per-id selector hooks `useIsSelected(id: string)` and `useIsCollapsed(id: string)` that read `ChartDataCtx` and return a boolean. React skips re-renders when the boolean is `===` to last render.
4. Memoize `SummaryCard` and `PodSummaryCard` in `ManagerView.tsx`.
5. Anything inside the subtree that needs a non-primitive (e.g., `pods` array for `findPod`) keeps using `useChartData()` directly — those subtrees re-render on those specific changes, which is correct.

**New file `web/src/views/chartSelectors.ts`:**

```ts
import { useChartData } from './ChartContext'

export function useIsSelected(id: string): boolean {
  return useChartData().selectedIds.has(id)
}

export function useIsCollapsed(id: string): boolean {
  return useChartData().collapsedIds?.has(id) ?? false
}
```

The hook still re-runs on every `ChartDataCtx` update, but the return value only flips for ids actually entering or leaving the set, so memo'd subtrees re-render only when their boolean changes. Verified by Section 4 render-count test.

**Caveat:** `ChartActionsContextValue` must not be re-created on every parent render. If consumers (`ChartProvider` callers) currently rebuild the actions object inline, we will need to wrap it in `useMemo` at the call site as part of this work. Confirm during implementation.

### 2. Optimistic mutations

**Files touched:** `web/src/store/useOrgMutations.ts`, new `web/src/store/optimistic.ts`.

**Pattern:** Extend the existing `dispatch` helper with an optional `optimistic` parameter. The pre-mutation snapshot must be read from refs (not captured inside the setState updater), because React does not guarantee the updater runs synchronously with the calling code.

```ts
async function dispatch<T>(
  call: () => Promise<T>,
  apply: (result: T) => Partial<OrgDataState>,
  opts: { undo?: boolean; optimistic?: (s: OrgDataState) => Partial<OrgDataState> } = {},
) {
  if (opts.undo) captureForUndo()
  const snapshot = opts.optimistic
    ? { working: workingRef.current, pods: podsRef.current }
    : null
  if (opts.optimistic) {
    setState((s) => ({ ...s, ...opts.optimistic!(s) }))
  }
  try {
    const result = await call()
    setState((s) => ({ ...s, ...apply(result) }))
  } catch (err) {
    if (snapshot) setState((s) => ({ ...s, working: snapshot.working, pods: snapshot.pods }))
    handleError(err)
  }
}
```

**Adds `podsRef` to `OrgDataContext`** mirroring the existing `workingRef` pattern (`OrgDataContext.tsx:68-69`). Passed into `useOrgMutations` deps. Both refs already updated synchronously via `ref.current = state.x` after each render.

**Mutations getting the optimistic path:**
- `move(personId, newManagerId, newTeam, _, newPod?)` → `applyMove(working, ...)`
- `reparent(personId, newManagerId)` → `applyMove` or `applyUpdate({ managerId: '' })`
- `reorder(personIds)` → `applyReorder(working, personIds)`
- `update(personId, fields)` → `applyUpdate(working, personId, fields)`

**Pure helpers in `web/src/store/optimistic.ts`:**

```ts
export function applyUpdate(nodes: OrgNode[], personId: string, fields: OrgNodeUpdatePayload): OrgNode[]
export function applyMove(nodes: OrgNode[], personId: string, newManagerId: string, newTeam: string, newPod?: string): OrgNode[]
export function applyReorder(nodes: OrgNode[], personIds: string[]): OrgNode[]
```

Each returns a new array, never mutates input. Each tested in isolation against synthetic fixtures.

**Reconciliation:** Server response is authoritative. `apply` overwrites `working` and `pods` entirely. If the server's view differs from optimistic (cascade pod cleanup, validation rejection, etc.) the user sees a brief flicker only on edge cases. Worst case: server rejects (validation/cycle) → revert + error banner.

**`pods` under optimistic:** left unchanged in the optimistic patch. Server response replaces them. Move-induced pod cleanup is deferred to server truth — acceptable since pods change is invisible until next render anyway.

### 3. Telemetry observability

**Files touched:** `web/src/api/client.ts`, `web/src/hooks/useLogging.ts`.

**Add to `client.ts`:**

```ts
let telemetryDropCount = 0
export function getTelemetryDropCount(): number { return telemetryDropCount }
export function resetTelemetryDropCount(): void { telemetryDropCount = 0 }
```

**Replace silent catches:**

- `client.ts:35` (`postLogEntry`): `.catch((e) => { telemetryDropCount++; console.warn('telemetry POST dropped', e) })`
- `client.ts:125-133` (the fetch-failure log inside `fetchWithTimeout`): already routes through `postLogEntry`, so the same counter applies. No new code path.
- `useLogging.ts:12` (`getConfig`): `.catch((e) => console.warn('config load failed; logging disabled', e))`. No counter — this is bootstrap, not telemetry.

**Recursion guard:** `postLogEntry` calls `fetch` directly, not `fetchWithTimeout`, so a failed log POST does not recurse into another log POST. Confirmed safe by reading; no code change needed.

**`resetClient()` extension:** add `telemetryDropCount = 0` so test suites stay hermetic.

### 4. Perf budget tests

**New files:**
- `web/src/test-helpers/syntheticOrg.ts` — `buildSyntheticOrg(n: number): OrgNode[]` builds a balanced tree (root → ~10 managers → ICs scaling to N). Stable seed; deterministic.
- `web/src/views/perfBudget.test.tsx` — covers ColumnView and ManagerView; shared fixture.
- `docs/scenarios/perf.md` — new scenario doc with `[PERF-001]` … `[PERF-006]`.

**Test pattern:**

```ts
test('[PERF-001] ColumnView mounts N=1000 within budget', () => {
  const nodes = buildSyntheticOrg(1000)
  const t0 = performance.now()
  render(<Providers org={nodes}><ColumnView /></Providers>)
  const ms = performance.now() - t0
  expect(ms).toBeLessThan(BUDGET.mount1k)
})
```

**Budgets** (jsdom — track regression direction, not real-paint UX):

| ID         | Test                                              | Budget   |
|------------|---------------------------------------------------|----------|
| PERF-001   | ColumnView mount N=100                             | 50ms     |
| PERF-002   | ColumnView mount N=1000                            | 400ms    |
| PERF-003   | ColumnView mount N=5000                            | 2000ms   |
| PERF-004   | ColumnView re-render after single-id selection N=1000 | 30ms     |
| PERF-005   | ColumnView re-render count after single selection N=1000 | < 5 subtree renders |
| PERF-006   | ManagerView mount N=1000                           | 400ms    |

Wall-clock budgets set ~3× observed local to absorb CI variance. The strict gate is **PERF-005 render count** — instruments a `vi.fn()` wrapper around the memoized subtree and asserts only the previously-selected and newly-selected id subtrees re-render, not all 1000.

**Scenario file `docs/scenarios/perf.md`:** lists each ID, description, test reference. `make check-scenarios` validates wiring.

## Architecture & Components

```
web/src/
├── api/
│   └── client.ts              # + telemetryDropCount, getter, reset; replace catches
├── hooks/
│   └── useLogging.ts          # replace silent catch with console.warn
├── store/
│   ├── useOrgMutations.ts     # extend dispatch with optimistic param; wire 4 mutations
│   └── optimistic.ts          # NEW: applyUpdate, applyMove, applyReorder pure helpers
├── views/
│   ├── ChartContext.tsx       # unchanged (already split Data/Actions)
│   ├── chartSelectors.ts      # NEW: useIsSelected, useIsCollapsed
│   ├── ColumnView.tsx         # memo(LayoutSubtree); switch to selectors
│   ├── ManagerView.tsx        # switch ManagerLayoutSubtree to selectors; memo SummaryCard
│   └── perfBudget.test.tsx    # NEW: PERF-001..006
├── test-helpers/
│   └── syntheticOrg.ts        # NEW: buildSyntheticOrg(n)
docs/scenarios/
└── perf.md                    # NEW: PERF area scenario doc
```

## Data Flow

**Optimistic mutation (move):**

```
User drag-drop
  → useOrgMutations.move(personId, newManagerId, newTeam)
    → dispatch with optimistic = (s) => ({ working: applyMove(s.working, ...) })
      → snapshot pre-state
      → apply optimistic patch (UI updates immediately)
      → api.moveNode(...)
        success → setState({ working: resp.working, pods: resp.pods })  // server truth
        failure → setState({ working: snapshot.working, pods: snapshot.pods }) + handleError
```

**Memo path (selection change):**

```
User clicks node id=42
  → ChartActionsContext.onSelect(42)
    → setSelectedIds(new Set([42]))
      → ChartDataContext re-emits
        → useIsSelected(42) returns true (was false) → that subtree re-renders
        → useIsSelected(N) returns same false → all other subtrees skip
        → useChartActions consumers see same actions value → skip
```

## Error Handling

- Optimistic revert on API failure: full state rollback to pre-mutation snapshot, error surfaced via existing `handleError` → `setError` → UI banner.
- Telemetry POST failure: count + warn, never propagated, never bothers user.
- Bootstrap config load failure: warn, logging stays off (current default), no UI surface.

## Testing

- Unit tests for `optimistic.ts` helpers (pure transforms).
- Updated `useOrgMutations` tests: assert pre-snapshot captured, optimistic applied, server response replaces, failure reverts.
- Telemetry: `client.test.ts` mocks `fetch` reject, asserts counter increments + `console.warn` called.
- Memo: `chartSelectors.test.ts` for the selector hooks (boolean flip on set membership change).
- Perf: `perfBudget.test.tsx` PERF-001..006.

All tests follow the scenario contract — `[AREA-NNN]` prefix in test names. `make check-scenarios` will pass.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| `ChartActionsContextValue` not stable at the provider call site → memo defeated | Audit `ChartProvider` consumers; wrap actions in `useMemo` if not already. Add to plan as a sub-task. |
| Optimistic `applyMove` diverges from server semantics (e.g., team re-derivation) | Server response always replaces local state on success; flicker-only edge cases acceptable. |
| jsdom timing too noisy → flaky budgets | Budgets set ~3× observed local; render-count test (PERF-005) is the strict gate, not wall-clock. |
| Pure helper `applyReorder` has subtle ordering semantics (siblings only?) | Mirror server's `reorder` semantics by reading the Go implementation in `internal/org/people.go` before writing the helper. Document semantics in helper godoc. |

## Out-of-Scope / Future

- Real-browser Playwright perf spec.
- Optimistic `add`/`remove` with temp-id swap.
- Telemetry dead-letter queue.
- `use-context-selector` library — native React + boolean selectors are enough.
