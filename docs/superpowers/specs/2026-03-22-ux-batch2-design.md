# UX Batch 2 — Filters, Focus, Reparent Consistency, UI Tests

## 1. Employment Type Filter

Excel-style column filter in the toolbar. A dropdown with checkboxes for each employment type found in the data.

**Toolbar:** "Filter" dropdown button. When any types are hidden, shows a badge count.

**Dropdown contents:**
- Dynamic list of all `employmentType` values in the working data
- Always includes "FTE" and "(blank)" for people with no type set
- Each type has a checkbox (checked = visible)
- "Select All" / "Clear All" at the top

**Filtering:**
- Client-side only — data stays in OrgContext, views skip filtered-out people
- State: `hiddenEmploymentTypes: Set<string>` in OrgContext
- Filtered people excluded from: node rendering, headcount metrics, manager info popover counts
- Filter persists across view switches (Detail ↔ Manager)

## 2. Set Head (Focus on Subtree)

Re-root the chart at a specific person. Their subtree becomes the entire view.

**Trigger:** New "focus" action button (⊙) in NodeActions hover overlay, visible on managers only. Clicking sets that person as head.

**Breadcrumb bar:** Appears below toolbar when head is set. Shows path from root: "All → Sarah Chen → Mike Torres". Click any segment to zoom to that level. Click "All" for full view.

**State:** `headPersonId: string | null` in OrgContext. When set, views filter to only that person + their recursive descendants.

**Escape:** Pressing Escape clears head and returns to full view.

**Interaction with filters:** Employment type filter still applies within the focused subtree.

## 3. Reparent Consistency

Centralize reparent logic so all paths behave identically.

**New OrgContext action:** `reparent(personId: string, newManagerId: string): Promise<void>`
- Looks up the new manager's team from `working`
- Calls `move(personId, newManagerId, managerTeam)`
- Both drag-and-drop and sidebar manager dropdown call `reparent` instead of `move`/`update`

**Affected paths:**
- `useDragDrop.ts` — calls `reparent` for person-to-person drops (team header drops still use `move` directly since the team is explicit)
- `DetailSidebar.tsx` — when manager dropdown changes, calls `reparent` on save instead of including managerId in the `update` fields. Team field in the form auto-updates to reflect the new manager's team.
- Batch edit — when manager field is changed in batch mode, each person gets `reparent` called instead of `update` with managerId.

**Backend:** No changes needed. `POST /api/move` already accepts `{personId, newManagerId, newTeam}`.

## 4. UI Tests (Playwright)

End-to-end browser tests.

**Setup:**
- Install Playwright: `npm init playwright@latest` in project root
- `e2e/` directory for test files
- Test helper starts `grove serve` on a random port, uploads test CSV
- `playwright.config.ts` at project root

**Test cases:**

### Upload & Render
- Upload `testdata/simple.csv` → chart renders 3 nodes
- Upload `testdata/ddp-org.csv` → chart renders correct node count
- Upload nonstandard CSV → mapping modal appears

### Node Interaction
- Click node → sidebar opens with person's data
- Edit name in sidebar → save → node text updates
- Hover node → action buttons appear
- Click + → new node appears under parent
- Click × → node moves to recycle bin
- Open recycle bin → restore person → node reappears

### Drag-and-Drop
- Drag node onto another → reparent (manager changes)
- Drag node onto team header → team changes

### Views
- Switch to Manager view → ICs collapsed into summary cards
- Switch back to Detail → ICs visible again

### Filters & Focus
- Open employment type filter → uncheck a type → nodes hidden
- Re-check → nodes visible
- Click focus (⊙) on a manager → chart re-roots → breadcrumb appears
- Click "All" in breadcrumb → full view restored
- Press Escape → full view restored

### Snapshots
- Save snapshot → appears in dropdown
- Load snapshot → chart reverts
- Delete snapshot → removed from dropdown

### Export
- Export CSV → file downloads
- Export PNG → file downloads
