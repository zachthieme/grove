// Scenarios: UI-017
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SearchBar from './SearchBar'
import { makeNode, renderWithOrg } from '../test-helpers'

const alice = makeNode({ id: 'p1', name: 'Alice Anderson', role: 'Engineer', team: 'Platform' })
const bob = makeNode({ id: 'p2', name: 'Bob Brown', role: 'Designer', team: 'Growth' })
const carol = makeNode({ id: 'p3', name: 'Carol Clark', role: 'Manager', team: 'Platform' })

describe('SearchBar', () => {
  afterEach(() => cleanup())

  it('[UI-017] renders an input with the correct placeholder and title', () => {
    renderWithOrg(<SearchBar />, { working: [alice] })
    const input = screen.getByRole('combobox', { name: 'Search' })
    expect(input).toBeDefined()
    expect(input.getAttribute('title')).toBe('Search (⌘K)')
  })

  it('[UI-017] shows matching results as user types', async () => {
    const user = userEvent.setup()
    renderWithOrg(<SearchBar />, { working: [alice, bob, carol] })
    await user.type(screen.getByRole('combobox'), 'alice')
    expect(screen.getByText('Alice Anderson')).toBeDefined()
    expect(screen.queryByText('Bob Brown')).toBeNull()
  })

  it('[UI-017] shows "No matches" when no people match', async () => {
    const user = userEvent.setup()
    renderWithOrg(<SearchBar />, { working: [alice, bob] })
    await user.type(screen.getByRole('combobox'), 'zzznomatch')
    expect(screen.getByText('No matches')).toBeDefined()
  })

  it('[UI-017] shows role and team as secondary meta text', async () => {
    const user = userEvent.setup()
    renderWithOrg(<SearchBar />, { working: [alice] })
    await user.type(screen.getByRole('combobox'), 'alice')
    expect(screen.getByText('Engineer · Platform')).toBeDefined()
  })

  it('[UI-017] does not open dropdown when query is empty', () => {
    renderWithOrg(<SearchBar />, { working: [alice] })
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('[UI-017] calls setSelectedId and clears query when a result is clicked', async () => {
    const user = userEvent.setup()
    const setSelectedId = vi.fn()
    renderWithOrg(<SearchBar />, { working: [alice, bob], setSelectedId })
    await user.type(screen.getByRole('combobox'), 'alice')
    await user.click(screen.getByText('Alice Anderson'))
    expect(setSelectedId).toHaveBeenCalledWith('p1')
    expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe('')
  })

  it('[UI-017] Escape clears the query and closes the dropdown', async () => {
    const user = userEvent.setup()
    renderWithOrg(<SearchBar />, { working: [alice] })
    const input = screen.getByRole('combobox')
    await user.type(input, 'alice')
    expect(screen.getByRole('listbox')).toBeDefined()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect((input as HTMLInputElement).value).toBe('')
  })

  it('[UI-017] arrow keys navigate highlighted result', async () => {
    const user = userEvent.setup()
    renderWithOrg(<SearchBar />, { working: [alice, bob, carol] })
    await user.type(screen.getByRole('combobox'), 'a') // alice and carol match
    const options = screen.getAllByRole('option')
    // First option should be highlighted (aria-selected)
    expect(options[0].getAttribute('aria-selected')).toBe('true')
    await user.keyboard('{ArrowDown}')
    const optionsAfter = screen.getAllByRole('option')
    expect(optionsAfter[1].getAttribute('aria-selected')).toBe('true')
  })

  it('[UI-017] Enter selects the highlighted result', async () => {
    const user = userEvent.setup()
    const setSelectedId = vi.fn()
    renderWithOrg(<SearchBar />, { working: [alice, bob], setSelectedId })
    await user.type(screen.getByRole('combobox'), 'alice')
    await user.keyboard('{Enter}')
    expect(setSelectedId).toHaveBeenCalledWith('p1')
  })

  it('[UI-017] limits results to 8 matches', async () => {
    const user = userEvent.setup()
    const manyPeople = Array.from({ length: 15 }, (_, i) =>
      makeNode({ id: `p${i}`, name: `Person ${i}` }),
    )
    renderWithOrg(<SearchBar />, { working: manyPeople })
    await user.type(screen.getByRole('combobox'), 'person')
    const options = screen.getAllByRole('option')
    expect(options.length).toBe(8)
  })

  it('[UI-017] case-insensitive match', async () => {
    const user = userEvent.setup()
    renderWithOrg(<SearchBar />, { working: [alice] })
    await user.type(screen.getByRole('combobox'), 'ALICE')
    expect(screen.getByText('Alice Anderson')).toBeDefined()
  })
})
