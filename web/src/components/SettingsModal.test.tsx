import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettingsModal from './SettingsModal'
import { makePerson } from '../test-helpers'
import type { Person } from '../api/types'

const mockOrg: Record<string, unknown> = {}

function resetMockOrg() {
  Object.assign(mockOrg, {
    working: [
      makePerson({ id: 'a1', discipline: 'Engineering' }),
      makePerson({ id: 'b2', discipline: 'Design' }),
      makePerson({ id: 'c3', discipline: 'Product' }),
      makePerson({ id: 'd4', discipline: 'Engineering' }),
    ] as Person[],
    settings: { disciplineOrder: [] as string[] },
    updateSettings: vi.fn().mockResolvedValue(undefined),
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

describe('SettingsModal', () => {
  it('renders Cancel button that calls onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<SettingsModal onClose={onClose} />)
    await user.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders Save button that calls updateSettings and onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<SettingsModal onClose={onClose} />)
    await user.click(screen.getByText('Save'))
    expect(mockOrg.updateSettings).toHaveBeenCalledTimes(1)
    expect(mockOrg.updateSettings).toHaveBeenCalledWith({
      disciplineOrder: ['Design', 'Engineering', 'Product'],
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when overlay is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { container } = render(<SettingsModal onClose={onClose} />)
    // The overlay is the outermost div
    const overlay = container.firstChild as HTMLElement
    await user.click(overlay)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when inner modal content is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<SettingsModal onClose={onClose} />)
    // Click on the title, which is inside the modal (stopPropagation)
    await user.click(screen.getByText('Settings'))
    expect(onClose).not.toHaveBeenCalled()
  })
})
