# UI State Scenarios

---

# Scenario: Deep link URL state sync

**ID**: UI-011
**Area**: ui-state
**Tests**:
- `web/src/hooks/useDeepLink.test.ts` → "useDeepLink"

## Behavior
URL query parameters reflect current UI state (selected person, view mode). Navigating to a URL with query params restores the selection and view.

## Invariants
- Selection changes update URL without page reload
- URL params parsed on mount to restore state
- Invalid IDs in URL params are ignored

## Edge cases
- None

---

# Scenario: Unsaved changes warning

**ID**: UI-012
**Area**: ui-state
**Tests**:
- `web/src/store/useDirtyTracking.test.ts` → "useDirtyTracking"

## Behavior
The beforeunload event fires a warning when the working state differs from the original. When clean (no changes), no warning is shown.

## Invariants
- Dirty state detected by reference inequality (working !== original)
- beforeunload handler registered when dirty
- Handler removed when clean
- Loaded flag must be true for tracking to activate

## Edge cases
- None

---

# Scenario: Batch edit operations

**ID**: UI-013
**Area**: ui-state
**Tests**:
- `web/src/components/DetailSidebar.test.tsx` → "batch edit"

## Behavior
Multi-selecting people opens the sidebar in batch mode. Only dirty fields are submitted. Manager changes are applied separately via reparent.

## Invariants
- Batch form shows mixed values for differing fields
- Only fields marked dirty are submitted
- Manager change triggers reparent for each selected person
- Save status reflects aggregate success/failure

## Edge cases
- All selected people have same value (no mixed indicator)
- Private checkbox in batch mode

---

# Scenario: Interactive tour

**ID**: UI-014
**Area**: ui-state
**Tests**:
- `web/src/components/Toolbar.test.tsx` → "Toolbar"

## Behavior
A guided walkthrough highlights key UI features using Driver.js popovers. The tour adapts based on whether data is loaded: empty state shows a 3-step mini-tour (welcome, upload prompt, close); loaded state shows an 8-step full tour covering view modes, data views, editing, drag-drop, snapshots, export, and recycle bin.

## Invariants
- Tour triggered via "?" help button in the toolbar
- Steps target elements via `data-tour` attributes
- Tour shows progress indicator (step N of M)
- Tour does not block user interaction with the underlying UI
- Tour configuration is created fresh each launch (not cached)
- Tour animates between steps with smooth scrolling

## Edge cases
- Target element not in DOM: Driver.js gracefully skips the step
- Empty state (no data loaded): shows simplified 3-step tour
- Tour launched while sidebar open: tour overlay renders above sidebar

---

# Scenario: Log panel

**ID**: UI-015
**Area**: ui-state
**Tests**:
- `web/src/components/LogPanel.test.tsx` → "renders log entries"
- `web/src/components/LogPanel.test.tsx` → "shows entry count"
- `web/src/components/LogPanel.test.tsx` → "renders close button"
- `web/src/components/LogPanel.test.tsx` → "handles empty state"

## Behavior
Displays API request/response logs from server and web client sources. Supports filtering by correlation ID and source type (API/Web/All). Entries are expandable to show request/response JSON bodies.

## Invariants
- Log list fetched on mount and when filter changes
- Status color: green (2xx), amber (3xx), red (4xx+), gray (no status)
- Correlation ID badge shows first 8 characters; clicking filters by that ID
- Clear button wipes all server logs then refreshes the list
- Download exports all logs (not filtered) as `grove-logs-{ISO-timestamp}.json`
- Entry count and buffer size shown in footer

## Edge cases
- Fetch error: error message displayed, previous data retained
- No request/response body: those sections not rendered
- Null correlationId: badge not shown for that entry
- Empty log list: "No log entries" message displayed

---

# Scenario: Org metrics

**ID**: UI-016
**Area**: ui-state
**Tests**:
- `web/src/hooks/useOrgMetrics.test.ts` → "span of control"
- `web/src/hooks/useOrgMetrics.test.ts` → "total headcount"
- `web/src/hooks/useOrgMetrics.test.ts` → "recruiting count"
- `web/src/hooks/useOrgMetrics.test.ts` → "discipline breakdown"
- `web/src/hooks/useOrgMetrics.test.ts` → "team/pod breakdown"

## Behavior
Computes organizational metrics for a given manager: span of control, total headcount, status breakdown, discipline composition, and team/pod groupings. Used in the manager info popover.

## Invariants
- Span of control counts direct reports only (not recursive)
- Total headcount counts all descendants recursively (excludes the manager)
- Status counters (recruiting, planned, transfers) are mutually exclusive
- Discipline breakdown only counts people with Active status
- Team/pod grouping uses pod field if set, team field as fallback, "Unassigned" if neither
- Groups sorted by count descending
- Discipline sub-counts within a group are always <= group total count

## Edge cases
- No direct reports: all metrics are zero
- No active people in subtree: byDiscipline map is empty
- Person with both pod and team: pod takes precedence for grouping
