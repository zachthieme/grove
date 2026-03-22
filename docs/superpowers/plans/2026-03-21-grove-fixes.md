# Grove Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename to Grove, remove tree view, add reflow button, add browser navigation guard, expand statuses to 7, and add status info popover.

**Architecture:** Six independent changes touching both Go backend and React frontend. The status expansion is the most cross-cutting (model, parser, views, frontend). The rest are localized changes.

**Tech Stack:** Go, React, TypeScript, CSS modules

**Spec:** `docs/superpowers/specs/2026-03-21-grove-fixes-design.md`

---

## File Structure

### Modified files

| File | Changes |
|------|---------|
| `Makefile` | Binary name `orgchart` → `grove`, clean target |
| `cmd/root.go` | Cobra `Use: "grove"` |
| `web/index.html` | `<title>Grove</title>` |
| `web/src/components/Toolbar.tsx` | Title "Grove", remove Tree tab, add Reflow button |
| `internal/model/model.go` | Replace 4 status constants with 7, update validation |
| `internal/model/model_test.go` | Update tests for new statuses |
| `internal/parser/parser.go` | Add backwards-compat status mapping in BuildPeople/BuildPeopleWithMapping |
| `internal/views/people.go` | Update status switch for new constants |
| `internal/views/headcount.go` | Update status switch for new constants |
| `internal/views/viewmodel.go` | Add new classDef constants |
| `web/src/api/types.ts` | Update Person status union type |
| `web/src/components/PersonNode.tsx` | Update status styling logic |
| `web/src/components/PersonNode.module.css` | Add new status styles |
| `web/src/components/DetailSidebar.tsx` | Update STATUSES array, add info popover |
| `web/src/views/HeadcountView.tsx` | Update status grouping |
| `web/src/store/OrgContext.tsx` | Add layoutKey + reflow, remove 'tree' from ViewMode, add beforeunload |
| `web/src/App.tsx` | Remove TreeView, use layoutKey, render without tree branch |

### Deleted files

| File | Reason |
|------|--------|
| `web/src/views/TreeView.tsx` | Tree view removed |
| `web/src/views/TreeView.module.css` | Tree view removed |
| `web/src/hooks/useZoomPan.ts` | Only used by TreeView |

---

## Task 1: Rename to Grove + Remove Tree View

**Files:**
- Modify: `Makefile`
- Modify: `cmd/root.go`
- Modify: `web/index.html`
- Modify: `web/src/components/Toolbar.tsx`
- Modify: `web/src/store/OrgContext.tsx`
- Modify: `web/src/App.tsx`
- Delete: `web/src/views/TreeView.tsx`
- Delete: `web/src/views/TreeView.module.css`
- Delete: `web/src/hooks/useZoomPan.ts`

These are pure removal/rename changes — no new logic.

- [ ] **Step 1: Rename in Makefile**

Change `orgchart` to `grove`:
```makefile
build: frontend
	go build -o grove .

clean:
	rm -rf web/dist grove
```

- [ ] **Step 2: Update Cobra root command**

In `cmd/root.go`:
```go
var rootCmd = &cobra.Command{
	Use:   "grove",
	Short: "Interactive org chart tool",
}
```

- [ ] **Step 3: Update HTML title**

In `web/index.html`:
```html
<title>Grove</title>
```

- [ ] **Step 4: Update Toolbar title and remove Tree tab**

In `web/src/components/Toolbar.tsx`:
- Change `<span className={styles.title}>Org Chart</span>` to `<span className={styles.title}>Grove</span>`
- Remove the `{ value: 'tree', label: 'Tree' }` entry from `viewModes`

- [ ] **Step 5: Remove 'tree' from ViewMode type**

In `web/src/store/OrgContext.tsx`:
- Change `type ViewMode = 'tree' | 'columns' | 'headcount'` to `type ViewMode = 'columns' | 'headcount'`
- Change default `viewMode: 'tree'` to `viewMode: 'columns'`

- [ ] **Step 6: Remove TreeView from App.tsx**

Remove the TreeView import and the `viewMode === 'tree'` rendering branch. Remove the `useZoomPan` import if present.

- [ ] **Step 7: Delete tree view files**

```bash
rm web/src/views/TreeView.tsx web/src/views/TreeView.module.css web/src/hooks/useZoomPan.ts
```

- [ ] **Step 8: Verify build**

```bash
cd web && npm run build && cd .. && make build
```

- [ ] **Step 9: Verify CLI**

