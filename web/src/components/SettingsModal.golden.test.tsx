import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { normalizeHTML, makePerson, renderWithOrg } from '../test-helpers'
import SettingsModal from './SettingsModal'

describe('SettingsModal golden', () => {
  afterEach(() => cleanup())

  it('with disciplines', () => {
    const { container } = renderWithOrg(<SettingsModal onClose={vi.fn()} />, {
      working: [
        makePerson({ id: 'a1', discipline: 'Engineering' }),
        makePerson({ id: 'b2', discipline: 'Design' }),
        makePerson({ id: 'c3', discipline: 'Product' }),
        makePerson({ id: 'd4', discipline: 'Engineering' }),
      ],
      settings: { disciplineOrder: [] },
      updateSettings: vi.fn().mockResolvedValue(undefined),
    })
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/settings-modal-with-disciplines.golden'
    )
  })

  it('empty (no disciplines)', () => {
    const { container } = renderWithOrg(<SettingsModal onClose={vi.fn()} />, {
      working: [],
      settings: { disciplineOrder: [] },
      updateSettings: vi.fn().mockResolvedValue(undefined),
    })
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/settings-modal-empty.golden'
    )
  })
})
