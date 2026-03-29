# Sidebar View/Edit Modes & Vim Focus Fix

**Date:** 2026-03-29
**Status:** Approved

## Problem

Three related issues with the current interaction model:

1. **Vim navigation breaks after one motion.** After clicking a node to select it, focus remains on the `PersonNode` div (`tabIndex={0}`, `role="button"`). Subsequent keystrokes fire on that element. While the vim handler doesn't filter by role, React re-renders from selection changes can cause focus to land unpredictably, breaking the next keystroke. dnd-kit's `KeyboardSensor` (unused but still registered) may also contribute.

2. **Selection and editing are conflated.** Clicking a node or navigating with vim keys opens the detail sidebar as a full edit form. There's no distinction between "I'm browsing the org chart" and "I'm editing this person."

3. **Escape handlers fire simultaneously.** Multiple independent `useEscapeKey` hooks all fire on a single Escape press (e.g., `clearHead` and `clearSelection` both trigger). This is an existing bug that this design should fix.

## Design

### 1. Fix vim focus management

Two changes:

**a) Remove dnd-kit `KeyboardSensor`** from `useChartLayout.ts`. It enables keyboard-initiated drags, which are unused (`DraggableNode` already strips `tabIndex` and `role` from the draggable ref). Clean removal, no functional loss.

**b) Active focus management after selection changes.** After vim navigation (hjkl) changes the selected node, blur the active element so focus returns to the document body. This ensures the vim handler (which listens at `document` level and skips INPUT/SELECT/TEXTAREA targets) continues to receive keystrokes. Same applies after click selection and inline edit completion.

### 2. Sidebar view mode vs edit mode

The sidebar gains a `mode` state: `'view'` | `'edit'`.

**View mode** (default when selecting via click or vim navigation):
- Displays person info as read-only text — no form inputs
- Shows: name, role, discipline, team, manager name, status, pod, employment type, level, other teams, notes, private status
- An "Edit" button at the bottom switches to edit mode
- Contains no focusable form elements that could intercept vim keys

**Edit mode** (activated by `I` key, edit button, or edit icon in NodeActions):
- The current full edit form: all inputs, dropdowns, save/delete buttons
- First input receives focus when entering edit mode
- Escape returns to view mode and moves focus back to chart
- Save returns to view mode

**Batch selection** always enters edit mode directly (it's an intentional bulk-edit action).

**PodSidebar** stays as-is — it's a separate component with its own concerns.

### 3. Vim key mapping

| Key | Action | Context |
|-----|--------|---------|
| h/j/k/l | Navigate tree | Sidebar stays in view mode, updates to follow selection |
| i | Inline edit on node | Triggers double-click on name field |
| I (shift) | Sidebar edit mode | Sidebar switches to edit mode, first input focused |
| o | Add report | Under selected node |
| O | Add parent | Root nodes only |
| d | Delete | Send to recycle bin |
| x | Cut | Mark for reparent |
| p | Paste | Move cut person under selected |
| / | Focus search | Search bar |
| Escape | Layered exit | See escape layering below |

### 4. Unified escape handler

Replace the multiple independent `useEscapeKey` hooks with a single coordinated escape handler. Evaluated in priority order — **only the first matching action fires**:

1. Component-scoped escapes fire first (inline edit, search bar, AddParentPopover — these are on the focused element, not document-level, so they naturally take priority)
2. ManagerInfoPopover open -> close popover
3. Cut is active -> cancel cut
4. Sidebar is in edit mode -> switch to view mode, return focus to chart
5. Node selected (sidebar in view mode) -> deselect, close sidebar
6. Head person focused -> clear head, show full chart

This replaces the current pattern of two separate `useEscapeKey(clearHead)` and `useEscapeKey(clearSelection)` hooks in App.tsx that both fire independently on the same keypress.

### 5. Focus management rule

After any interaction that should return control to vim navigation, blur the active element:
- After vim hjkl navigation changes selection
- After click selection
- After inline edit completion (Enter/Escape/Tab/blur in PersonNode)
- After drag-and-drop completion
- After exiting sidebar edit mode via Escape

## Files to modify

- `web/src/hooks/useChartLayout.ts` — Remove KeyboardSensor
- `web/src/components/DetailSidebar.tsx` — Add view/edit mode split
- `web/src/components/DetailSidebar.module.css` — View mode styling
- `web/src/hooks/useVimNav.ts` — Add `I` binding, integrate into unified escape handler
- `web/src/hooks/useEscapeKey.ts` — Refactor or replace with unified handler
- `web/src/App.tsx` — Wire sidebar mode state, replace multiple escape hooks with unified handler
- `web/src/components/PersonNode.tsx` — Blur after inline edit completion

## Out of scope

- Keyboard-initiated drag-and-drop (removed, unused)
- Changes to inline editing (i key / double-click) — works as-is except focus cleanup
- Changes to batch selection UX
- PodSidebar view/edit mode (stays as-is)
- Vim `d` key vs delete confirmation popover inconsistency (separate concern)
- Table view sidebar behavior (vim is already disabled for table view)
