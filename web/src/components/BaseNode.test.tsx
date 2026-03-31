import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DndContext } from '@dnd-kit/core'
import BaseNode from './BaseNode'

afterEach(() => cleanup())

describe('BaseNode', () => {
  it('renders children inside the card', () => {
    render(
      <BaseNode nodeId="n1" testId="card">
        <span>Hello child</span>
      </BaseNode>,
    )
    const card = screen.getByTestId('card')
    expect(card.textContent).toContain('Hello child')
  })

  it('applies default variant (no manager/group class)', () => {
    render(
      <BaseNode nodeId="n1" testId="card">
        content
      </BaseNode>,
    )
    const card = screen.getByTestId('card')
    expect(card.className).not.toMatch(/manager/)
    expect(card.className).not.toMatch(/group/)
  })

  it('applies manager variant class', () => {
    render(
      <BaseNode nodeId="n1" variant="manager" testId="card">
        content
      </BaseNode>,
    )
    const card = screen.getByTestId('card')
    expect(card.className).toMatch(/manager/)
  })

  it('applies group variant class', () => {
    render(
      <BaseNode nodeId="n1" variant="group" testId="card">
        content
      </BaseNode>,
    )
    const card = screen.getByTestId('card')
    expect(card.className).toMatch(/group/)
  })

  it('selected class applied when selected', () => {
    render(
      <BaseNode nodeId="n1" selected testId="card">
        content
      </BaseNode>,
    )
    const card = screen.getByTestId('card')
    expect(card.className).toMatch(/selected/)
    expect(card.dataset.selected).toBe('true')
  })

  it('status style: recruiting', () => {
    render(
      <BaseNode nodeId="n1" statusStyle="recruiting" testId="card">
        content
      </BaseNode>,
    )
    const card = screen.getByTestId('card')
    expect(card.className).toMatch(/recruiting/)
  })

  it('status style: planned maps to future class', () => {
    render(
      <BaseNode nodeId="n1" statusStyle="planned" testId="card">
        content
      </BaseNode>,
    )
    const card = screen.getByTestId('card')
    expect(card.className).toMatch(/future/)
  })

  it('status style: transfer', () => {
    render(
      <BaseNode nodeId="n1" statusStyle="transfer" testId="card">
        content
      </BaseNode>,
    )
    const card = screen.getByTestId('card')
    expect(card.className).toMatch(/transfer/)
  })

  it('ghost class applied when ghost', () => {
    render(
      <BaseNode nodeId="n1" ghost testId="card">
        content
      </BaseNode>,
    )
    const card = screen.getByTestId('card')
    expect(card.className).toMatch(/ghost/)
  })

  it('emp accent sets --emp-color CSS variable', () => {
    render(
      <BaseNode nodeId="n1" empAccent="#8b5cf6" testId="card">
        content
      </BaseNode>,
    )
    const card = screen.getByTestId('card')
    expect(card.style.getPropertyValue('--emp-color')).toBe('#8b5cf6')
    expect(card.className).toMatch(/empRight/)
  })

  it('note icon only appears when noteText provided', () => {
    const { rerender } = render(
      <BaseNode nodeId="n1">content</BaseNode>,
    )
    expect(screen.queryByLabelText('Toggle notes')).toBeNull()

    rerender(
      <BaseNode nodeId="n1" noteText="A note">content</BaseNode>,
    )
    expect(screen.getByLabelText('Toggle notes')).toBeTruthy()
  })

  it('note panel toggles on click', async () => {
    render(
      <BaseNode nodeId="n1" noteText="My note">content</BaseNode>,
    )
    const btn = screen.getByLabelText('Toggle notes')

    await userEvent.click(btn)
    expect(screen.getByText('My note')).toBeTruthy()

    await userEvent.click(btn)
    expect(screen.queryByText('My note')).toBeNull()
  })

  it('collapse toggle only appears when onToggleCollapse provided', () => {
    const { rerender } = render(
      <BaseNode nodeId="n1">content</BaseNode>,
    )
    expect(screen.queryByLabelText(/subtree/)).toBeNull()

    rerender(
      <BaseNode nodeId="n1" onToggleCollapse={() => {}}>content</BaseNode>,
    )
    expect(screen.getByLabelText(/subtree/)).toBeTruthy()
  })

  it('collapse toggle calls onToggleCollapse', async () => {
    const onToggle = vi.fn()
    render(
      <BaseNode nodeId="n1" onToggleCollapse={onToggle}>content</BaseNode>,
    )
    await userEvent.click(screen.getByLabelText(/subtree/))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('collapsed state shows Expand label', () => {
    render(
      <BaseNode nodeId="n1" collapsed onToggleCollapse={() => {}}>
        content
      </BaseNode>,
    )
    expect(screen.getByLabelText('Expand subtree')).toBeTruthy()
    expect(screen.getByTitle('Expand')).toBeTruthy()
  })

  it('warning dot only when warning provided', () => {
    const { rerender } = render(
      <BaseNode nodeId="n1">content</BaseNode>,
    )
    expect(screen.queryByLabelText(/Warning/)).toBeNull()

    rerender(
      <BaseNode nodeId="n1" warning="Span too wide">content</BaseNode>,
    )
    expect(screen.getByLabelText('Warning: Span too wide')).toBeTruthy()
  })

  it('private icon only when isPrivate', () => {
    const { rerender } = render(
      <BaseNode nodeId="n1">content</BaseNode>,
    )
    expect(screen.queryByLabelText('Private')).toBeNull()

    rerender(
      <BaseNode nodeId="n1" isPrivate>content</BaseNode>,
    )
    expect(screen.getByLabelText('Private')).toBeTruthy()
  })

  it('private icon hidden for placeholders', () => {
    render(
      <BaseNode nodeId="n1" isPrivate isPlaceholder>content</BaseNode>,
    )
    expect(screen.queryByLabelText('Private')).toBeNull()
  })

  it('onClick called on card click', async () => {
    const onClick = vi.fn()
    render(
      <BaseNode nodeId="n1" onClick={onClick} testId="card">
        content
      </BaseNode>,
    )
    await userEvent.click(screen.getByTestId('card'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('onClick called on Enter key', async () => {
    const onClick = vi.fn()
    render(
      <BaseNode nodeId="n1" onClick={onClick} testId="card">
        content
      </BaseNode>,
    )
    screen.getByTestId('card').focus()
    await userEvent.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('hover shows action buttons', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <BaseNode
        nodeId="n1"
        actions={{ onDelete: vi.fn() }}
      >
        content
      </BaseNode>,
    )
    const wrapper = container.firstElementChild!
    expect(screen.queryByLabelText('Delete')).toBeNull()

    await user.hover(wrapper)
    expect(screen.getByLabelText('Delete')).toBeTruthy()

    await user.unhover(wrapper)
    expect(screen.queryByLabelText('Delete')).toBeNull()
  })

  it('ghost hides actions', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <BaseNode
        nodeId="n1"
        ghost
        actions={{ onDelete: vi.fn() }}
      >
        content
      </BaseNode>,
    )
    await user.hover(container.firstElementChild!)
    expect(screen.queryByLabelText('Delete')).toBeNull()
  })

  it('drag/drop wrapper appears when draggable=true', () => {
    const { container } = render(
      <DndContext>
        <BaseNode nodeId="n1" draggable testId="card">
          content
        </BaseNode>
      </DndContext>,
    )
    expect(container.querySelector('[data-dnd-draggable]')).toBeTruthy()
  })

  it('no drag wrapper when neither enabled', () => {
    const { container } = render(
      <BaseNode nodeId="n1" testId="card">
        content
      </BaseNode>,
    )
    expect(container.querySelector('[data-dnd-draggable]')).toBeNull()
  })

  it('cardRef called with .node element', () => {
    const ref = vi.fn()
    render(
      <BaseNode nodeId="n1" cardRef={ref} testId="card">
        content
      </BaseNode>,
    )
    expect(ref).toHaveBeenCalledOnce()
    const el = ref.mock.calls[0][0]
    expect(el).toBeInstanceOf(HTMLDivElement)
    expect(el.getAttribute('role')).toBe('button')
  })

  it('note icon NOT inside role=button card (a11y)', () => {
    render(
      <BaseNode nodeId="n1" noteText="Note" testId="card">
        content
      </BaseNode>,
    )
    const card = screen.getByTestId('card')
    // Note button must not be a descendant of the card (role=button)
    const noteBtn = screen.getByLabelText('Toggle notes')
    expect(card.contains(noteBtn)).toBe(false)
  })

  it('collapse toggle NOT inside role=button card (a11y)', () => {
    render(
      <BaseNode nodeId="n1" onToggleCollapse={() => {}} testId="card">
        content
      </BaseNode>,
    )
    const card = screen.getByTestId('card')
    const toggle = screen.getByLabelText(/subtree/)
    expect(card.contains(toggle)).toBe(false)
  })
})
