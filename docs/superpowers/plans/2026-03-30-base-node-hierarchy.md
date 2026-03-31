# BaseNode Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify PersonNode and PodHeaderNode into a shared BaseNode component so capabilities (notes, collapse, edge anchoring, drag/drop, selection) are implemented once.

**Architecture:** BaseNode provides the shared DOM structure (wrapper > cardArea > node > children) with opt-in capabilities via props. PersonNode and GroupHeaderNode are thin wrappers that compose BaseNode and inject their content as children. DraggableNode is absorbed into BaseNode.

**Tech Stack:** React 18, TypeScript, CSS Modules, dnd-kit, vitest, @testing-library/react

---

### File Map

| File | Action | Responsibility |
|---|---|---|
| `web/src/components/BaseNode.tsx` | Create | Shared wrapper: card shell, notes, collapse, actions, drag/drop, edge ref |
| `web/src/components/BaseNode.module.css` | Create | All card structural styles (merged from PersonNode + PodHeaderNode CSS) |
| `web/src/components/BaseNode.test.tsx` | Create | Capability tests for BaseNode |
| `web/src/components/PersonNode.tsx` | Modify | Thin wrapper composing BaseNode |
| `web/src/components/PersonNode.module.css` | Modify | Remove structural styles (keep content-specific: inline edit) |
| `web/src/components/GroupHeaderNode.tsx` | Create | Thin wrapper composing BaseNode (replaces PodHeaderNode) |
| `web/src/views/shared.tsx` | Modify | Remove DraggableNode, keep buildOrgTree + OrgNode |
| `web/src/views/ColumnView.tsx` | Modify | Replace DraggableNode + PodHeaderNode with PersonNode + GroupHeaderNode |
| `web/src/views/ManagerView.tsx` | Modify | Replace DraggableNode with PersonNode |
| `web/src/views/ChartShell.tsx` | Modify | Remove DraggableNode import, update OrphanGroup renderTeamHeader |
| `web/src/views/OrphanGroup.tsx` | Modify | Replace DraggableNode with PersonNode, PodHeaderNode with GroupHeaderNode |
| `web/src/views/PodHeaderNode.tsx` | Delete | Replaced by GroupHeaderNode |
| `web/src/views/PodHeaderNode.module.css` | Delete | Styles merged into BaseNode.module.css |

---

### Task 1: Create BaseNode component and CSS

**Files:**
- Create: `web/src/components/BaseNode.tsx`
- Create: `web/src/components/BaseNode.module.css`

- [ ] **Step 1: Create BaseNode.module.css**

This merges structural styles from PersonNode.module.css and PodHeaderNode.module.css into one file. Content-specific styles (inline edit, emp abbreviation, diff annotations) stay in PersonNode.module.css.

```css
/* web/src/components/BaseNode.module.css */

.wrapper {
  position: relative;
  animation: nodeEnter 0.3s ease-out both;
}

@keyframes nodeEnter {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.cardArea {
  position: relative;
}

.node {
  border: 1.5px solid var(--border-medium);
  border-radius: var(--radius-md);
  background: var(--surface-raised);
  padding: 8px 12px;
  text-align: left;
  cursor: pointer;
  user-select: none;
  transition: all var(--transition-normal);
  box-shadow: var(--shadow-sm);
}

/* Variants */
.manager {
  border-left: 3.5px solid var(--grove-green);
}

.group {
  border-left: 3.5px solid var(--grove-green);
}

.node:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

/* Selection */
.selected,
.selected:hover {
  border-color: var(--grove-green);
  border-left-color: var(--grove-green);
  box-shadow: var(--shadow-focus);
}

/* Status styles */
.recruiting {
  border-color: var(--grove-green-muted);
  border-top-style: dashed;
  border-right-style: dashed;
  border-bottom-style: dashed;
  background: var(--grove-green-soft);
}

.future {
  border-color: var(--border-soft);
  border-top-style: dashed;
  border-right-style: dashed;
  border-bottom-style: dashed;
  background: var(--surface-sunken);
}

.transfer {
  border-color: var(--grove-gold);
  border-top-style: dashed;
  border-right-style: dashed;
  border-bottom-style: dashed;
  background: var(--grove-gold-light);
}

/* Ghost / placeholder */
.ghost {
  opacity: 0.35;
  border-style: dashed;
  text-decoration: line-through;
}

.placeholder {
  border-style: dashed;
  border-color: var(--border-soft);
  background: var(--surface-sunken);
  cursor: default;
  font-style: italic;
  color: var(--text-tertiary);
}

/* Employment type right accent */
.empRight {
  border-right: 3.5px solid var(--emp-color);
}

/* Warning dot */
.warningDot {
  position: absolute;
  top: -6px;
  left: -6px;
  font-size: 12px;
  line-height: 1;
  z-index: 2;
  cursor: help;
}

/* Private icon */
.privateIcon {
  position: absolute;
  top: -6px;
  right: -2px;
  font-size: 11px;
  line-height: 1;
  z-index: 2;
  opacity: 0.6;
}

/* Note icon + panel */
.noteIcon {
  position: absolute;
  bottom: -8px;
  right: 6px;
  width: 20px;
  height: 20px;
  font-size: 11px;
  line-height: 20px;
  text-align: center;
  border: 1px solid var(--border-medium);
  border-radius: 50%;
  background: var(--surface-raised);
  cursor: pointer;
  opacity: 0.5;
  transition: opacity var(--transition-fast), transform var(--transition-fast);
  z-index: 3;
  padding: 0;
}

.noteIcon:hover, .noteIconActive {
  opacity: 1;
  transform: scale(1.1);
}

.notePanel {
  margin-top: 4px;
  padding: 8px 10px;
  background: var(--surface-note);
  border: 1px solid var(--grove-gold-light);
  border-radius: 0 0 var(--radius-md) var(--radius-md);
  box-shadow: var(--shadow-sm);
  animation: noteSlideIn 0.15s ease-out;
  position: relative;
  z-index: 1;
}

@keyframes noteSlideIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.notePanelText {
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Collapse toggle */
.collapseToggle {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: -4px auto 0;
  width: 24px;
  height: 16px;
  font-size: 10px;
  color: var(--text-muted);
  background: var(--surface-toolbar);
  border: 1px solid var(--border-soft);
  border-radius: 0 0 6px 6px;
  cursor: pointer;
  transition: all var(--transition-fast);
  position: relative;
  z-index: 2;
}

.collapseToggle:hover {
  color: var(--text-secondary);
  border-color: var(--border-medium);
  background: var(--surface-raised);
}

/* Drag/drop states */
.dragHandle {
  cursor: grab;
  transition: opacity 0.15s;
}

.dragging {
  opacity: 0.3;
}

.dropTarget {
  border-radius: 6px;
  transition: outline 0.15s, background 0.15s;
}

.dropOver {
  outline: 2px solid var(--grove-green, #3d6b35);
  outline-offset: 2px;
  background: var(--grove-green-soft, #e8f0e6);
}
```

