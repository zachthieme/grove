import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { normalizeHTML, makePerson, renderWithOrg } from '../test-helpers'
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
      working: [makePerson({ id: 'p1', name: 'Solo', managerId: '' })],
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
        makePerson({ id: 'p1', name: 'CEO', managerId: '' }),
        makePerson({ id: 'p2', name: 'VP', managerId: 'p1' }),
        makePerson({ id: 'p3', name: 'Director', managerId: 'p2' }),
      ],
      setHead: vi.fn(),
    })
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/breadcrumbs-deep-chain.golden'
    )
  })
})
