import { describe, it, expect, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import AutosaveBanner from './AutosaveBanner'
import { normalizeHTML, makePerson, renderWithOrg } from '../test-helpers'

describe('AutosaveBanner golden', () => {
  afterEach(() => cleanup())

  it('null/hidden when autosaveAvailable is null', async () => {
    const { container } = renderWithOrg(<AutosaveBanner />, { autosaveAvailable: null })
    await expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/autosave-banner-null.golden'
    )
  })

  it('with valid timestamp', async () => {
    const { container } = renderWithOrg(<AutosaveBanner />, {
      autosaveAvailable: {
        original: [makePerson()], working: [makePerson()], recycled: [],
        snapshotName: '', timestamp: '2025-01-15T10:30:00Z',
      },
    })
    await expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/autosave-banner-valid-timestamp.golden'
    )
  })

  it('with invalid timestamp', async () => {
    const { container } = renderWithOrg(<AutosaveBanner />, {
      autosaveAvailable: {
        original: [makePerson()], working: [makePerson()], recycled: [],
        snapshotName: '', timestamp: 'not-a-date',
      },
    })
    await expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/autosave-banner-invalid-timestamp.golden'
    )
  })
})