```bash
./grove people testdata/simple.csv | head -1
```

Expected: `flowchart TD`

- [ ] **Step 10: Run all tests**

```bash
go test ./...
```

- [ ] **Step 11: Commit**

```bash
jj describe -m "feat: rename to Grove, remove tree view"
```

---

## Task 2: Reflow Button + Navigation Guard

**Files:**
- Modify: `web/src/store/OrgContext.tsx`
- Modify: `web/src/components/Toolbar.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Add layoutKey and reflow to OrgContext**

In OrgState, add `layoutKey: number` (initial: 0).
In OrgActions, add `reflow: () => void`.

```ts
const reflow = useCallback(() => {
  setState((s) => ({ ...s, layoutKey: s.layoutKey + 1 }))
}, [])
```

Add to context value.

- [ ] **Step 2: Add beforeunload guard to OrgContext**

Add a `useEffect` in `OrgProvider`:

```ts
useEffect(() => {
  const hasChanges = state.loaded && (
    state.working.length !== state.original.length ||
    state.working.some((w, i) => w.id !== state.original[i]?.id)
  )

  if (!hasChanges) return

  const handler = (e: BeforeUnloadEvent) => {
    e.preventDefault()
  }
  window.addEventListener('beforeunload', handler)
  return () => window.removeEventListener('beforeunload', handler)
}, [state.loaded, state.working, state.original])
```

- [ ] **Step 3: Add Reflow button to Toolbar**

Add a button after the view mode pills:
```tsx
<button
  className={styles.pill}
  onClick={() => reflow()}
  title="Re-layout"
>
  ↻
</button>
```

Get `reflow` from `useOrg()`.

- [ ] **Step 4: Use layoutKey in App.tsx**

Get `layoutKey` from `useOrg()`. Pass as `key` prop to views:

```tsx
<ColumnView key={layoutKey} ... />
<HeadcountView key={layoutKey} ... />
```

- [ ] **Step 5: Verify build**

```bash
cd web && npm run build
```

- [ ] **Step 6: Commit**

```bash
jj describe -m "feat: add reflow button and browser navigation guard"
```

---

## Task 3: Expanded Statuses — Backend

**Files:**
- Modify: `internal/model/model.go`
- Modify: `internal/model/model_test.go`
- Modify: `internal/parser/parser.go`
- Modify: `internal/parser/parser_test.go`
- Modify: `internal/views/people.go`
- Modify: `internal/views/people_test.go`
- Modify: `internal/views/headcount.go`
- Modify: `internal/views/headcount_test.go`
- Modify: `internal/views/viewmodel.go`
- Modify: `integration_test.go`
- Modify: `testdata/crossteam.csv`
- Modify: `testdata/complex.csv`

- [ ] **Step 1: Write failing test for new statuses**

Add to `model_test.go`:

```go
func TestNewOrg_NewStatuses(t *testing.T) {
	statuses := []string{"Active", "Open", "Pending Open", "Transfer In", "Transfer Out", "Backfill", "Planned"}
	for _, s := range statuses {
		people := []Person{
			{Name: "Test", Role: "Eng", Discipline: "Eng", Manager: "", Team: "T", Status: s},
		}
		// Transfer In, Transfer Out, Pending Open, Planned allow blank role/discipline
		if s == "Transfer In" || s == "Transfer Out" || s == "Pending Open" || s == "Planned" {
			people[0].Role = ""
			people[0].Discipline = ""
		}
		_, err := NewOrg(people)
		if err != nil {
			t.Errorf("status %q should be valid, got error: %v", s, err)
		}
	}
}

func TestNewOrg_OldStatusesRejected(t *testing.T) {
	// "Hiring" and bare "Transfer" should no longer be valid (they're mapped in parser, not model)
	for _, s := range []string{"Hiring", "Transfer"} {
		people := []Person{
			{Name: "Test", Role: "Eng", Discipline: "Eng", Manager: "", Team: "T", Status: s},
		}
		_, err := NewOrg(people)
		if err == nil {
			t.Errorf("status %q should be rejected by model", s)
		}
	}
}
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
go test ./internal/model/ -run "TestNewOrg_NewStatuses|TestNewOrg_OldStatuses" -v
```

- [ ] **Step 3: Update model.go**

Replace status constants:
```go
const (
	StatusActive      = "Active"
	StatusOpen        = "Open"
	StatusPendingOpen = "Pending Open"
	StatusTransferIn  = "Transfer In"
	StatusTransferOut = "Transfer Out"
	StatusBackfill    = "Backfill"
	StatusPlanned     = "Planned"
)
```

Remove `StatusHiring` and `StatusTransfer`.

Update `NewOrg` validation:
```go
validStatuses := map[string]bool{
	StatusActive: true, StatusOpen: true, StatusPendingOpen: true,
	StatusTransferIn: true, StatusTransferOut: true,
	StatusBackfill: true, StatusPlanned: true,
}
```

Update the Role/Discipline exemption:
```go
blankAllowed := p.Status == StatusTransferIn || p.Status == StatusTransferOut ||
	p.Status == StatusPendingOpen || p.Status == StatusPlanned
