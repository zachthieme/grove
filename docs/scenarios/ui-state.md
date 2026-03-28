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
