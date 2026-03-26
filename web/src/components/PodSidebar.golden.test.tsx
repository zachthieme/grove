import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { normalizeHTML, makePerson, renderWithOrg } from '../test-helpers'
import PodSidebar from './PodSidebar'
import type { Pod } from '../api/types'

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

describe('PodSidebar golden', () => {
  afterEach(() => cleanup())

  it('no selection', () => {
    const { container } = renderWithOrg(<PodSidebar />, {
      pods: [alphaPod],
      working: [manager, member1, member2],
      selectedPodId: null,
      updatePod: vi.fn().mockResolvedValue(undefined),
    })
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/pod-sidebar-no-selection.golden'
    )
  })

  it('pod selected with notes and members', () => {
    const { container } = renderWithOrg(<PodSidebar />, {
      pods: [alphaPod],
      working: [manager, member1, member2],
      selectedPodId: 'pod-1',
      updatePod: vi.fn().mockResolvedValue(undefined),
    })
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/pod-sidebar-selected.golden'
    )
  })
})
