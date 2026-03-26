import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import ColumnMappingModal from './ColumnMappingModal'
import { normalizeHTML } from '../test-helpers'
import type { MappedColumn } from '../api/types'

afterEach(() => cleanup())

const headers = ['Full Name', 'Job Title', 'Department', 'Reports To', 'Group']

const preview = [
  ['Full Name', 'Job Title', 'Department', 'Reports To', 'Group'],
  ['Alice Smith', 'Engineer', 'Eng', 'Bob Jones', 'Platform'],
  ['Carol White', 'Designer', 'Design', '', 'UX'],
]

describe('ColumnMappingModal golden', () => {
  it('default with mapped fields and preview', async () => {
    const mapping: Record<string, MappedColumn> = {
      name: { column: 'Full Name', confidence: 'high' },
      role: { column: 'Job Title', confidence: 'medium' },
    }
    const { container } = render(
      <ColumnMappingModal
        headers={headers}
        mapping={mapping}
        preview={preview}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    await expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/column-mapping-modal-mapped.golden'
    )
  })

  it('empty mapping (Load disabled, no preview)', async () => {
    const { container } = render(
      <ColumnMappingModal
        headers={headers}
        mapping={{}}
        preview={preview}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    await expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/column-mapping-modal-empty.golden'
    )
  })
})
