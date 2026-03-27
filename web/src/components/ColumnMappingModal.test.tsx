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
  it('[UI-010] calls onConfirm with the current mapping when Load is clicked', () => {
    const { onConfirm } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Load' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    const arg = (onConfirm as Mock).mock.calls[0][0]
    expect(arg.name).toBe('Full Name')
    expect(arg.role).toBe('Job Title')
  })

  it('[UI-010] calls onCancel when Cancel is clicked', () => {
    const { onCancel } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('[UI-010] changing a dropdown updates the mapping', () => {
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

  it('[UI-010] Load becomes enabled after mapping name via dropdown', () => {
    renderModal({ mapping: emptyMapping })
    const loadBtn = screen.getByRole('button', { name: 'Load' }) as HTMLButtonElement
    expect(loadBtn.disabled).toBe(true)
    // Map name to 'Full Name'
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[]
    fireEvent.change(selects[0], { target: { value: 'Full Name' } })
    expect(loadBtn.disabled).toBe(false)
  })

  it('[UI-010] Load becomes disabled after unmapping name', () => {
    renderModal()
    const loadBtn = screen.getByRole('button', { name: 'Load' }) as HTMLButtonElement
    expect(loadBtn.disabled).toBe(false)
    // Unmap name
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[]
    fireEvent.change(selects[0], { target: { value: '' } })
    expect(loadBtn.disabled).toBe(true)
  })
})
