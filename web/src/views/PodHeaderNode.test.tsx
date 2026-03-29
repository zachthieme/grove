import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PodHeaderNode } from './PodHeaderNode'

vi.mock('@dnd-kit/core', () => ({
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
}))

afterEach(() => cleanup())

describe('PodHeaderNode', () => {
  it('renders pod name and member count', () => {
    render(<PodHeaderNode podName="Alpha Pod" memberCount={5} />)
    expect(screen.getByText('Alpha Pod')).toBeTruthy()
    expect(screen.getByText('5 people')).toBeTruthy()
  })

  it('shows singular "person" for count of 1', () => {
    render(<PodHeaderNode podName="Solo" memberCount={1} />)
    expect(screen.getByText('1 person')).toBeTruthy()
  })

  it('shows add action on hover when onAdd is provided', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    const { container } = render(<PodHeaderNode podName="Pod" memberCount={3} onAdd={onAdd} />)

    const wrapper = container.firstChild as HTMLElement
    fireEvent.mouseEnter(wrapper)

    // NodeActions should appear with add button
    const addBtn = screen.getByLabelText('Add direct report')
    expect(addBtn).toBeTruthy()
  })

  it('does not show actions when onAdd is not provided', () => {
    const { container } = render(<PodHeaderNode podName="Pod" memberCount={3} />)
    const wrapper = container.firstChild as HTMLElement
    fireEvent.mouseEnter(wrapper)

    expect(screen.queryByLabelText('Add direct report')).toBeNull()
  })

  it('calls onAdd when add action clicked', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    const { container } = render(<PodHeaderNode podName="Pod" memberCount={3} onAdd={onAdd} />)

    const wrapper = container.firstChild as HTMLElement
    fireEvent.mouseEnter(wrapper)

    const addBtn = screen.getByLabelText('Add direct report')
    await user.click(addBtn)
    expect(onAdd).toHaveBeenCalled()
  })

  it('calls onClick when header is clicked', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<PodHeaderNode podName="Pod" memberCount={3} onClick={onClick} />)

    await user.click(screen.getByText('Pod'))
    expect(onClick).toHaveBeenCalled()
  })

  it('shows note icon when publicNote is provided', () => {
    render(<PodHeaderNode podName="Pod" memberCount={3} publicNote="Some note text" />)
    const noteBtn = screen.getByLabelText('Toggle pod notes')
    expect(noteBtn).toBeTruthy()
  })

  it('does not show note icon when publicNote is not provided', () => {
    render(<PodHeaderNode podName="Pod" memberCount={3} />)
    expect(screen.queryByLabelText('Toggle pod notes')).toBeNull()
  })

  it('toggles note panel visibility when note icon clicked', async () => {
    const user = userEvent.setup()
    render(<PodHeaderNode podName="Pod" memberCount={3} publicNote="Note content" />)

    const noteBtn = screen.getByLabelText('Toggle pod notes')
    await user.click(noteBtn)
    expect(screen.getByText('Note content')).toBeTruthy()

    await user.click(noteBtn)
    expect(screen.queryByText('Note content')).toBeNull()
  })

  it('calls nodeRef when provided', () => {
    const nodeRef = vi.fn()
    render(<PodHeaderNode podName="Pod" memberCount={3} nodeRef={nodeRef} />)
    expect(nodeRef).toHaveBeenCalled()
  })

  it('hides actions on mouse leave', () => {
    const onAdd = vi.fn()
    const { container } = render(<PodHeaderNode podName="Pod" memberCount={3} onAdd={onAdd} />)

    const wrapper = container.firstChild as HTMLElement
    fireEvent.mouseEnter(wrapper)
    expect(screen.getByLabelText('Add direct report')).toBeTruthy()

    fireEvent.mouseLeave(wrapper)
    expect(screen.queryByLabelText('Add direct report')).toBeNull()
  })
})
