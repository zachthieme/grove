import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, fireEvent } from '@testing-library/react'
import UploadPrompt from './UploadPrompt'
import { renderWithOrg } from '../test-helpers'

describe('UploadPrompt', () => {
  afterEach(() => cleanup())

  it('calls upload when a file is selected', () => {
    const uploadFn = vi.fn()
    const { container } = renderWithOrg(<UploadPrompt />, {
      loaded: false,
      upload: uploadFn,
    })
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['data'], 'test.csv', { type: 'text/csv' })
    fireEvent.change(input, { target: { files: [file] } })
    expect(uploadFn).toHaveBeenCalledWith(file)
  })

  it('does not call upload when no file is selected', () => {
    const uploadFn = vi.fn()
    const { container } = renderWithOrg(<UploadPrompt />, {
      loaded: false,
      upload: uploadFn,
    })
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [] } })
    expect(uploadFn).not.toHaveBeenCalled()
  })
})
