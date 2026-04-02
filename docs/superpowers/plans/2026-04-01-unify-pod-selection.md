# Unify Pod Selection — Remove `selectedPodId`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the dual selection model (`selectedIds` vs `selectedPodId`) so all nodes — person, pod group, team group — use one selection path.

**Architecture:** Remove `selectedPodId` and `selectPod` from `SelectionContext`. Pods are selected by collapseKey via `toggleSelect`/`setSelectedId`, same as team groups. `DetailSidebar` detects pod collapseKeys (already does this via `usePodForKey`) and routes to `PodSidebar`. `onPodSelect` is removed from `ChartContext`; ManagerView pod clicks use `onSelect(collapseKey)` instead.

**Tech Stack:** React, TypeScript, Vitest

---

### Task 1: Remove `selectedPodId` and `selectPod` from SelectionContext

**Files:**
- Modify: `web/src/store/orgTypes.ts` — remove `selectedPodId` and `selectPod` from `SelectionContextValue`
- Modify: `web/src/store/SelectionContext.tsx` — remove `selectedPodId` state, `selectPod` callback, and all `setSelectedPodId(null)` calls in `toggleSelect`/`batchSelect`/`clearSelection`
- Modify: `web/src/test-helpers.tsx` — remove `selectedPodId` and `selectPod` from mock context defaults

- [ ] **Step 1: Update `orgTypes.ts`**

Remove `selectedPodId` and `selectPod` from `SelectionContextValue`. No replacement needed.

- [ ] **Step 2: Update `SelectionContext.tsx`**

Remove:
- `const [selectedPodId, setSelectedPodId] = useState<string | null>(null)` (line 18)
- The entire `selectPod` callback (lines 74–85)
- `setSelectedPodId(null)` from `toggleSelect` (line 35), `clearSelection` (~line 66), and `batchSelect` (~line 91)
- `selectedPodId` and `selectPod` from the `useMemo` value and deps

- [ ] **Step 3: Update `test-helpers.tsx`**

Remove `selectedPodId: null` and `selectPod: noop` from the mock context factory.

- [ ] **Step 4: Verify TypeScript compiles — expect errors in consumers**

Run: `cd web && npx tsc --noEmit 2>&1 | head -40`

This will show every consumer that still references `selectedPodId`, `selectPod`, or `onPodSelect`. These are fixed in subsequent tasks.

---

### Task 2: Remove `onPodSelect` from ChartContext and ChartShell

**Files:**
- Modify: `web/src/views/ChartContext.tsx` — remove `onPodSelect` from `ChartActionsContextValue` and `selectedPodId` from `ChartDataContextValue`
- Modify: `web/src/views/ChartShell.tsx` — remove `selectedPodId` from `chartData` and `onPodSelect` from `chartActions`

- [ ] **Step 1: Remove from `ChartContext.tsx`**

Remove `selectedPodId?: string | null` from `ChartDataContextValue` and `onPodSelect?: (podId: string) => void` from `ChartActionsContextValue`.

- [ ] **Step 2: Remove from `ChartShell.tsx`**

Remove `selection.selectedPodId` from the `chartData` memo and `onPodSelect: selection.selectPod` from the `chartActions` memo.

---

### Task 3: Update ColumnView — pod info button uses `onSelect`

**Files:**
- Modify: `web/src/views/ColumnView.tsx`

The pod header's `onClick` already uses `onSelect(group.collapseKey, e)` (fixed earlier). The `onInfo` callback still uses `onPodSelect(pod.id)`. Change it to also use `onSelect`:

- [ ] **Step 1: Replace `onPodSelect` with `onSelect`**

In `LayoutSubtree`, destructure `onSelect` instead of `onPodSelect`. Change the `onInfo` handler from `() => onPodSelect(pod.id)` to `() => onSelect(group.collapseKey)`.

- [ ] **Step 2: Update deps array** to remove `onPodSelect`, add `onSelect` if not already present.

---

### Task 4: Update ManagerView — pod click uses `onSelect` with collapseKey

**Files:**
- Modify: `web/src/views/ManagerView.tsx`

`PodSummaryCard` currently passes `onPodSelect` (a pod UUID) to `SummaryCard`. Change it to call `onSelect(group.collapseKey)` instead.

