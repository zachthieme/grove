import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { normalizeHTML, makePerson } from '../test-helpers'
import PodSidebar from './PodSidebar'
import type { Pod } from '../api/types'

vi.mock('../store/OrgContext', () => ({
  useOrg: () => mockOrg,
}))

const manager = makePerson({ id: 'm1', name: 'Manager Alice', managerId: '' })
const member1 = makePerson({ id: 'p1', name: 'Bob Jones', managerId: 'm1', team: 'Platform', pod: 'Alpha' })
const member2 = makePerson({ id: 'p2', name: 'Carol White', managerId: 'm1', team: 'Platform', pod: 'Alpha' })

const alphaPod: Pod = {
  id: 'pod-1',
  name: 'Alpha',
  team: 'Platform',
  managerId: 'm1',
  publicNote: 'Public info',
  privateNote: 'Private info',
}

const mockOrg: Record<string, unknown> = {
  pods: [alphaPod] as Pod[],
  working: [manager, member1, member2] as ReturnType<typeof makePerson>[],
  selectedPodId: 'pod-1' as string | null,
  updatePod: vi.fn().mockResolvedValue(undefined),
}

describe('PodSidebar golden', () => {
  afterEach(() => {
    cleanup()
    mockOrg.pods = [alphaPod]
    mockOrg.working = [manager, member1, member2]
    mockOrg.selectedPodId = 'pod-1'
  })

  it('no selection', () => {
    mockOrg.selectedPodId = null
    const { container } = render(<PodSidebar />)
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/pod-sidebar-no-selection.golden'
    )
  })

  it('pod selected with notes and members', () => {
    const { container } = render(<PodSidebar />)
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/pod-sidebar-selected.golden'
    )
  })
})
