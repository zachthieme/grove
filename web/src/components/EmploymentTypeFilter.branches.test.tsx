import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EmploymentTypeFilter from './EmploymentTypeFilter'
import { makePerson, renderWithOrg } from '../test-helpers'

describe('EmploymentTypeFilter branch coverage', () => {
  afterEach(() => cleanup())

  it('displays badge with hidden count when hiddenEmploymentTypes is non-empty', async () => {
    renderWithOrg(<EmploymentTypeFilter />, {
      working: [
        makePerson({ id: '1', employmentType: 'FTE' }),
        makePerson({ id: '2', employmentType: 'CW' }),
      ],
      hiddenEmploymentTypes: new Set(['FTE']),
    })
    // Badge should show "1"
    const badge = screen.getByText('1')
    expect(badge).toBeDefined()
  })

  it('does not display badge when hiddenEmploymentTypes is empty', () => {
    renderWithOrg(<EmploymentTypeFilter />, {
      working: [makePerson({ id: '1', employmentType: 'FTE' })],
      hiddenEmploymentTypes: new Set(),
    })
    // The trigger button text is just "Filter" with no badge number
    const trigger = screen.getByRole('button', { name: 'Employment type filter' })
    expect(trigger.textContent).toBe('Filter')
  })

  it('shows checkmark for visible types and no checkmark for hidden types', async () => {
    const user = userEvent.setup()
    renderWithOrg(<EmploymentTypeFilter />, {
      working: [
        makePerson({ id: '1', employmentType: 'FTE' }),
        makePerson({ id: '2', employmentType: 'CW' }),
      ],
      hiddenEmploymentTypes: new Set(['CW']),
    })
    await user.click(screen.getByRole('button', { name: 'Employment type filter' }))

    const items = screen.getAllByRole('menuitemcheckbox')
    // CW comes first alphabetically, FTE second
    const cwItem = items.find((el) => el.textContent?.includes('CW'))
    const fteItem = items.find((el) => el.textContent?.includes('FTE'))
    expect(cwItem?.getAttribute('aria-checked')).toBe('false')
    expect(fteItem?.getAttribute('aria-checked')).toBe('true')
  })

  it('displays "No type" label for persons with empty employmentType', async () => {
    const user = userEvent.setup()
    renderWithOrg(<EmploymentTypeFilter />, {
      working: [
        makePerson({ id: '1', employmentType: '' }),
        makePerson({ id: '2', employmentType: 'FTE' }),
      ],
    })
    await user.click(screen.getByRole('button', { name: 'Employment type filter' }))
    expect(screen.getByText('No type')).toBeDefined()
  })

  it('sorts employment types alphabetically with empty string last', async () => {
    const user = userEvent.setup()
    renderWithOrg(<EmploymentTypeFilter />, {
      working: [
        makePerson({ id: '1', employmentType: 'Vendor' }),
        makePerson({ id: '2', employmentType: '' }),
        makePerson({ id: '3', employmentType: 'CW' }),
        makePerson({ id: '4', employmentType: 'FTE' }),
      ],
    })
    await user.click(screen.getByRole('button', { name: 'Employment type filter' }))
    const items = screen.getAllByRole('menuitemcheckbox')
    expect(items[0].textContent).toContain('CW')
    expect(items[1].textContent).toContain('FTE')
    expect(items[2].textContent).toContain('Vendor')
    expect(items[3].textContent).toContain('No type')
  })

  it('opens and closes dropdown on toggle clicks', async () => {
    const user = userEvent.setup()
    renderWithOrg(<EmploymentTypeFilter />, {
      working: [makePerson({ id: '1', employmentType: 'FTE' })],
    })
    const trigger = screen.getByRole('button', { name: 'Employment type filter' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    await user.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    await user.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('deduplicates employment types from multiple people', async () => {
    const user = userEvent.setup()
    renderWithOrg(<EmploymentTypeFilter />, {
      working: [
        makePerson({ id: '1', employmentType: 'FTE' }),
        makePerson({ id: '2', employmentType: 'FTE' }),
        makePerson({ id: '3', employmentType: 'CW' }),
      ],
    })
    await user.click(screen.getByRole('button', { name: 'Employment type filter' }))
    const items = screen.getAllByRole('menuitemcheckbox')
    // Only CW and FTE (deduplicated)
    expect(items).toHaveLength(2)
  })

  it('displays badge count matching number of hidden types', () => {
    renderWithOrg(<EmploymentTypeFilter />, {
      working: [
        makePerson({ id: '1', employmentType: 'FTE' }),
        makePerson({ id: '2', employmentType: 'CW' }),
        makePerson({ id: '3', employmentType: 'Vendor' }),
      ],
      hiddenEmploymentTypes: new Set(['FTE', 'CW']),
    })
    expect(screen.getByText('2')).toBeDefined()
  })
})
