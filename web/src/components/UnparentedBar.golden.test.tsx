import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { normalizeHTML, makePerson, renderWithOrg } from '../test-helpers'
import UnparentedBar from './UnparentedBar'

describe('UnparentedBar golden', () => {
  afterEach(() => cleanup())

  it('no orphans', () => {
    const manager = makePerson({ id: 'm1', name: 'Manager', managerId: '' })
    const report = makePerson({ id: 'r1', name: 'Report', managerId: 'm1' })
    const { container } = renderWithOrg(<UnparentedBar />, {
      working: [manager, report],
      toggleSelect: vi.fn(),
    })
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/unparented-bar-no-orphans.golden'
    )
  })

  it('singular orphan count', () => {
    const { container } = renderWithOrg(<UnparentedBar />, {
      working: [makePerson({ id: 'o1', name: 'Orphan Alice', managerId: '' })],
      toggleSelect: vi.fn(),
    })
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/unparented-bar-singular.golden'
    )
  })

  it('plural orphan count', () => {
    const { container } = renderWithOrg(<UnparentedBar />, {
      working: [
        makePerson({ id: 'o1', name: 'Orphan Alice', managerId: '' }),
        makePerson({ id: 'o2', name: 'Orphan Bob', managerId: '' }),
      ],
      toggleSelect: vi.fn(),
    })
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/unparented-bar-plural.golden'
    )
  })

  it('tree roots not counted as orphans', () => {
    const treeRoot = makePerson({ id: 'tr1', name: 'Tree Root', managerId: '' })
    const report = makePerson({ id: 'r1', name: 'Report', managerId: 'tr1' })
    const { container } = renderWithOrg(<UnparentedBar />, {
      working: [treeRoot, report],
      toggleSelect: vi.fn(),
    })
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/unparented-bar-tree-roots.golden'
    )
  })
})