if !blankAllowed {
	if p.Role == "" { ... }
	if p.Discipline == "" { ... }
}
```

- [ ] **Step 4: Update existing model tests**

The existing `TestNewOrg_TransferAllowsBlankRoleAndDiscipline` uses `Status: "Transfer"` — update to `"Transfer In"`.

- [ ] **Step 5: Add backwards-compat mapping to parser**

In `BuildPeople` (the function that reads exact header names), add status normalization after extracting the status value:

```go
status := get("status")
switch status {
case "Hiring":
	status = "Open"
case "Transfer":
	status = "Transfer In"
}
p.Status = status
```

Same in `BuildPeopleWithMapping`.

- [ ] **Step 6: Update internal/views/people.go**

The switch on `p.Status` uses `model.StatusHiring` and `model.StatusTransfer`. Update to handle all 7 statuses. Group Open/Backfill as hiring-style (dashed blue), PendingOpen/Planned as future (dashed gray), TransferIn/TransferOut as transfer (dashed amber).

- [ ] **Step 7: Update internal/views/headcount.go**

Same — update the status switch to group the new statuses.

- [ ] **Step 8: Update internal/views/viewmodel.go if needed**

Add new classDef constants if the views need them (e.g., `classDefPending`, `classDefBackfill`). Or simplify to reuse existing ones where visual treatment is the same.

- [ ] **Step 9: Update testdata CSV files**

`testdata/crossteam.csv` has `Hiring` and `Transfer` statuses. Update:
- `Hiring` → `Open`
- `Transfer` → `Transfer In`

Also check `testdata/complex.csv` for any `Hiring` or `Transfer` values and update them.

- [ ] **Step 10: Update view test files**

- `internal/views/people_test.go` — update any `Status: "Hiring"` to `"Open"` and `Status: "Transfer"` to `"Transfer In"`
- `internal/views/headcount_test.go` — same updates
- `internal/parser/parser_test.go` — `TestParseCSV_CrossTeam` asserts `open.Status != "Hiring"` — after the backwards-compat mapping, the parser maps `"Hiring"` to `"Open"`, so update this assertion to check `open.Status == "Open"` (or just verify it's not empty, since the CSV is now updated)

- [ ] **Step 11: Update integration test**

`integration_test.go` checks for the string `"classDef hiring"` in Mermaid output. If the classDef names change (e.g., from `classHiring` to `classRecruiting`), update this string assertion. The compiler won't catch this — it's a string comparison.

- [ ] **Step 12: Run all Go tests**

```bash
go test ./...
```

ALL tests must pass — no skipping.

- [ ] **Step 13: Commit**

```bash
jj describe -m "feat: expand statuses to 7 (backend), add backwards-compat mapping"
```

---

## Task 4: Expanded Statuses — Frontend

**Files:**
- Modify: `web/src/api/types.ts`
- Modify: `web/src/components/PersonNode.tsx`
- Modify: `web/src/components/PersonNode.module.css`
- Modify: `web/src/views/HeadcountView.tsx`

- [ ] **Step 1: Update Person status type**

In `types.ts`:
```ts
status: 'Active' | 'Open' | 'Pending Open' | 'Transfer In' | 'Transfer Out' | 'Backfill' | 'Planned'
```

- [ ] **Step 2: Update PersonNode styling logic**

```tsx
const isRecruiting = person.status === 'Open' || person.status === 'Backfill'
const isFuture = person.status === 'Pending Open' || person.status === 'Planned'
const isTransfer = person.status === 'Transfer In' || person.status === 'Transfer Out'

const classNames = [
  styles.node,
  selected && styles.selected,
  isRecruiting && styles.recruiting,
  isFuture && styles.future,
  isTransfer && styles.transfer,
  // ... rest unchanged
].filter(Boolean).join(' ')