- [ ] **Step 2: Create BaseNode.tsx**

```tsx
/* web/src/components/BaseNode.tsx */
import { useState, memo, type ReactNode } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import NodeActions from './NodeActions'
import styles from './BaseNode.module.css'

export interface BaseNodeActions {
  onAdd?: (e: React.MouseEvent) => void
  onAddParent?: (e: React.MouseEvent) => void
  onDelete?: (e: React.MouseEvent) => void
  onEdit?: (e: React.MouseEvent) => void
  onInfo?: (e: React.MouseEvent) => void
  onFocus?: (e: React.MouseEvent) => void
}

export interface BaseNodeProps {
  nodeId: string
  children: ReactNode
  variant?: 'default' | 'manager' | 'group'
  statusStyle?: 'recruiting' | 'planned' | 'transfer'
  empAccent?: string
  ghost?: boolean
  isPlaceholder?: boolean
  noteText?: string
  collapsed?: boolean
  onToggleCollapse?: () => void
  selected?: boolean
  onClick?: (e?: React.MouseEvent) => void
  warning?: string
  isPrivate?: boolean
  draggable?: boolean
  dragData?: Record<string, unknown>
  droppable?: boolean
  droppableId?: string
  cardRef?: (el: HTMLDivElement | null) => void
  actions?: BaseNodeActions
  testId?: string
  ariaLabel?: string
  /** Additional CSS classes to compose on the .node element */
  nodeClassName?: string
  /** CSS custom properties to set on the .node element */
  nodeStyle?: React.CSSProperties
  /** Diff annotation classes */
  diffClasses?: string[]
}

function BaseNodeInner({
  nodeId,
  children,
  variant = 'default',
  statusStyle,
  empAccent,
  ghost,
  isPlaceholder,
  noteText,
  collapsed,
  onToggleCollapse,
  selected,
  onClick,
  warning,
  isPrivate,
  draggable: isDraggableEnabled,
  dragData,
  droppable: isDroppableEnabled,
  droppableId,
  cardRef,
  actions,
  testId,
  ariaLabel,
  nodeClassName,
  nodeStyle,
  diffClasses,
}: BaseNodeProps) {
  const [hovered, setHovered] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: isDraggableEnabled ? nodeId : `disabled-drag-${nodeId}`,
    data: dragData,
    disabled: !isDraggableEnabled,
  })

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: droppableId ?? nodeId,
    disabled: !isDroppableEnabled,
  })

  const hasNotes = !!noteText
  const showActions = !ghost && !isPlaceholder && actions && Object.values(actions).some(Boolean)

  const classNames = [
    styles.node,
    variant === 'manager' && styles.manager,
    variant === 'group' && styles.group,
    selected && styles.selected,
    statusStyle === 'recruiting' && styles.recruiting,
    statusStyle === 'planned' && styles.future,
    statusStyle === 'transfer' && styles.transfer,
    ghost && styles.ghost,
    isPlaceholder && styles.placeholder,
    empAccent && styles.empRight,
    ...(diffClasses || []),
    nodeClassName,
  ].filter(Boolean).join(' ')

  const computedStyle = empAccent
    ? { '--emp-color': empAccent, ...nodeStyle } as React.CSSProperties
    : nodeStyle

  const cardContent = (
    <div
      className={styles.wrapper}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {showActions && hovered && (
        <NodeActions
          showAdd={!!actions.onAdd}
          showAddParent={!!actions.onAddParent}
          showInfo={!!actions.onInfo}
          showFocus={!!actions.onFocus}
          showEdit={!!actions.onEdit}
          showDelete={!!actions.onDelete}
          onAdd={actions.onAdd ?? (() => {})}
          onAddParent={actions.onAddParent}
          onDelete={actions.onDelete ?? (() => {})}
          onEdit={actions.onEdit}
          onInfo={actions.onInfo ?? (() => {})}
          onFocus={actions.onFocus}
        />
      )}
      {warning && (
        <div className={styles.warningDot} title={warning} role="img" aria-label={`Warning: ${warning}`}>{'\u26A0'}</div>
      )}
      {isPrivate && !isPlaceholder && (
        <div className={styles.privateIcon} title="Private" role="img" aria-label="Private">{'\u{1F512}'}</div>
      )}
      <div className={styles.cardArea}>
        <div
          ref={cardRef}
          className={classNames}
          style={computedStyle}
          onClick={(e) => { onClick?.(e); (e.currentTarget as HTMLElement).blur() }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.() } }}
          role="button"
          tabIndex={0}
          data-selected={selected || false}
          data-testid={testId}
          aria-label={ariaLabel}
        >
          {children}
        </div>
        {hasNotes && (
          <button
            className={`${styles.noteIcon} ${noteOpen ? styles.noteIconActive : ''}`}
            onClick={(e) => { e.stopPropagation(); setNoteOpen(v => !v) }}
            aria-label="Toggle notes"
            aria-expanded={noteOpen}
          >
            {'\u{1F4CB}'}
          </button>
        )}
        {noteOpen && hasNotes && (
          <div className={styles.notePanel}>
            <div className={styles.notePanelText}>{noteText}</div>
          </div>
        )}
      </div>
      {onToggleCollapse && (
        <button
          className={styles.collapseToggle}
          onClick={(e) => { e.stopPropagation(); onToggleCollapse() }}
          aria-label={collapsed ? 'Expand' : 'Collapse'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '\u25B8' : '\u25BE'}
        </button>
      )}
    </div>
  )

  // Wrap in drag/drop layers when enabled
  if (!isDraggableEnabled && !isDroppableEnabled) {
    return cardContent
  }

  return (
    <div
      ref={setDropRef}
      data-person-id={nodeId}
      className={`${styles.dropTarget} ${isOver && !isDragging ? styles.dropOver : ''}`}
    >
      <div
        ref={setDragRef}
        {...(isDraggableEnabled ? listeners : {})}
        {...(isDraggableEnabled ? attributes : {})}
        role={undefined}
        tabIndex={undefined}
        data-dnd-draggable={isDraggableEnabled || undefined}
        className={`${styles.dragHandle} ${isDragging ? styles.dragging : ''}`}
      >
        {cardContent}
      </div>
    </div>
  )
}

const BaseNode = memo(BaseNodeInner)
export default BaseNode
```

