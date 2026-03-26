import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UnparentedBar from './UnparentedBar'
import { makePerson } from '../test-helpers'

const mockOrg: Record<string, unknown> = {}

function resetMockOrg() {
  Object.assign(mockOrg, {
    working: [] as ReturnType<typeof makePerson>[],
    toggleSelect: vi.fn(),
  })
}

vi.mock('../store/OrgContext', () => ({
  useOrg: () => mockOrg,
}))

beforeEach(() => {
  vi.clearAllMocks()
  resetMockOrg()
})

afterEach(() => cleanup())

describe('UnparentedBar', () => {
  it('expands to show orphan names when toggle is clicked', async () => {
    const user = userEvent.setup()
    const orphan = makePerson({ id: 'o1', name: 'Orphan Alice', managerId: '' })
    mockOrg.working = [orphan]
    render(<UnparentedBar />)
    await user.click(screen.getByText(/1 unparented person/))
    expect(screen.getByText('Orphan Alice')).toBeDefined()
  })

  it('collapses again when toggle is clicked twice', async () => {
    const user = userEvent.setup()
    const orphan = makePerson({ id: 'o1', name: 'Orphan Alice', managerId: '' })
    mockOrg.working = [orphan]
    render(<UnparentedBar />)
    const toggle = screen.getByText(/1 unparented person/)
    await user.click(toggle)
    expect(screen.getByText('Orphan Alice')).toBeDefined()
    await user.click(toggle)
    expect(screen.queryByText('Orphan Alice')).toBeNull()
  })

  it('calls toggleSelect when an orphan name is clicked', async () => {
    const user = userEvent.setup()
    const orphan = makePerson({ id: 'o1', name: 'Orphan Alice', managerId: '' })
    mockOrg.working = [orphan]
    render(<UnparentedBar />)
    await user.click(screen.getByText(/1 unparented person/))
    await user.click(screen.getByText('Orphan Alice'))
    expect(mockOrg.toggleSelect).toHaveBeenCalledTimes(1)
    expect(mockOrg.toggleSelect).toHaveBeenCalledWith('o1', false)
  })
})
