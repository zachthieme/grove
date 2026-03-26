import { describe, it, expect, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import RecycleBinDrawer from './RecycleBinDrawer'
import { normalizeHTML, makePerson, renderWithOrg } from '../test-helpers'

describe('RecycleBinDrawer golden', () => {
  afterEach(() => cleanup())

  it('binOpen=false renders nothing', async () => {
    const { container } = renderWithOrg(<RecycleBinDrawer />, {
      binOpen: false,
      recycled: [],
    })
    await expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/recycle-bin-drawer-closed.golden'
    )
  })

  it('binOpen=true empty', async () => {
    const { container } = renderWithOrg(<RecycleBinDrawer />, {
      binOpen: true,
      recycled: [],
    })
    await expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/recycle-bin-drawer-empty.golden'
    )
  })

  it('binOpen=true with items', async () => {
    const { container } = renderWithOrg(<RecycleBinDrawer />, {
      binOpen: true,
      recycled: [
        makePerson({ id: 'r1', name: 'Bob Jones', role: 'Designer', team: 'UX' }),
        makePerson({ id: 'r2', name: 'Carol Ng', role: 'PM', team: 'Product' }),
      ],
    })
    await expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/recycle-bin-drawer-with-items.golden'
    )
  })
})