- [ ] **Step 3: Run type check**

Run: `cd web && npx tsc --noEmit`
Expected: exit 0 (no errors — BaseNode is created but not imported anywhere yet)

- [ ] **Step 4: Commit**

```bash
jj describe -m "feat: add BaseNode component and CSS (phase 1 of node hierarchy)"
```

---

### Task 2: Write BaseNode unit tests

**Files:**
- Create: `web/src/components/BaseNode.test.tsx`

- [ ] **Step 1: Write BaseNode tests**

```tsx
/* web/src/components/BaseNode.test.tsx */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DndContext } from '@dnd-kit/core'
import BaseNode from './BaseNode'

afterEach(() => cleanup())

function renderWithDnd(ui: React.ReactElement) {
  return render(<DndContext>{ui}</DndContext>)
}

describe('BaseNode', () => {
  it('renders children inside the card', () => {
    render(<BaseNode nodeId="1"><span>Hello</span></BaseNode>)
    expect(screen.getByText('Hello')).toBeTruthy()
  })

  it('applies default variant (no extra border class)', () => {
    render(<BaseNode nodeId="1" testId="card"><span>IC</span></BaseNode>)
    const node = screen.getByTestId('card')
    expect(node.className).not.toContain('manager')
    expect(node.className).not.toContain('group')
  })

  it('applies manager variant class', () => {
    render(<BaseNode nodeId="1" variant="manager" testId="card"><span>Mgr</span></BaseNode>)
    const node = screen.getByTestId('card')
    expect(node.className).toContain('manager')
  })

  it('applies group variant class', () => {
    render(<BaseNode nodeId="1" variant="group" testId="card"><span>Pod</span></BaseNode>)
    const node = screen.getByTestId('card')
    expect(node.className).toContain('group')
  })

  it('applies selected class when selected', () => {
    render(<BaseNode nodeId="1" selected testId="card"><span>X</span></BaseNode>)
    const node = screen.getByTestId('card')
    expect(node.className).toContain('selected')
  })

  it('applies recruiting status class', () => {
    render(<BaseNode nodeId="1" statusStyle="recruiting" testId="card"><span>X</span></BaseNode>)
    expect(screen.getByTestId('card').className).toContain('recruiting')
  })

  it('applies planned status class', () => {
    render(<BaseNode nodeId="1" statusStyle="planned" testId="card"><span>X</span></BaseNode>)
    expect(screen.getByTestId('card').className).toContain('future')
  })

  it('applies transfer status class', () => {
    render(<BaseNode nodeId="1" statusStyle="transfer" testId="card"><span>X</span></BaseNode>)
    expect(screen.getByTestId('card').className).toContain('transfer')
  })

  it('applies ghost class', () => {
    render(<BaseNode nodeId="1" ghost testId="card"><span>X</span></BaseNode>)
    expect(screen.getByTestId('card').className).toContain('ghost')
  })

  it('applies emp accent right border via CSS variable', () => {
    render(<BaseNode nodeId="1" empAccent="#8b5cf6" testId="card"><span>X</span></BaseNode>)
    const node = screen.getByTestId('card')
    expect(node.className).toContain('empRight')
    expect(node.style.getPropertyValue('--emp-color')).toBe('#8b5cf6')
  })

  // Note icon + panel
  it('shows note icon only when noteText provided', () => {
    const { rerender } = render(<BaseNode nodeId="1"><span>X</span></BaseNode>)
    expect(screen.queryByLabelText('Toggle notes')).toBeNull()
    rerender(<BaseNode nodeId="1" noteText="A note"><span>X</span></BaseNode>)
    expect(screen.getByLabelText('Toggle notes')).toBeTruthy()
  })

  it('toggles note panel on icon click', async () => {
    render(<BaseNode nodeId="1" noteText="Hello note"><span>X</span></BaseNode>)
    expect(screen.queryByText('Hello note')).toBeNull()
    await userEvent.click(screen.getByLabelText('Toggle notes'))
    expect(screen.getByText('Hello note')).toBeTruthy()
    await userEvent.click(screen.getByLabelText('Toggle notes'))
    expect(screen.queryByText('Hello note')).toBeNull()
  })

  // Collapse toggle
  it('shows collapse toggle only when onToggleCollapse provided', () => {
    const { rerender } = render(<BaseNode nodeId="1"><span>X</span></BaseNode>)
    expect(screen.queryByLabelText('Collapse')).toBeNull()
    expect(screen.queryByLabelText('Expand')).toBeNull()
    rerender(<BaseNode nodeId="1" onToggleCollapse={() => {}}><span>X</span></BaseNode>)
    expect(screen.getByLabelText('Collapse')).toBeTruthy()
  })

  it('calls onToggleCollapse when toggle clicked', async () => {
    const onToggle = vi.fn()
    render(<BaseNode nodeId="1" onToggleCollapse={onToggle}><span>X</span></BaseNode>)
    await userEvent.click(screen.getByLabelText('Collapse'))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('shows Expand label when collapsed', () => {
    render(<BaseNode nodeId="1" collapsed onToggleCollapse={() => {}}><span>X</span></BaseNode>)
    expect(screen.getByLabelText('Expand')).toBeTruthy()
  })

  // Warning dot
  it('shows warning dot only when warning provided', () => {
    const { rerender } = render(<BaseNode nodeId="1"><span>X</span></BaseNode>)
    expect(screen.queryByLabelText(/Warning/)).toBeNull()
    rerender(<BaseNode nodeId="1" warning="Missing manager"><span>X</span></BaseNode>)
    expect(screen.getByLabelText('Warning: Missing manager')).toBeTruthy()
  })

  // Private icon
  it('shows private icon only when isPrivate', () => {
    const { rerender } = render(<BaseNode nodeId="1"><span>X</span></BaseNode>)
    expect(screen.queryByLabelText('Private')).toBeNull()
    rerender(<BaseNode nodeId="1" isPrivate><span>X</span></BaseNode>)
    expect(screen.getByLabelText('Private')).toBeTruthy()
  })

  it('hides private icon for placeholders', () => {
    render(<BaseNode nodeId="1" isPrivate isPlaceholder><span>X</span></BaseNode>)
    expect(screen.queryByLabelText('Private')).toBeNull()
  })

  // Click
  it('calls onClick on card click', async () => {
    const onClick = vi.fn()
    render(<BaseNode nodeId="1" onClick={onClick} testId="card"><span>X</span></BaseNode>)
    await userEvent.click(screen.getByTestId('card'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('calls onClick on Enter key', () => {
    const onClick = vi.fn()
    render(<BaseNode nodeId="1" onClick={onClick} testId="card"><span>X</span></BaseNode>)
    fireEvent.keyDown(screen.getByTestId('card'), { key: 'Enter' })
    expect(onClick).toHaveBeenCalledOnce()
  })

  // Hover actions
  it('shows action buttons on hover', async () => {
    const user = userEvent.setup()
    const actions = { onDelete: vi.fn() }
    const { container } = render(<BaseNode nodeId="1" actions={actions}><span>X</span></BaseNode>)
    expect(screen.queryByLabelText('Delete')).toBeNull()
    await user.hover(container.firstElementChild!)
    expect(screen.getByLabelText('Delete')).toBeTruthy()
  })

  it('hides actions for ghost nodes', async () => {
    const user = userEvent.setup()
    const actions = { onDelete: vi.fn() }
    const { container } = render(<BaseNode nodeId="1" ghost actions={actions}><span>X</span></BaseNode>)
    await user.hover(container.firstElementChild!)
    expect(screen.queryByLabelText('Delete')).toBeNull()
  })

  // Drag/drop
  it('wraps in drag/drop layers when draggable', () => {
    const { container } = renderWithDnd(
      <BaseNode nodeId="1" draggable dragData={{ type: 'person' }}><span>X</span></BaseNode>
    )
    expect(container.querySelector('[data-dnd-draggable]')).toBeTruthy()
  })

  it('does not wrap in drag/drop when neither enabled', () => {
    const { container } = render(<BaseNode nodeId="1"><span>X</span></BaseNode>)
    expect(container.querySelector('[data-dnd-draggable]')).toBeNull()
  })

  // cardRef
  it('calls cardRef with the .node element', () => {
    const cardRef = vi.fn()
    render(<BaseNode nodeId="1" cardRef={cardRef} testId="card"><span>X</span></BaseNode>)
    expect(cardRef).toHaveBeenCalledOnce()
    expect(cardRef.mock.calls[0][0]).toBe(screen.getByTestId('card'))
  })

  // a11y: no nested interactive controls
  it('note icon is not nested inside the role=button card', () => {
    render(<BaseNode nodeId="1" noteText="Note" testId="card"><span>X</span></BaseNode>)
    const card = screen.getByTestId('card')
    const noteBtn = screen.getByLabelText('Toggle notes')
    // noteBtn should NOT be a descendant of card
    expect(card.contains(noteBtn)).toBe(false)
  })

  it('collapse toggle is not nested inside the role=button card', () => {
    render(<BaseNode nodeId="1" onToggleCollapse={() => {}} testId="card"><span>X</span></BaseNode>)
    const card = screen.getByTestId('card')
    const toggle = screen.getByLabelText('Collapse')
    expect(card.contains(toggle)).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd web && npx vitest run src/components/BaseNode.test.tsx`
Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
jj describe -m "test: add BaseNode unit tests (phase 1 of node hierarchy)"
```

---

### Task 3: Migrate PersonNode to compose BaseNode

**Files:**
- Modify: `web/src/components/PersonNode.tsx`
- Modify: `web/src/components/PersonNode.module.css`
- Modify: `web/src/views/shared.tsx` — remove DraggableNode, PersonNode now uses BaseNode's drag/drop

- [ ] **Step 1: Rewrite PersonNode to compose BaseNode**

PersonNode keeps its inline editing logic (double-click, field cycling, edit buffer) but delegates the wrapper structure to BaseNode. The `person` prop is translated to BaseNode's capability props.

```tsx
/* web/src/components/PersonNode.tsx */
import { useState, useEffect, useRef, memo } from 'react'
import BaseNode, { type BaseNodeActions } from './BaseNode'
import styles from './PersonNode.module.css'
import type { Person } from '../api/types'
import type { PersonChange } from '../hooks/useOrgDiff'
import type { EditBuffer } from '../store/useInteractionState'
import { isRecruitingStatus, isPlannedStatus, isTransferStatus } from '../constants'

