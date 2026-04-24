import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettingsModal from './SettingsModal'
import { makeNode, renderWithOrg } from '../test-helpers'

afterEach(() => cleanup())

describe('SettingsModal', () => {
  function renderSettings(onClose: () => void, overrides = {}) {
    const updateSettings = vi.fn().mockResolvedValue(undefined)
    const ctx = {
      working: [
        makeNode({ id: 'a1', discipline: 'Engineering' }),
        makeNode({ id: 'b2', discipline: 'Design' }),
        makeNode({ id: 'c3', discipline: 'Product' }),
        makeNode({ id: 'd4', discipline: 'Engineering' }),
      ],
      settings: { disciplineOrder: [] as string[] },
      updateSettings,
      ...overrides,
    }
    const result = renderWithOrg(<SettingsModal onClose={onClose} />, ctx)
    return { ...result, updateSettings }
  }

  it('[SETTINGS-001] renders Cancel button that calls onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderSettings(onClose)
    await user.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('[SETTINGS-001] renders Save button that calls updateSettings and onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { updateSettings } = renderSettings(onClose)
    await user.click(screen.getByText('Save'))
    expect(updateSettings).toHaveBeenCalledTimes(1)
    expect(updateSettings).toHaveBeenCalledWith({
      disciplineOrder: ['Design', 'Engineering', 'Product'],
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('[SETTINGS-001] calls onClose when overlay is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { container } = renderSettings(onClose)
    const overlay = container.firstChild as HTMLElement
    await user.click(overlay)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('[SETTINGS-001] does not call onClose when inner modal content is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderSettings(onClose)
    await user.click(screen.getByText('Settings'))
    expect(onClose).not.toHaveBeenCalled()
  })

  // Scenarios: SETTINGS-001
  describe('error and edge states', () => {
    it('renders "No disciplines found" hint when working has no disciplines', () => {
      const onClose = vi.fn()
      renderWithOrg(<SettingsModal onClose={onClose} />, {
        working: [],
        settings: { disciplineOrder: [] },
      })
      expect(screen.getByText('No disciplines found in current data.')).toBeDefined()
    })

    it('does not call onClose when updateSettings has not yet resolved', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      // updateSettings returns a pending promise that never resolves
      const updateSettings = vi.fn().mockReturnValue(new Promise(() => {}))
      renderSettings(onClose, { updateSettings })
      await user.click(screen.getByText('Save'))
      expect(updateSettings).toHaveBeenCalledTimes(1)
      // onClose should not be called because updateSettings hasn't resolved
      expect(onClose).not.toHaveBeenCalled()
    })
  })
})
