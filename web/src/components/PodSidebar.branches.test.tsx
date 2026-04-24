/**
 * Additional branch coverage for PodSidebar.
 * Covers: handleSave with no fields changed (early return), non-Error rejection,
 * save button disabled while saving, "Saving..." text, "Saved!" text,
 * combined field changes, pod with undefined notes (nullish fallbacks),
 * member count with no matching members.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PodSidebar from './PodSidebar'
import { makeNode, renderWithOrg } from '../test-helpers'
import type { Pod } from '../api/types'

afterEach(() => cleanup())

const manager = makeNode({ id: 'm1', name: 'Manager Alice', managerId: '' })
const member1 = makeNode({ id: 'p1', name: 'Bob Jones', managerId: 'm1', team: 'Platform', pod: 'Alpha' })
const member2 = makeNode({ id: 'p2', name: 'Carol White', managerId: 'm1', team: 'Platform', pod: 'Alpha' })

const alphaPod: Pod = {
  id: 'pod-1',
  name: 'Alpha',
  team: 'Platform',
  managerId: 'm1',
  publicNote: 'Public info',
  privateNote: 'Private info',
}

function renderPod(podOverride: Partial<Pod> = {}, contextOverrides = {}) {
  const pod = { ...alphaPod, ...podOverride }
  const updatePod = vi.fn().mockResolvedValue(undefined)
  const clearSelection = vi.fn()
  const result = renderWithOrg(<PodSidebar podId={pod.id} />, {
    pods: [pod],
    working: [manager, member1, member2],
    updatePod,
    clearSelection,
    ...contextOverrides,
  })
  return { ...result, updatePod, clearSelection }
}

describe('PodSidebar — branch coverage', () => {
  describe('handleSave early return', () => {
    it('does not call updatePod when no fields have changed', async () => {
      const { updatePod } = renderPod()
      // Save button should be disabled (nothing dirty)
      const saveBtn = screen.getByRole('button', { name: /save/i }) as HTMLButtonElement
      expect(saveBtn.disabled).toBe(true)
      // Force click anyway
      fireEvent.click(saveBtn)
      expect(updatePod).not.toHaveBeenCalled()
    })
  })

  describe('non-Error rejection', () => {
    it('shows "Save failed" when updatePod rejects with a string', async () => {
      const updatePod = vi.fn().mockRejectedValueOnce('string error')
      renderWithOrg(<PodSidebar podId="pod-1" />, {
        pods: [alphaPod],
        working: [manager, member1, member2],
        updatePod,
      })
      const nameInput = screen.getByDisplayValue('Alpha') as HTMLInputElement
      fireEvent.change(nameInput, { target: { value: 'Renamed' } })
      fireEvent.click(screen.getByRole('button', { name: /save/i }))
      await waitFor(() => {
        expect(screen.getByText('Save failed')).toBeTruthy()
      })
      expect(screen.getByText('Retry')).toBeTruthy()
    })

    it('shows Error.message when updatePod rejects with an Error', async () => {
      const updatePod = vi.fn().mockRejectedValueOnce(new Error('Custom error msg'))
      renderWithOrg(<PodSidebar podId="pod-1" />, {
        pods: [alphaPod],
        working: [manager, member1, member2],
        updatePod,
      })
      const nameInput = screen.getByDisplayValue('Alpha') as HTMLInputElement
      fireEvent.change(nameInput, { target: { value: 'Renamed' } })
      fireEvent.click(screen.getByRole('button', { name: /save/i }))
      await waitFor(() => {
        expect(screen.getByText('Custom error msg')).toBeTruthy()
      })
    })
  })

  describe('save button status text', () => {
    it('shows "Saving..." while save is in progress', async () => {
      let resolveUpdate: () => void
      const updatePod = vi.fn().mockImplementation(
        () => new Promise<void>(resolve => { resolveUpdate = resolve })
      )
      renderWithOrg(<PodSidebar podId="pod-1" />, {
        pods: [alphaPod],
        working: [manager, member1, member2],
        updatePod,
      })
      const nameInput = screen.getByDisplayValue('Alpha') as HTMLInputElement
      fireEvent.change(nameInput, { target: { value: 'Renamed' } })
      fireEvent.click(screen.getByRole('button', { name: /save/i }))
      await waitFor(() => {
        expect(screen.getByText('Saving...')).toBeTruthy()
      })
      resolveUpdate!()
    })

    it('disables save button while saving', async () => {
      let resolveUpdate: () => void
      const updatePod = vi.fn().mockImplementation(
        () => new Promise<void>(resolve => { resolveUpdate = resolve })
      )
      renderWithOrg(<PodSidebar podId="pod-1" />, {
        pods: [alphaPod],
        working: [manager, member1, member2],
        updatePod,
      })
      const nameInput = screen.getByDisplayValue('Alpha') as HTMLInputElement
      fireEvent.change(nameInput, { target: { value: 'Renamed' } })
      fireEvent.click(screen.getByRole('button', { name: /save/i }))
      await waitFor(() => {
        const btn = screen.getByText('Saving...') as HTMLButtonElement
        expect(btn.disabled).toBe(true)
      })
      resolveUpdate!()
    })

    it('shows "Saved!" after successful save', async () => {
      renderPod()
      const nameInput = screen.getByDisplayValue('Alpha') as HTMLInputElement
      fireEvent.change(nameInput, { target: { value: 'Renamed' } })
      fireEvent.click(screen.getByRole('button', { name: /save/i }))
      await waitFor(() => {
        expect(screen.getByText('Saved!')).toBeTruthy()
      })
    })

    it('applies saved CSS class after successful save', async () => {
      renderPod()
      const nameInput = screen.getByDisplayValue('Alpha') as HTMLInputElement
      fireEvent.change(nameInput, { target: { value: 'Renamed' } })
      fireEvent.click(screen.getByRole('button', { name: /save/i }))
      await waitFor(() => {
        const btn = screen.getByText('Saved!')
        expect(btn.className).toContain('saveBtnSaved')
      })
    })
  })

  describe('combined field changes', () => {
    it('sends all changed fields in a single updatePod call', async () => {
      const { updatePod } = renderPod()
      const nameInput = screen.getByDisplayValue('Alpha') as HTMLInputElement
      fireEvent.change(nameInput, { target: { value: 'Renamed' } })
      const publicTextarea = screen.getByDisplayValue('Public info') as HTMLTextAreaElement
      fireEvent.change(publicTextarea, { target: { value: 'New public' } })
      const privateTextarea = screen.getByDisplayValue('Private info') as HTMLTextAreaElement
      fireEvent.change(privateTextarea, { target: { value: 'New private' } })
      fireEvent.click(screen.getByRole('button', { name: /save/i }))
      expect(updatePod).toHaveBeenCalledWith('pod-1', {
        name: 'Renamed',
        publicNote: 'New public',
        privateNote: 'New private',
      })
    })

    it('sends only publicNote when only publicNote changes', async () => {
      const { updatePod } = renderPod()
      const publicTextarea = screen.getByDisplayValue('Public info') as HTMLTextAreaElement
      fireEvent.change(publicTextarea, { target: { value: 'Updated public' } })
      fireEvent.click(screen.getByRole('button', { name: /save/i }))
      expect(updatePod).toHaveBeenCalledWith('pod-1', { publicNote: 'Updated public' })
    })

    it('sends only privateNote when only privateNote changes', async () => {
      const { updatePod } = renderPod()
      const privateTextarea = screen.getByDisplayValue('Private info') as HTMLTextAreaElement
      fireEvent.change(privateTextarea, { target: { value: 'Updated private' } })
      fireEvent.click(screen.getByRole('button', { name: /save/i }))
      expect(updatePod).toHaveBeenCalledWith('pod-1', { privateNote: 'Updated private' })
    })
  })

  describe('pod with undefined notes (nullish fallbacks)', () => {
    it('handles pod with no publicNote or privateNote', () => {
      const bareNote: Pod = {
        id: 'pod-bare', name: 'Bare', team: 'T', managerId: 'm1',
        // publicNote and privateNote are undefined
      }
      renderWithOrg(<PodSidebar podId="pod-bare" />, {
        pods: [bareNote],
        working: [manager, member1],
        updatePod: vi.fn().mockResolvedValue(undefined),
      })
      // Textareas should show empty, with placeholders
      const publicTA = screen.getByPlaceholderText('Visible on the org chart') as HTMLTextAreaElement
      expect(publicTA.value).toBe('')
      const privateTA = screen.getByPlaceholderText('Only visible in this panel') as HTMLTextAreaElement
      expect(privateTA.value).toBe('')
    })

    it('detects dirty state correctly when notes are undefined', async () => {
      const bareNote: Pod = {
        id: 'pod-bare', name: 'Bare', team: 'T', managerId: 'm1',
      }
      const updatePod = vi.fn().mockResolvedValue(undefined)
      renderWithOrg(<PodSidebar podId="pod-bare" />, {
        pods: [bareNote],
        working: [manager],
        updatePod,
      })
      // Save should be disabled initially
      const saveBtn = screen.getByRole('button', { name: /save/i }) as HTMLButtonElement
      expect(saveBtn.disabled).toBe(true)
      // Type into publicNote
      const publicTA = screen.getByPlaceholderText('Visible on the org chart') as HTMLTextAreaElement
      fireEvent.change(publicTA, { target: { value: 'New note' } })
      expect(saveBtn.disabled).toBe(false)
      fireEvent.click(saveBtn)
      expect(updatePod).toHaveBeenCalledWith('pod-bare', { publicNote: 'New note' })
    })
  })

  describe('member count', () => {
    it('shows 0 when no working people match pod', () => {
      const orphanPod: Pod = {
        id: 'pod-orphan', name: 'Orphan', team: 'Platform', managerId: 'm1',
      }
      renderWithOrg(<PodSidebar podId="pod-orphan" />, {
        pods: [orphanPod],
        working: [manager], // no members with pod: 'Orphan'
        updatePod: vi.fn().mockResolvedValue(undefined),
      })
      expect(screen.getByText('0')).toBeTruthy()
    })

    it('shows correct count for matching members', () => {
      renderPod()
      expect(screen.getByText('2')).toBeTruthy()
    })
  })

  describe('team field is disabled', () => {
    it('shows team as disabled input', () => {
      renderPod()
      const teamInput = screen.getByDisplayValue('Platform') as HTMLInputElement
      expect(teamInput.disabled).toBe(true)
    })
  })

  describe('close button', () => {
    it('calls clearSelection on close', async () => {
      const user = userEvent.setup()
      const { clearSelection } = renderPod()
      await user.click(screen.getByLabelText('Close'))
      expect(clearSelection).toHaveBeenCalled()
    })
  })
})
