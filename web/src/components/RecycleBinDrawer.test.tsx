import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RecycleBinDrawer from './RecycleBinDrawer'
import { makePerson, renderWithOrg } from '../test-helpers'

describe('RecycleBinDrawer', () => {
  afterEach(() => cleanup())

  it('[UI-004] calls restore with person id when Restore button is clicked', async () => {
    const user = userEvent.setup()
    const restoreFn = vi.fn()
    renderWithOrg(<RecycleBinDrawer />, {
      restore: restoreFn,
      binOpen: true,
      recycled: [makePerson({ id: 'r1', name: 'Bob Jones' })],
    })
    await user.click(screen.getByRole('button', { name: 'Restore' }))
    expect(restoreFn).toHaveBeenCalledWith('r1')
  })

  it('[UI-004] calls setBinOpen(false) when close button is clicked', async () => {
    const user = userEvent.setup()
    const setBinOpenFn = vi.fn()
    renderWithOrg(<RecycleBinDrawer />, {
      setBinOpen: setBinOpenFn,
      binOpen: true,
    })
    await user.click(screen.getByRole('button', { name: 'Close recycle bin' }))
    expect(setBinOpenFn).toHaveBeenCalledWith(false)
  })

  it('[UI-004] calls emptyBin when Empty Bin button is clicked', async () => {
    const user = userEvent.setup()
    const emptyBinFn = vi.fn()
    renderWithOrg(<RecycleBinDrawer />, {
      emptyBin: emptyBinFn,
      binOpen: true,
      recycled: [makePerson({ id: 'r1' })],
    })
    await user.click(screen.getByRole('button', { name: /empty bin/i }))
    expect(emptyBinFn).toHaveBeenCalledTimes(1)
  })

  // Scenarios: UI-004
  describe('error and edge states', () => {
    it('renders empty bin message when recycled is empty', () => {
      renderWithOrg(<RecycleBinDrawer />, {
        binOpen: true,
        recycled: [],
      })
      expect(screen.getByText('Bin is empty')).toBeDefined()
      expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull()
      expect(screen.queryByRole('button', { name: /empty bin/i })).toBeNull()
    })

    it('does not render when binOpen is false', () => {
      const { container } = renderWithOrg(<RecycleBinDrawer />, {
        binOpen: false,
        recycled: [makePerson({ id: 'r1', name: 'Bob Jones' })],
      })
      expect(container.innerHTML).toBe('')
    })

    it('hides Empty Bin button when recycled list is empty', () => {
      renderWithOrg(<RecycleBinDrawer />, {
        binOpen: true,
        recycled: [],
      })
      expect(screen.queryByRole('button', { name: /empty bin/i })).toBeNull()
    })
  })
})
