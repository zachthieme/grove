import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { normalizeHTML, makeNode, renderWithOrg } from '../test-helpers'
import SettingsModal from './SettingsModal'

describe('SettingsModal golden', () => {
  afterEach(() => cleanup())

  it('with disciplines', () => {
    const { container } = renderWithOrg(<SettingsModal onClose={vi.fn()} />, {
      working: [
        makeNode({ id: 'a1', discipline: 'Engineering' }),
        makeNode({ id: 'b2', discipline: 'Design' }),
        makeNode({ id: 'c3', discipline: 'Product' }),
        makeNode({ id: 'd4', discipline: 'Engineering' }),
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