function getEmpAbbrev(empType: string | undefined): string {
  if (!empType || empType === 'FTE') return ''
  if (empType === 'Intern') return 'Intern'
  switch (empType) {
    case 'PSP': return 'PSP'
    case 'CW': return 'CW'
    case 'Evergreen': return 'EVG'
    default: return empType.slice(0, 3).toUpperCase()
  }
}

function getEmpColor(empType: string | undefined): string | undefined {
  if (!empType || empType === 'FTE' || empType === 'Intern') return undefined
  return '#8b5cf6'
}

function getStatusStyle(status: string): 'recruiting' | 'planned' | 'transfer' | undefined {
  if (isRecruitingStatus(status)) return 'recruiting'
  if (isPlannedStatus(status)) return 'planned'
  if (isTransferStatus(status)) return 'transfer'
  return undefined
}

function getDiffClasses(changes?: PersonChange): string[] {
  if (!changes) return []
  const result: string[] = []
  if (changes.types.has('added')) result.push(styles.added)
  if (changes.types.has('reporting')) result.push(styles.reporting)
  if (changes.types.has('title')) result.push(styles.titleChange)
  if (changes.types.has('reorg')) result.push(styles.reorg)
  return result
}

interface Props {
  person: Person & { isPlaceholder?: boolean }
  selected?: boolean
  ghost?: boolean
  changes?: PersonChange
  showTeam?: boolean
  isManager?: boolean
  collapsed?: boolean
  editing?: boolean
  editBuffer?: EditBuffer | null
  focusField?: 'name' | 'role' | 'team' | null
  onAdd?: () => void
  onAddParent?: () => void
  onDelete?: () => void
  onInfo?: () => void
  onFocus?: () => void
  onEditMode?: () => void
  onToggleCollapse?: () => void
  onClick?: (e?: React.MouseEvent) => void
  onEnterEditing?: () => void
  onUpdateBuffer?: (field: string, value: string) => void
  onCommitEdits?: () => void
  cardRef?: (el: HTMLDivElement | null) => void
}

