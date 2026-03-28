# Filter Scenarios

---

# Scenario: Employment type filter

**ID**: FILTER-001
**Area**: filters
**Tests**:
- `web/e2e/features.spec.ts` → "employment type filter"
- `web/src/components/EmploymentTypeFilter.test.tsx` → "EmploymentTypeFilter"
- `web/src/hooks/useFilteredPeople.test.ts` → "filters out people matching hidden employment types"
- `web/src/store/UIContext.test.tsx` → "toggleEmploymentTypeFilter adds and removes from hidden set"
- `web/src/store/UIContext.test.tsx` → "showAllEmploymentTypes clears hidden set"
- `web/src/store/UIContext.test.tsx` → "hideAllEmploymentTypes adds all provided types to hidden set"

## Behavior
User toggles employment type checkboxes in the filter panel. People with hidden employment types are excluded from the view.

## Invariants
- Hidden types stored as a Set
- Toggle adds if absent, removes if present
- Show All clears the set (shows everyone)
- Hide All adds all known types to the set
- Filtering applies to both people and ghost people in diff mode

## Edge cases
- Undefined employmentType treated as not matching any filter
- Empty hidden set shows all people

---

# Scenario: Head focus / subtree zoom

**ID**: FILTER-002
**Area**: filters
**Tests**:
- `web/e2e/features.spec.ts` → "head focus subtree zoom"
- `web/src/hooks/useHeadSubtree.test.ts` → "useHeadSubtree"
- `web/src/hooks/useFilteredPeople.test.ts` → "filters to only people in the head subtree"

## Behavior
User clicks the focus button on a manager node. The view zooms to show only that manager's subtree. Breadcrumbs show the path. Escape or "All" returns to full view.

## Invariants
- headSubtree includes the head person and all descendants
- Only people in the subtree are shown
- Ghost people (diff mode) also filtered by subtree
- Null headPersonId shows everyone

## Edge cases
- Leaf node as head → shows just that person
- Root node as head → shows entire tree
- Empty working list with non-null head → returns null

---

# Scenario: Sorted people

**ID**: FILTER-003
**Area**: filters
**Tests**:
- `web/src/hooks/useSortedPeople.test.ts` → "sortPeople"

## Behavior
People are sorted within each (managerId, team) group by: FTE tier → discipline order → level descending → sortIndex.

## Invariants
- FTEs and Interns sort in tier 0; all other types in tier 1
- Discipline order follows settings.disciplineOrder array index
- Unknown disciplines (not in disciplineOrder) sort alphabetically after all known disciplines
- Higher levels sort first within same discipline
- Level 0 (unset) sorts below all positive levels but above no-level entries
- Root nodes (no managerId) are not sorted
- sortIndex breaks remaining ties (ascending)

## Edge cases
- Empty discipline order → all disciplines sort alphabetically
- All people same discipline and level → sortIndex is sole differentiator
- Negative levels are not used in practice but would sort below positive levels

---

# Scenario: Private people visibility

**ID**: FILTER-004
**Area**: filters
**Tests**:
- `web/src/hooks/useFilteredPeople.test.ts` → "hides private people when showPrivate is false"
- `web/src/hooks/useFilteredPeople.test.ts` → "shows private people when showPrivate is true"
- `web/src/hooks/useFilteredPeople.test.ts` → "injects placeholder for hidden private manager with visible reports"
- `web/src/hooks/useFilteredPeople.test.ts` → "does not inject placeholder when private manager has no visible reports"
- `web/src/hooks/useFilteredPeople.test.ts` → "filters private people from ghost people in diff mode"

## Behavior
User marks people as private via the edit sidebar. Private people are hidden from all views by default. A toolbar toggle (visible only when private people exist) reveals/hides them. Hidden private managers with visible reports are replaced by "TBD Manager" placeholder nodes.

## Invariants
- Private field defaults to false
- showPrivate defaults to false (hidden by default)
- Toolbar toggle only visible when at least one person is private
- Placeholder managers have stable deterministic IDs based on the real manager ID
- Placeholders are non-interactive (no edit, no delete, no drag-as-source)
- Drops onto placeholders resolve to the real hidden manager ID
- Private people are excluded from ghost people when hidden in diff mode
- Private people are excluded from recycle bin when hidden
- Metrics reflect only visible people when private people are hidden
- Exports always include all people regardless of toggle state

## Edge cases
- Private manager with no visible reports → no placeholder injected
- Head person is private and hidden → head filter clears
- All people private and hidden → empty view
