import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, cleanup } from '@testing-library/react'
import PodSidebar from './PodSidebar'
import { makePerson, renderWithOrg } from '../test-helpers'
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

describe('PodSidebar', () => {
  afterEach(() => cleanup())

  it('[UI-003] close button calls selectPod(null)', () => {
    const selectPod = vi.fn()
    renderWithOrg(<PodSidebar />, {
      pods: [alphaPod],
      working: [manager, member1, member2],
      selectedPodId: 'pod-1',
      selectPod,
    })
    fireEvent.click(screen.getByLabelText('Close'))
    expect(selectPod).toHaveBeenCalledWith(null)
  })

  it('[UI-003] save button is disabled when nothing changed', () => {
    renderWithOrg(<PodSidebar />, {
      pods: [alphaPod],
      working: [manager, member1, member2],
      selectedPodId: 'pod-1',
    })
    const saveBtn = screen.getByRole('button', { name: /save/i })
    expect((saveBtn as HTMLButtonElement).disabled).toBe(true)
  })

  it('[UI-003] save button is enabled when name changes', () => {
    renderWithOrg(<PodSidebar />, {
      pods: [alphaPod],
      working: [manager, member1, member2],
      selectedPodId: 'pod-1',
    })
    const nameInput = screen.getByDisplayValue('Alpha') as HTMLInputElement
    fireEvent.change(nameInput, { target: { value: 'Alpha Renamed' } })
    const saveBtn = screen.getByRole('button', { name: /save/i })
    expect((saveBtn as HTMLButtonElement).disabled).toBe(false)
  })

  it('[UI-003] calls updatePod when save button clicked after name change', async () => {
    const updatePodFn = vi.fn().mockResolvedValue(undefined)
    renderWithOrg(<PodSidebar />, {
      pods: [alphaPod],
      working: [manager, member1, member2],
      selectedPodId: 'pod-1',
      updatePod: updatePodFn,
    })
    const nameInput = screen.getByDisplayValue('Alpha') as HTMLInputElement
    fireEvent.change(nameInput, { target: { value: 'Alpha Renamed' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(updatePodFn).toHaveBeenCalledTimes(1)
    expect(updatePodFn).toHaveBeenCalledWith('pod-1', { name: 'Alpha Renamed' })
  })

  it('[UI-003] calls updatePod when save clicked after public note change', async () => {
    const updatePodFn = vi.fn().mockResolvedValue(undefined)
    renderWithOrg(<PodSidebar />, {
      pods: [alphaPod],
      working: [manager, member1, member2],
      selectedPodId: 'pod-1',
      updatePod: updatePodFn,
    })
    const textarea = screen.getByDisplayValue('Public info') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Updated public' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(updatePodFn).toHaveBeenCalledTimes(1)
    expect(updatePodFn).toHaveBeenCalledWith('pod-1', { publicNote: 'Updated public' })
  })

  it('[UI-003] calls updatePod when save clicked after private note change', async () => {
    const updatePodFn = vi.fn().mockResolvedValue(undefined)
    renderWithOrg(<PodSidebar />, {
      pods: [alphaPod],
      working: [manager, member1, member2],
      selectedPodId: 'pod-1',
      updatePod: updatePodFn,
    })
    const textarea = screen.getByDisplayValue('Private info') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Updated private' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(updatePodFn).toHaveBeenCalledTimes(1)
    expect(updatePodFn).toHaveBeenCalledWith('pod-1', { privateNote: 'Updated private' })
  })

  // Scenarios: UI-003
  describe('error and edge states', () => {
    it('shows "Retry" and error message when updatePod rejects', async () => {
      const updatePodFn = vi.fn().mockRejectedValueOnce(new Error('Network error'))
      renderWithOrg(<PodSidebar />, {
        pods: [alphaPod],
        working: [manager, member1, member2],
        selectedPodId: 'pod-1',
        updatePod: updatePodFn,
      })
      const nameInput = screen.getByDisplayValue('Alpha') as HTMLInputElement
      fireEvent.change(nameInput, { target: { value: 'Alpha Renamed' } })
      await fireEvent.click(screen.getByRole('button', { name: /save/i }))
      // Wait for the async rejection to be handled
      await vi.waitFor(() => {
        expect(screen.getByText('Retry')).toBeDefined()
      })
      expect(screen.getByText('Network error')).toBeDefined()
      expect(updatePodFn).toHaveBeenCalledTimes(1)
    })

    it('renders nothing when selectedPodId does not match any pod', () => {
      const { container } = renderWithOrg(<PodSidebar />, {
        pods: [alphaPod],
        working: [manager, member1, member2],
        selectedPodId: 'nonexistent',
      })
      expect(container.innerHTML).toBe('')
    })
  })
})
