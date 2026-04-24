import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ManagerInfoPopover from './ManagerInfoPopover'
import { makeNode } from '../test-helpers'

afterEach(() => cleanup())

const manager = makeNode({ id: 'm1', name: 'Manager Alice', managerId: '' })
const report1 = makeNode({ id: 'r1', name: 'Bob', managerId: 'm1', discipline: 'Engineering', status: 'Active' })

describe('ManagerInfoPopover', () => {
  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const working = [manager, report1]
    render(<ManagerInfoPopover personId="m1" working={working} onClose={onClose} />)
    await user.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when overlay is mouseDown-ed', () => {
    const onClose = vi.fn()
    const working = [manager, report1]
    const { container } = render(<ManagerInfoPopover personId="m1" working={working} onClose={onClose} />)
    const overlay = container.firstChild as HTMLElement
    fireEvent.mouseDown(overlay)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when popover content is mouseDown-ed', () => {
    const onClose = vi.fn()
    const working = [manager, report1]
    render(<ManagerInfoPopover personId="m1" working={working} onClose={onClose} />)
    // mouseDown on the person name text inside the popover
    fireEvent.mouseDown(screen.getByText('Manager Alice'))
    expect(onClose).not.toHaveBeenCalled()
  })
})
