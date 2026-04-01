import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AutosaveBanner from './AutosaveBanner'
import { makePerson, renderWithOrg } from '../test-helpers'

describe('AutosaveBanner', () => {
  afterEach(() => cleanup())

  it('[AUTO-003] renders Restore button that calls restoreAutosave on click', async () => {
    const user = userEvent.setup()
    const restoreFn = vi.fn()
    renderWithOrg(<AutosaveBanner />, {
      restoreAutosave: restoreFn,
      autosaveAvailable: {
        original: [makePerson()], working: [makePerson()], recycled: [],
        snapshotName: '', timestamp: '2025-01-15T10:30:00Z',
      },
    })
    const restoreBtn = screen.getByRole('button', { name: 'Restore autosaved data' })
    await user.click(restoreBtn)
    expect(restoreFn).toHaveBeenCalledTimes(1)
  })

  it('[AUTO-003] renders Dismiss button that calls dismissAutosave on click', async () => {
    const user = userEvent.setup()
    const dismissFn = vi.fn()
    renderWithOrg(<AutosaveBanner />, {
      dismissAutosave: dismissFn,
      autosaveAvailable: {
        original: [makePerson()], working: [makePerson()], recycled: [],
        snapshotName: '', timestamp: '2025-01-15T10:30:00Z',
      },
    })
    const dismissBtn = screen.getByRole('button', { name: 'Dismiss autosave recovery' })
    await user.click(dismissBtn)
    expect(dismissFn).toHaveBeenCalledTimes(1)
  })

  // Scenarios: AUTO-003
  describe('error and edge states', () => {
    it('does not render when autosaveAvailable is null', () => {
      const { container } = renderWithOrg(<AutosaveBanner />, {
        autosaveAvailable: null,
      })
      expect(container.innerHTML).toBe('')
    })
  })
})
