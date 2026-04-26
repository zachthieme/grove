# Vim-Mode Scenarios

---

# Scenario: Spatial navigation

**ID**: VIM-001
**Area**: vim
**Tests**:
- `web/src/hooks/useSpatialNav.test.ts` → "[VIM-001]"

## Behavior
With vim mode enabled, h/j/k/l (and arrow keys) move selection spatially across visible person nodes. A directional bias prefers the primary axis: pressing j prefers downward neighbors over horizontal ones, and similarly for the other directions. Returns null (no-op) when no candidate exists in the requested direction.

## Invariants
- h/← → left, l/→ → right, j/↓ → down, k/↑ → up
- Primary-axis bias: downward neighbor prefers vertical alignment over horizontal proximity
- No candidate in direction → no movement, no error
- Disabled when an input/textarea/select/contentEditable element has focus

## Edge cases
- Empty rect map → null
- Single node (no neighbors) → null
- Equal-distance candidates broken by primary-axis bias

---

# Scenario: Mutation key bindings

**ID**: VIM-002
**Area**: vim
**Tests**:
- `web/src/hooks/useVimNav.test.ts` → "[VIM-002]"

## Behavior
o adds a report under the selection (sibling product if selection is itself a product). O adds a parent above selection. P adds a product (sibling on a product, child on a person, in-pod on a pod). d sends selection to recycle bin. x cuts selection (marks for move). p pastes cut nodes under selection. Multi-select supports d (delete all) and x (cut all).

## Invariants
- Single-target ops (o/O/P/p) require selectedId (size === 1)
- Multi-target ops (d/x) operate on selectedIds set
- Cut state cleared when cut targets leave the working set
- Esc cancels active cut

## Edge cases
- p with no cut targets → no-op
- d on root → no-op (must always have someone)

---

# Scenario: Search and selection bindings

**ID**: VIM-003
**Area**: vim
**Tests**:
- `web/src/hooks/useVimNav.test.ts` → "[VIM-003]"

## Behavior
/ focuses the search input. Ctrl+A / Cmd+A selects all working people. Esc cancels active cut, clears selection, and clears the focused-person filter (in priority order via useUnifiedEscape).

## Invariants
- / never opens a literal slash search dialog — only focuses the existing input
- Ctrl/Cmd-A doesn't fire when an input is focused (browser default takes over)
- Esc priority: close info popover → cancel cut → clear selection → clear head

## Edge cases
- / when search input is hidden (no data loaded) → no-op
- Ctrl-A when working is empty → no-op

---

# Scenario: Cheat sheet discoverability

**ID**: VIM-004
**Area**: vim
**Tests**:
- `web/src/components/VimCheatSheet.test.tsx` → "VimCheatSheet"

## Behavior
Pressing ? (Shift+/) when vim mode is enabled opens a modal listing all bindings, grouped by action category. Bindings render as a key+description pair. The Settings modal's vim toggle hint also points at ? as the discovery path.

## Invariants
- Modal is `role="dialog"` with `aria-modal="true"` and labeled by its title
- Click outside (overlay) closes; click inside the modal does not
- Esc key closes
- Section list mirrors the docstring on useVimNav.ts (drift caught by tests)

## Edge cases
- ? while an input is focused → no-op (vim handler skips inputs)
- ? while vim mode disabled → no-op (hook not enabled)
