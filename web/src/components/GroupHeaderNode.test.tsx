import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import GroupHeaderNode from './GroupHeaderNode'

afterEach(() => cleanup())

// Wrap in DndContext since GroupHeaderNode uses BaseNode with draggable/droppable
function renderWithDnd(ui: React.ReactElement) {
  return render(<DndContext>{ui}</DndContext>)
}

describe('GroupHeaderNode', () => {
  it('renders group name and member count', () => {
    renderWithDnd(<GroupHeaderNode nodeId="p1" name="Alpha Pod" count={5} />)
    expect(screen.getByText('Alpha Pod')).toBeTruthy()
    expect(screen.getByText('5 people')).toBeTruthy()
  })

  it('shows singular "person" for count of 1', () => {
    renderWithDnd(<GroupHeaderNode nodeId="p1" name="Solo" count={1} />)
    expect(screen.getByText('1 person')).toBeTruthy()
  })

  it('shows add action on hover when onAdd is provided', async () => {
    const onAdd = vi.fn()
    const { container } = renderWithDnd(
      <GroupHeaderNode nodeId="p1" name="Pod" count={3} onAdd={onAdd} />
    )

    const wrapper = container.querySelector('[data-dnd-draggable]')!.firstChild as HTMLElement
    fireEvent.mouseEnter(wrapper)

    const addBtn = screen.getByLabelText('Add direct report')
    expect(addBtn).toBeTruthy()
  })

  it('does not show actions when onAdd and onInfo are not provided', async () => {
    const { container } = renderWithDnd(
      <GroupHeaderNode nodeId="p1" name="Pod" count={3} />
    )

    const wrapper = container.querySelector('[data-dnd-draggable]')!.firstChild as HTMLElement
    fireEvent.mouseEnter(wrapper)

    expect(screen.queryByLabelText('Add direct report')).toBeNull()
  })

  it('calls onAdd when add action clicked', () => {
    const onAdd = vi.fn()
    const { container } = renderWithDnd(
      <GroupHeaderNode nodeId="p1" name="Pod" count={3} onAdd={onAdd} />
    )

    const wrapper = container.querySelector('[data-dnd-draggable]')!.firstChild as HTMLElement
    fireEvent.mouseEnter(wrapper)

    const addBtn = screen.getByLabelText('Add direct report')
    fireEvent.click(addBtn)
    expect(onAdd).toHaveBeenCalled()
  })

  it('calls onClick when header card is clicked', () => {
    const onClick = vi.fn()
    renderWithDnd(
      <GroupHeaderNode nodeId="p1" name="Pod" count={3} onClick={onClick} />
    )

    fireEvent.click(screen.getByText('Pod'))
    expect(onClick).toHaveBeenCalled()
  })

  it('shows note icon when noteText is provided', () => {
    renderWithDnd(
      <GroupHeaderNode nodeId="p1" name="Pod" count={3} noteText="Some note text" />
    )
    const noteBtn = screen.getByLabelText('Toggle notes')
    expect(noteBtn).toBeTruthy()
  })

  it('does not show note icon when noteText is not provided', () => {
    renderWithDnd(
      <GroupHeaderNode nodeId="p1" name="Pod" count={3} />
    )
    expect(screen.queryByLabelText('Toggle notes')).toBeNull()
  })

  it('toggles note panel visibility when note icon clicked', () => {
    renderWithDnd(
      <GroupHeaderNode nodeId="p1" name="Pod" count={3} noteText="Note content" />
    )

    const noteBtn = screen.getByLabelText('Toggle notes')
    fireEvent.click(noteBtn)
    expect(screen.getByText('Note content')).toBeTruthy()

    fireEvent.click(noteBtn)
    expect(screen.queryByText('Note content')).toBeNull()
  })

  it('calls cardRef when provided', () => {
    const cardRef = vi.fn()
    renderWithDnd(
      <GroupHeaderNode nodeId="p1" name="Pod" count={3} cardRef={cardRef} />
    )
    expect(cardRef).toHaveBeenCalled()
  })

  it('has correct testId and ariaLabel', () => {
    renderWithDnd(
      <GroupHeaderNode nodeId="p1" name="Alpha" count={2} />
    )
    const card = screen.getByTestId('group-Alpha')
    expect(card).toBeTruthy()
    expect(card.getAttribute('aria-label')).toBe('Alpha group')
  })

  it('applies group variant class via BaseNode', () => {
    renderWithDnd(
      <GroupHeaderNode nodeId="p1" name="Pod" count={3} />
    )
    const card = screen.getByTestId('group-Pod')
    expect(card.className).toMatch(/group/)
  })

  it('shows info action on hover when onInfo is provided', () => {
    const onInfo = vi.fn()
    const { container } = renderWithDnd(
      <GroupHeaderNode nodeId="p1" name="Pod" count={3} onInfo={onInfo} />
    )

    const wrapper = container.querySelector('[data-dnd-draggable]')!.firstChild as HTMLElement
    fireEvent.mouseEnter(wrapper)

    const infoBtn = screen.getByLabelText('Org metrics')
    expect(infoBtn).toBeTruthy()
    fireEvent.click(infoBtn)
    expect(onInfo).toHaveBeenCalled()
  })
})
