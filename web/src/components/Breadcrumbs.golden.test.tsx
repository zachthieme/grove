import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { normalizeHTML, makePerson } from '../test-helpers'
import Breadcrumbs from './Breadcrumbs'

vi.mock('../store/OrgContext', () => ({
  useOrg: () => mockOrg,
}))

const mockOrg: Record<string, unknown> = {
  headPersonId: null as string | null,
  working: [] as ReturnType<typeof makePerson>[],
  setHead: vi.fn(),
}

describe('Breadcrumbs golden', () => {
  afterEach(() => {
    cleanup()
    mockOrg.headPersonId = null
    mockOrg.working = []
  })

  it('null (headPersonId=null)', () => {
    mockOrg.headPersonId = null
    const { container } = render(<Breadcrumbs />)
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/breadcrumbs-null.golden'
    )
  })

  it('single person', () => {
    mockOrg.headPersonId = 'p1'
    mockOrg.working = [makePerson({ id: 'p1', name: 'Solo', managerId: '' })]
    const { container } = render(<Breadcrumbs />)
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/breadcrumbs-single.golden'
    )
  })

  it('deep ancestor chain with separators', () => {
    mockOrg.headPersonId = 'p3'
    mockOrg.working = [
      makePerson({ id: 'p1', name: 'CEO', managerId: '' }),
      makePerson({ id: 'p2', name: 'VP', managerId: 'p1' }),
      makePerson({ id: 'p3', name: 'Director', managerId: 'p2' }),
    ]
    const { container } = render(<Breadcrumbs />)
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/breadcrumbs-deep-chain.golden'
    )
  })
})
