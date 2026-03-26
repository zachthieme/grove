import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RecycleBinButton from './RecycleBinButton'
import { renderWithOrg } from '../test-helpers'

describe('RecycleBinButton', () => {
  afterEach(() => cleanup())

  it('calls setBinOpen with toggled value on click', async () => {
    const user = userEvent.setup()
    const setBinOpenFn = vi.fn()
    renderWithOrg(<RecycleBinButton />, {
      setBinOpen: setBinOpenFn,
      binOpen: false,
    })
    await user.click(screen.getByRole('button', { name: /recycle bin/i }))
    expect(setBinOpenFn).toHaveBeenCalledWith(true)
  })

  it('calls setBinOpen(false) when binOpen is true and button is clicked', async () => {
    const user = userEvent.setup()
    const setBinOpenFn = vi.fn()
    renderWithOrg(<RecycleBinButton />, {
      setBinOpen: setBinOpenFn,
      binOpen: true,
    })
    await user.click(screen.getByRole('button', { name: /recycle bin/i }))
    expect(setBinOpenFn).toHaveBeenCalledWith(false)
  })
})
