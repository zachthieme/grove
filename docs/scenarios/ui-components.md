# UI Component Scenarios

---

# Scenario: Toolbar controls

**ID**: UI-001
**Area**: ui-components
**Tests**:
- `web/src/components/Toolbar.test.tsx` → "Toolbar"

## Behavior
Toolbar provides view mode pills, data view pills, export buttons, and layout refresh.

## Invariants
- View mode pills toggle between detail/manager/table
- Data view pills toggle between original/working/diff
- Export buttons trigger PNG/SVG export
- Refresh layout increments layoutKey

## Edge cases
- None

---

# Scenario: Sidebar person edit

**ID**: UI-002
**Area**: ui-components
**Tests**:
- `web/src/components/DetailSidebar.test.tsx` → "single-person edit"

## Behavior
Selecting a person opens the sidebar with an edit form. Save persists changes, Delete moves to bin.

## Invariants
- Form populated from person's current values
- Save calls update (and reparent if manager changed)
- Delete calls remove and clears selection
- Close button calls clearSelection
- Save status cycles: idle → saving → saved → idle

## Edge cases
- Duplicate names: correct person ID used on save
- Empty string fields are valid
- Very long strings pass through (server validates)
- Special characters preserved
- Whitespace-only fields pass through

---

# Scenario: Pod sidebar

**ID**: UI-003
**Area**: ui-components
**Tests**:
- `web/src/components/PodSidebar.test.tsx` → "PodSidebar"

## Behavior
Selecting a pod opens the pod sidebar. Name, public note, and private note can be edited.

## Invariants
- Save disabled when nothing changed
- Save enabled when any field changes
- updatePod called with changed fields

## Edge cases
- None

---

# Scenario: Recycle bin drawer

**ID**: UI-004
**Area**: ui-components
**Tests**:
- `web/src/components/RecycleBinDrawer.test.tsx` → "RecycleBinDrawer"
- `web/src/components/RecycleBinButton.test.tsx` → "RecycleBinButton"

## Behavior
Recycle bin shows deleted people. Each has a Restore button. Empty Bin permanently removes all.

## Invariants
- Restore calls restore API with person ID
- Close button calls setBinOpen(false)
- Empty Bin calls emptyBin API

## Edge cases
- None

---

# Scenario: Snapshots dropdown

**ID**: UI-005
**Area**: ui-components
**Tests**:
- `web/src/components/SnapshotsDropdown.test.tsx` → "SnapshotsDropdown"

## Behavior
Dropdown shows saved snapshots + "Original". Click loads snapshot, delete button removes it, Save As prompts for name.

## Invariants
- Clicking snapshot calls loadSnapshot with name
- Clicking Original calls loadSnapshot with __original__
- Delete button calls deleteSnapshot
- Save As uses window.prompt, calls saveSnapshot if not cancelled

## Edge cases
- Cancel prompt does not save

---

# Scenario: Upload prompt

**ID**: UI-006
**Area**: ui-components
**Tests**:
- `web/src/components/UploadPrompt.test.tsx` → "UploadPrompt"

## Behavior
File input triggers upload. No file selected is a no-op.

## Invariants
- upload called with the selected File object
- No call when no file selected

## Edge cases
- None

---

# Scenario: Error boundary

**ID**: UI-007
**Area**: ui-components
**Tests**:
- `web/src/components/ErrorBoundary.test.tsx` → "ErrorBoundary"

## Behavior
Catches React render errors and shows fallback UI with a recovery button.

## Invariants
- Children render normally when no error
- Error shows fallback UI
- Recovery button resets error state

## Edge cases
- None

---

# Scenario: Unparented bar

**ID**: UI-008
**Area**: ui-components
**Tests**:
- `web/src/components/UnparentedBar.test.tsx` → "UnparentedBar"

## Behavior
Shows a collapsible bar listing people with no manager (orphans). Clicking a name selects them.

## Invariants
- Toggle expands/collapses the list
- Clicking orphan name calls toggleSelect

## Edge cases
- None

---

# Scenario: Breadcrumbs navigation

**ID**: UI-009
**Area**: ui-components
**Tests**:
- `web/src/components/Breadcrumbs.test.tsx` → "Breadcrumbs"

## Behavior
Shows ancestor chain when focused on a subtree. "All" resets to full view.

## Invariants
- "All" calls setHead(null)
- Ancestor button calls setHead with ancestor ID

## Edge cases
- None

---

# Scenario: Column mapping modal

**ID**: UI-010
**Area**: ui-components
**Tests**:
- `web/src/components/ColumnMappingModal.test.tsx` → "ColumnMappingModal"

## Behavior
Shows when upload needs column mapping. Dropdowns let user assign columns. Load confirms, Cancel dismisses.

## Invariants
- Load calls onConfirm with current mapping
- Cancel calls onCancel
- Changing dropdown updates mapping state
- Load enabled only when name is mapped

## Edge cases
- Unmapping name disables Load button

---

# Scenario: Global people search

**ID**: UI-017
**Area**: ui-components
**Tests**:
- `web/src/components/SearchBar.test.tsx` → "SearchBar"

## Behavior
A search input in the toolbar lets users find people by name. As the user types, a dropdown shows up to 8 matching people. Clicking a result selects that person (opens sidebar) and scrolls to their node. Cmd+K / Ctrl+K focuses the input from anywhere. Escape clears and closes the dropdown.

## Invariants
- Only visible when org data is loaded (rendered inside the `{loaded && ...}` block of Toolbar)
- Filters `working` array by case-insensitive substring match on name only
- Shows at most 8 results
- Shows "No matches" when filter returns empty
- Clicking a result calls `setSelectedId(person.id)` and clears the query
- Arrow keys navigate results; Enter selects the highlighted result
- Escape clears the query and closes the dropdown
- Cmd+K / Ctrl+K focuses the search input

## Edge cases
- Empty query: dropdown does not open
- Query with no matches: shows "No matches" item
