import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { normalizeHTML, makePerson } from '../test-helpers'
import ManagerInfoPopover from './ManagerInfoPopover'

describe('ManagerInfoPopover golden', () => {
  afterEach(() => cleanup())

  it('basic with active ICs', () => {
    const manager = makePerson({ id: 'm1', name: 'Manager Alice', managerId: '' })
    const report1 = makePerson({ id: 'r1', name: 'Bob', managerId: 'm1', discipline: 'Engineering', status: 'Active' })
    const report2 = makePerson({ id: 'r2', name: 'Carol', managerId: 'm1', discipline: 'Design', status: 'Active' })
    const report3 = makePerson({ id: 'r3', name: 'Dan', managerId: 'm1', discipline: 'Engineering', status: 'Active' })
    const working = [manager, report1, report2, report3]
    const { container } = render(
      <ManagerInfoPopover personId="m1" working={working} onClose={vi.fn()} />
    )
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/manager-info-popover-basic.golden'
    )
  })

  it('with recruiting/open roles', () => {
    const manager = makePerson({ id: 'm1', name: 'Manager Alice', managerId: '' })
    const active = makePerson({ id: 'r1', name: 'Bob', managerId: 'm1', discipline: 'Engineering', status: 'Active' })
    const openReq = makePerson({ id: 'o1', name: 'Open Req', managerId: 'm1', status: 'Open' })
    const backfill = makePerson({ id: 'bf1', name: 'Backfill Req', managerId: 'm1', status: 'Backfill' })
    const working = [manager, active, openReq, backfill]
    const { container } = render(
      <ManagerInfoPopover personId="m1" working={working} onClose={vi.fn()} />
    )
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/manager-info-popover-recruiting.golden'
    )
  })

  it('full (all categories)', () => {
    const manager = makePerson({ id: 'm1', name: 'Manager Alice', managerId: '' })
    const active = makePerson({ id: 'r1', name: 'Bob', managerId: 'm1', discipline: 'Engineering', status: 'Active' })
    const openReq = makePerson({ id: 'o1', name: 'Open Req', managerId: 'm1', status: 'Open' })
    const planned = makePerson({ id: 'pl1', name: 'Planned Req', managerId: 'm1', status: 'Planned' })
    const transfer = makePerson({ id: 'ti1', name: 'Transfer', managerId: 'm1', status: 'Transfer In' })
    const working = [manager, active, openReq, planned, transfer]
    const { container } = render(
      <ManagerInfoPopover personId="m1" working={working} onClose={vi.fn()} />
    )
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/manager-info-popover-full.golden'
    )
  })

  it('unknown person', () => {
    const { container } = render(
      <ManagerInfoPopover personId="nonexistent" working={[]} onClose={vi.fn()} />
    )
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/manager-info-popover-unknown.golden'
    )
  })

  it('nested headcount', () => {
    const manager = makePerson({ id: 'm1', name: 'Manager Alice', managerId: '' })
    const report1 = makePerson({ id: 'r1', name: 'Bob', managerId: 'm1', discipline: 'Engineering', status: 'Active' })
    const subreport = makePerson({ id: 'sr1', name: 'Sub', managerId: 'r1', discipline: 'QA', status: 'Active' })
    const working = [manager, report1, subreport]
    const { container } = render(
      <ManagerInfoPopover personId="m1" working={working} onClose={vi.fn()} />
    )
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/manager-info-popover-nested.golden'
    )
  })
})
