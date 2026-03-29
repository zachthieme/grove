# Sidebar View/Edit Modes & Vim Focus Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix vim navigation so it works reliably for multiple motions, split the detail sidebar into view/edit modes, and unify escape handling into a single prioritized handler.

**Architecture:** Three independent changes that compose: (1) remove dead KeyboardSensor + add active blur after selection changes, (2) refactor DetailSidebar into view-mode (read-only) and edit-mode (current form), controlled by a `sidebarMode` state in App.tsx, (3) replace multiple `useEscapeKey` hooks with a single unified handler that evaluates state in priority order.

**Tech Stack:** React, TypeScript, vitest, dnd-kit, CSS modules

**Spec:** `docs/superpowers/specs/2026-03-29-sidebar-vim-focus-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `web/src/hooks/useChartLayout.ts` | Modify | Remove KeyboardSensor import and usage |
| `web/src/hooks/useVimNav.ts` | Modify | Add blur after navigation, add `I` binding, add `onSidebarEdit` callback |
| `web/src/hooks/useEscapeKey.ts` | Delete | Replaced by unified escape handler |
| `web/src/hooks/useUnifiedEscape.ts` | Create | Single escape handler with priority-ordered actions |
| `web/src/components/DetailSidebar.tsx` | Modify | Add view/edit mode split, accept `mode` + `onSetMode` props |
| `web/src/components/DetailSidebar.module.css` | Modify | Add view-mode styling |
| `web/src/components/PersonNode.tsx` | Modify | Blur after inline edit completion, wire edit icon to sidebar edit mode |
| `web/src/components/ManagerInfoPopover.tsx` | Modify | Use unified escape instead of useEscapeKey |
| `web/src/App.tsx` | Modify | Add `sidebarMode` state, wire unified escape, pass mode to sidebar |
| `web/src/store/ViewDataContext.tsx` | Modify | Add `onEditMode` callback for NodeActions edit icon |

---

### Task 1: Remove KeyboardSensor from useChartLayout

**Files:**
- Modify: `web/src/hooks/useChartLayout.ts:2,20-22`

- [ ] **Step 1: Remove KeyboardSensor**

Change the import and sensor setup:

```typescript
// Before (line 2):
import { MouseSensor, KeyboardSensor, useSensor, useSensors, type DragStartEvent } from '@dnd-kit/core'

// After:
import { MouseSensor, useSensor, useSensors, type DragStartEvent } from '@dnd-kit/core'
```

Remove lines 21-22 and update line 22:

```typescript
// Before (lines 20-22):
const mouseSensor = useSensor(MouseSensor, { activationConstraint: { distance: 8 } })
const keyboardSensor = useSensor(KeyboardSensor)
const sensors = useSensors(mouseSensor, keyboardSensor)

// After:
const mouseSensor = useSensor(MouseSensor, { activationConstraint: { distance: 8 } })
const sensors = useSensors(mouseSensor)
```

- [ ] **Step 2: Verify build**

Run: `cd web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run all tests**

Run: `cd web && npx vitest run`
Expected: All tests pass (no test references KeyboardSensor directly)

- [ ] **Step 4: Commit**

```bash
jj new -m "fix: remove unused dnd-kit KeyboardSensor"
```

---

### Task 2: Add blur after vim navigation and inline edit completion

**Files:**
- Modify: `web/src/hooks/useVimNav.ts:84,92,98,104,167`
- Modify: `web/src/components/PersonNode.tsx:68-73`

- [ ] **Step 1: Add blur after vim navigation in useVimNav.ts**

After each `navigate()` call and after the `i` inline edit dispatch, blur the active element. Add this at the end of the navigate function (line 132, before the closing `}`), and after the `navigate(e.key)` call on line 167:

In the keyboard handler (around line 165-168), after `navigate(e.key)`:

```typescript
if (['j', 'k', 'h', 'l', 'o', 'O', 'd', 'x', 'p'].includes(e.key)) {
  e.preventDefault()
  navigate(e.key)
  // Ensure focus returns to document body so subsequent vim keys work
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur()
  }
}
```

- [ ] **Step 2: Add blur after inline edit completion in PersonNode.tsx**

In `commitEdit` (lines 68-73), blur after clearing the editing field:

