// Scenarios: VIEW-006
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { DragBadgeOverlay } from './DragBadgeOverlay'
import { makePerson } from '../test-helpers'

vi.mock('@dnd-kit/core', () => ({
  DragOverlay: ({ children }: { children: React.ReactNode }) => <div data-testid="drag-overlay">{children}</div>,
}))

afterEach(() => cleanup())

describe('DragBadgeOverlay', () => {
  it('[VIEW-006] renders nothing when draggedPerson is null', () => {
    render(<DragBadgeOverlay draggedPerson={null} selectedIds={new Set()} />)
    const overlay = screen.getByTestId('drag-overlay')
    expect(overlay.children.length).toBe(0)
  })

  it('[VIEW-006] renders nothing when draggedPerson is undefined', () => {
    render(<DragBadgeOverlay draggedPerson={undefined} selectedIds={new Set()} />)
    const overlay = screen.getByTestId('drag-overlay')
    expect(overlay.children.length).toBe(0)
  })

  it('[VIEW-006] shows PersonNode when draggedPerson is provided', () => {
    const person = makePerson({ id: 'p1', name: 'Alice' })
    render(<DragBadgeOverlay draggedPerson={person} selectedIds={new Set()} />)
    expect(screen.getByText('Alice')).toBeTruthy()
  })

  it('[VIEW-006] shows multi-select badge with count when draggedPerson is in selectedIds and size > 1', () => {
    const person = makePerson({ id: 'p1', name: 'Alice' })
    const selectedIds = new Set(['p1', 'p2', 'p3'])
    render(<DragBadgeOverlay draggedPerson={person} selectedIds={selectedIds} />)
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('[VIEW-006] does NOT show badge when only 1 selected even if draggedPerson is in set', () => {
    const person = makePerson({ id: 'p1', name: 'Alice' })
    const selectedIds = new Set(['p1'])
    render(<DragBadgeOverlay draggedPerson={person} selectedIds={selectedIds} />)
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.queryByText('1')).toBeNull()
  })

  it('[VIEW-006] does NOT show badge when draggedPerson is not in selectedIds', () => {
    const person = makePerson({ id: 'p1', name: 'Alice' })
    const selectedIds = new Set(['p2', 'p3'])
    render(<DragBadgeOverlay draggedPerson={person} selectedIds={selectedIds} />)
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.queryByText('2')).toBeNull()
  })
})
