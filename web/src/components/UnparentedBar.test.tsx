import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UnparentedBar from './UnparentedBar'
import { makePerson, renderWithOrg } from '../test-helpers'

afterEach(() => cleanup())

describe('UnparentedBar', () => {
  it('expands to show orphan names when toggle is clicked', async () => {
    const user = userEvent.setup()
    const orphan = makePerson({ id: 'o1', name: 'Orphan Alice', managerId: '' })
    renderWithOrg(<UnparentedBar />, {
      working: [orphan],
    })
    await user.click(screen.getByText(/1 unparented person/))
    expect(screen.getByText('Orphan Alice')).toBeDefined()
  })

  it('collapses again when toggle is clicked twice', async () => {
    const user = userEvent.setup()
    const orphan = makePerson({ id: 'o1', name: 'Orphan Alice', managerId: '' })
    renderWithOrg(<UnparentedBar />, {
      working: [orphan],
    })
    const toggle = screen.getByText(/1 unparented person/)
    await user.click(toggle)
    expect(screen.getByText('Orphan Alice')).toBeDefined()
    await user.click(toggle)
    expect(screen.queryByText('Orphan Alice')).toBeNull()
  })

  it('calls toggleSelect when an orphan name is clicked', async () => {
    const user = userEvent.setup()
    const toggleSelect = vi.fn()
    const orphan = makePerson({ id: 'o1', name: 'Orphan Alice', managerId: '' })
    renderWithOrg(<UnparentedBar />, {
      working: [orphan],
      toggleSelect,
    })
    await user.click(screen.getByText(/1 unparented person/))
    await user.click(screen.getByText('Orphan Alice'))
    expect(toggleSelect).toHaveBeenCalledTimes(1)
    expect(toggleSelect).toHaveBeenCalledWith('o1', false)
  })
})
