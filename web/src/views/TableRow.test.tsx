// Scenarios: VIEW-003
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TableRow from './TableRow'
import { makeNode } from '../test-helpers'
import type { ColumnDef } from './tableColumns'

afterEach(() => cleanup())

const testColumns: ColumnDef[] = [
  { key: 'name', label: 'Name', width: '150px', cellType: 'text' },
  { key: 'role', label: 'Role', width: '150px', cellType: 'text' },
]

const defaultProps = {
  columns: testColumns,
  managers: [],
  onUpdate: vi.fn(async () => {}),
  onDelete: vi.fn(),
}

describe('TableRow', () => {
  it('renders person name in cells', () => {
    const person = makeNode({ id: 'p1', name: 'Alice', role: 'Designer' })
    render(
      <table><tbody>
        <TableRow {...defaultProps} person={person} />
      </tbody></table>,
    )
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('Designer')).toBeTruthy()
  })

  it('shows select checkbox with correct aria-label', () => {
    const person = makeNode({ id: 'p1', name: 'Bob' })
    render(
      <table><tbody>
        <TableRow {...defaultProps} person={person} />
      </tbody></table>,
    )
    expect(screen.getByRole('checkbox', { name: 'Select Bob' })).toBeTruthy()
  })

  it('select checkbox calls onToggleSelect with person ID', async () => {
    const user = userEvent.setup()
    const onToggleSelect = vi.fn()
    const person = makeNode({ id: 'p1', name: 'Carol' })
    render(
      <table><tbody>
        <TableRow {...defaultProps} person={person} onToggleSelect={onToggleSelect} />
      </tbody></table>,
    )
    await user.click(screen.getByRole('checkbox', { name: 'Select Carol' }))
    expect(onToggleSelect).toHaveBeenCalledWith('p1')
  })

  it('shows delete button when not readOnly', () => {
    const person = makeNode({ id: 'p1', name: 'Dan' })
    render(
      <table><tbody>
        <TableRow {...defaultProps} person={person} />
      </tbody></table>,
    )
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy()
  })

  it('hides delete button when readOnly=true', () => {
    const person = makeNode({ id: 'p1', name: 'Eve' })
    render(
      <table><tbody>
        <TableRow {...defaultProps} person={person} readOnly />
      </tbody></table>,
    )
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })

  it('delete button calls onDelete with person ID', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    const person = makeNode({ id: 'p1', name: 'Frank' })
    render(
      <table><tbody>
        <TableRow {...defaultProps} person={person} onDelete={onDelete} />
      </tbody></table>,
    )
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledWith('p1')
  })

  it('selected row has checked checkbox', () => {
    const person = makeNode({ id: 'p1', name: 'Grace' })
    render(
      <table><tbody>
        <TableRow {...defaultProps} person={person} selected />
      </tbody></table>,
    )
    const checkbox = screen.getByRole('checkbox', { name: 'Select Grace' }) as HTMLInputElement
    expect(checkbox.checked).toBe(true)
  })
})