function PersonNodeInner({ person, selected, ghost, changes, showTeam, isManager, collapsed, editing, editBuffer, focusField: _focusField, onAdd, onAddParent, onDelete, onInfo, onFocus, onEditMode, onToggleCollapse, onClick, onEnterEditing, onUpdateBuffer, onCommitEdits, cardRef }: Props) {
  const nameRef = useRef<HTMLInputElement>(null)
  const roleRef = useRef<HTMLInputElement>(null)
  const teamRef = useRef<HTMLInputElement>(null)
  const [activeField, setActiveField] = useState<'name' | 'role' | 'team'>('name')
  const cyclingRef = useRef(false)

  const isPlaceholder = !!person.isPlaceholder
  const empAbbrev = getEmpAbbrev(person.employmentType)

  const handleDoubleClick = (field: 'name' | 'role' | 'team') => (e: React.MouseEvent) => {
    if (!onEnterEditing || ghost || isPlaceholder) return
    e.stopPropagation()
    setActiveField(field)
    onEnterEditing()
  }

  useEffect(() => {
    if (!editing) return
    const ref = activeField === 'role' ? roleRef : activeField === 'team' ? teamRef : nameRef
    ref.current?.focus()
    ref.current?.select()
  }, [editing, activeField])

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Enter') { e.preventDefault(); onCommitEdits?.() }
    if (e.key === 'Tab') {
      e.preventDefault()
      cyclingRef.current = true
      if (activeField === 'name') setActiveField(showTeam ? 'team' : 'role')
      else if (activeField === 'team') setActiveField('role')
      else setActiveField('name')
    }
  }

  const handleEditBlur = () => {
    if (cyclingRef.current) { cyclingRef.current = false; return }
    onCommitEdits?.()
  }

  const isRecruiting = isRecruitingStatus(person.status)
  const isFuture = isPlannedStatus(person.status)
  const isTransfer = isTransferStatus(person.status)
  const prefix = isRecruiting ? '\u{1F535} ' : isFuture ? '\u{2B1C} ' : isTransfer ? '\u{1F7E1} ' : ''
  const statusLabel = isRecruiting ? 'Recruiting' : isFuture ? 'Planned' : isTransfer ? 'Transfer' : null

  const actions: BaseNodeActions | undefined = (!ghost && !isPlaceholder && (onAdd || onAddParent || onDelete || onInfo || onFocus || onEditMode))
    ? {
        onAdd: onAdd ? (e) => { e.stopPropagation(); onAdd() } : undefined,
        onAddParent: onAddParent ? (e) => { e.stopPropagation(); onAddParent() } : undefined,
        onDelete: onDelete ? (e) => { e.stopPropagation(); onDelete() } : undefined,
        onEdit: onEditMode ? (e) => { e.stopPropagation(); onEditMode() } : undefined,
        onInfo: onInfo ? (e) => { e.stopPropagation(); onInfo() } : undefined,
        onFocus: onFocus ? (e) => { e.stopPropagation(); onFocus() } : undefined,
      }
    : undefined

  return (
    <BaseNode
      nodeId={person.id}
      variant={isManager ? 'manager' : 'default'}
      statusStyle={getStatusStyle(person.status)}
      empAccent={getEmpColor(person.employmentType)}
      ghost={ghost}
      isPlaceholder={isPlaceholder}
      noteText={person.publicNote}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      selected={selected}
      onClick={onClick}
      warning={person.warning}
      isPrivate={person.private}
      draggable={!ghost && !isPlaceholder}
      dragData={{ person }}
      droppable={!ghost && !isPlaceholder}
      cardRef={cardRef}
      actions={actions}
      testId={`person-${person.name}`}
      ariaLabel={person.name}
      diffClasses={getDiffClasses(changes)}
    >
      <div className={styles.name} onDoubleClick={handleDoubleClick('name')}>
        {editing && editBuffer ? (
          <input ref={nameRef} className={styles.inlineEdit} value={editBuffer.name} onChange={(e) => onUpdateBuffer?.('name', e.target.value)} onKeyDown={handleEditKeyDown} onBlur={handleEditBlur} />
        ) : (
          <>{statusLabel && <span className="sr-only">{statusLabel}: </span>}{prefix}{person.name}</>
        )}
      </div>
      {showTeam && (
        <div className={styles.team} onDoubleClick={handleDoubleClick('team')}>
          {editing && editBuffer ? (
            <input ref={teamRef} className={`${styles.inlineEdit} ${styles.inlineEditSmall}`} value={editBuffer.team} onChange={(e) => onUpdateBuffer?.('team', e.target.value)} onKeyDown={handleEditKeyDown} onBlur={handleEditBlur} />
          ) : (
            person.team || '\u00A0'
          )}
        </div>
      )}
      <div className={styles.role} onDoubleClick={handleDoubleClick('role')}>
        {editing && editBuffer ? (
          <input ref={roleRef} className={`${styles.inlineEdit} ${styles.inlineEditSmall}`} value={editBuffer.role} onChange={(e) => onUpdateBuffer?.('role', e.target.value)} onKeyDown={handleEditKeyDown} onBlur={handleEditBlur} />
        ) : (
          <>{person.role || 'TBD'}{empAbbrev && <span className={styles.empAbbrev}> &middot; {empAbbrev}</span>}</>
        )}
      </div>
    </BaseNode>
  )
}

