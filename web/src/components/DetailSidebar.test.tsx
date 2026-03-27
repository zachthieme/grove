import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DetailSidebar from './DetailSidebar'
import { makePerson, renderWithOrg } from '../test-helpers'

// --- Test fixtures ---

const alice = makePerson({ id: 'a1', name: 'Alice Smith', role: 'VP', managerId: '', team: 'Platform', discipline: 'Eng', employmentType: 'FTE' })
const bob = makePerson({ id: 'b2', name: 'Bob Jones', role: 'Engineer', managerId: 'a1', team: 'Platform', discipline: 'Eng', employmentType: 'FTE' })
const carol = makePerson({ id: 'c3', name: 'Carol White', role: 'Designer', managerId: 'a1', team: 'Design', discipline: 'Design', employmentType: 'FTE' })

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

    it('[UI-002] calls update with correct fields when Save is clicked', async () => {
      const user = userEvent.setup()
      const { update } = renderSingle()
      await user.click(screen.getByText('Save'))
      expect(update).toHaveBeenCalledTimes(1)
      const [personId, fields] = update.mock.calls[0]
      expect(personId).toBe('b2')
      expect(fields.name).toBe('Bob Jones')
      expect(fields.role).toBe('Engineer')
      expect(fields.status).toBe('Active')
      expect(fields.employmentType).toBe('FTE')
      expect(fields.team).toBe('Platform')
      expect(fields.managerId).toBe('a1')
    })

    it('[UI-002] does not call reparent when manager has not changed', async () => {
      const user = userEvent.setup()
      const { reparent } = renderSingle()
      await user.click(screen.getByText('Save'))
      expect(reparent).not.toHaveBeenCalled()
    })

    it('[UI-002] clears manager via reparent when set to no manager', async () => {
      const user = userEvent.setup()
      const { reparent } = renderSingle()
      const selects = screen.getAllByRole('combobox')
      await user.selectOptions(selects[0], '')
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
      renderSingle({ update: vi.fn().mockRejectedValue(new Error('network error')) })
      await user.click(screen.getByText('Save'))
      expect(screen.getByText('Retry')).toBeDefined()
    })

    it('[UI-002] shows error message text when save fails', async () => {
      const user = userEvent.setup()
      renderSingle({ update: vi.fn().mockRejectedValue(new Error('network error')) })
      await user.click(screen.getByText('Save'))
      expect(screen.getByText('Save failed')).toBeDefined()
    })

    it('[UI-002] name field updates reactively when changed', async () => {
      const user = userEvent.setup()
      renderSingle()
      const nameInput = screen.getByDisplayValue('Bob Jones') as HTMLInputElement
      await user.clear(nameInput)
      await user.type(nameInput, 'Robert Jones')
      expect(nameInput.value).toBe('Robert Jones')
    })
  })

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
  })

  describe('boundary inputs', () => {
    describe('duplicate names', () => {
      const alice1 = makePerson({ id: 'dup1', name: 'Alice Smith', role: 'Engineer', managerId: '', team: 'Alpha', employmentType: 'FTE' })
      const alice2 = makePerson({ id: 'dup2', name: 'Alice Smith', role: 'Designer', managerId: 'dup1', team: 'Beta', employmentType: 'FTE' })

      it('[UI-002] calls update with correct id for second duplicate on save', async () => {
        const user = userEvent.setup()
        const update = vi.fn().mockResolvedValue(undefined)
        renderWithOrg(<DetailSidebar />, {
          working: [alice1, alice2],
          selectedId: 'dup2',
          selectedIds: new Set(['dup2']),
          update,
        })
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
        const nameInput = screen.getByDisplayValue('Alice Smith') as HTMLInputElement
        await user.clear(nameInput)
        await user.type(nameInput, 'Alice Smith-1')
        expect(nameInput.value).toBe('Alice Smith-1')
        unmount()

        renderWithOrg(<DetailSidebar />, {
          working: [alice1, alice2],
          selectedId: 'dup2',
          selectedIds: new Set(['dup2']),
          update,
        })
        const nameInput2 = screen.getByDisplayValue('Alice Smith') as HTMLInputElement
        await user.clear(nameInput2)
        await user.type(nameInput2, 'Alice Smith-2')
        expect(nameInput2.value).toBe('Alice Smith-2')
      })
    })

    describe('empty string fields', () => {
      it('[UI-002] calls update with empty fields when saved', async () => {
        const user = userEvent.setup()
        const update = vi.fn().mockResolvedValue(undefined)
        const emptyPerson = makePerson({ id: 'empty1', name: '', role: '', team: '', discipline: '', employmentType: '' })
        renderWithOrg(<DetailSidebar />, {
          working: [emptyPerson],
          selectedId: 'empty1',
          selectedIds: new Set(['empty1']),
          update,
        })
        await user.click(screen.getByText('Save'))
        expect(update).toHaveBeenCalledTimes(1)
        const [personId, fields] = update.mock.calls[0]
        expect(personId).toBe('empty1')
        expect(fields.name).toBe('')
        expect(fields.role).toBe('')
      })
    })

    describe('very long strings', () => {
      it('[UI-002] calls update with full-length strings on save', async () => {
        const user = userEvent.setup()
        const update = vi.fn().mockResolvedValue(undefined)
        const longStr = 'A'.repeat(500)
        const longPerson = makePerson({ id: 'long1', name: longStr, role: longStr, team: longStr, discipline: longStr })
        renderWithOrg(<DetailSidebar />, {
          working: [longPerson],
          selectedId: 'long1',
          selectedIds: new Set(['long1']),
          update,
        })
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
        const p = makePerson({ id: 'save-special', name: specialName })
        renderWithOrg(<DetailSidebar />, {
          working: [p],
          selectedId: 'save-special',
          selectedIds: new Set(['save-special']),
          update,
        })
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
        const wsPerson = makePerson({ id: 'ws1', name: '   ', role: '   ', team: '   ' })
        renderWithOrg(<DetailSidebar />, {
          working: [wsPerson],
          selectedId: 'ws1',
          selectedIds: new Set(['ws1']),
          update,
        })
        await user.click(screen.getByText('Save'))
        expect(update).toHaveBeenCalledTimes(1)
        const [, fields] = update.mock.calls[0]
        expect(fields.name).toBe('   ')
        expect(fields.role).toBe('   ')
      })
    })
  })
})
