import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettingsModal from './SettingsModal'
import { makePerson, renderWithOrg } from '../test-helpers'

afterEach(() => cleanup())

describe('SettingsModal', () => {
  function renderSettings(onClose: () => void, overrides = {}) {
    const updateSettings = vi.fn().mockResolvedValue(undefined)
    const ctx = {
      working: [
        makePerson({ id: 'a1', discipline: 'Engineering' }),
        makePerson({ id: 'b2', discipline: 'Design' }),
        makePerson({ id: 'c3', discipline: 'Product' }),
        makePerson({ id: 'd4', discipline: 'Engineering' }),
      ],
      settings: { disciplineOrder: [] as string[] },
      updateSettings,
      ...overrides,
    }
    const result = renderWithOrg(<SettingsModal onClose={onClose} />, ctx)
    return { ...result, updateSettings }
  }

  it('renders Cancel button that calls onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderSettings(onClose)
    await user.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders Save button that calls updateSettings and onClose', async () => {
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

  it('calls onClose when overlay is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { container } = renderSettings(onClose)
    const overlay = container.firstChild as HTMLElement
    await user.click(overlay)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when inner modal content is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderSettings(onClose)
    await user.click(screen.getByText('Settings'))
    expect(onClose).not.toHaveBeenCalled()
  })
})
