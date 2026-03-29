// Scenarios: VIEW-003
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TableHeader from './TableHeader'
import type { ColumnDef } from './tableColumns'

const testColumns: ColumnDef[] = [
  { key: 'name', label: 'Name', cellType: 'text', width: '150px' },
  { key: 'role', label: 'Role', cellType: 'text', width: '150px' },
]

type TableHeaderProps = Parameters<typeof TableHeader>[0]

function defaultProps(overrides: Partial<TableHeaderProps> = {}): TableHeaderProps {
  return {
    columns: testColumns,
    sortKey: null,
    sortDir: null,
    onSort: vi.fn(),
    filterActive: new Set(),
    onFilterClick: vi.fn(),
    openFilter: null,
    people: [],
    columnFilters: new Map(),
    onFilterSelectionChange: vi.fn(),
    onFilterClose: vi.fn(),
    allSelected: false,
    someSelected: false,
    onToggleAll: vi.fn(),
    ...overrides,
  }
}

afterEach(() => cleanup())

describe('TableHeader', () => {
  it('renders column labels', () => {
    render(
      <table><thead>
        <TableHeader {...defaultProps()} />
      </thead></table>
    )
    expect(screen.getByText('Name')).toBeTruthy()
    expect(screen.getByText('Role')).toBeTruthy()
  })

  it('calls onSort with column key when clicking column label', async () => {
    const onSort = vi.fn()
    render(
      <table><thead>
        <TableHeader {...defaultProps({ onSort })} />
      </thead></table>
    )
    await userEvent.click(screen.getByText('Name'))
    expect(onSort).toHaveBeenCalledWith('name')
  })

  it('shows sort arrow ▲ when sortKey matches column and sortDir is asc', () => {
    render(
      <table><thead>
        <TableHeader {...defaultProps({ sortKey: 'name', sortDir: 'asc' })} />
      </thead></table>
    )
    const label = screen.getByText('Name', { selector: 'span' })
    expect(label.textContent).toContain('▲')
  })

  it('shows sort arrow ▼ when sortKey matches column and sortDir is desc', () => {
    render(
      <table><thead>
        <TableHeader {...defaultProps({ sortKey: 'name', sortDir: 'desc' })} />
      </thead></table>
    )
    const label = screen.getByText('Name', { selector: 'span' })
    expect(label.textContent).toContain('▼')
  })

  it('shows no sort arrow when sortKey is null', () => {
    render(
      <table><thead>
        <TableHeader {...defaultProps({ sortKey: null, sortDir: null })} />
      </thead></table>
    )
    const nameLabel = screen.getByText('Name', { selector: 'span' })
    expect(nameLabel.textContent).not.toContain('▲')
    expect(nameLabel.textContent).not.toContain('▼')
    const roleLabel = screen.getByText('Role', { selector: 'span' })
    expect(roleLabel.textContent).not.toContain('▲')
    expect(roleLabel.textContent).not.toContain('▼')
  })

  it('calls onToggleAll when select all checkbox is clicked', async () => {
    const onToggleAll = vi.fn()
    render(
      <table><thead>
        <TableHeader {...defaultProps({ onToggleAll })} />
      </thead></table>
    )
    await userEvent.click(screen.getByTitle('Select all'))
    expect(onToggleAll).toHaveBeenCalledOnce()
  })

  it('select all checkbox is checked when allSelected is true', () => {
    render(
      <table><thead>
        <TableHeader {...defaultProps({ allSelected: true })} />
      </thead></table>
    )
    const checkbox = screen.getByTitle('Select all') as HTMLInputElement
    expect(checkbox.checked).toBe(true)
  })

  it('filter button has correct aria-label', () => {
    render(
      <table><thead>
        <TableHeader {...defaultProps()} />
      </thead></table>
    )
    expect(screen.getByLabelText('Filter Name')).toBeTruthy()
    expect(screen.getByLabelText('Filter Role')).toBeTruthy()
  })

  it('calls onFilterClick with column key when filter button is clicked', async () => {
    const onFilterClick = vi.fn()
    render(
      <table><thead>
        <TableHeader {...defaultProps({ onFilterClick })} />
      </thead></table>
    )
    await userEvent.click(screen.getByLabelText('Filter Name'))
    expect(onFilterClick).toHaveBeenCalledWith('name')
  })
})
