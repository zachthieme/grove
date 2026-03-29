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

  it('[CREATE-001] auto-opens sidebar after create by calling setSelectedId with the new person id', async () => {
    const createOrgFn = vi.fn().mockResolvedValue('new-person-id')
    const setSelectedIdFn = vi.fn()
    renderWithOrg(<UploadPrompt />, {
      loaded: false,
      createOrg: createOrgFn,
      setSelectedId: setSelectedIdFn,
    })
    await userEvent.click(screen.getByText('or start from scratch'))
    await userEvent.type(screen.getByPlaceholderText('Name of the first person'), 'Alice')
    await userEvent.click(screen.getByText('Create'))
    expect(setSelectedIdFn).toHaveBeenCalledWith('new-person-id')
  })

  it('[CREATE-001] does not call setSelectedId when createOrg returns no id', async () => {
    const createOrgFn = vi.fn().mockResolvedValue(undefined)
    const setSelectedIdFn = vi.fn()
    renderWithOrg(<UploadPrompt />, {
      loaded: false,
      createOrg: createOrgFn,
      setSelectedId: setSelectedIdFn,
    })
    await userEvent.click(screen.getByText('or start from scratch'))
    await userEvent.type(screen.getByPlaceholderText('Name of the first person'), 'Alice')
    await userEvent.click(screen.getByText('Create'))
    expect(setSelectedIdFn).not.toHaveBeenCalled()
  })

  it('[CREATE-004] Create button is disabled with empty name', async () => {
    renderWithOrg(<UploadPrompt />, { loaded: false })
    await userEvent.click(screen.getByText('or start from scratch'))
    expect((screen.getByText('Create') as HTMLButtonElement).disabled).toBe(true)
  })

  // Scenarios: CREATE-001
  describe('error and edge states', () => {
    it('[CREATE-001] form remains visible for retry when createOrg returns undefined (API failure)', async () => {
      // createOrg returns undefined when the API call fails (error is surfaced via UIContext, not this component)
      const createOrgFn = vi.fn().mockResolvedValue(undefined)
      renderWithOrg(<UploadPrompt />, { loaded: false, createOrg: createOrgFn })
      await userEvent.click(screen.getByText('or start from scratch'))
      await userEvent.type(screen.getByPlaceholderText('Name of the first person'), 'Alice')
      await userEvent.click(screen.getByText('Create'))
      // Should not throw — form stays visible so user can retry
      expect(createOrgFn).toHaveBeenCalledWith('Alice')
      screen.getByPlaceholderText('Name of the first person')
    })
  })
})