const PersonNode = memo(PersonNodeInner)
export default PersonNode
```

- [ ] **Step 2: Strip PersonNode.module.css to content-only styles**

Remove all structural styles (wrapper, cardArea, node, noteIcon, notePanel, collapseToggle, warningDot, privateIcon, ghost, placeholder, selected, recruiting, future, transfer, empRight) — these now live in BaseNode.module.css.

Keep only: `.name`, `.team`, `.role`, `.empAbbrev`, `.added`, `.reporting`, `.titleChange`, `.reorg`, `.inlineEdit`, `.inlineEditSmall`, and the `.manager .name` override.

```css
/* web/src/components/PersonNode.module.css */

.manager .name {
  font-size: 13.5px;
}

/* Text */
.name {
  font-weight: 600;
  font-size: 13px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: -0.01em;
}

.team {
  font-size: 10px;
  color: var(--grove-green);
  font-weight: 600;
  margin-top: 2px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.role {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.empAbbrev {
  font-size: 10px;
  color: var(--text-tertiary);
}

/* Diff annotations */
.added {
  border-color: var(--grove-green-light);
  border-left-color: var(--grove-green);
  background: var(--grove-green-soft);
}

.reporting {
  border-color: var(--grove-amber);
  border-left-color: var(--grove-amber);
  background: var(--grove-gold-light);
}

.titleChange {
  border-color: var(--grove-green-muted);
  border-left-color: var(--grove-green);
  background: var(--grove-green-soft);
}

.reorg {
  border-color: var(--grove-gold);
  border-left-color: var(--grove-gold);
  background: var(--grove-gold-light);
}

/* Inline editing */
.inlineEdit {
  font-weight: 600;
  font-size: 13px;
  color: var(--text-primary);
  letter-spacing: -0.01em;
  border: none;
  border-bottom: 1.5px solid var(--grove-green);
  background: transparent;
  outline: none;
  padding: 0;
  width: 100%;
  font-family: inherit;
}

.inlineEditSmall {
  font-weight: 500;
  font-size: 11px;
  text-transform: none;
  letter-spacing: normal;
}
```

- [ ] **Step 3: Update shared.tsx — remove DraggableNode, PersonNode now handles drag/drop via BaseNode**

PersonNode now embeds drag/drop via BaseNode, so DraggableNode is no longer needed. All callers that use `DraggableNode` will be updated in Task 4 to use `PersonNode` directly.

```tsx
/* web/src/views/shared.tsx */
import type { Person } from '../api/types'

export interface OrgNode {
  person: Person
  children: OrgNode[]
}

export function buildOrgTree(people: Person[]): OrgNode[] {
  const byId = new Map(people.map((p) => [p.id, p]))
  const childrenMap = new Map<string, Person[]>()

  for (const p of people) {
    if (p.managerId && byId.has(p.managerId)) {
      if (!childrenMap.has(p.managerId)) childrenMap.set(p.managerId, [])
      childrenMap.get(p.managerId)!.push(p)
    }
  }

  const roots = people.filter((p) => !p.managerId || !byId.has(p.managerId))

  function build(person: Person): OrgNode {
    const children = (childrenMap.get(person.id) || [])
      .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
      .map(build)
    return { person, children }
  }

  return roots.map(build)
}
```

- [ ] **Step 4: Run type check**

Run: `cd web && npx tsc --noEmit`
Expected: errors in ColumnView.tsx, ManagerView.tsx, ChartShell.tsx, OrphanGroup.tsx (they still import DraggableNode). This is expected — we fix those in Task 4.

- [ ] **Step 5: Don't commit yet — Task 4 will fix the import errors and we commit together**

---

### Task 4: Update all view files to use PersonNode directly (remove DraggableNode usage)

**Files:**
- Modify: `web/src/views/ColumnView.tsx` — replace `DraggableNode` with `PersonNode`
- Modify: `web/src/views/ManagerView.tsx` — replace `DraggableNode` with `PersonNode`
- Modify: `web/src/views/ChartShell.tsx` — remove DraggableNode import
- Modify: `web/src/views/OrphanGroup.tsx` — replace `DraggableNode` with `PersonNode`

- [ ] **Step 1: Update ColumnView.tsx**

Replace all `DraggableNode` usage with `PersonNode`. The key change: `DraggableNode` had a `nodeRef` prop for edge anchoring. `PersonNode` now has a `cardRef` prop that goes to BaseNode. The `onSelect` prop becomes `onClick`.

In `ColumnView.tsx`, find all `<DraggableNode` usages and replace with `<PersonNode`. The prop mapping:
- `onSelect={...}` → `onClick={...}`
- `nodeRef={...}` → `cardRef={...}`
- Remove `onEnterEditing`, `onUpdateBuffer`, `onCommitEdits` wrappers — pass directly

Also update the import: remove `DraggableNode` from `'./shared'`, add `PersonNode` from `'../components/PersonNode'`.

- [ ] **Step 2: Update ManagerView.tsx**

Same changes as ColumnView — replace `DraggableNode` with `PersonNode`, update prop names.

- [ ] **Step 3: Update ChartShell.tsx**

Remove the `DraggableNode` import from `'./shared'`. It's no longer used directly in ChartShell (it was used via the `renderSubtree` callbacks in ColumnView/ManagerView).

- [ ] **Step 4: Update OrphanGroup.tsx**

Replace `DraggableNode` with `PersonNode`. The `renderOrphanNode` function becomes simpler — same prop mapping as above.

Update import: remove `DraggableNode` from `'./shared'`, add `PersonNode` from `'../components/PersonNode'`.

- [ ] **Step 5: Run type check**

Run: `cd web && npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 6: Run all tests and update snapshots**

Run: `cd web && npx vitest run -u`
Expected: all tests pass. Golden snapshots will update to reflect new DOM structure (BaseNode wrapper instead of DraggableNode wrapper).

- [ ] **Step 7: Commit**

```bash
jj describe -m "refactor: migrate PersonNode to BaseNode, remove DraggableNode (phase 2)"
```

---

### Task 5: Create GroupHeaderNode and migrate PodHeaderNode

**Files:**
- Create: `web/src/components/GroupHeaderNode.tsx`
- Modify: `web/src/views/ColumnView.tsx` — replace `PodHeaderNode` with `GroupHeaderNode`
- Modify: `web/src/views/ChartShell.tsx` — update renderTeamHeader type
- Modify: `web/src/views/OrphanGroup.tsx` — replace PodHeaderNode with GroupHeaderNode
- Delete: `web/src/views/PodHeaderNode.tsx`
- Delete: `web/src/views/PodHeaderNode.module.css`

- [ ] **Step 1: Create GroupHeaderNode.tsx**

```tsx
/* web/src/components/GroupHeaderNode.tsx */
import BaseNode, { type BaseNodeActions } from './BaseNode'
import styles from './GroupHeaderNode.module.css'

interface Props {
  nodeId: string
  name: string
  count: number
  noteText?: string
  collapsed?: boolean
  onToggleCollapse?: () => void
  selected?: boolean
  onClick?: (e?: React.MouseEvent) => void
  onAdd?: () => void
  onInfo?: () => void
  cardRef?: (el: HTMLDivElement | null) => void
  droppableId?: string
}

export default function GroupHeaderNode({ nodeId, name, count, noteText, collapsed, onToggleCollapse, selected, onClick, onAdd, onInfo, cardRef, droppableId }: Props) {
  const actions: BaseNodeActions | undefined = (onAdd || onInfo)
    ? {
        onAdd: onAdd ? (e) => { e.stopPropagation(); onAdd() } : undefined,
        onInfo: onInfo ? (e) => { e.stopPropagation(); onInfo() } : undefined,
      }
    : undefined

  return (
    <BaseNode
      nodeId={nodeId}
      variant="group"
      noteText={noteText}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      selected={selected}
      onClick={onClick}
      draggable
      droppable
      droppableId={droppableId ?? nodeId}
      cardRef={cardRef}
      actions={actions}
      testId={`group-${name}`}
      ariaLabel={`${name} group`}
    >
      <div className={styles.name}>{name}</div>
      <div className={styles.count}>{count} {count === 1 ? 'person' : 'people'}</div>
    </BaseNode>
  )
}
```

- [ ] **Step 2: Create GroupHeaderNode.module.css**

```css
/* web/src/components/GroupHeaderNode.module.css */

.name {
  font-weight: 600;
  font-size: 13px;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}

.count {
  font-size: 10px;
  color: var(--grove-green);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 2px;
}
```

- [ ] **Step 3: Update ColumnView.tsx to use GroupHeaderNode**

Replace `PodHeaderNode` import with `GroupHeaderNode`. Update `renderPodHeader` to create `GroupHeaderNode` instead. Update the `renderTeamHeader` callback at the bottom.

Key mapping:
- `podName` → `name`
- `memberCount` → `count`
- `publicNote` → `noteText`
- `podNodeId` → `nodeId` and `droppableId`
- `nodeRef` → `cardRef`
- `onAdd` → `onAdd` (stays same)
- `onClick` for pod sidebar → `onInfo` or `onClick`

- [ ] **Step 4: Update OrphanGroup.tsx to use GroupHeaderNode**

Replace the `renderTeamHeader` callback type and default fallback to use `GroupHeaderNode`.

- [ ] **Step 5: Delete PodHeaderNode files**

```bash
rm web/src/views/PodHeaderNode.tsx web/src/views/PodHeaderNode.module.css
```

- [ ] **Step 6: Run type check and tests**

Run: `cd web && npx tsc --noEmit && npx vitest run -u`
Expected: exit 0, all tests pass

- [ ] **Step 7: Commit**

```bash
jj describe -m "refactor: replace PodHeaderNode with GroupHeaderNode on BaseNode (phase 3)"
```

---

### Task 6: Clean up dead code and verify

**Files:**
- Verify: `web/src/components/PersonNode.module.css` — no unused classes
- Verify: `web/src/views/shared.tsx` — only exports buildOrgTree + OrgNode
- Verify: no remaining imports of DraggableNode or PodHeaderNode

- [ ] **Step 1: Search for stale imports**

Run: `cd web && grep -rn "DraggableNode\|PodHeaderNode" src/ --include="*.tsx" --include="*.ts"`
Expected: no matches

- [ ] **Step 2: Run full test suite**

Run: `cd web && npx vitest run`
Expected: all tests pass

- [ ] **Step 3: Run build**

Run: `cd /home/zach/code/grove && make build`
Expected: clean build

- [ ] **Step 4: Commit**

```bash
jj describe -m "chore: remove dead code after BaseNode migration (phase 4)"
```
