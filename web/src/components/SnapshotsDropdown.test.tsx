import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SnapshotsDropdown from './SnapshotsDropdown'
import { makePerson, renderWithOrg } from '../test-helpers'

describe('SnapshotsDropdown', () => {
  afterEach(() => cleanup())

  it('[UI-005] opens dropdown on click and sets aria-expanded="true"', async () => {
    const user = userEvent.setup()
    renderWithOrg(<SnapshotsDropdown />, {
      working: [makePerson()],
    })
    const trigger = screen.getByRole('button', { name: /Snapshot:/ })
    await user.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })

  it('[UI-005] closes dropdown on second click', async () => {
    const user = userEvent.setup()
    renderWithOrg(<SnapshotsDropdown />, {
      working: [makePerson()],
    })
    const trigger = screen.getByRole('button', { name: /Snapshot:/ })
    await user.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    await user.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('[UI-005] calls loadSnapshot when a snapshot item is clicked', async () => {
    const user = userEvent.setup()
    const loadFn = vi.fn()
    renderWithOrg(<SnapshotsDropdown />, {
      working: [makePerson()],
      loadSnapshot: loadFn,
      snapshots: [{ name: 'Sprint 1', timestamp: '2025-01-15T10:30:00Z' }],
    })
    await user.click(screen.getByRole('button', { name: /Snapshot:/ }))
    await user.click(screen.getByText('Sprint 1'))
    expect(loadFn).toHaveBeenCalledWith('Sprint 1')
  })

  it('[UI-005] calls loadSnapshot with __original__ when Original is clicked', async () => {
    const user = userEvent.setup()
    const loadFn = vi.fn()
    renderWithOrg(<SnapshotsDropdown />, {
      working: [makePerson()],
      loadSnapshot: loadFn,
    })
    await user.click(screen.getByRole('button', { name: /Snapshot:/ }))
    await user.click(screen.getByText('Original'))
    expect(loadFn).toHaveBeenCalledWith('__original__')
  })

  it('[UI-005] calls deleteSnapshot when delete button is clicked', async () => {
    const user = userEvent.setup()
    const deleteFn = vi.fn()
    renderWithOrg(<SnapshotsDropdown />, {
      working: [makePerson()],
      deleteSnapshot: deleteFn,
      snapshots: [{ name: 'Sprint 1', timestamp: '2025-01-15T10:30:00Z' }],
    })
    await user.click(screen.getByRole('button', { name: /Snapshot:/ }))
    await user.click(screen.getByRole('button', { name: 'Delete snapshot Sprint 1' }))
    expect(deleteFn).toHaveBeenCalledWith('Sprint 1')
  })

  it('[UI-005] calls saveSnapshot via prompt when Save As is clicked', async () => {
    const user = userEvent.setup()
    const saveFn = vi.fn()
    vi.spyOn(window, 'prompt').mockReturnValue('New Name')
    renderWithOrg(<SnapshotsDropdown />, {
      working: [makePerson()],
      saveSnapshot: saveFn,
    })
    await user.click(screen.getByRole('button', { name: /Snapshot:/ }))
    await user.click(screen.getByText('Save As...'))
    expect(saveFn).toHaveBeenCalledWith('New Name')
    vi.restoreAllMocks()
  })

  it('[UI-005] does not call saveSnapshot when prompt is cancelled', async () => {
    const user = userEvent.setup()
    const saveFn = vi.fn()
    vi.spyOn(window, 'prompt').mockReturnValue(null)
    renderWithOrg(<SnapshotsDropdown />, {
      working: [makePerson()],
      saveSnapshot: saveFn,
    })
    await user.click(screen.getByRole('button', { name: /Snapshot:/ }))
    await user.click(screen.getByText('Save As...'))
    expect(saveFn).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  // Scenarios: UI-005
  describe('error and edge states', () => {
    it('renders no snapshot items when snapshots list is empty', async () => {
      const user = userEvent.setup()
      renderWithOrg(<SnapshotsDropdown />, {
        working: [makePerson()],
        snapshots: [],
      })
      await user.click(screen.getByRole('button', { name: /Snapshot:/ }))
      // Should still show "Save As..." and "Original" but no named snapshots
      expect(screen.getByText('Save As...')).toBeDefined()
      expect(screen.getByText('Original')).toBeDefined()
      expect(screen.queryByRole('button', { name: /Delete snapshot/ })).toBeNull()
    })

    it('displays current snapshot name label', () => {
      renderWithOrg(<SnapshotsDropdown />, {
        working: [makePerson()],
        currentSnapshotName: 'Sprint 1',
        snapshots: [{ name: 'Sprint 1', timestamp: '2025-01-15T10:30:00Z' }],
      })
      expect(screen.getByRole('button', { name: /Snapshot: Sprint 1/ })).toBeDefined()
    })

    it('displays "Original" label when currentSnapshotName is __original__', () => {
      renderWithOrg(<SnapshotsDropdown />, {
        working: [makePerson()],
        currentSnapshotName: '__original__',
      })
      expect(screen.getByRole('button', { name: /Snapshot: Original/ })).toBeDefined()
    })
  })
})
