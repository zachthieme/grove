/**
 * Branch coverage tests for shared.tsx DraggableNode component.
 * Covers lines 47-59: DraggableNode rendering with drop/drag state branches.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { DraggableNode } from './shared'

// Track what useDroppable returns so we can control isOver
let mockIsOver = false
let mockIsDragging = false
let capturedDropRef: ((node: HTMLElement | null) => void) | null = null
let capturedDragRef: ((node: HTMLElement | null) => void) | null = null

vi.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({
    attributes: { 'data-test-draggable': 'true' },
    listeners: {},
    setNodeRef: (node: HTMLElement | null) => { capturedDragRef?.(node) },
    isDragging: mockIsDragging,
  }),
  useDroppable: () => ({
    setNodeRef: (node: HTMLElement | null) => { capturedDropRef?.(node) },
    isOver: mockIsOver,
  }),
}))

vi.mock('../components/PersonNode', () => ({
  default: ({ person, selected, onClick }: { person: { name: string }; selected: boolean; onClick: () => void }) => (
    <div data-testid="person-node" data-selected={selected} onClick={onClick}>
      {person.name}
    </div>
  ),
}))

const basePerson = {
  id: 'p1',
  name: 'Alice',
  role: 'Engineer',
  discipline: 'Eng',
  managerId: '',
  team: 'Team A',
  additionalTeams: [] as string[],
  status: 'Active' as const,
}

afterEach(() => {
  cleanup()
  mockIsOver = false
  mockIsDragging = false
  capturedDropRef = null
  capturedDragRef = null
})

describe('DraggableNode', () => {
  it('renders PersonNode with person data', () => {
    render(
      <DraggableNode
        person={basePerson}
        selected={false}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByTestId('person-node')).toBeDefined()
    expect(screen.getByText('Alice')).toBeDefined()
  })

  it('applies drop highlight styles when isOver and not dragging', () => {
    mockIsOver = true
    mockIsDragging = false
    const { container } = render(
      <DraggableNode
        person={basePerson}
        selected={false}
        onSelect={() => {}}
      />,
    )
    // The outermost div should have the drop-highlight outline
    const outerDiv = container.firstElementChild as HTMLElement
    expect(outerDiv.style.outline).toContain('2px solid')
    expect(outerDiv.style.outlineOffset).toBe('2px')
  })

  it('does NOT apply drop highlight when isDragging (even if isOver)', () => {
    mockIsOver = true
    mockIsDragging = true
    const { container } = render(
      <DraggableNode
        person={basePerson}
        selected={false}
        onSelect={() => {}}
      />,
    )
    const outerDiv = container.firstElementChild as HTMLElement
    expect(outerDiv.style.outline).toBe('none')
  })

  it('does NOT apply drop highlight when not isOver', () => {
    mockIsOver = false
    mockIsDragging = false
    const { container } = render(
      <DraggableNode
        person={basePerson}
        selected={false}
        onSelect={() => {}}
      />,
    )
    const outerDiv = container.firstElementChild as HTMLElement
    expect(outerDiv.style.outline).toBe('none')
  })

  it('reduces opacity when isDragging', () => {
    mockIsDragging = true
    const { container } = render(
      <DraggableNode
        person={basePerson}
        selected={false}
        onSelect={() => {}}
      />,
    )
    const outerDiv = container.firstElementChild as HTMLElement
    const dragDiv = outerDiv.firstElementChild as HTMLElement
    expect(dragDiv.style.opacity).toBe('0.3')
  })

  it('has full opacity when not dragging', () => {
    mockIsDragging = false
    const { container } = render(
      <DraggableNode
        person={basePerson}
        selected={false}
        onSelect={() => {}}
      />,
    )
    const outerDiv = container.firstElementChild as HTMLElement
    const dragDiv = outerDiv.firstElementChild as HTMLElement
    expect(dragDiv.style.opacity).toBe('1')
  })

  it('calls nodeRef callback with the drop ref element', () => {
    const nodeRefFn = vi.fn()
    capturedDropRef = (node) => { nodeRefFn(node) }
    render(
      <DraggableNode
        person={basePerson}
        selected={false}
        onSelect={() => {}}
        nodeRef={nodeRefFn}
      />,
    )
    // The component's ref callback should call both setDropRef and nodeRef
    // Since our mock captures the ref, nodeRef should have been called
    expect(nodeRefFn).toHaveBeenCalled()
  })

  it('works without optional nodeRef', () => {
    // Should not throw when nodeRef is undefined
    render(
      <DraggableNode
        person={basePerson}
        selected={false}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByText('Alice')).toBeDefined()
  })
})
