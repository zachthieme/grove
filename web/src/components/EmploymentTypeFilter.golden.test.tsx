import { describe, it, expect, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import EmploymentTypeFilter from './EmploymentTypeFilter'
import { normalizeHTML, renderWithOrg } from '../test-helpers'

describe('EmploymentTypeFilter golden', () => {
  afterEach(() => cleanup())

  it('default no hidden types', async () => {
    const { container } = renderWithOrg(<EmploymentTypeFilter />, {
      hiddenEmploymentTypes: new Set(),
    })
    await expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/employment-type-filter-default.golden'
    )
  })

  it('with hidden types showing badge', async () => {
    const { container } = renderWithOrg(<EmploymentTypeFilter />, {
      hiddenEmploymentTypes: new Set(['CW', 'Intern']),
    })
    await expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/employment-type-filter-hidden-badge.golden'
    )
  })
})
