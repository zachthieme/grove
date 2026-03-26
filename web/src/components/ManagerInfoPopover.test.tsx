import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ManagerInfoPopover from './ManagerInfoPopover'
import type { Person } from '../api/types'

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: 'a1',
    name: 'Alice Smith',
    role: 'Software Engineer',
    discipline: 'Engineering',
    managerId: '',
    team: 'Platform',
    additionalTeams: [],
    status: 'Active',
    ...overrides,
  }
}

afterEach(() => cleanup())

const manager = makePerson({ id: 'm1', name: 'Manager Alice', managerId: '' })
const report1 = makePerson({ id: 'r1', name: 'Bob', managerId: 'm1', discipline: 'Engineering', status: 'Active' })
const report2 = makePerson({ id: 'r2', name: 'Carol', managerId: 'm1', discipline: 'Design', status: 'Active' })
const report3 = makePerson({ id: 'r3', name: 'Dan', managerId: 'm1', discipline: 'Engineering', status: 'Active' })

describe('ManagerInfoPopover', () => {
  it('renders the person name', () => {
    const working = [manager, report1, report2]
    render(<ManagerInfoPopover personId="m1" working={working} onClose={vi.fn()} />)
    expect(screen.getByText('Manager Alice')).toBeDefined()
  })

  it('shows Unknown fallback when person is not found', () => {
    render(<ManagerInfoPopover personId="nonexistent" working={[]} onClose={vi.fn()} />)
    expect(screen.getByText('Unknown')).toBeDefined()
  })

  it('shows Direct Reports count', () => {
    const working = [manager, report1, report2, report3]
    render(<ManagerInfoPopover personId="m1" working={working} onClose={vi.fn()} />)
    const label = screen.getByText('Direct Reports')
    const value = label.parentElement!.querySelector('[class*="value"]')!
    expect(value.textContent).toBe('3')
  })

  it('shows Total Headcount', () => {
    const working = [manager, report1, report2]
    render(<ManagerInfoPopover personId="m1" working={working} onClose={vi.fn()} />)
    const label = screen.getByText('Total Headcount')
    const value = label.parentElement!.querySelector('[class*="value"]')!
    expect(value.textContent).toBe('2')
  })

  it('shows Recruiting row when there are open/backfill reports', () => {
    const openReq = makePerson({ id: 'o1', name: 'Open Req', managerId: 'm1', status: 'Open' })
    const backfill = makePerson({ id: 'bf1', name: 'Backfill Req', managerId: 'm1', status: 'Backfill' })
    const working = [manager, report1, openReq, backfill]
    render(<ManagerInfoPopover personId="m1" working={working} onClose={vi.fn()} />)
    const label = screen.getByText('Recruiting')
    const value = label.parentElement!.querySelector('[class*="value"]')!
    expect(value.textContent).toBe('2')
  })

  it('does not show Recruiting row when no open/backfill reports', () => {
    const working = [manager, report1]
    render(<ManagerInfoPopover personId="m1" working={working} onClose={vi.fn()} />)
    expect(screen.queryByText('Recruiting')).toBeNull()
  })

  it('shows Planned row when there are planned/pending open reports', () => {
    const planned = makePerson({ id: 'pl1', name: 'Planned', managerId: 'm1', status: 'Planned' })
    const pendingOpen = makePerson({ id: 'po1', name: 'PendingOpen', managerId: 'm1', status: 'Pending Open' })
    const working = [manager, planned, pendingOpen]
    render(<ManagerInfoPopover personId="m1" working={working} onClose={vi.fn()} />)
    expect(screen.getByText('Planned')).toBeDefined()
  })

  it('does not show Planned row when no planned reports', () => {
    const working = [manager, report1]
    render(<ManagerInfoPopover personId="m1" working={working} onClose={vi.fn()} />)
    expect(screen.queryByText('Planned')).toBeNull()
  })

  it('shows Transfers row when there are transfer in/out reports', () => {
    const transferIn = makePerson({ id: 'ti1', name: 'Transfer', managerId: 'm1', status: 'Transfer In' })
    const working = [manager, transferIn]
    render(<ManagerInfoPopover personId="m1" working={working} onClose={vi.fn()} />)
    const label = screen.getByText('Transfers')
    const value = label.parentElement!.querySelector('[class*="value"]')!
    expect(value.textContent).toBe('1')
  })

  it('does not show Transfers row when no transfers', () => {
    const working = [manager, report1]
    render(<ManagerInfoPopover personId="m1" working={working} onClose={vi.fn()} />)
    expect(screen.queryByText('Transfers')).toBeNull()
  })

  it('shows discipline breakdown for active reports', () => {
    const working = [manager, report1, report2, report3]
    render(<ManagerInfoPopover personId="m1" working={working} onClose={vi.fn()} />)
    expect(screen.getByText('By discipline')).toBeDefined()
    // Engineering: 2, Design: 1
    expect(screen.getByText('Engineering')).toBeDefined()
    expect(screen.getByText('Design')).toBeDefined()
  })

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

  it('includes nested reports in total headcount', () => {
    // manager -> report1 -> subreport
    const subreport = makePerson({ id: 'sr1', name: 'Sub', managerId: 'r1', discipline: 'QA', status: 'Active' })
    const working = [manager, report1, subreport]
    render(<ManagerInfoPopover personId="m1" working={working} onClose={vi.fn()} />)
    // Direct Reports is 1, Total Headcount is 2
    const directLabel = screen.getByText('Direct Reports')
    const directValue = directLabel.parentElement!.querySelector('[class*="value"]')!
    expect(directValue.textContent).toBe('1')
    const totalLabel = screen.getByText('Total Headcount')
    const totalValue = totalLabel.parentElement!.querySelector('[class*="value"]')!
    expect(totalValue.textContent).toBe('2')
  })
})
