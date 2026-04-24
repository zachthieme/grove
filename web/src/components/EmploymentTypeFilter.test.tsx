import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EmploymentTypeFilter from './EmploymentTypeFilter'
import { makeNode, renderWithOrg } from '../test-helpers'

describe('EmploymentTypeFilter', () => {
  afterEach(() => cleanup())

  it('[FILTER-001] calls toggleEmploymentTypeFilter when a checkbox item is clicked', async () => {
    const user = userEvent.setup()
    const toggleFn = vi.fn()
    renderWithOrg(<EmploymentTypeFilter />, {
      toggleEmploymentTypeFilter: toggleFn,
      working: [makeNode({ id: '1', employmentType: 'FTE' })],
    })
    await user.click(screen.getByRole('button', { name: 'Employment type filter' }))
    await user.click(screen.getByRole('menuitemcheckbox'))
    expect(toggleFn).toHaveBeenCalledWith('FTE')
  })

  it('[FILTER-001] calls showAllEmploymentTypes when Show All is clicked', async () => {
    const user = userEvent.setup()
    const showAllFn = vi.fn()
    renderWithOrg(<EmploymentTypeFilter />, {
      showAllEmploymentTypes: showAllFn,
      working: [makeNode({ id: '1', employmentType: 'FTE' })],
    })
    await user.click(screen.getByRole('button', { name: 'Employment type filter' }))
    await user.click(screen.getByText('Show All'))
    expect(showAllFn).toHaveBeenCalledTimes(1)
  })

  it('[FILTER-001] calls hideAllEmploymentTypes with all types when Hide All is clicked', async () => {
    const user = userEvent.setup()
    const hideAllFn = vi.fn()
    renderWithOrg(<EmploymentTypeFilter />, {
      hideAllEmploymentTypes: hideAllFn,
      working: [
        makeNode({ id: '1', employmentType: 'FTE' }),
        makeNode({ id: '2', employmentType: 'CW' }),
      ],
    })
    await user.click(screen.getByRole('button', { name: 'Employment type filter' }))
    await user.click(screen.getByText('Hide All'))
    expect(hideAllFn).toHaveBeenCalledWith(['CW', 'FTE'])
  })
})
