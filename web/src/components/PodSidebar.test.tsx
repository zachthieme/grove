import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PodSidebar from './PodSidebar'
import { makePerson } from '../test-helpers'
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

const mockOrg: Record<string, unknown> = {}

function resetMockOrg() {
  Object.assign(mockOrg, {
    pods: [alphaPod] as Pod[],
    working: [manager, member1, member2] as ReturnType<typeof makePerson>[],
    selectedPodId: 'pod-1' as string | null,
    updatePod: vi.fn().mockResolvedValue(undefined),
  })
}

vi.mock('../store/OrgContext', () => ({
  useOrg: () => mockOrg,
}))

beforeEach(() => {
  vi.clearAllMocks()
  resetMockOrg()
})

afterEach(() => cleanup())

describe('PodSidebar', () => {
  it('calls updatePod on blur when name has changed', async () => {
    const user = userEvent.setup()
    render(<PodSidebar />)
    const nameInput = screen.getByDisplayValue('Alpha') as HTMLInputElement
    await user.clear(nameInput)
    await user.type(nameInput, 'Alpha Renamed')
    // Tab away to trigger blur
    await user.tab()
    expect(mockOrg.updatePod).toHaveBeenCalledTimes(1)
    expect(mockOrg.updatePod).toHaveBeenCalledWith('pod-1', { name: 'Alpha Renamed' })
  })

  it('does not call updatePod on blur when nothing changed', () => {
    render(<PodSidebar />)
    const nameInput = screen.getByDisplayValue('Alpha') as HTMLInputElement
    fireEvent.blur(nameInput)
    expect(mockOrg.updatePod).not.toHaveBeenCalled()
  })

  it('calls updatePod on blur when public note changed', async () => {
    const user = userEvent.setup()
    render(<PodSidebar />)
    const textarea = screen.getByDisplayValue('Public info') as HTMLTextAreaElement
    await user.clear(textarea)
    await user.type(textarea, 'Updated public')
    await user.tab()
    expect(mockOrg.updatePod).toHaveBeenCalledTimes(1)
    expect(mockOrg.updatePod).toHaveBeenCalledWith('pod-1', { publicNote: 'Updated public' })
  })

  it('calls updatePod on blur when private note changed', async () => {
    const user = userEvent.setup()
    render(<PodSidebar />)
    const textarea = screen.getByDisplayValue('Private info') as HTMLTextAreaElement
    await user.clear(textarea)
    await user.type(textarea, 'Updated private')
    await user.tab()
    expect(mockOrg.updatePod).toHaveBeenCalledTimes(1)
    expect(mockOrg.updatePod).toHaveBeenCalledWith('pod-1', { privateNote: 'Updated private' })
  })
})
