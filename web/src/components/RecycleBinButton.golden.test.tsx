import { describe, it, expect, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import RecycleBinButton from './RecycleBinButton'
import { normalizeHTML, makeNode, renderWithOrg } from '../test-helpers'

describe('RecycleBinButton golden', () => {
  afterEach(() => cleanup())

  it('empty, binOpen=false', async () => {
    const { container } = renderWithOrg(<RecycleBinButton />, {
      recycled: [],
      binOpen: false,
    })
    await expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/recycle-bin-button-empty-closed.golden'
    )
  })

  it('with count, binOpen=false', async () => {
    const { container } = renderWithOrg(<RecycleBinButton />, {
      recycled: [makeNode({ id: 'r1' }), makeNode({ id: 'r2' })],
      binOpen: false,
    })
    await expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/recycle-bin-button-with-count.golden'
    )
  })

  it('binOpen=true', async () => {
    const { container } = renderWithOrg(<RecycleBinButton />, {
      recycled: [makeNode({ id: 'r1' })],
      binOpen: true,
    })
    await expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/recycle-bin-button-open.golden'
    )
  })
})
