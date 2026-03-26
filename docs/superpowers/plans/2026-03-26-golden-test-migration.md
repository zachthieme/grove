# Golden Test Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate mock-heavy frontend component tests to golden file snapshots, keeping only behavioral tests (click handlers, mock call assertions) in traditional test files.

**Architecture:** Extract shared test infrastructure (normalizeHTML, makePerson, common mock factories) into a helper module. For each component, create a `.golden.test.tsx` that renders representative states and snapshots via `toMatchFileSnapshot`. Trim existing `.test.tsx` files to contain only behavioral interaction tests. Delete files fully superseded by existing golden tests.

**Tech Stack:** Vitest 4.1, @testing-library/react, toMatchFileSnapshot, jsdom

---

## Shared Convention

**Golden test pattern** (established in existing ColumnView/ManagerView/TableView golden tests):

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { normalizeHTML, makePerson } from '../test-helpers'

describe('ComponentName golden', () => {
  afterEach(() => cleanup())

  it('scenario name', () => {
    const { container } = render(<Component prop={value} />)
    expect(normalizeHTML(container.innerHTML))
      .toMatchFileSnapshot('./__golden__/component-scenario.golden')
  })
})
```

**Rules:**
- Golden tests ONLY assert `toMatchFileSnapshot` — no `screen.getByText`, no mock assertions
- Behavioral tests (click → mock called, user interaction → state change) stay in `.test.tsx`
- Mocking dnd-kit/useChartLayout is acceptable in golden tests (jsdom limitation)
- Mocking OrgContext is acceptable in golden tests when the component uses `useOrg()` — but use a minimal, read-only mock (no `vi.fn()` assertions on it)
- `normalizeHTML` strips inline styles and normalizes whitespace for stable snapshots
- Golden files live in `__golden__/` directory adjacent to the test
- Naming: `component-scenario.golden` (kebab-case)

---

### Task 1: Extract shared test helpers

**Files:**
- Create: `web/src/test-helpers.ts`
- Modify: `web/src/views/ColumnView.golden.test.tsx`
- Modify: `web/src/views/ManagerView.golden.test.tsx`
- Modify: `web/src/views/TableView.golden.test.tsx`

- [ ] **Step 1: Create `test-helpers.ts` with shared utilities**

```ts
import type { Person } from './api/types'

export function normalizeHTML(html: string): string {
  return html
    .replace(/\s*style="[^"]*"/g, '')
    .replace(/\s+/g, ' ')
    .replace(/> </g, '>\n<')
    .trim()
}

