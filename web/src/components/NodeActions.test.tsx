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
  it('[UI-002] click handlers fire correctly', async () => {
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
