// Scenarios: VIEW-006
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { DragBadgeOverlay } from './DragBadgeOverlay'

vi.mock('@dnd-kit/core', () => ({
  DragOverlay: ({ children }: { children: React.ReactNode }) => <div data-testid="drag-overlay">{children}</div>,
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: vi.fn(), isDragging: false }),
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
}))

afterEach(() => cleanup())

describe('DragBadgeOverlay', () => {
  it('[VIEW-006] renders nothing when activeDragId is null', () => {
    render(<DragBadgeOverlay activeDragId={null} selectedIds={new Set()} />)
    const overlay = screen.getByTestId('drag-overlay')
    expect(overlay.children.length).toBe(0)
  })

  it('[VIEW-006] renders content when a matching DOM node exists', () => {
    // Set up a DOM node that the overlay will find
    const el = document.createElement('div')
    el.setAttribute('data-person-id', 'p1')
    const btn = document.createElement('div')
    btn.setAttribute('role', 'button')
    btn.textContent = 'Alice'
    el.appendChild(btn)
    document.body.appendChild(el)

    render(<DragBadgeOverlay activeDragId="p1" selectedIds={new Set()} />)
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0)

    document.body.removeChild(el)
  })

  it('[VIEW-006] shows multi-select badge when activeDragId is in selectedIds and size > 1', () => {
    const el = document.createElement('div')
    el.setAttribute('data-person-id', 'p1')
    const btn = document.createElement('div')
    btn.setAttribute('role', 'button')
    btn.textContent = 'Alice'
    el.appendChild(btn)
    document.body.appendChild(el)

    const selectedIds = new Set(['p1', 'p2', 'p3'])
    render(<DragBadgeOverlay activeDragId="p1" selectedIds={selectedIds} />)
    expect(screen.getByText('3')).toBeTruthy()

    document.body.removeChild(el)
  })

  it('[VIEW-006] does NOT show badge when only 1 selected', () => {
    const el = document.createElement('div')
    el.setAttribute('data-person-id', 'p1')
    const btn = document.createElement('div')
    btn.setAttribute('role', 'button')
    btn.textContent = 'Alice'
    el.appendChild(btn)
    document.body.appendChild(el)

    render(<DragBadgeOverlay activeDragId="p1" selectedIds={new Set(['p1'])} />)
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0)
    expect(screen.queryByText('1')).toBeNull()

    document.body.removeChild(el)
  })

  it('[VIEW-006] does NOT show badge when activeDragId is not in selectedIds', () => {
    const el = document.createElement('div')
    el.setAttribute('data-person-id', 'p1')
    const btn = document.createElement('div')
    btn.setAttribute('role', 'button')
    btn.textContent = 'Alice'
    el.appendChild(btn)
    document.body.appendChild(el)

    render(<DragBadgeOverlay activeDragId="p1" selectedIds={new Set(['p2', 'p3'])} />)
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0)
    expect(screen.queryByText('2')).toBeNull()

    document.body.removeChild(el)
  })
})
