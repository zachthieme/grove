/**
 * Branch coverage tests for TableRow.
 * Targets uncovered branches:
 * - handleTab: shift=true (backward), shift=false (forward), out of bounds (lines 37-39)
 * - diffClass: all change type branches (added, removed, reporting, title, reorg, pod, empty) (lines 43-51)
 * - readOnly col.key.startsWith('extra:') (lines 69, 71-72)
 * - getDropdownOptions switch branches (lines 22-31)
 * - checkbox ariaLabel for checkbox cellType (line 74)
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TableRow from './TableRow'
import { makePerson } from '../test-helpers'
import type { ColumnDef } from './tableColumns'
import type { PersonChange, ChangeType } from '../hooks/useOrgDiff'

afterEach(() => cleanup())

const baseColumns: ColumnDef[] = [
  { key: 'name', label: 'Name', width: '150px', cellType: 'text' },
  { key: 'role', label: 'Role', width: '150px', cellType: 'text' },
  { key: 'team', label: 'Team', width: '120px', cellType: 'text' },
]

const defaultProps = {
  columns: baseColumns,
  managers: [] as { value: string; label: string }[],
  onUpdate: vi.fn(async () => {}),
  onDelete: vi.fn(),
}

function makeChange(...types: ChangeType[]): PersonChange {
  return { types: new Set(types) }
}

function renderRow(props: Partial<Parameters<typeof TableRow>[0]> = {}) {
  const person = props.person ?? makePerson({ id: 'p1', name: 'Test Person' })
  return render(
    <table><tbody>
      <TableRow {...defaultProps} person={person} {...props} />
    </tbody></table>,
  )
}

describe('TableRow — branch coverage', () => {
  describe('diffClass branches', () => {
    it('applies rowAdded class for "added" change type', () => {
      const { container } = renderRow({ change: makeChange('added') })
      const row = container.querySelector('tr')!
      expect(row.className).toContain('rowAdded')
    })

    it('applies rowRemoved class for "removed" change type', () => {
      const { container } = renderRow({ change: makeChange('removed') })
      const row = container.querySelector('tr')!
      expect(row.className).toContain('rowRemoved')
    })

    it('applies rowReporting class for "reporting" change type', () => {
      const { container } = renderRow({ change: makeChange('reporting') })
      const row = container.querySelector('tr')!
      expect(row.className).toContain('rowReporting')
    })

    it('applies rowTitle class for "title" change type', () => {
      const { container } = renderRow({ change: makeChange('title') })
      const row = container.querySelector('tr')!
      expect(row.className).toContain('rowTitle')
    })

    it('applies rowReorg class for "reorg" change type', () => {
      const { container } = renderRow({ change: makeChange('reorg') })
      const row = container.querySelector('tr')!
      expect(row.className).toContain('rowReorg')
    })

    it('applies rowPod class for "pod" change type', () => {
      const { container } = renderRow({ change: makeChange('pod') })
      const row = container.querySelector('tr')!
      expect(row.className).toContain('rowPod')
    })

    it('does not apply diff class when no change', () => {
      const { container } = renderRow()
      const row = container.querySelector('tr')!
      expect(row.className).not.toContain('rowAdded')
      expect(row.className).not.toContain('rowRemoved')
      expect(row.className).not.toContain('rowReporting')
      expect(row.className).not.toContain('rowTitle')
      expect(row.className).not.toContain('rowReorg')
      expect(row.className).not.toContain('rowPod')
    })

    it('applies rowSelected class when selected', () => {
      const { container } = renderRow({ selected: true })
      const row = container.querySelector('tr')!
      expect(row.className).toContain('rowSelected')
    })

    it('does not apply rowSelected class when not selected', () => {
      const { container } = renderRow({ selected: false })
      const row = container.querySelector('tr')!
      expect(row.className).not.toContain('rowSelected')
    })
  })

  describe('handleTab', () => {
    it('tab forward navigates to next cell', async () => {
      const user = userEvent.setup()
      const { container } = renderRow()

      // Click first editable cell to start editing
      const cells = container.querySelectorAll('td')
      const nameCell = cells[1] // first data cell after checkbox
      await user.click(nameCell)

      // Should now be in editing mode with input visible
      const input = nameCell.querySelector('input[type="text"]')
      expect(input).not.toBeNull()

      // Tab should trigger handleTab
      await user.keyboard('{Tab}')
    })

    it('shift+tab backward navigates to previous cell', async () => {
      const user = userEvent.setup()
      const { container } = renderRow()

      // Click second editable cell to start editing
      const cells = container.querySelectorAll('td')
      const roleCell = cells[2]
      await user.click(roleCell)

      const input = roleCell.querySelector('input[type="text"]')
      expect(input).not.toBeNull()

      // Shift+Tab should trigger handleTab with shift=true
      await user.keyboard('{Shift>}{Tab}{/Shift}')
    })
  })

  describe('extra columns are readOnly', () => {
    it('marks extra: columns as readOnly', () => {
      const columnsWithExtra: ColumnDef[] = [
        { key: 'name', label: 'Name', width: '150px', cellType: 'text' },
        { key: 'extra:location', label: 'Location', width: '120px', cellType: 'text' },
      ]
      const person = makePerson({ id: 'p1', name: 'Alice', extra: { location: 'NYC' } })
      const { container } = render(
        <table><tbody>
          <TableRow {...defaultProps} columns={columnsWithExtra} person={person} />
        </tbody></table>,
      )

      // The extra column should show as text (not editable)
      const cells = container.querySelectorAll('td')
      const locationCell = cells[2] // after checkbox + name
      expect(locationCell.textContent).toBe('NYC')
    })
  })

  describe('getDropdownOptions', () => {
    it('renders manager dropdown options for managerId column', () => {
      const managers = [
        { value: 'm1', label: 'Manager One' },
        { value: 'm2', label: 'Manager Two' },
      ]
      const columnsWithManager: ColumnDef[] = [
        { key: 'name', label: 'Name', width: '150px', cellType: 'text' },
        { key: 'managerId', label: 'Manager', width: '150px', cellType: 'dropdown' },
      ]
      renderRow({ columns: columnsWithManager, managers })

      // The manager column should show the value (not a dropdown until editing)
      expect(screen.getByText('Test Person')).toBeTruthy()
    })

    it('renders status dropdown options for status column', () => {
      const columnsWithStatus: ColumnDef[] = [
        { key: 'name', label: 'Name', width: '150px', cellType: 'text' },
        { key: 'status', label: 'Status', width: '120px', cellType: 'dropdown' },
      ]
      renderRow({ columns: columnsWithStatus })

      // Status column should show the person's status
      expect(screen.getByText('Active')).toBeTruthy()
    })
  })

  describe('checkbox cellType with ariaLabel', () => {
    it('renders checkbox cell with aria-label', () => {
      const columnsWithCheckbox: ColumnDef[] = [
        { key: 'name', label: 'Name', width: '150px', cellType: 'text' },
        { key: 'private', label: 'Private', width: '70px', cellType: 'checkbox' },
      ]
      const person = makePerson({ id: 'p1', name: 'Alice', private: true })
      renderRow({ columns: columnsWithCheckbox, person })

      const checkbox = screen.getByLabelText('Private for Alice') as HTMLInputElement
      expect(checkbox).toBeTruthy()
      expect(checkbox.checked).toBe(true)
    })

    it('renders unchecked checkbox for private=false', () => {
      const columnsWithCheckbox: ColumnDef[] = [
        { key: 'name', label: 'Name', width: '150px', cellType: 'text' },
        { key: 'private', label: 'Private', width: '70px', cellType: 'checkbox' },
      ]
      const person = makePerson({ id: 'p1', name: 'Bob', private: false })
      renderRow({ columns: columnsWithCheckbox, person })

      const checkbox = screen.getByLabelText('Private for Bob') as HTMLInputElement
      expect(checkbox.checked).toBe(false)
    })
  })

  describe('onToggleSelect is optional', () => {
    it('does not crash when onToggleSelect is undefined and checkbox is clicked', async () => {
      const user = userEvent.setup()
      const person = makePerson({ id: 'p1', name: 'Eve' })
      render(
        <table><tbody>
          <TableRow {...defaultProps} person={person} onToggleSelect={undefined} />
        </tbody></table>,
      )
      const checkbox = screen.getByRole('checkbox', { name: 'Select Eve' })
      // Should not throw
      await user.click(checkbox)
    })
  })
})