export function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: 'default-id',
    name: 'Default Person',
    role: 'Engineer',
    discipline: 'Engineering',
    managerId: '',
    team: 'Platform',
    additionalTeams: [],
    status: 'Active',
    ...overrides,
  }
}
```

- [ ] **Step 2: Update existing 3 golden test files to import from test-helpers**

Replace local `normalizeHTML` and `makePerson` definitions with imports from `../test-helpers` (for views) or `./test-helpers` (for components).

- [ ] **Step 3: Run tests to verify nothing broke**

Run: `cd web && npx vitest run --reporter=verbose 2>&1 | tail -20`
Expected: All existing golden tests still pass.

- [ ] **Step 4: Commit**

```
test: extract shared test helpers for golden test migration
```

---

### Task 2: Delete redundant mock-only test files

These files test the exact same scenarios already covered by their `.golden.test.tsx` counterparts.

**Files:**
- Modify: `web/src/views/ColumnView.golden.test.tsx` (add orphan scenario)
- Delete: `web/src/views/ColumnView.test.tsx` (4 tests — all structural, covered by golden)
- Delete: `web/src/views/ManagerView.test.tsx` (3 tests — all structural, covered by golden)

- [ ] **Step 1: Add orphan scenario to ColumnView golden test**

ColumnView.test.tsx has a "renders orphans grouped by team" test (multiple roots, different teams, no hierarchy) that isn't covered by existing golden scenarios. Add a golden test for this before deleting.

- [ ] **Step 2: Delete the mock test files**

- [ ] **Step 3: Run tests to verify golden tests cover all scenarios**

Run: `cd web && npx vitest run --reporter=verbose 2>&1 | tail -20`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```
test: remove ColumnView and ManagerView mock tests superseded by golden files
```

**Intentionally excluded from migration:**
- `ErrorBoundary.test.tsx` — Tests React error boundary lifecycle (throw → fallback → recovery). All 3 tests are behavioral; no structural rendering to snapshot.
- `LogPanel.test.tsx` — Tests async data fetching with `act()`. Async render timing makes golden snapshots unreliable.

---

### Task 3: Convert PersonNode to golden tests

PersonNode.test.tsx has 15 structural tests and 0 behavioral tests. Full conversion.

**Files:**
- Create: `web/src/components/__golden__/` directory
- Create: `web/src/components/PersonNode.golden.test.tsx`
- Create: golden fixture files in `web/src/components/__golden__/`
- Delete: `web/src/components/PersonNode.test.tsx`

- [ ] **Step 1: Create PersonNode golden test file**

Golden scenarios to cover (each becomes one `toMatchFileSnapshot` call):
1. `person-node-default.golden` — Active person with name, role, team
2. `person-node-manager.golden` — isManager=true (accent bar visible)
3. `person-node-non-manager.golden` — isManager=false
4. `person-node-cw-type.golden` — employmentType='CW' (abbreviation shown)
5. `person-node-fte-type.golden` — employmentType='FTE' (no abbreviation)
6. `person-node-warning.golden` — warning='Missing manager'
7. `person-node-open-status.golden` — status='Open' (blue circle prefix)
8. `person-node-backfill-status.golden` — status='Backfill'
9. `person-node-planned-status.golden` — status='Planned' (white square)
10. `person-node-transfer-in.golden` — status='Transfer In' (yellow circle)
11. `person-node-transfer-out.golden` — status='Transfer Out'
12. `person-node-ghost.golden` — ghost=true
13. `person-node-note.golden` — publicNote='Some note'

- [ ] **Step 2: Run golden tests to generate fixture files**

Run: `cd web && npx vitest run src/components/PersonNode.golden.test.tsx --reporter=verbose`
Expected: All 13 tests pass, golden files auto-created on first run.

- [ ] **Step 3: Verify golden files look correct**

Spot-check a few `.golden` files to ensure they contain sensible HTML.

- [ ] **Step 4: Delete PersonNode.test.tsx**

- [ ] **Step 5: Run full test suite**

Run: `cd web && npx vitest run --reporter=verbose 2>&1 | tail -20`
Expected: All pass.

- [ ] **Step 6: Commit**

```
test: migrate PersonNode from mock tests to golden file snapshots
```

---

### Task 4: Convert NodeActions — golden + keep behavioral

NodeActions.test.tsx has 8 structural tests and 1 behavioral test (click handlers). Split.

**Files:**
- Create: `web/src/components/NodeActions.golden.test.tsx`
- Modify: `web/src/components/NodeActions.test.tsx` (trim to behavioral only)
- Create: golden fixture files in `web/src/components/__golden__/`

- [ ] **Step 1: Create NodeActions golden test**

Golden scenarios:
1. `node-actions-default.golden` — showAdd=true, showEdit=true, showDelete=true
2. `node-actions-no-add.golden` — showAdd=false
3. `node-actions-no-delete.golden` — showDelete=false
4. `node-actions-no-edit.golden` — showEdit=false
5. `node-actions-with-info.golden` — showInfo=true
6. `node-actions-with-focus.golden` — showFocus=true, onFocus provided
7. `node-actions-focus-no-handler.golden` — showFocus=true, onFocus=undefined
8. `node-actions-minimal.golden` — showFocus=false

- [ ] **Step 2: Trim NodeActions.test.tsx to keep only the behavioral click handler test**

Keep only the `'click handlers fire correctly'` test that asserts `onAdd/onDelete/onEdit/onInfo/onFocus` were called.

- [ ] **Step 3: Run tests**

Run: `cd web && npx vitest run src/components/NodeActions --reporter=verbose`
Expected: 8 golden + 1 behavioral = 9 tests pass.

- [ ] **Step 4: Commit**

```
test: migrate NodeActions structural tests to golden files
```

---

### Task 5: Convert UploadPrompt — golden + keep behavioral

UploadPrompt.test.tsx has 6 structural and 2 behavioral tests.

**Files:**
- Create: `web/src/components/UploadPrompt.golden.test.tsx`
- Modify: `web/src/components/UploadPrompt.test.tsx` (trim to behavioral only)

- [ ] **Step 1: Create UploadPrompt golden test**

Golden scenarios:
1. `upload-prompt-default.golden` — default render (title, tagline, definition, icon, button, hidden file input)

One golden snapshot captures all 6 structural assertions (they all verify parts of the same default render).

- [ ] **Step 2: Trim UploadPrompt.test.tsx to behavioral only**

Keep: `'calls upload when a file is selected'` and `'does not call upload when no file is selected'`.

- [ ] **Step 3: Run tests and commit**

```
test: migrate UploadPrompt structural tests to golden files
```

---

### Task 6: Convert ColumnMappingModal — golden + keep behavioral

14 tests total. Structural: title, labels, selects, pre-selection, options, preview, button state. Behavioral: onConfirm/onCancel clicks, dropdown changes.

**Files:**
- Create: `web/src/components/ColumnMappingModal.golden.test.tsx`
- Modify: `web/src/components/ColumnMappingModal.test.tsx`

- [ ] **Step 1: Create golden test**

Golden scenarios:
1. `column-mapping-default.golden` — with name+role mapped, preview visible
2. `column-mapping-empty.golden` — empty mapping, Load disabled, no preview

- [ ] **Step 2: Trim .test.tsx to behavioral only**

Keep: `onConfirm` called with mapping, `onCancel` called, dropdown change updates mapping, Load enable/disable after interaction.

- [ ] **Step 3: Run tests and commit**

```
test: migrate ColumnMappingModal structural tests to golden files
```

---

### Task 7: Convert AutosaveBanner — golden + keep behavioral

6 tests. Structural: null render, alert role, message, time formatting. Behavioral: restore/dismiss clicks.

**Files:**
- Create: `web/src/components/AutosaveBanner.golden.test.tsx`
- Modify: `web/src/components/AutosaveBanner.test.tsx`

- [ ] **Step 1: Create golden test**

Scenarios:
1. `autosave-banner-null.golden` — autosaveAvailable=null (renders nothing)
2. `autosave-banner-with-time.golden` — with valid timestamp
3. `autosave-banner-invalid-time.golden` — with invalid timestamp

- [ ] **Step 2: Trim .test.tsx to behavioral only (restore/dismiss button clicks)**

- [ ] **Step 3: Run tests and commit**

```
test: migrate AutosaveBanner structural tests to golden files
```

---

### Task 8: Convert RecycleBinDrawer — golden + keep behavioral

9 tests. Structural: null, drawer, empty, count, cards, Empty Bin button visibility, aria-label. Behavioral: restore/close/emptyBin clicks.

**Files:**
- Create: `web/src/components/RecycleBinDrawer.golden.test.tsx`
- Modify: `web/src/components/RecycleBinDrawer.test.tsx`

- [ ] **Step 1: Create golden test**

Scenarios:
1. `recycle-bin-drawer-closed.golden` — binOpen=false
2. `recycle-bin-drawer-empty.golden` — binOpen=true, recycled=[]
3. `recycle-bin-drawer-with-items.golden` — binOpen=true, recycled=[person, person]

- [ ] **Step 2: Trim .test.tsx to behavioral only**

- [ ] **Step 3: Run tests and commit**

```
test: migrate RecycleBinDrawer structural tests to golden files
```

---

### Task 9: Convert RecycleBinButton — golden + keep behavioral

7 tests. Structural: aria-label, badge, aria-pressed. Behavioral: setBinOpen click.

**Files:**
- Create: `web/src/components/RecycleBinButton.golden.test.tsx`
- Modify: `web/src/components/RecycleBinButton.test.tsx`

- [ ] **Step 1: Create golden test**

Scenarios:
1. `recycle-bin-button-empty.golden` — recycled=[], binOpen=false
2. `recycle-bin-button-with-count.golden` — recycled=[items], binOpen=false
3. `recycle-bin-button-pressed.golden` — binOpen=true

- [ ] **Step 2: Trim .test.tsx to behavioral only**

- [ ] **Step 3: Run tests and commit**

```
test: migrate RecycleBinButton structural tests to golden files
```

---

### Task 10: Convert SnapshotsDropdown — golden + keep behavioral

11 tests. Structural: labels, aria, snapshot list. Behavioral: open/close, loadSnapshot, deleteSnapshot, saveSnapshot.

**Files:**
- Create: `web/src/components/SnapshotsDropdown.golden.test.tsx`
- Modify: `web/src/components/SnapshotsDropdown.test.tsx`

- [ ] **Step 1: Create golden test**

Scenarios:
1. `snapshots-dropdown-working.golden` — currentSnapshotName=null
2. `snapshots-dropdown-original.golden` — currentSnapshotName='__original__'
3. `snapshots-dropdown-named.golden` — currentSnapshotName='Q1 Plan'

- [ ] **Step 2: Trim .test.tsx to behavioral only (open/close, load, delete, save)**

- [ ] **Step 3: Run tests and commit**

```
test: migrate SnapshotsDropdown structural tests to golden files
```

---

### Task 11: Convert EmploymentTypeFilter — golden + keep behavioral

12 tests. Structural: trigger, badge, dropdown items, checkboxes. Behavioral: toggle/show/hide clicks.

**Files:**
- Create: `web/src/components/EmploymentTypeFilter.golden.test.tsx`
- Modify: `web/src/components/EmploymentTypeFilter.test.tsx`

- [ ] **Step 1: Create golden test**

Scenarios:
1. `employment-filter-default.golden` — no hidden types
2. `employment-filter-with-hidden.golden` — 2 types hidden (badge shown)

- [ ] **Step 2: Trim .test.tsx to behavioral only**

- [ ] **Step 3: Run tests and commit**

```
test: migrate EmploymentTypeFilter structural tests to golden files
```

---

### Task 12: Convert Breadcrumbs — golden + keep behavioral

7 tests. Structural: null render, All button, ancestors, separators. Behavioral: setHead clicks.

**Files:**
- Create: `web/src/components/Breadcrumbs.golden.test.tsx`
- Modify: `web/src/components/Breadcrumbs.test.tsx`

- [ ] **Step 1: Create golden test**

Scenarios:
1. `breadcrumbs-null.golden` — headPersonId=null
2. `breadcrumbs-single.golden` — headPersonId set, person is root
3. `breadcrumbs-deep.golden` — 3-level ancestor chain

- [ ] **Step 2: Trim .test.tsx to behavioral only (setHead clicks)**

- [ ] **Step 3: Run tests and commit**

```
test: migrate Breadcrumbs structural tests to golden files
```

---

### Task 13: Convert UnparentedBar — golden + keep behavioral

10 tests. Structural: null renders, count, collapsed state, orphan detection. Behavioral: expand/collapse, toggleSelect.

**Files:**
- Create: `web/src/components/UnparentedBar.golden.test.tsx`
- Modify: `web/src/components/UnparentedBar.test.tsx`

- [ ] **Step 1: Create golden test**

Scenarios:
1. `unparented-bar-no-orphans.golden` — all people have managers or reports
2. `unparented-bar-one-orphan.golden` — singular count
3. `unparented-bar-multiple-orphans.golden` — plural count

- [ ] **Step 2: Trim .test.tsx to behavioral only**

- [ ] **Step 3: Run tests and commit**

```
test: migrate UnparentedBar structural tests to golden files
```

---

### Task 14: Convert ManagerInfoPopover — golden + keep behavioral

12 tests. Structural: name, counts, category rows, discipline. Behavioral: onClose clicks.

**Files:**
- Create: `web/src/components/ManagerInfoPopover.golden.test.tsx`
- Modify: `web/src/components/ManagerInfoPopover.test.tsx`

- [ ] **Step 1: Create golden test**

Scenarios:
1. `manager-info-basic.golden` — manager with active ICs only
2. `manager-info-recruiting.golden` — has open/backfill reports
3. `manager-info-full.golden` — all categories (recruiting, planned, transfers, multi-discipline)
4. `manager-info-unknown.golden` — person not found

- [ ] **Step 2: Trim .test.tsx to behavioral only (onClose clicks)**

- [ ] **Step 3: Run tests and commit**

```
test: migrate ManagerInfoPopover structural tests to golden files
```

---

### Task 15: Convert SettingsModal — golden + keep behavioral

10 tests. Structural: title, sections, disciplines, empty state. Behavioral: cancel/save/close clicks.

**Files:**
- Create: `web/src/components/SettingsModal.golden.test.tsx`
- Modify: `web/src/components/SettingsModal.test.tsx`

- [ ] **Step 1: Create golden test**

Scenarios:
1. `settings-modal-default.golden` — with disciplines from working data
2. `settings-modal-empty.golden` — no disciplines

- [ ] **Step 2: Trim .test.tsx to behavioral only**

- [ ] **Step 3: Run tests and commit**

```
test: migrate SettingsModal structural tests to golden files
```

---

### Task 16: Convert PodSidebar — golden + keep behavioral

12 tests. Structural: null renders, heading, fields, counts, notes. Behavioral: updatePod onBlur.

**Files:**
- Create: `web/src/components/PodSidebar.golden.test.tsx`
- Modify: `web/src/components/PodSidebar.test.tsx`

- [ ] **Step 1: Create golden test**

Scenarios:
1. `pod-sidebar-no-selection.golden` — no selectedPodId
2. `pod-sidebar-with-pod.golden` — pod selected, with notes and members

- [ ] **Step 2: Trim .test.tsx to behavioral only (updatePod onBlur calls)**

- [ ] **Step 3: Run tests and commit**

```
test: migrate PodSidebar structural tests to golden files
```

---

### Task 17: Convert Toolbar — golden + keep behavioral

24 tests. Structural: button presence, pill rendering, export items, menu items, exporting state. Behavioral: setViewMode, setDataView, reflow, export handler clicks.

**Files:**
- Create: `web/src/components/Toolbar.golden.test.tsx`
- Modify: `web/src/components/Toolbar.test.tsx`

- [ ] **Step 1: Create golden test**

Scenarios:
1. `toolbar-loaded.golden` — loaded=true, default state
2. `toolbar-not-loaded.golden` — loaded=false (no view/data pills)
3. `toolbar-exporting.golden` — exporting=true
4. `toolbar-with-logging.golden` — loggingEnabled=true

- [ ] **Step 2: Trim .test.tsx to behavioral only**

Keep: setViewMode call, setDataView call, export handler calls (PNG/SVG), reflow call, onToggleLogs call, aria-expanded state changes (these require user interaction).

- [ ] **Step 3: Run tests and commit**

```
test: migrate Toolbar structural tests to golden files
```

---

### Task 18: Convert DetailSidebar — golden + keep behavioral

57 tests. Structural: headings, field rendering, form layout, field values. Behavioral: save/delete/reparent mock calls, error states, reactive input changes.

**Files:**
- Create: `web/src/components/DetailSidebar.golden.test.tsx`
- Modify: `web/src/components/DetailSidebar.test.tsx`

- [ ] **Step 1: Create golden test**

Scenarios:
1. `detail-sidebar-null.golden` — no selection
2. `detail-sidebar-single.golden` — single person selected (Bob)
3. `detail-sidebar-batch.golden` — 2 people selected (mixed fields)
4. `detail-sidebar-batch-uniform.golden` — 2 people with same role
5. `detail-sidebar-empty-fields.golden` — person with all empty strings
6. `detail-sidebar-long-strings.golden` — 500-char fields
7. `detail-sidebar-special-chars.golden` — Unicode/emoji/CJK name
8. `detail-sidebar-whitespace.golden` — whitespace-only fields

- [ ] **Step 2: Trim .test.tsx to behavioral only**

Keep: clearSelection on close, update mock calls on save, reparent on manager change, remove on delete, setSelectedId after delete, "Saved!" success state, "Retry" error state, input reactivity, batch save calling update per person, batch reparent clearing manager. Remove all structural-only assertions (headings, field labels, field values, button presence, placeholders).

- [ ] **Step 3: Run tests and commit**

```
test: migrate DetailSidebar structural tests to golden files
```

---

### Task 19: Convert TableView — golden + keep behavioral

17 tests. Already has golden tests for basic rendering + diff. The .test.tsx has overlap plus behavioral tests.

**Files:**
- Modify: `web/src/views/TableView.test.tsx` (trim to behavioral only)
- Modify: `web/src/views/TableView.golden.test.tsx` (add missing scenarios)

- [ ] **Step 1: Add missing golden scenarios to existing TableView.golden.test.tsx**

Add:
5. `table-view-single-person.golden` — 1 person
6. `table-view-readonly-buttons.golden` — readOnly=true (no add/paste/delete buttons)

- [ ] **Step 2: Trim TableView.test.tsx to behavioral only**

Keep: cells editable on click, delete calls remove, checkbox calls toggleSelect, column visibility dropdown interaction.

- [ ] **Step 3: Run tests and commit**

```
test: migrate TableView structural tests to golden files
```

---

### Task 20: Final cleanup and verification

- [ ] **Step 1: Run full test suite**

Run: `cd web && npx vitest run --reporter=verbose 2>&1 | tail -30`
Expected: All tests pass.

- [ ] **Step 2: Run coverage check**

Run: `cd web && npx vitest run --coverage 2>&1 | tail -30`
Expected: Coverage thresholds (80/75/75/80) still met.

- [ ] **Step 3: Verify mock count reduction**

Run: `grep -r 'vi\.mock' web/src --include='*.test.tsx' --include='*.test.ts' -l | wc -l`
Expected: Significantly fewer files with vi.mock (behavioral tests still need some mocks for click handler assertions, but structural tests no longer mock).

- [ ] **Step 4: Commit**

```
test: complete golden test migration — verify coverage and mock reduction
```
