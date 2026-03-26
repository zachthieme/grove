import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NodeActions from './NodeActions'

afterEach(cleanup)

function defaultProps(overrides: Partial<Parameters<typeof NodeActions>[0]> = {}) {
  return {
    showAdd: true,
    showInfo: false,
    showFocus: false,
    showEdit: true,
    showDelete: true,
    onAdd: vi.fn(),
    onDelete: vi.fn(),
    onEdit: vi.fn(),
    onInfo: vi.fn(),
    onFocus: undefined as ((e: React.MouseEvent) => void) | undefined,
    ...overrides,
  }
}

describe('NodeActions', () => {
  it('renders edit and delete buttons by default', () => {
    render(<NodeActions {...defaultProps()} />)

    expect(screen.getByLabelText('Edit')).toBeTruthy()
    expect(screen.getByLabelText('Delete')).toBeTruthy()
    expect(screen.getByLabelText('Add direct report')).toBeTruthy()
  })

  it('hides add button when showAdd=false', () => {
    render(<NodeActions {...defaultProps({ showAdd: false })} />)

    expect(screen.queryByLabelText('Add direct report')).toBeNull()
    expect(screen.getByLabelText('Edit')).toBeTruthy()
    expect(screen.getByLabelText('Delete')).toBeTruthy()
  })

  it('hides delete button when showDelete=false', () => {
    render(<NodeActions {...defaultProps({ showDelete: false })} />)

    expect(screen.queryByLabelText('Delete')).toBeNull()
    expect(screen.getByLabelText('Edit')).toBeTruthy()
  })

  it('hides edit button when showEdit=false', () => {
    render(<NodeActions {...defaultProps({ showEdit: false })} />)

    expect(screen.queryByLabelText('Edit')).toBeNull()
    expect(screen.getByLabelText('Delete')).toBeTruthy()
  })

  it('shows info button when showInfo=true', () => {
    render(<NodeActions {...defaultProps({ showInfo: true })} />)

    expect(screen.getByLabelText('Org metrics')).toBeTruthy()
  })

  it('hides info button when showInfo=false', () => {
    render(<NodeActions {...defaultProps({ showInfo: false })} />)

    expect(screen.queryByLabelText('Org metrics')).toBeNull()
  })

  it('shows focus button when showFocus=true and onFocus provided', () => {
    const onFocus = vi.fn()
    render(<NodeActions {...defaultProps({ showFocus: true, onFocus })} />)

    expect(screen.getByLabelText('Focus on subtree')).toBeTruthy()
  })

  it('hides focus button when showFocus=true but onFocus not provided', () => {
    render(<NodeActions {...defaultProps({ showFocus: true, onFocus: undefined })} />)

    expect(screen.queryByLabelText('Focus on subtree')).toBeNull()
  })

  it('hides focus button when showFocus=false', () => {
    const onFocus = vi.fn()
    render(<NodeActions {...defaultProps({ showFocus: false, onFocus })} />)

    expect(screen.queryByLabelText('Focus on subtree')).toBeNull()
  })

  it('click handlers fire correctly', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    const onDelete = vi.fn()
    const onEdit = vi.fn()
    const onInfo = vi.fn()
    const onFocus = vi.fn()

    render(
      <NodeActions
        {...defaultProps({
          showAdd: true,
          showInfo: true,
          showFocus: true,
          onAdd,
          onDelete,
          onEdit,
          onInfo,
          onFocus,
        })}
      />
    )

    await user.click(screen.getByLabelText('Add direct report'))
    expect(onAdd).toHaveBeenCalledTimes(1)

    await user.click(screen.getByLabelText('Delete'))
    expect(onDelete).toHaveBeenCalledTimes(1)

    await user.click(screen.getByLabelText('Edit'))
    expect(onEdit).toHaveBeenCalledTimes(1)

    await user.click(screen.getByLabelText('Org metrics'))
    expect(onInfo).toHaveBeenCalledTimes(1)

    await user.click(screen.getByLabelText('Focus on subtree'))
    expect(onFocus).toHaveBeenCalledTimes(1)
  })
})
