# Selection Scenarios

---

# Scenario: Single and multi-select

**ID**: SELECT-001
**Area**: selection
**Tests**:
- `web/src/store/SelectionContext.test.tsx` → "SelectionContext"
- `web/src/store/OrgContext.integration.test.tsx` → "selection"

## Behavior
Clicking a person selects them. Shift/Ctrl-click adds to selection. Clicking selected person deselects. Pod selection clears person selection and vice versa.

## Invariants
- Single click: select one, deselect previous
- Multi-click (shift/ctrl): add to existing selection
- Toggle: clicking already-selected person deselects
- selectPod clears person selection
- batchSelect sets exact Set of IDs
- selectedId derived: returns single ID when exactly one selected, null otherwise
- clearSelection empties everything

## Edge cases
- useSelection throws outside provider

---

# Scenario: Escape key handling

**ID**: SELECT-002
**Area**: selection
**Tests**:
- `web/src/hooks/useEscapeKey.test.ts` → "useEscapeKey"

## Behavior
Escape key triggers callbacks: clears selection, exits head focus. Disabled when focus is in form elements.

## Invariants
- Calls callback on Escape when enabled
- Ignores non-Escape keys
- Ignores when disabled
- Ignores when focus in INPUT, SELECT, TEXTAREA
- Stops listening on unmount

## Edge cases
- None

---

# Scenario: Outside click handling

**ID**: SELECT-003
**Area**: selection
**Tests**:
- `web/src/hooks/useOutsideClick.test.ts` → "useOutsideClick"

## Behavior
Clicking outside a referenced element triggers a callback (e.g., closing a dropdown).

## Invariants
- Fires on mousedown outside ref element
- Does not fire on mousedown inside or on children
- Does not fire when not active
- Stops listening on unmount

## Edge cases
- None

---

# Scenario: Drag and drop

**ID**: SELECT-004
**Area**: selection
**Tests**:
- `web/src/hooks/useDragDrop.test.ts` → "useDragDrop"

## Behavior
Dropping a person onto another person reparents them. Dropping onto a team target moves to that team. Multi-select drags move all selected people.

## Invariants
- Person-to-person drop: calls reparent
- Person-to-team drop: calls move with team name
- Multi-select: all selected people moved (excluding drop target)
- Self-drop: no-op
- No drop target: no-op
- Pod drop: moves with pod manager and team
- Single selected person: moves only that person

## Edge cases
- Dragged person not in selectedIds → move only dragged person
- Pod not found → fallback to pod name as team

---

# Scenario: Deep linking via URL

**ID**: SELECT-005
**Area**: selection
**Tests**:
- `web/src/hooks/useDeepLink.test.ts` → "useDeepLink"

## Behavior
viewMode, selectedId, and headPersonId are synced to URL query params (?view=, ?selected=, ?head=). Default values are omitted from URL.

## Invariants
- On mount: reads URL params and applies to state
- On state change: writes to URL via history.replaceState
- Default view (detail) omitted from URL
- Null selectedId and headPersonId omitted from URL
- Invalid view values ignored

## Edge cases
- URL with no params → no state changes on mount

---

# Scenario: Note icon toggle

**ID**: SELECT-006
**Area**: selection
**Tests**:
- `web/e2e/features.spec.ts` → "note icon toggle"

## Behavior
Clicking the note icon on a person node toggles a note popover or sidebar.

## Invariants
- Click shows note content
- Second click or outside click hides it

## Edge cases
- None
