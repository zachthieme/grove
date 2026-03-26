import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { normalizeHTML, makePerson } from '../test-helpers'
import SettingsModal from './SettingsModal'

vi.mock('../store/OrgContext', () => ({
  useOrg: () => mockOrg,
}))

const mockOrg: Record<string, unknown> = {
  working: [] as ReturnType<typeof makePerson>[],
  settings: { disciplineOrder: [] as string[] },
  updateSettings: vi.fn().mockResolvedValue(undefined),
}

describe('SettingsModal golden', () => {
  afterEach(() => {
    cleanup()
    mockOrg.working = []
    mockOrg.settings = { disciplineOrder: [] }
  })

  it('with disciplines', () => {
    mockOrg.working = [
      makePerson({ id: 'a1', discipline: 'Engineering' }),
      makePerson({ id: 'b2', discipline: 'Design' }),
      makePerson({ id: 'c3', discipline: 'Product' }),
      makePerson({ id: 'd4', discipline: 'Engineering' }),
    ]
    const { container } = render(<SettingsModal onClose={vi.fn()} />)
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/settings-modal-with-disciplines.golden'
    )
  })

  it('empty (no disciplines)', () => {
    mockOrg.working = []
    const { container } = render(<SettingsModal onClose={vi.fn()} />)
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/settings-modal-empty.golden'
    )
  })
})
