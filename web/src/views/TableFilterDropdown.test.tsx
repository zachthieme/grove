import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TableFilterDropdown from './TableFilterDropdown'

afterEach(() => cleanup())

function renderDropdown(overrides: Partial<{
  columnKey: string
  values: string[]
  selected: Set<string>
  onSelectionChange: (key: string, selected: Set<string>) => void
  onClose: () => void
}> = {}) {
  const anchorEl = document.createElement('button')
  Object.defineProperty(anchorEl, 'getBoundingClientRect', {
    value: () => ({ top: 0, left: 0, bottom: 30, right: 100, width: 100, height: 30, x: 0, y: 0 }),
  })
  document.body.appendChild(anchorEl)

  const defaults = {
    columnKey: 'name',
    values: ['Alice', 'Bob', 'Carol'],
    selected: new Set(['Alice', 'Bob', 'Carol']),
    onSelectionChange: vi.fn(),
    onClose: vi.fn(),
  }

  const props = { ...defaults, ...overrides }

  return render(
    <TableFilterDropdown
      columnKey={props.columnKey}
      values={props.values}
      selected={props.selected}
      onSelectionChange={props.onSelectionChange}
      onClose={props.onClose}
      anchorRef={{ current: anchorEl }}
    />
  )
}

describe('TableFilterDropdown', () => {
  it('renders all unique values as checkboxes', () => {
    renderDropdown()
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
    expect(screen.getByText('Carol')).toBeTruthy()
  })

  it('shows (Select All) checkbox', () => {
    renderDropdown()
    expect(screen.getByText('(Select All)')).toBeTruthy()
  })

  it('renders search input', () => {
    renderDropdown()
    const searchInput = screen.getByPlaceholderText('Search...')
    expect(searchInput).toBeTruthy()
  })

  it('filters values by search text', async () => {
    const user = userEvent.setup()
    renderDropdown()
    const searchInput = screen.getByPlaceholderText('Search...')
    await user.type(searchInput, 'Ali')
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.queryByText('Bob')).toBeNull()
    expect(screen.queryByText('Carol')).toBeNull()
  })

  it('toggling a single value calls onSelectionChange', async () => {
    const user = userEvent.setup()
    const onSelectionChange = vi.fn()
    const selected = new Set(['Alice', 'Bob', 'Carol'])
    renderDropdown({ onSelectionChange, selected })

    // Find the checkbox for 'Alice' and uncheck it
    const checkboxes = screen.getAllByRole('checkbox')
    // First checkbox is Select All, rest are individual values
    const aliceCheckbox = checkboxes[1]
    await user.click(aliceCheckbox)

    expect(onSelectionChange).toHaveBeenCalledWith('name', expect.any(Set))
    const newSelection = onSelectionChange.mock.calls[0][1] as Set<string>
    expect(newSelection.has('Alice')).toBe(false)
    expect(newSelection.has('Bob')).toBe(true)
  })

  it('toggling Select All deselects all when all selected', async () => {
    const user = userEvent.setup()
    const onSelectionChange = vi.fn()
    const selected = new Set(['Alice', 'Bob', 'Carol'])
    renderDropdown({ onSelectionChange, selected })

    const selectAllCheckbox = screen.getAllByRole('checkbox')[0]
    await user.click(selectAllCheckbox)

    expect(onSelectionChange).toHaveBeenCalledWith('name', expect.any(Set))
    const newSelection = onSelectionChange.mock.calls[0][1] as Set<string>
    expect(newSelection.size).toBe(0)
  })

  it('toggling Select All selects all when none selected', async () => {
    const user = userEvent.setup()
    const onSelectionChange = vi.fn()
    const selected = new Set<string>()
    renderDropdown({ onSelectionChange, selected })

    const selectAllCheckbox = screen.getAllByRole('checkbox')[0]
    await user.click(selectAllCheckbox)

    expect(onSelectionChange).toHaveBeenCalledWith('name', expect.any(Set))
    const newSelection = onSelectionChange.mock.calls[0][1] as Set<string>
    expect(newSelection.has('Alice')).toBe(true)
    expect(newSelection.has('Bob')).toBe(true)
    expect(newSelection.has('Carol')).toBe(true)
  })

  it('calls onClose when clicking outside', () => {
    const onClose = vi.fn()
    renderDropdown({ onClose })

    fireEvent.mouseDown(document.body)
    expect(onClose).toHaveBeenCalled()
  })

  it('deduplicates values', () => {
    renderDropdown({ values: ['Alice', 'Alice', 'Bob'] })
    // Should only show Alice once
    const labels = screen.getAllByText('Alice')
    expect(labels.length).toBe(1)
  })

  it('shows (empty) for empty string values', () => {
    renderDropdown({ values: ['', 'Bob'], selected: new Set(['', 'Bob']) })
    expect(screen.getByText('(empty)')).toBeTruthy()
  })

  it('returns null when anchor has no position', () => {
    // Do NOT define getBoundingClientRect - the ref just has the element
    // But the component will call updatePos on mount; we need the element in the body
    // Actually, the component calls getBoundingClientRect which exists on all elements
    // The component renders null when pos is null - test the null ref path
    const { container } = render(
      <TableFilterDropdown
        columnKey="name"
        values={['a']}
        selected={new Set(['a'])}
        onSelectionChange={vi.fn()}
        onClose={vi.fn()}
        anchorRef={{ current: null }}
      />
    )
    // When anchorRef.current is null, updatePos doesn't set pos, so it returns null
    expect(container.innerHTML).toBe('')
  })
})
