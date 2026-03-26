import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import TableView from './TableView'
import { normalizeHTML, makePerson, renderWithOrg } from '../test-helpers'
import type { PersonChange } from '../hooks/useOrgDiff'

const basePeople = [
  makePerson({ id: 'p-001', name: 'Alice Smith', role: 'VP', discipline: 'Eng', managerId: '', team: 'Engineering', employmentType: 'FTE' }),
  makePerson({ id: 'p-002', name: 'Bob Jones', role: 'Engineer', discipline: 'Eng', managerId: 'p-001', team: 'Platform', employmentType: 'FTE' }),
]

describe('TableView golden', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders table with people', () => {
    const { container } = renderWithOrg(<TableView people={basePeople} />, {
      working: basePeople,
      viewMode: 'table',
      dataView: 'working',
    })

    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/table-view-people.golden')
  })

  it('renders read-only table', () => {
    const { container } = renderWithOrg(<TableView people={basePeople} readOnly={true} />, {
      working: basePeople,
      viewMode: 'table',
      dataView: 'working',
    })

    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/table-view-readonly.golden')
  })

  it('renders diff classes', () => {
    const changes = new Map<string, PersonChange>([
      ['p-001', { types: new Set(['added']) }],
      ['p-002', { types: new Set(['reporting']) }],
    ])

    const { container } = renderWithOrg(<TableView people={basePeople} changes={changes} />, {
      working: basePeople,
      viewMode: 'table',
      dataView: 'working',
    })

    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/table-view-diff.golden')
  })

  it('renders empty table', () => {
    const { container } = renderWithOrg(<TableView people={[]} />, {
      working: [],
      viewMode: 'table',
      dataView: 'working',
    })

    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/table-view-empty.golden')
  })

  it('renders single person table', () => {
    const singlePerson = [
      makePerson({ id: 'p-001', name: 'Alice Smith', role: 'VP', discipline: 'Eng', managerId: '', team: 'Engineering', employmentType: 'FTE' }),
    ]
    const { container } = renderWithOrg(<TableView people={singlePerson} />, {
      working: singlePerson,
      viewMode: 'table',
      dataView: 'working',
    })

    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/table-view-single.golden')
  })
})
