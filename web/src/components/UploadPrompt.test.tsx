import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UploadPrompt from './UploadPrompt'
import { renderWithOrg } from '../test-helpers'

describe('UploadPrompt', () => {
  afterEach(() => cleanup())

  it('[UI-006] calls upload when a file is selected', () => {
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

  it('[UI-006] does not call upload when no file is selected', () => {
    const uploadFn = vi.fn()
    const { container } = renderWithOrg(<UploadPrompt />, {
      loaded: false,
      upload: uploadFn,
    })
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [] } })
    expect(uploadFn).not.toHaveBeenCalled()
  })

  it('[CREATE-001] shows "start from scratch" button', () => {
    renderWithOrg(<UploadPrompt />, { loaded: false })
    // getByText throws if not found — presence is the assertion
    screen.getByText('or start from scratch')
  })

  it('[CREATE-001] clicking "start from scratch" shows name input', async () => {
    renderWithOrg(<UploadPrompt />, { loaded: false })
    await userEvent.click(screen.getByText('or start from scratch'))
    screen.getByPlaceholderText('Name of the first person')
    screen.getByText('Create')
  })

  it('[CREATE-001] submitting name calls createOrg', async () => {
    const createOrgFn = vi.fn()
    renderWithOrg(<UploadPrompt />, { loaded: false, createOrg: createOrgFn })
    await userEvent.click(screen.getByText('or start from scratch'))
    await userEvent.type(screen.getByPlaceholderText('Name of the first person'), 'Alice')
    await userEvent.click(screen.getByText('Create'))
    expect(createOrgFn).toHaveBeenCalledWith('Alice')
  })

  it('[CREATE-004] Create button is disabled with empty name', async () => {
    renderWithOrg(<UploadPrompt />, { loaded: false })
    await userEvent.click(screen.getByText('or start from scratch'))
    expect((screen.getByText('Create') as HTMLButtonElement).disabled).toBe(true)
  })
})
