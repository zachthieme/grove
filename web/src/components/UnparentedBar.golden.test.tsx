import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { normalizeHTML, makePerson } from '../test-helpers'
import UnparentedBar from './UnparentedBar'

vi.mock('../store/OrgContext', () => ({
  useOrg: () => mockOrg,
}))

const mockOrg: Record<string, unknown> = {
  working: [] as ReturnType<typeof makePerson>[],
  toggleSelect: vi.fn(),
}

describe('UnparentedBar golden', () => {
  afterEach(() => {
    cleanup()
    mockOrg.working = []
  })

  it('no orphans', () => {
    const manager = makePerson({ id: 'm1', name: 'Manager', managerId: '' })
    const report = makePerson({ id: 'r1', name: 'Report', managerId: 'm1' })
    mockOrg.working = [manager, report]
    const { container } = render(<UnparentedBar />)
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/unparented-bar-no-orphans.golden'
    )
  })

  it('singular orphan count', () => {
    mockOrg.working = [makePerson({ id: 'o1', name: 'Orphan Alice', managerId: '' })]
    const { container } = render(<UnparentedBar />)
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/unparented-bar-singular.golden'
    )
  })

  it('plural orphan count', () => {
    mockOrg.working = [
      makePerson({ id: 'o1', name: 'Orphan Alice', managerId: '' }),
      makePerson({ id: 'o2', name: 'Orphan Bob', managerId: '' }),
    ]
    const { container } = render(<UnparentedBar />)
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/unparented-bar-plural.golden'
    )
  })

  it('tree roots not counted as orphans', () => {
    const treeRoot = makePerson({ id: 'tr1', name: 'Tree Root', managerId: '' })
    const report = makePerson({ id: 'r1', name: 'Report', managerId: 'tr1' })
    mockOrg.working = [treeRoot, report]
    const { container } = render(<UnparentedBar />)
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/unparented-bar-tree-roots.golden'
    )
  })
})