const prefix = isRecruiting ? '\u{1F535} ' : isFuture ? '\u{2B1C} ' : isTransfer ? '\u{1F7E1} ' : ''
```

- [ ] **Step 3: Update PersonNode.module.css**

Replace `.hiring` with `.recruiting` and add `.future`:
```css
.recruiting {
  border-style: dashed;
  border-color: #60a5fa;
}

.future {
  border-style: dashed;
  border-color: #9ca3af;
}

.transfer {
  border-style: dashed;
  border-color: #f59e0b;
}
```

- [ ] **Step 4: Update HeadcountView grouping**

Replace the current `hiring`/`transfer` counters with three groups:
```ts
interface TeamCount {
  team: string
  disciplines: Map<string, number>
  recruiting: number   // Open + Backfill
  planned: number      // Pending Open + Planned
  transfers: number    // Transfer In + Transfer Out
  total: number
}
```

Update the counting logic:
```ts
if (person.status === 'Active') {
  // count by discipline
} else if (person.status === 'Open' || person.status === 'Backfill') {
  tc.recruiting++
} else if (person.status === 'Pending Open' || person.status === 'Planned') {
  tc.planned++
} else if (person.status === 'Transfer In' || person.status === 'Transfer Out') {
  tc.transfers++
}
tc.total++
```

Update the rendering to show all three groups.

- [ ] **Step 5: Verify build**

```bash
cd web && npm run build
```

- [ ] **Step 6: Commit**

```bash
jj describe -m "feat: expand statuses to 7 (frontend), update node styles and headcount"
```

---

## Task 5: Status Info Popover + Sidebar Updates

**Files:**
- Modify: `web/src/components/DetailSidebar.tsx`
- Modify: `web/src/components/DetailSidebar.module.css`

- [ ] **Step 1: Update STATUSES array**

```ts
const STATUSES: Person['status'][] = [
  'Active', 'Open', 'Pending Open', 'Transfer In', 'Transfer Out', 'Backfill', 'Planned',
]

const STATUS_DESCRIPTIONS: Record<string, string> = {
  'Active': 'Currently filled and working',
  'Open': 'Approved headcount, actively recruiting',
  'Pending Open': 'Headcount requested, not yet approved',
  'Transfer In': 'Person coming from another team/org',
  'Transfer Out': 'Person leaving to another team/org',
  'Backfill': 'Replacing someone who left',
  'Planned': 'Future role in a reorg, not yet active',
}
```

- [ ] **Step 2: Add info popover**

Add a small ℹ icon next to the Status label with hover state:

```tsx
const [showStatusInfo, setShowStatusInfo] = useState(false)

// In the Status field:
<div className={styles.field}>
  <label>
    Status
    <span
      className={styles.infoIcon}
      onMouseEnter={() => setShowStatusInfo(true)}
      onMouseLeave={() => setShowStatusInfo(false)}
    >
      ℹ
    </span>
  </label>
  {showStatusInfo && (
    <div className={styles.infoPop}>
      {STATUSES.map((s) => (
        <div key={s} className={styles.infoRow}>
          <strong>{s}</strong> — {STATUS_DESCRIPTIONS[s]}
        </div>
      ))}
    </div>
  )}
  <select ...>
```

- [ ] **Step 3: Add popover styles**

```css
.infoIcon {
  cursor: help;
  color: #3b82f6;
  margin-left: 6px;
  font-size: 13px;
}

.infoPop {
  position: absolute;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 10px 12px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  z-index: 30;
  width: 260px;
  font-size: 12px;
  right: 16px;
}

.infoRow {
  margin-bottom: 4px;
  line-height: 1.4;
}
```

Add `position: relative` to the `.field` class if not already present.

- [ ] **Step 4: Verify build**

```bash
cd web && npm run build
```

- [ ] **Step 5: Full build and test**

```bash
make build && go test ./...
```

- [ ] **Step 6: Commit**

```bash
jj describe -m "feat: add status info popover and update sidebar for 7 statuses"
```

---

## Summary

| Task | What it delivers | Key files |
|------|-----------------|-----------|
| 1 | Rename to Grove, remove tree view | Makefile, root.go, Toolbar, App, delete TreeView |
| 2 | Reflow button + navigation guard | OrgContext, Toolbar, App |
| 3 | 7 statuses — backend | model.go, parser.go, views/*.go |
| 4 | 7 statuses — frontend | types.ts, PersonNode, HeadcountView |
| 5 | Status info popover + sidebar | DetailSidebar |
