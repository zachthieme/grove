import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import TableView from './TableView'
import { normalizeHTML, makeNode, renderWithViewData } from '../test-helpers'


const basePeople = [
  makeNode({ id: 'p-001', name: 'Alice Smith', role: 'VP', discipline: 'Eng', managerId: '', team: 'Engineering', employmentType: 'FTE' }),
  makeNode({ id: 'p-002', name: 'Bob Jones', role: 'Engineer', discipline: 'Eng', managerId: 'p-001', team: 'Platform', employmentType: 'FTE' }),
]

describe('TableView golden', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders table with people', () => {
    const { container } = renderWithViewData(<TableView />, {
      working: basePeople,
      original: basePeople,
      viewMode: 'table',
      dataView: 'working',
    })

    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/table-view-people.golden')
  })

  it('renders read-only table', () => {
    const { container } = renderWithViewData(<TableView />, {
      working: basePeople,
      original: basePeople,
      viewMode: 'table',
      dataView: 'original',
    })

    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/table-view-readonly.golden')
  })

  it('renders diff classes', () => {
    // To get diff changes, original and working must differ
    const modifiedPeople = [
      makeNode({ id: 'p-001', name: 'Alice Smith', role: 'VP', discipline: 'Eng', managerId: '', team: 'Engineering', employmentType: 'FTE' }),
      makeNode({ id: 'p-002', name: 'Bob Jones', role: 'Engineer', discipline: 'Eng', managerId: 'p-001', team: 'Platform', employmentType: 'FTE' }),
      makeNode({ id: 'p-003', name: 'New Person', role: 'Intern', discipline: 'Eng', managerId: 'p-001', team: 'Platform' }),
    ]

    const { container } = renderWithViewData(<TableView />, {
      working: modifiedPeople,
      original: basePeople,
      viewMode: 'table',
      dataView: 'diff',
    })

    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/table-view-diff.golden')
  })

  it('renders empty table', () => {
    const { container } = renderWithViewData(<TableView />, {
      working: [],
      original: [],
      viewMode: 'table',
      dataView: 'working',
    })

    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/table-view-empty.golden')
  })

  it('renders single person table', () => {
    const singlePerson = [
      makeNode({ id: 'p-001', name: 'Alice Smith', role: 'VP', discipline: 'Eng', managerId: '', team: 'Engineering', employmentType: 'FTE' }),
    ]
    const { container } = renderWithViewData(<TableView />, {
      working: singlePerson,
      original: singlePerson,
      viewMode: 'table',
      dataView: 'working',
    })

    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/table-view-single.golden')
  })
})
