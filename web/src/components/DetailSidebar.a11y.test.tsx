// Scenarios: UI-002
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { axe } from 'vitest-axe'
import DetailSidebar from './DetailSidebar'
import { makePerson, renderWithOrg } from '../test-helpers'

afterEach(() => cleanup())

describe('DetailSidebar a11y', () => {
  it('has no axe violations with single person selected', async () => {
    const alice = makePerson({ id: 'alice-001', name: 'Alice', role: 'Engineer', managerId: '' })
    const { container } = renderWithOrg(<DetailSidebar />, {
      working: [alice],
      original: [alice],
      selectedIds: new Set(['alice-001']),
    })
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no axe violations with manager and reports', async () => {
    const mgr = makePerson({ id: 'mgr-001', name: 'Manager', role: 'Manager', managerId: '' })
    const ic = makePerson({ id: 'ic-001', name: 'IC Alice', role: 'Engineer', managerId: 'mgr-001' })
    const { container } = renderWithOrg(<DetailSidebar />, {
      working: [mgr, ic],
      original: [mgr, ic],
      selectedIds: new Set(['ic-001']),
    })
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
