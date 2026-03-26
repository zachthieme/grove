import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Breadcrumbs from './Breadcrumbs'
import { makePerson } from '../test-helpers'

const mockOrg: Record<string, unknown> = {}

function resetMockOrg() {
  Object.assign(mockOrg, {
    headPersonId: null as string | null,
    working: [] as ReturnType<typeof makePerson>[],
    setHead: vi.fn(),
  })
}

vi.mock('../store/OrgContext', () => ({
  useOrg: () => mockOrg,
}))

describe('Breadcrumbs', () => {
  beforeEach(() => resetMockOrg())
  afterEach(() => cleanup())

  it('calls setHead(null) when "All" button is clicked', async () => {
    const user = userEvent.setup()
    const setHeadFn = vi.fn()
    mockOrg.setHead = setHeadFn
    mockOrg.headPersonId = 'p1'
    mockOrg.working = [makePerson({ id: 'p1', name: 'Alice' })]
    render(<Breadcrumbs />)
    await user.click(screen.getByText('All'))
    expect(setHeadFn).toHaveBeenCalledWith(null)
  })

  it('calls setHead with ancestor id when ancestor button is clicked', async () => {
    const user = userEvent.setup()
    const setHeadFn = vi.fn()
    mockOrg.setHead = setHeadFn
    mockOrg.headPersonId = 'p3'
    mockOrg.working = [
      makePerson({ id: 'p1', name: 'CEO', managerId: '' }),
      makePerson({ id: 'p2', name: 'VP', managerId: 'p1' }),
      makePerson({ id: 'p3', name: 'Director', managerId: 'p2' }),
    ]
    render(<Breadcrumbs />)
    await user.click(screen.getByRole('button', { name: 'CEO' }))
    expect(setHeadFn).toHaveBeenCalledWith('p1')
  })
})