```typescript
const commitEdit = () => {
  if (editingField && editValue.trim() !== getOriginal(editingField)) {
    onInlineEdit?.(editingField, editValue.trim())
  }
  setEditingField(null)
  // Return focus to document body so vim keys resume working
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur()
  }
}
```

- [ ] **Step 3: Verify build**

Run: `cd web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Run all tests**

Run: `cd web && npx vitest run`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
jj new -m "fix: blur active element after vim navigation and inline edit"
```

---

### Task 3: Create unified escape handler

**Files:**
- Create: `web/src/hooks/useUnifiedEscape.ts`
- Create: `web/src/hooks/useUnifiedEscape.test.ts`
- Delete: `web/src/hooks/useEscapeKey.ts`
- Delete: `web/src/hooks/useEscapeKey.test.ts`

- [ ] **Step 1: Write test for useUnifiedEscape**

Create `web/src/hooks/useUnifiedEscape.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { fireEvent } from '@testing-library/dom'
import { useUnifiedEscape } from './useUnifiedEscape'

function makeActions(overrides: Partial<Parameters<typeof useUnifiedEscape>[0]> = {}) {
  return {
    infoPopoverOpen: false,
    onCloseInfoPopover: vi.fn(),
    cutActive: false,
    onCancelCut: vi.fn(),
    sidebarEditMode: false,
    onExitSidebarEdit: vi.fn(),
    hasSelection: false,
    onClearSelection: vi.fn(),
    hasHead: false,
    onClearHead: vi.fn(),
    enabled: true,
    ...overrides,
  }
}

describe('useUnifiedEscape', () => {
  it('[SELECT-002] fires only the highest-priority action', () => {
    const actions = makeActions({
      cutActive: true,
      hasSelection: true,
      hasHead: true,
    })
    renderHook(() => useUnifiedEscape(actions))
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(actions.onCancelCut).toHaveBeenCalledTimes(1)
    expect(actions.onClearSelection).not.toHaveBeenCalled()
    expect(actions.onClearHead).not.toHaveBeenCalled()
  })

  it('[SELECT-002] info popover has highest priority', () => {
    const actions = makeActions({
      infoPopoverOpen: true,
      cutActive: true,
      sidebarEditMode: true,
      hasSelection: true,
    })
    renderHook(() => useUnifiedEscape(actions))
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(actions.onCloseInfoPopover).toHaveBeenCalledTimes(1)
    expect(actions.onCancelCut).not.toHaveBeenCalled()
    expect(actions.onExitSidebarEdit).not.toHaveBeenCalled()
    expect(actions.onClearSelection).not.toHaveBeenCalled()
  })

  it('[SELECT-002] sidebar edit mode exits to view mode', () => {
    const actions = makeActions({
      sidebarEditMode: true,
      hasSelection: true,
    })
    renderHook(() => useUnifiedEscape(actions))
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(actions.onExitSidebarEdit).toHaveBeenCalledTimes(1)
    expect(actions.onClearSelection).not.toHaveBeenCalled()
  })

  it('[SELECT-002] clears selection when in view mode', () => {
    const actions = makeActions({ hasSelection: true, hasHead: true })
    renderHook(() => useUnifiedEscape(actions))
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(actions.onClearSelection).toHaveBeenCalledTimes(1)
    expect(actions.onClearHead).not.toHaveBeenCalled()
  })

  it('[SELECT-002] clears head when nothing else is active', () => {
    const actions = makeActions({ hasHead: true })
    renderHook(() => useUnifiedEscape(actions))
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(actions.onClearHead).toHaveBeenCalledTimes(1)
  })

  it('[SELECT-002] skips when focus is in an input', () => {
    const actions = makeActions({ hasSelection: true })
    renderHook(() => useUnifiedEscape(actions))

    const input = document.createElement('input')
    document.body.appendChild(input)
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(actions.onClearSelection).not.toHaveBeenCalled()
    document.body.removeChild(input)
  })

  it('[SELECT-002] does nothing when disabled', () => {
    const actions = makeActions({ hasSelection: true, enabled: false })
    renderHook(() => useUnifiedEscape(actions))
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(actions.onClearSelection).not.toHaveBeenCalled()
  })

  it('[SELECT-002] does not fire on non-Escape keys', () => {
    const actions = makeActions({ hasSelection: true })
    renderHook(() => useUnifiedEscape(actions))
    fireEvent.keyDown(document, { key: 'Enter' })

    expect(actions.onClearSelection).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/hooks/useUnifiedEscape.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement useUnifiedEscape**

Create `web/src/hooks/useUnifiedEscape.ts`:

```typescript
import { useEffect, useRef } from 'react'

