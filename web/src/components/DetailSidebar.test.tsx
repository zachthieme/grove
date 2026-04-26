import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DetailSidebar from './DetailSidebar'
import { makeNode, renderWithOrg } from '../test-helpers'

// --- Test fixtures ---

const alice = makeNode({ id: 'a1', name: 'Alice Smith', role: 'VP', managerId: '', team: 'Platform', discipline: 'Eng', employmentType: 'FTE' })
const bob = makeNode({ id: 'b2', name: 'Bob Jones', role: 'Engineer', managerId: 'a1', team: 'Platform', discipline: 'Eng', employmentType: 'FTE' })
const carol = makeNode({ id: 'c3', name: 'Carol White', role: 'Designer', managerId: 'a1', team: 'Design', discipline: 'Design', employmentType: 'FTE' })

afterEach(() => cleanup())

// --- Tests ---

describe('DetailSidebar', () => {
  describe('single-person edit', () => {
    function renderSingle(overrides = {}) {
      const update = vi.fn().mockResolvedValue(undefined)
      const remove = vi.fn().mockResolvedValue(undefined)
      const reparent = vi.fn().mockResolvedValue(undefined)
      const clearSelection = vi.fn()
      const setSelectedId = vi.fn()
      const ctx = {
        working: [alice, bob],
        selectedId: 'b2',
        selectedIds: new Set(['b2']),
        update,
        remove,
        reparent,
        clearSelection,
        setSelectedId,
        ...overrides,
      }
      const result = renderWithOrg(<DetailSidebar />, ctx)
      return { ...result, update, remove, reparent, clearSelection, setSelectedId, ...overrides }
    }

    it('[UI-002] calls clearSelection when close button is clicked', async () => {
      const user = userEvent.setup()
      const { clearSelection } = renderSingle()
      const closeBtn = screen.getByLabelText('Close')
      await user.click(closeBtn)
      expect(clearSelection).toHaveBeenCalledTimes(1)
    })

    it('[UI-002] calls update with changed fields when Save is clicked', async () => {
      const user = userEvent.setup()
      const { update } = renderSingle()
      const nameInput = screen.getByTestId('field-name') as HTMLInputElement
      await user.clear(nameInput)
      await user.type(nameInput, 'Robert Jones')
      await user.click(screen.getByText('Save'))
      expect(update).toHaveBeenCalledTimes(1)
      const [personId, fields] = update.mock.calls[0]
      expect(personId).toBe('b2')
      expect(fields.name).toBe('Robert Jones')
    })

    it('[UI-002] does not call reparent when manager has not changed', async () => {
      const user = userEvent.setup()
      const { reparent, update } = renderSingle()
      // Change name but not manager
      const nameInput = screen.getByTestId('field-name') as HTMLInputElement
      await user.clear(nameInput)
      await user.type(nameInput, 'New Name')
      await user.click(screen.getByText('Save'))
      expect(reparent).not.toHaveBeenCalled()
      expect(update).toHaveBeenCalled()
    })

    it('[UI-002] clears manager via reparent when set to no manager', async () => {
      const user = userEvent.setup()
      const { reparent } = renderSingle()
      const managerSelect = screen.getByTestId('field-manager')
      await user.selectOptions(managerSelect, '')
      await user.click(screen.getByText('Save'))
      expect(reparent).toHaveBeenCalledWith('b2', '', expect.any(String))
    })

    it('[UI-002] calls remove with person id when Delete is clicked', async () => {
      const user = userEvent.setup()
      const { remove } = renderSingle()
      await user.click(screen.getByText('Delete'))
      expect(remove).toHaveBeenCalledWith('b2')
    })

    it('[UI-002] calls setSelectedId(null) after successful delete', async () => {
      const user = userEvent.setup()
      const { setSelectedId } = renderSingle()
      await user.click(screen.getByText('Delete'))
      expect(setSelectedId).toHaveBeenCalledWith(null)
    })

    it('[UI-002] shows "Saved!" after successful save', async () => {
      const user = userEvent.setup()
      renderSingle()
      await user.click(screen.getByText('Save'))
      expect(screen.getByText('Saved!')).toBeDefined()
    })

    it('[UI-002] shows "Retry" button label after save fails', async () => {
      const user = userEvent.setup()
      renderSingle({
        update: vi.fn().mockRejectedValue(new Error('network error')),
      })
      // Must change a field to trigger save
      const nameInput = screen.getByTestId('field-name') as HTMLInputElement
      await user.clear(nameInput)
      await user.type(nameInput, 'New Name')
      await user.click(screen.getByText('Save'))
      expect(screen.getByText('Retry')).toBeDefined()
    })

    it('[UI-002] shows error message text when save fails', async () => {
      const user = userEvent.setup()
      renderSingle({
        update: vi.fn().mockRejectedValue(new Error('network error')),
      })
      const nameInput = screen.getByTestId('field-name') as HTMLInputElement
      await user.clear(nameInput)
      await user.type(nameInput, 'New Name')
      await user.click(screen.getByText('Save'))
      expect(screen.getByText('Save failed')).toBeDefined()
    })

    it('[UI-002] name field updates reactively when changed', async () => {
      const user = userEvent.setup()
      renderSingle()
      const nameInput = screen.getByTestId('field-name') as HTMLInputElement
      expect(nameInput.value).toBe('Bob Jones')
      await user.clear(nameInput)
      await user.type(nameInput, 'Robert')
      expect(nameInput.value).toBe('Robert')
    })

    it('[UI-002] shows "Saved!" when no changes are made', async () => {
      const user = userEvent.setup()
      renderSingle()
      await user.click(screen.getByText('Save'))
      expect(screen.getByText('Saved!')).toBeDefined()
    })

    it('[VIM-006] focuses and selects the name input when interactionMode is "editing"', () => {
      renderSingle({
        interactionMode: 'editing',
        editingPersonId: 'b2',
      })
      const nameInput = screen.getByTestId('field-name') as HTMLInputElement
      expect(document.activeElement).toBe(nameInput)
      expect(nameInput.selectionStart).toBe(0)
      expect(nameInput.selectionEnd).toBe(nameInput.value.length)
    })

    it('[VIM-006] does not focus the name input when interactionMode is "selected"', () => {
      renderSingle({
        interactionMode: 'selected',
        editingPersonId: null,
      })
      const nameInput = screen.getByTestId('field-name') as HTMLInputElement
      expect(document.activeElement).not.toBe(nameInput)
    })

    it('[VIM-006] Esc on input commits via update (rapid-add flow does not lose typed name)', async () => {
      const user = userEvent.setup()
      const { update } = renderSingle()
      const nameInput = screen.getByTestId('field-name') as HTMLInputElement
      await user.click(nameInput)
      await user.clear(nameInput)
      await user.type(nameInput, 'Robert')
      await user.keyboard('{Escape}')
      expect(update).toHaveBeenCalledTimes(1)
      const [, fields] = update.mock.calls[0]
      expect(fields.name).toBe('Robert')
    })
  })

  // Scenarios: UI-013
  describe('batch edit', () => {
    function renderBatch(overrides = {}) {
      const update = vi.fn().mockResolvedValue(undefined)
      const reparent = vi.fn().mockResolvedValue(undefined)
      const clearSelection = vi.fn()
      const ctx = {
        working: [alice, bob, carol],
        selectedId: null,
        selectedIds: new Set(['b2', 'c3']),
        update,
        reparent,
        clearSelection,
        ...overrides,
      }
      const result = renderWithOrg(<DetailSidebar />, ctx)
      return { ...result, update, reparent, clearSelection }
    }

    it('[VIEW-007] calls clearSelection when close button is clicked in batch mode', async () => {
      const user = userEvent.setup()
      const { clearSelection } = renderBatch()
      await user.click(screen.getByLabelText('Close'))
      expect(clearSelection).toHaveBeenCalledTimes(1)
    })

    it('[VIEW-007] calls update for each selected person on batch save', async () => {
      const user = userEvent.setup()
      const { update } = renderBatch()
      const mixedInputs = screen.getAllByPlaceholderText('Mixed')
      await user.clear(mixedInputs[0])
      await user.type(mixedInputs[0], 'Senior Engineer')
      await user.click(screen.getByText('Save'))
      expect(update).toHaveBeenCalledTimes(2)
    })

    it('[VIEW-007] clears manager via reparent when batch-set to no manager', async () => {
      const user = userEvent.setup()
      const { reparent } = renderBatch()
      const selects = screen.getAllByRole('combobox')
      const managerSelect = selects.find(
        (s) => Array.from(s.querySelectorAll('option')).some((o) => o.textContent === '(No manager)'),
      )!
      await user.selectOptions(managerSelect, '')
      await user.click(screen.getByText('Save'))
      expect(reparent).toHaveBeenCalledTimes(2)
      expect(reparent).toHaveBeenCalledWith('b2', '', expect.any(String))
      expect(reparent).toHaveBeenCalledWith('c3', '', expect.any(String))
    })

    it('[VIEW-007] "Clear selection" button calls clearSelection', async () => {
      const user = userEvent.setup()
      const { clearSelection } = renderBatch()
      const clearBtn = screen.getByText('Clear selection')
      await user.click(clearBtn)
      expect(clearSelection).toHaveBeenCalledTimes(1)
    })

    it('[VIEW-007] renders nothing when all batch-selected people have been deleted', () => {
      const { container } = renderWithOrg(<DetailSidebar />, {
        working: [],
        selectedId: null,
        selectedIds: new Set(['a1', 'b2', 'c3']),
      })
      expect(container.innerHTML).toBe('')
    })
  })

  describe('boundary inputs', () => {
    describe('duplicate names', () => {
      const alice1 = makeNode({ id: 'dup1', name: 'Alice Smith', role: 'Engineer', managerId: '', team: 'Alpha', employmentType: 'FTE' })
      const alice2 = makeNode({ id: 'dup2', name: 'Alice Smith', role: 'Designer', managerId: 'dup1', team: 'Beta', employmentType: 'FTE' })

      it('[UI-002] calls update with correct id for second duplicate on save', async () => {
        const user = userEvent.setup()
        const update = vi.fn().mockResolvedValue(undefined)
        renderWithOrg(<DetailSidebar />, {
          working: [alice1, alice2],
          selectedId: 'dup2',
          selectedIds: new Set(['dup2']),
          update,
        })
        // Change role to make it dirty
        const roleInput = screen.getByTestId('field-role') as HTMLInputElement
        await user.clear(roleInput)
        await user.type(roleInput, 'New Role')
        await user.click(screen.getByText('Save'))
        expect(update).toHaveBeenCalledTimes(1)
        const [personId] = update.mock.calls[0]
        expect(personId).toBe('dup2')
      })

      it('[UI-002] can edit each duplicate independently', async () => {
        const user = userEvent.setup()
        const update = vi.fn().mockResolvedValue(undefined)
        const { unmount } = renderWithOrg(<DetailSidebar />, {
          working: [alice1, alice2],
          selectedId: 'dup1',
          selectedIds: new Set(['dup1']),
          update,
        })
        const nameInput = screen.getByTestId('field-name') as HTMLInputElement
        expect(nameInput.value).toBe('Alice Smith')
        await user.clear(nameInput)
        await user.type(nameInput, 'Alice One')
        expect(nameInput.value).toBe('Alice One')
        unmount()

        renderWithOrg(<DetailSidebar />, {
          working: [alice1, alice2],
          selectedId: 'dup2',
          selectedIds: new Set(['dup2']),
          update,
        })
        const nameInput2 = screen.getByTestId('field-name') as HTMLInputElement
        expect(nameInput2.value).toBe('Alice Smith')
        await user.clear(nameInput2)
        await user.type(nameInput2, 'Alice Two')
        expect(nameInput2.value).toBe('Alice Two')
      })
    })

    describe('empty string fields', () => {
      it('[UI-002] renders empty fields correctly in edit form', async () => {
        const user = userEvent.setup()
        const update = vi.fn().mockResolvedValue(undefined)
        // Person has a non-empty role so we can clear it to empty to trigger save
        const emptyPerson = makeNode({ id: 'empty1', name: 'Empty Person', role: 'Engineer', team: '', discipline: '', employmentType: '' })
        renderWithOrg(<DetailSidebar />, {
          working: [emptyPerson],
          selectedId: 'empty1',
          selectedIds: new Set(['empty1']),
          update,
        })
        // Clear the role field to an empty string (makes it dirty)
        const roleInput = screen.getByTestId('field-role') as HTMLInputElement
        await user.clear(roleInput)
        await user.click(screen.getByText('Save'))
        expect(update).toHaveBeenCalledTimes(1)
        const [personId, fields] = update.mock.calls[0]
        expect(personId).toBe('empty1')
        expect(fields.role).toBe('')
      })
    })

    describe('very long strings', () => {
      it('[UI-002] calls update with full-length strings on save', async () => {
        const user = userEvent.setup()
        const update = vi.fn().mockResolvedValue(undefined)
        const longStr = 'A'.repeat(500)
        const longPerson = makeNode({ id: 'long1', name: 'Short', role: 'Short', team: 'T', discipline: 'D' })
        renderWithOrg(<DetailSidebar />, {
          working: [longPerson],
          selectedId: 'long1',
          selectedIds: new Set(['long1']),
          update,
        })
        // Use fireEvent.change to efficiently set long string values (avoids typing 500 chars via userEvent)
        const nameInput = screen.getByTestId('field-name') as HTMLInputElement
        const roleInput = screen.getByTestId('field-role') as HTMLInputElement
        fireEvent.change(nameInput, { target: { value: longStr } })
        fireEvent.change(roleInput, { target: { value: longStr } })
        await user.click(screen.getByText('Save'))
        expect(update).toHaveBeenCalledTimes(1)
        const [, fields] = update.mock.calls[0]
        expect(fields.name).toBe(longStr)
        expect(fields.role).toBe(longStr)
      })
    })

    describe('special characters in names', () => {
      it('[UI-002] preserves special characters through save', async () => {
        const user = userEvent.setup()
        const update = vi.fn().mockResolvedValue(undefined)
        const specialName = 'Jos\u00e9 Garc\u00eda-L\u00f3pez'
        // Start with a plain name so we can change it to specialName (making it dirty)
        const p = makeNode({ id: 'save-special', name: 'Plain Name' })
        renderWithOrg(<DetailSidebar />, {
          working: [p],
          selectedId: 'save-special',
          selectedIds: new Set(['save-special']),
          update,
        })
        // Use fireEvent.change to set the special-character name efficiently
        const nameInput = screen.getByTestId('field-name') as HTMLInputElement
        fireEvent.change(nameInput, { target: { value: specialName } })
        await user.click(screen.getByText('Save'))
        expect(update).toHaveBeenCalledTimes(1)
        const [, fields] = update.mock.calls[0]
        expect(fields.name).toBe(specialName)
      })
    })

    describe('whitespace-only fields', () => {
      it('[UI-002] calls update with whitespace-only values on save', async () => {
        const user = userEvent.setup()
        const update = vi.fn().mockResolvedValue(undefined)
        // Start with normal values; change them to whitespace-only to verify whitespace passes through
        const wsPerson = makeNode({ id: 'ws1', name: 'Real Name', role: 'Real Role', team: 'T' })
        renderWithOrg(<DetailSidebar />, {
          working: [wsPerson],
          selectedId: 'ws1',
          selectedIds: new Set(['ws1']),
          update,
        })
        // Use fireEvent.change to set whitespace-only values (making fields dirty)
        const nameInput = screen.getByTestId('field-name') as HTMLInputElement
        const roleInput = screen.getByTestId('field-role') as HTMLInputElement
        fireEvent.change(nameInput, { target: { value: '   ' } })
        fireEvent.change(roleInput, { target: { value: '   ' } })
        await user.click(screen.getByText('Save'))
        expect(update).toHaveBeenCalledTimes(1)
        const [, fields] = update.mock.calls[0]
        expect(fields.name).toBe('   ')
        expect(fields.role).toBe('   ')
      })
    })
  })

  describe('error and edge states', () => {
    it('renders nothing when no person is selected', () => {
      const { container } = renderWithOrg(<DetailSidebar />, {
        working: [alice, bob],
        selectedId: null,
        selectedIds: new Set(),
      })
      expect(container.innerHTML).toBe('')
    })

    it('[UI-002] shows "Retry" when update rejects', async () => {
      const user = userEvent.setup()
      const update = vi.fn().mockRejectedValueOnce(new Error('Network error'))
      renderWithOrg(<DetailSidebar />, {
        working: [alice, bob],
        selectedId: 'b2',
        selectedIds: new Set(['b2']),
        update,
      })
      // Must change a field to trigger save (no-change save short-circuits to "Saved!")
      const nameInput = screen.getByTestId('field-name') as HTMLInputElement
      await user.clear(nameInput)
      await user.type(nameInput, 'New Name')
      await user.click(screen.getByText('Save'))
      expect(screen.getByText('Retry')).toBeDefined()
      expect(screen.getByText('Save failed')).toBeDefined()
    })
  })
})