- [ ] **Step 1: Update `PodSummaryCard`**

Destructure `onSelect` instead of `onPodSelect` from `useChart()`. Pass an `onClick` that calls `onSelect(group.collapseKey)` instead of passing `onPodClick={onPodSelect}`.

- [ ] **Step 2: Update `SummaryCard`**

Change the `onPodClick` prop to a simple `onClick` callback. Remove `podId` prop since it's no longer needed for selection (keep it only if used for something else). Update the click handler.

---

### Task 5: Update SearchBar — pod search uses `setSelectedId(collapseKey)`

**Files:**
- Modify: `web/src/components/SearchBar.tsx`

Currently calls `selectPod(result.pod.id)`. Change to `setSelectedId(collapseKey)`. Need to construct the collapseKey from the pod data: `pod:${pod.managerId}:${pod.name}`.

- [ ] **Step 1: Remove `selectPod` import, add collapseKey construction**

In `selectResult`, replace:
```tsx
selectPod(result.pod.id)
```
with:
```tsx
setSelectedId(`pod:${result.pod.managerId}:${result.pod.name}`)
```

- [ ] **Step 2: Fix scroll-to selector**

Replace the fragile substring match `[data-person-id*="${result.pod.name}"]` with the exact collapseKey: `[data-person-id="pod:${result.pod.managerId}:${result.pod.name}"]`.

---

### Task 6: Update App.tsx — remove `selectedPodId` from sidebar visibility

**Files:**
- Modify: `web/src/App.tsx`

- [ ] **Step 1: In `AppWorkspace`**, remove `selectedPodId` from the `useSelection()` destructure. The `hasSidebarSelection` check becomes just `selectedIds.size > 0`.

- [ ] **Step 2: In `useUnifiedEscape`** call, `hasSelection` already checks `selectedIds.size > 0`. No change needed — but verify Escape now clears pod selection (since pods are in `selectedIds`).

---

### Task 7: Update DetailSidebar — remove `selectedPodId` fallback

**Files:**
- Modify: `web/src/components/DetailSidebar.tsx`

- [ ] **Step 1:** Remove `selectedPodId` from the `useSelection()` destructure. Remove the fallback line `if (selectedPodId && !selectedId && !isBatch) return <PodSidebar podId={selectedPodId} />`. The `usePodForKey` path already handles pod collapseKeys.

---

### Task 8: Fix lasso select — skip all group nodes uniformly

**Files:**
- Modify: `web/src/hooks/useLassoSelect.ts`

- [ ] **Step 1:** Change the pod-only skip (`if (id.startsWith('pod:')) continue`) to skip all non-person IDs. The simplest check: skip any ID that contains `:`, since collapseKeys use `:` separators and person UUIDs don't.

```tsx
if (id.includes(':')) continue
```

---

### Task 9: Remove `vimAddReport` duplication

**Files:**
- Modify: `web/src/App.tsx`

- [ ] **Step 1:** Import and use `handleAddReport` from `useActions()` instead of the inline `vimAddReport`. Remove the `vimAddReport` callback.

---

### Task 10: Fix tests

**Files:**
- Modify: `web/src/store/SelectionContext.test.tsx` — remove/update tests for `selectPod`
- Modify: `web/src/components/DetailSidebar.branches.test.tsx` — update pod selection to use collapseKeys
- Modify: `web/src/components/DetailSidebar.golden.test.tsx` — update mock context
- Modify: `web/src/views/ManagerView.branches.test.tsx` — update pod click assertions
- Modify: Any other test that references `selectedPodId`, `selectPod`, or `onPodSelect`

- [ ] **Step 1: Run `npx tsc --noEmit` and `npx vitest --run`** to find all remaining type errors and test failures.

- [ ] **Step 2: Fix each test file.** Pattern: replace `selectedPodId: 'pod-1'` with `selectedId: 'pod:managerId:podName'` (using the correct collapseKey for the test data). Replace `selectPod` calls with `setSelectedId` calls.

- [ ] **Step 3: Run full test suite and verify all pass.**

Run: `cd web && npx vitest --run`

- [ ] **Step 4: Build and verify.**

Run: `make build`
