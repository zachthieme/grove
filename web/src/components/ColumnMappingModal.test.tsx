import { describe, it, expect, vi, afterEach, type Mock } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import ColumnMappingModal from './ColumnMappingModal'
import type { MappedColumn } from '../api/types'

afterEach(() => cleanup())

const headers = ['Full Name', 'Job Title', 'Department', 'Reports To', 'Group']

const mappingWithName: Record<string, MappedColumn> = {
  name: { column: 'Full Name', confidence: 'high' },
  role: { column: 'Job Title', confidence: 'medium' },
}

const emptyMapping: Record<string, MappedColumn> = {}

const preview = [
  ['Full Name', 'Job Title', 'Department', 'Reports To', 'Group'],
  ['Alice Smith', 'Engineer', 'Eng', 'Bob Jones', 'Platform'],
  ['Carol White', 'Designer', 'Design', '', 'UX'],
]

function renderModal(overrides: Partial<Parameters<typeof ColumnMappingModal>[0]> = {}) {
  const props = {
    headers,
    mapping: mappingWithName,
    preview,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  }
  const result = render(<ColumnMappingModal {...props} />)
  return { ...result, ...props }
}

describe('ColumnMappingModal', () => {
  it('renders the title', () => {
    renderModal()
    expect(screen.getByText('Map Spreadsheet Columns')).toBeDefined()
  })

  it('renders a select dropdown for each of the 9 app fields', () => {
    renderModal()
    const selects = screen.getAllByRole('combobox')
    expect(selects.length).toBe(9)
  })

  it('renders labels for all 9 app fields', () => {
    renderModal()
    const labels = ['Name', 'Role', 'Discipline', 'Manager', 'Team', 'Status', 'Additional Teams', 'New Role', 'New Team']
    for (const label of labels) {
      // Some labels also appear in preview table headers, so use getAllByText
      const elements = screen.getAllByText(label)
      expect(elements.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('pre-selects columns from the mapping prop', () => {
    renderModal()
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[]
    // Name (index 0) should be pre-selected to 'Full Name'
    expect(selects[0].value).toBe('Full Name')
    // Role (index 1) should be pre-selected to 'Job Title'
    expect(selects[1].value).toBe('Job Title')
  })

  it('has unmapped option as first option in each select', () => {
    renderModal()
    const selects = screen.getAllByRole('combobox')
    for (const select of selects) {
      const firstOption = select.querySelector('option') as HTMLOptionElement
      expect(firstOption.textContent).toBe('— unmapped —')
      expect(firstOption.value).toBe('')
    }
  })

  it('lists all headers as options in each select', () => {
    renderModal()
    const selects = screen.getAllByRole('combobox')
    // Each select should have 1 unmapped + 5 header options = 6
    for (const select of selects) {
      const options = select.querySelectorAll('option')
      expect(options.length).toBe(6) // unmapped + 5 headers
    }
  })

  it('Load button is enabled when required field (name) is mapped', () => {
    renderModal()
    const loadBtn = screen.getByRole('button', { name: 'Load' }) as HTMLButtonElement
    expect(loadBtn.disabled).toBe(false)
  })

  it('Load button is disabled when required field (name) is not mapped', () => {
    renderModal({ mapping: emptyMapping })
    const loadBtn = screen.getByRole('button', { name: 'Load' }) as HTMLButtonElement
    expect(loadBtn.disabled).toBe(true)
  })

  it('renders Cancel button', () => {
    renderModal()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDefined()
  })

  it('calls onConfirm with the current mapping when Load is clicked', () => {
    const { onConfirm } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Load' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    const arg = (onConfirm as Mock).mock.calls[0][0]
    expect(arg.name).toBe('Full Name')
    expect(arg.role).toBe('Job Title')
  })

  it('calls onCancel when Cancel is clicked', () => {
    const { onCancel } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('changing a dropdown updates the mapping', () => {
    const { onConfirm } = renderModal()
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[]
    // Change discipline (index 2) to 'Department'
    fireEvent.change(selects[2], { target: { value: 'Department' } })
    expect(selects[2].value).toBe('Department')
    // Confirm and verify
    fireEvent.click(screen.getByRole('button', { name: 'Load' }))
    const arg = (onConfirm as Mock).mock.calls[0][0]
    expect(arg.discipline).toBe('Department')
  })

  it('shows preview table when fields are mapped', () => {
    renderModal()
    expect(screen.getByText('Preview')).toBeDefined()
    // Preview should show data rows (not header row)
    expect(screen.getByText('Alice Smith')).toBeDefined()
    expect(screen.getByText('Engineer')).toBeDefined()
  })

  it('does not show preview table when no fields are mapped', () => {
    renderModal({ mapping: emptyMapping })
    expect(screen.queryByText('Preview')).toBeNull()
  })

  it('Load becomes enabled after mapping name via dropdown', () => {
    renderModal({ mapping: emptyMapping })
    const loadBtn = screen.getByRole('button', { name: 'Load' }) as HTMLButtonElement
    expect(loadBtn.disabled).toBe(true)
    // Map name to 'Full Name'
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[]
    fireEvent.change(selects[0], { target: { value: 'Full Name' } })
    expect(loadBtn.disabled).toBe(false)
  })

  it('Load becomes disabled after unmapping name', () => {
    renderModal()
    const loadBtn = screen.getByRole('button', { name: 'Load' }) as HTMLButtonElement
    expect(loadBtn.disabled).toBe(false)
    // Unmap name
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[]
    fireEvent.change(selects[0], { target: { value: '' } })
    expect(loadBtn.disabled).toBe(true)
  })
})