interface UnifiedEscapeActions {
  infoPopoverOpen: boolean
  onCloseInfoPopover: () => void
  cutActive: boolean
  onCancelCut: () => void
  sidebarEditMode: boolean
  onExitSidebarEdit: () => void
  hasSelection: boolean
  onClearSelection: () => void
  hasHead: boolean
  onClearHead: () => void
  enabled: boolean
}

/**
 * Single coordinated escape handler. Evaluates state in priority order
 * and fires only the first matching action per keypress.
 *
 * Priority (highest to lowest):
 * 1. Close info popover
 * 2. Cancel cut
 * 3. Exit sidebar edit mode (return to view mode)
 * 4. Clear selection (close sidebar)
 * 5. Clear head person (show full chart)
 *
 * Component-scoped escapes (inline edit, search bar, AddParentPopover)
 * fire first because they're on focused input elements — this handler
 * skips INPUT/SELECT/TEXTAREA targets.
 */
export function useUnifiedEscape(actions: UnifiedEscapeActions) {
  // Use a ref to avoid re-registering the event listener on every render.
  // The actions object is recreated each render in App.tsx, but the ref
  // always points to the latest version.
  const actionsRef = useRef(actions)
  actionsRef.current = actions

  useEffect(() => {
    if (!actionsRef.current.enabled) return
    const handler = (e: KeyboardEvent) => {
      const a = actionsRef.current
      if (!a.enabled) return
      if (e.key !== 'Escape') return
      const el = e.target as HTMLElement
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (el?.isContentEditable) return

      e.preventDefault()
      if (a.infoPopoverOpen) { a.onCloseInfoPopover(); return }
      if (a.cutActive) { a.onCancelCut(); return }
      if (a.sidebarEditMode) { a.onExitSidebarEdit(); return }
      if (a.hasSelection) { a.onClearSelection(); return }
      if (a.hasHead) { a.onClearHead(); return }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [actions.enabled])
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/hooks/useUnifiedEscape.test.ts`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
jj new -m "feat: add unified escape handler with priority-ordered actions"
```

---

### Task 4: Wire unified escape into App.tsx and remove useEscapeKey

**Files:**
- Modify: `web/src/App.tsx:8,55-57`
- Modify: `web/src/components/ManagerInfoPopover.tsx:3,16`
- Delete: `web/src/hooks/useEscapeKey.ts`
- Delete: `web/src/hooks/useEscapeKey.test.ts`

- [ ] **Step 1: Add sidebarMode state and unified escape to App.tsx**

Replace the `useEscapeKey` import and calls in App.tsx:

```typescript
// Remove this import (line 8):
import { useEscapeKey } from './hooks/useEscapeKey'

// Add this import:
import { useUnifiedEscape } from './hooks/useUnifiedEscape'
```

Add `sidebarMode` state after the `clearHead`/`useEscapeKey` lines (replace lines 55-57):

```typescript
// Remove these three lines:
const clearHead = useCallback(() => setHead(null), [setHead])
useEscapeKey(clearHead, !!headPersonId)
useEscapeKey(clearSelection, selectedIds.size > 0)

// Replace with:
const clearHead = useCallback(() => setHead(null), [setHead])
const [sidebarMode, setSidebarMode] = useState<'view' | 'edit'>('view')

// Reset sidebar to view mode when selection changes
useEffect(() => {
  setSidebarMode('view')
}, [selectedIds])
```

Add the unified escape hook after the `useVimNav` call (after line 107):

```typescript
useUnifiedEscape({
  infoPopoverOpen: !!infoPopoverId,
  onCloseInfoPopover: clearInfoPopover,
  cutActive: !!cutId,
  onCancelCut: () => {/* cutId is managed inside useVimNav — need to expose a cancelCut */},
  sidebarEditMode: sidebarMode === 'edit',
  onExitSidebarEdit: () => { setSidebarMode('view'); if (document.activeElement instanceof HTMLElement) document.activeElement.blur() },
  hasSelection: selectedIds.size > 0,
  onClearSelection: clearSelection,
  hasHead: !!headPersonId,
  onClearHead: clearHead,
  enabled: true,
})
```

Note: `useVimNav` currently handles its own Escape for `cutId`. We need to expose a `cancelCut` function from it. Update useVimNav to return `{ cutId, cancelCut }`:

In `web/src/hooks/useVimNav.ts`, add after line 31:

```typescript
const cancelCut = useCallback(() => setCutId(null), [])
```

Update the return (line 174):

```typescript
return { cutId, cancelCut }
```

Remove the Escape handling from useVimNav's keyboard handler (lines 144-148) — this is now handled by the unified escape:

```typescript
// Remove these lines from the handler:
if (e.key === 'Escape' && cutId) {
  e.preventDefault()
  setCutId(null)
  return
}
```

Then wire `cancelCut` in App.tsx:

```typescript
const { cutId, cancelCut } = useVimNav({ ... })

// In useUnifiedEscape:
onCancelCut: cancelCut,
```

- [ ] **Step 2: Remove useEscapeKey from ManagerInfoPopover**

In `web/src/components/ManagerInfoPopover.tsx`, remove the `useEscapeKey` import and call (lines 3, 16). The unified escape handler now handles this via `infoPopoverOpen`.

```typescript
// Remove line 3:
import { useEscapeKey } from '../hooks/useEscapeKey'

// Remove line 16:
useEscapeKey(onClose, true)
```

- [ ] **Step 3: Check for any other useEscapeKey imports**

Run: `cd web && grep -r "useEscapeKey" src/ --include="*.ts" --include="*.tsx" | grep -v test | grep -v node_modules`

If there are none left (other than the hook file itself), delete the hook and its test:

```bash
rm web/src/hooks/useEscapeKey.ts web/src/hooks/useEscapeKey.test.ts
```

- [ ] **Step 4: Verify build**

Run: `cd web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Run all tests**

Run: `cd web && npx vitest run`
Expected: All pass (the useEscapeKey tests are deleted, unified escape tests pass)

- [ ] **Step 6: Commit**

```bash
jj new -m "refactor: replace useEscapeKey hooks with unified escape handler"
```

---

### Task 5: Add sidebar view mode to DetailSidebar

**Files:**
- Modify: `web/src/components/DetailSidebar.tsx`
- Modify: `web/src/components/DetailSidebar.module.css`
- Modify: `web/src/App.tsx:203`

- [ ] **Step 1: Update DetailSidebar golden test to expect view mode**

The golden tests render DetailSidebar with a selected person. After this change, the default will be view mode (read-only). Update the test expectations by re-running with `--update` after the implementation.

- [ ] **Step 2: Add mode prop to DetailSidebar**

Add props to the component for mode control. At the top of `DetailSidebar.tsx`, add to the component:

```typescript
interface DetailSidebarProps {
  mode?: 'view' | 'edit'
  onSetMode?: (mode: 'view' | 'edit') => void
}

export default function DetailSidebar({ mode = 'view', onSetMode }: DetailSidebarProps) {
```

- [ ] **Step 3: Add view mode rendering**

Before the existing form return (around line 234), add a view mode branch. The view mode shows all person fields as read-only text:

```tsx
// For single person view mode
if (!isBatch && person && mode === 'view') {
  const manager = working.find(p => p.id === person.managerId)
  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <h3 data-testid="sidebar-heading">{person.name || '(unnamed)'}</h3>
        <button className={styles.closeBtn} onClick={clearSelection} aria-label="Close" title="Close">
          &times;
        </button>
      </div>
      <div className={styles.viewBody}>
        <div className={styles.viewField}>
          <span className={styles.viewLabel}>Role</span>
          <span className={styles.viewValue}>{person.role || 'TBD'}</span>
        </div>
        <div className={styles.viewField}>
          <span className={styles.viewLabel}>Discipline</span>
          <span className={styles.viewValue}>{person.discipline || '\u2014'}</span>
        </div>
        <div className={styles.viewField}>
          <span className={styles.viewLabel}>Team</span>
          <span className={styles.viewValue}>{person.team || '\u2014'}</span>
        </div>
        {person.additionalTeams && person.additionalTeams.length > 0 && (
          <div className={styles.viewField}>
            <span className={styles.viewLabel}>Other Teams</span>
            <span className={styles.viewValue}>{person.additionalTeams.join(', ')}</span>
          </div>
        )}
        <div className={styles.viewField}>
          <span className={styles.viewLabel}>Manager</span>
          <span className={styles.viewValue}>{manager?.name || '(none)'}</span>
        </div>
        <div className={styles.viewField}>
          <span className={styles.viewLabel}>Status</span>
          <span className={styles.viewValue}>{person.status}</span>
        </div>
        {person.pod && (
          <div className={styles.viewField}>
            <span className={styles.viewLabel}>Pod</span>
            <span className={styles.viewValue}>{person.pod}</span>
          </div>
        )}
        <div className={styles.viewField}>
          <span className={styles.viewLabel}>Employment</span>
          <span className={styles.viewValue}>{person.employmentType || 'FTE'}</span>
        </div>
        {(person.level ?? 0) > 0 && (
          <div className={styles.viewField}>
            <span className={styles.viewLabel}>Level</span>
            <span className={styles.viewValue}>{person.level}</span>
          </div>
        )}
        {person.publicNote && (
          <div className={styles.viewField}>
            <span className={styles.viewLabel}>Note</span>
            <span className={styles.viewValue}>{person.publicNote}</span>
          </div>
        )}
        {person.private && (
          <div className={styles.viewField}>
            <span className={styles.viewLabel}>Visibility</span>
            <span className={styles.viewValue}>Private</span>
          </div>
        )}
      </div>
      <div className={styles.actions}>
        <button className={styles.editBtn} onClick={() => onSetMode?.('edit')}>Edit</button>
      </div>
    </aside>
  )
}
```

- [ ] **Step 4: Add view mode CSS**

Add to `web/src/components/DetailSidebar.module.css`:

```css
.viewBody {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  overflow-y: auto;
}

.viewField {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.viewLabel {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.viewValue {
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.4;
}

.editBtn {
  background: var(--surface-raised);
  color: var(--grove-green);
  border: 1px solid var(--grove-green);
  border-radius: var(--radius-sm);
  padding: 8px 14px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.editBtn:hover {
  background: var(--grove-green);
  color: #fff;
}
```

- [ ] **Step 5: Pass mode and onSetMode from App.tsx**

In App.tsx, update the sidebar rendering (line 203):

```tsx
{hasSidebarSelection && <DetailSidebar mode={sidebarMode} onSetMode={setSidebarMode} />}
```

Add `useState` import if not already present (it is).

- [ ] **Step 6: Verify build**

Run: `cd web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Add edit-mode golden test**

Add a new test case to `web/src/components/DetailSidebar.golden.test.tsx` for edit mode rendering:

```tsx
it('single person in edit mode', () => {
  const { container } = renderWithOrg(<DetailSidebar mode="edit" onSetMode={vi.fn()} />, {
    ...baseCtx,
    selectedId: 'b2',
    selectedIds: new Set(['b2']),
  })
  expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/detail-sidebar-edit.golden')
})
```

- [ ] **Step 8: Update golden tests**

Run: `cd web && npx vitest run --update src/components/DetailSidebar.golden.test.tsx`

Review the updated golden files to confirm:
- Existing single-person test now shows view mode markup
- New edit-mode test shows the full form

- [ ] **Step 9: Run all tests**

Run: `cd web && npx vitest run`
Expected: All pass

- [ ] **Step 10: Commit**

```bash
jj new -m "feat: add sidebar view mode with read-only person display"
```

---

### Task 6: Add `I` binding to useVimNav for sidebar edit mode

**Files:**
- Modify: `web/src/hooks/useVimNav.ts`

- [ ] **Step 1: Add onSidebarEdit callback to VimNavOptions**

```typescript
interface VimNavOptions {
  // ... existing fields ...
  onSidebarEdit?: () => void  // Add this
}
```

Update the function signature:

```typescript
export function useVimNav({ working, selectedId, setSelectedId, onDelete, onAddReport, onAddParent, onReparent, onSidebarEdit, enabled }: VimNavOptions) {
```

- [ ] **Step 2: Add `I` handler in the keyboard event listener**

After the `i` handler (line 163), add:

```typescript
if (e.key === 'I' && selectedId) {
  e.preventDefault()
  onSidebarEdit?.()
  return
}
```

- [ ] **Step 3: Update docstring**

Add to the comment block at line 21:

```typescript
 * I   — open sidebar in edit mode
```

- [ ] **Step 4: Wire in App.tsx**

In the `useVimNav` call in App.tsx (around line 98-107), add:

```typescript
onSidebarEdit: () => setSidebarMode('edit'),
```

- [ ] **Step 5: Verify build and tests**

Run: `cd web && npx tsc --noEmit && npx vitest run`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
jj new -m "feat: add shift-I vim binding to enter sidebar edit mode"
```

---

### Task 7: Sidebar edit mode returns to view mode on save

**Files:**
- Modify: `web/src/components/DetailSidebar.tsx`

- [ ] **Step 1: Update handleSave to return to view mode**

In the `handleSave` function, after `markSaved()` (around line 206), switch back to view mode:

```typescript
// After markSaved() in the single-person branch:
markSaved()
onSetMode?.('view')

// After markSaved() in the batch branch (not strictly needed since batch is always edit, but for consistency):
// Leave batch as-is — batch selection stays in edit mode
```

- [ ] **Step 2: Auto-focus first input when entering edit mode**

Add a ref and effect to auto-focus when mode switches to edit. At the top of the component:

```typescript
const firstInputRef = useRef<HTMLInputElement>(null)

useEffect(() => {
  if (mode === 'edit' && firstInputRef.current) {
    firstInputRef.current.focus()
  }
}, [mode])
```

Add `ref={firstInputRef}` to the Name input (the first input in the form, line 246):

```tsx
<input data-testid="field-name" ref={firstInputRef} value={form.name} onChange={(e) => handleChange('name', e.target.value)} />
```

Add `useRef` to the import at line 1 (currently imports `useState, useEffect, useMemo` — add `useRef`):

```typescript
import { useState, useEffect, useMemo, useRef } from 'react'
```

- [ ] **Step 3: Verify build and tests**

Run: `cd web && npx tsc --noEmit && npx vitest run`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
jj new -m "feat: auto-focus first input on edit mode, return to view on save"
```

---

### Task 8: Wire NodeActions edit icon to sidebar edit mode and blur after click

**Files:**
- Modify: `web/src/components/PersonNode.tsx:41,135`
- Modify: `web/src/views/shared.tsx`
- Modify: `web/src/views/ChartContext.tsx`
- Modify: `web/src/store/ViewDataContext.tsx`

- [ ] **Step 1: Add onEditMode callback to PersonNode props**

In `web/src/components/PersonNode.tsx`, add to the Props interface (around line 41):

```typescript
onEditMode?: () => void
```

Update the function signature to destructure `onEditMode`.

Change the NodeActions `onEdit` handler (line 135) to call `onEditMode` instead of `onClick`:

```typescript
onEdit={onEditMode ? (e) => { e.stopPropagation(); onEditMode() } : undefined}
```

- [ ] **Step 2: Thread onEditMode through the view layer**

The callback needs to flow from App.tsx through ChartContext/ViewDataContext to PersonNode. Check how existing callbacks like `onInfo` are threaded and follow the same pattern.

In `web/src/store/ViewDataContext.tsx`, add an `onEditMode` callback that calls both `setSelectedId` and `setSidebarMode('edit')`. This requires `setSidebarMode` to be accessible — either pass it down as a prop or lift it into ViewDataContext.

The simplest approach: pass `setSidebarMode` from App.tsx to ViewDataProvider, then expose `handleEditMode` from `useActions()`.

In App.tsx, pass the callback through:

```typescript
<ViewDataProvider onEditMode={(id: string) => { setSelectedId(id); setSidebarMode('edit') }}>
```

Then wire it through ChartContext to PersonNode, following the same pattern as `onInfo`/`onFocus`.

- [ ] **Step 3: Add blur after click selection**

In the click handler for PersonNode (line 146), the click gives focus to the node div. After selection, blur should happen. The simplest approach: in `PersonNode.tsx`, after `onClick` fires, blur:

```typescript
onClick={(e) => { onClick?.(e); (e.currentTarget as HTMLElement).blur() }}
```

- [ ] **Step 4: Verify build and tests**

Run: `cd web && npx tsc --noEmit && npx vitest run`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
jj new -m "feat: wire edit icon to sidebar edit mode, blur after click"
```
