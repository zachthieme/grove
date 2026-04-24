import { describe, it, expect, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import SnapshotsDropdown from './SnapshotsDropdown'
import { normalizeHTML, makeNode, renderWithOrg } from '../test-helpers'

describe('SnapshotsDropdown golden', () => {
  afterEach(() => cleanup())

  it('Working label', async () => {
    const { container } = renderWithOrg(<SnapshotsDropdown />, {
      working: [makeNode()],
      currentSnapshotName: null,
    })
    await expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/snapshots-dropdown-working.golden'
    )
  })

  it('Original label', async () => {
    const { container } = renderWithOrg(<SnapshotsDropdown />, {
      working: [makeNode()],
      currentSnapshotName: '__original__',
    })
    await expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/snapshots-dropdown-original.golden'
    )
  })

  it('named snapshot label', async () => {
    const { container } = renderWithOrg(<SnapshotsDropdown />, {
      working: [makeNode()],
      currentSnapshotName: 'My Snapshot',
    })
    await expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/snapshots-dropdown-named.golden'
    )
  })
})
