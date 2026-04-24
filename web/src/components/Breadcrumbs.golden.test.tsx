import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { normalizeHTML, makeNode, renderWithOrg } from '../test-helpers'
import Breadcrumbs from './Breadcrumbs'

describe('Breadcrumbs golden', () => {
  afterEach(() => cleanup())

  it('null (headPersonId=null)', () => {
    const { container } = renderWithOrg(<Breadcrumbs />, {
      headPersonId: null,
      working: [],
      setHead: vi.fn(),
    })
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/breadcrumbs-null.golden'
    )
  })

  it('single person', () => {
    const { container } = renderWithOrg(<Breadcrumbs />, {
      headPersonId: 'p1',
      working: [makeNode({ id: 'p1', name: 'Solo', managerId: '' })],
      setHead: vi.fn(),
    })
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/breadcrumbs-single.golden'
    )
  })

  it('deep ancestor chain with separators', () => {
    const { container } = renderWithOrg(<Breadcrumbs />, {
      headPersonId: 'p3',
      working: [
        makeNode({ id: 'p1', name: 'CEO', managerId: '' }),
        makeNode({ id: 'p2', name: 'VP', managerId: 'p1' }),
        makeNode({ id: 'p3', name: 'Director', managerId: 'p2' }),
      ],
      setHead: vi.fn(),
    })
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/breadcrumbs-deep-chain.golden'
    )
  })
})
