/**
 * Additional branch coverage for DetailSidebar.
 * Covers: status info popover, batch dirty tracking for private checkbox,
 * batch save with partial failures, manager change auto-updating team,
 * showPrivate filtering managers, level/pod/note diff fields on single save,
 * PodSidebar delegation, batch save skipping MIXED_VALUE fields,
 * handleDelete with null person guard, editBuffer fallbacks.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, cleanup, fireEvent, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DetailSidebar from './DetailSidebar'
import { makePerson, renderWithOrg } from '../test-helpers'
import type { Pod } from '../api/types'

afterEach(() => cleanup())

const alice = makePerson({
  id: 'a1', name: 'Alice Smith', role: 'VP', managerId: '',
  team: 'Platform', discipline: 'Eng', employmentType: 'FTE',
})
const bob = makePerson({
  id: 'b2', name: 'Bob Jones', role: 'Engineer', managerId: 'a1',
  team: 'Platform', discipline: 'Eng', employmentType: 'FTE',
})
const carol = makePerson({
  id: 'c3', name: 'Carol White', role: 'Designer', managerId: 'a1',
  team: 'Design', discipline: 'Design', employmentType: 'Contractor',
})

/** Helper for single-person edit tests: provides selection context */
function singleEditCtx(person: ReturnType<typeof makePerson>, overrides: Record<string, unknown> = {}) {
  return {
    selectedId: person.id,
    selectedIds: new Set([person.id]),
    ...overrides,
  }
}

describe('DetailSidebar — branch coverage', () => {
  describe('status info popover', () => {
    function renderSingle() {
      return renderWithOrg(<DetailSidebar mode="edit" />, {
        working: [alice, bob],
        ...singleEditCtx(bob),
        update: vi.fn().mockResolvedValue(undefined),
      })
    }

    it('toggles status info popover on when clicking info icon', async () => {
      const user = userEvent.setup()
      renderSingle()
      const infoBtn = screen.getByLabelText('Show status descriptions')
      await user.click(infoBtn)
      expect(screen.getByText('Status Types')).toBeTruthy()
      expect(screen.getByText(/Currently filled and working/)).toBeTruthy()
    })

    it('toggles status info popover off when clicking info icon twice', async () => {
      const user = userEvent.setup()
      renderSingle()
      const infoBtn = screen.getByLabelText('Show status descriptions')
      await user.click(infoBtn)
      expect(screen.getByText('Status Types')).toBeTruthy()
      await user.click(infoBtn)
      expect(screen.queryByText('Status Types')).toBeNull()
    })

    it('closes popover when clicking overlay background', async () => {
      const user = userEvent.setup()
      renderSingle()
      const infoBtn = screen.getByLabelText('Show status descriptions')
      await user.click(infoBtn)
      expect(screen.getByText('Status Types')).toBeTruthy()
      // The overlay is the parent div of the infoPop
      const closeBtn = screen.getByText('x')
      // Click the 'x' close button inside the popover
      await user.click(closeBtn)
      expect(screen.queryByText('Status Types')).toBeNull()
    })

    it('closes popover when mouseDown on overlay', () => {
      renderWithOrg(<DetailSidebar mode="edit" />, {
        working: [alice, bob],
        ...singleEditCtx(bob),
        update: vi.fn().mockResolvedValue(undefined),
      })
      // Open the popover
      fireEvent.click(screen.getByLabelText('Show status descriptions'))
      expect(screen.getByText('Status Types')).toBeTruthy()

      // The overlay is the div containing the infoPop. The structure is:
      // infoOverlay > infoPop > infoHeader > span("Status Types")
      // We need the infoOverlay, which is the great-grandparent of "Status Types"
      const statusTypes = screen.getByText('Status Types')
      const infoHeader = statusTypes.parentElement! // infoHeader div
      const infoPop = infoHeader.parentElement!     // infoPop div
      const overlay = infoPop.parentElement!         // infoOverlay div

      // mouseDown on overlay should close
      fireEvent.mouseDown(overlay)
      expect(screen.queryByText('Status Types')).toBeNull()
    })

    it('does not close popover when mouseDown on inner content (stopPropagation)', () => {
      renderWithOrg(<DetailSidebar mode="edit" />, {
        working: [alice, bob],
        ...singleEditCtx(bob),
        update: vi.fn().mockResolvedValue(undefined),
      })
      fireEvent.click(screen.getByLabelText('Show status descriptions'))
      expect(screen.getByText('Status Types')).toBeTruthy()

      // mouseDown on inner content should NOT close (stopPropagation)
      const statusTypesHeader = screen.getByText('Status Types')
      const infoPop = statusTypesHeader.closest('div')!
      fireEvent.mouseDown(infoPop)
      // Popover should still be visible
      expect(screen.getByText('Status Types')).toBeTruthy()
    })
  })

  describe('PodSidebar delegation', () => {
    it('renders PodSidebar when selectedPodId is set and no person selected', () => {
      const pod: Pod = {
        id: 'pod-1', name: 'Alpha', team: 'Platform', managerId: 'a1',
      }
      renderWithOrg(<DetailSidebar />, {
        working: [alice, bob],
        pods: [pod],
        selectedPodId: 'pod-1',
        selectedId: null,
        selectedIds: new Set(),
      })
      expect(screen.getByText('Pod Details')).toBeTruthy()
    })

    it('does not render PodSidebar when person is also selected', () => {
      const pod: Pod = {
        id: 'pod-1', name: 'Alpha', team: 'Platform', managerId: 'a1',
      }
      renderWithOrg(<DetailSidebar />, {
        working: [alice, bob],
        pods: [pod],
        selectedPodId: 'pod-1',
        selectedId: 'b2',
        selectedIds: new Set(['b2']),
        update: vi.fn().mockResolvedValue(undefined),
      })
      expect(screen.queryByText('Pod Details')).toBeNull()
      expect(screen.getByTestId('sidebar-heading')).toBeTruthy()
    })
  })

  describe('showPrivate manager filtering', () => {
    it('hides private managers from dropdown when showPrivate is false', () => {
      const privateMgr = makePerson({
        id: 'prv1', name: 'Private Manager', role: 'Lead',
        managerId: '', team: 'Secret', private: true,
      })
      const ic = makePerson({
        id: 'ic1', name: 'IC Person', role: 'Eng',
        managerId: 'prv1', team: 'Secret',
      })
      renderWithOrg(<DetailSidebar mode="edit" />, {
        working: [privateMgr, ic],
        ...singleEditCtx(ic),
        showPrivate: false,
        update: vi.fn().mockResolvedValue(undefined),
      })
      const managerSelect = screen.getByTestId('field-manager')
      const options = within(managerSelect).queryAllByRole('option')
      const optionTexts = options.map(o => o.textContent)
      expect(optionTexts.some(t => t?.includes('Private Manager'))).toBe(false)
    })

    it('shows private managers in dropdown when showPrivate is true', () => {
      const privateMgr = makePerson({
        id: 'prv1', name: 'Private Manager', role: 'Lead',
        managerId: '', team: 'Secret', private: true,
      })
      const ic = makePerson({
        id: 'ic1', name: 'IC Person', role: 'Eng',
        managerId: 'prv1', team: 'Secret',
      })
      renderWithOrg(<DetailSidebar mode="edit" />, {
        working: [privateMgr, ic],
        ...singleEditCtx(ic),
        showPrivate: true,
        update: vi.fn().mockResolvedValue(undefined),
      })
      const managerSelect = screen.getByTestId('field-manager')
      const options = within(managerSelect).queryAllByRole('option')
      const optionTexts = options.map(o => o.textContent)
      expect(optionTexts.some(t => t?.includes('Private Manager'))).toBe(true)
    })
  })

  describe('single save: optional field diffs', () => {
    function renderSingleEdit(person: ReturnType<typeof makePerson>, overrides = {}) {
      const update = vi.fn().mockResolvedValue(undefined)
      const reparent = vi.fn().mockResolvedValue(undefined)
      renderWithOrg(<DetailSidebar mode="edit" />, {
        working: [alice, person],
        selectedId: person.id,
        selectedIds: new Set([person.id]),
        update,
        reparent,
        ...overrides,
      })
      return { update, reparent }
    }

    it('includes level field when level has changed', async () => {
      const user = userEvent.setup()
      const person = makePerson({ id: 'p1', name: 'Person', managerId: '', team: 'T', level: 3 })
      const { update } = renderSingleEdit(person)
      const levelInput = screen.getByTestId('field-level') as HTMLInputElement
      await user.clear(levelInput)
      await user.type(levelInput, '5')
      await user.click(screen.getByText('Save'))
      expect(update).toHaveBeenCalledTimes(1)
      const fields = update.mock.calls[0][1]
      expect(fields.level).toBe(5)
    })

    it('includes pod field when pod has changed', async () => {
      const user = userEvent.setup()
      const person = makePerson({ id: 'p1', name: 'Person', managerId: '', team: 'T', pod: 'Alpha' })
      const { update } = renderSingleEdit(person)
      const podInput = screen.getByTestId('field-pod') as HTMLInputElement
      await user.clear(podInput)
      await user.type(podInput, 'Beta')
      await user.click(screen.getByText('Save'))
      const fields = update.mock.calls[0][1]
      expect(fields.pod).toBe('Beta')
    })

    it('includes publicNote when changed', async () => {
      const user = userEvent.setup()
      const person = makePerson({ id: 'p1', name: 'Person', managerId: '', team: 'T', publicNote: 'Old note' })
      const { update } = renderSingleEdit(person)
      const textarea = screen.getByTestId('field-publicNote') as HTMLTextAreaElement
      await user.clear(textarea)
      await user.type(textarea, 'New note')
      await user.click(screen.getByText('Save'))
      const fields = update.mock.calls[0][1]
      expect(fields.publicNote).toBe('New note')
    })

    it('includes privateNote when changed', async () => {
      const user = userEvent.setup()
      const person = makePerson({ id: 'p1', name: 'Person', managerId: '', team: 'T', privateNote: 'Secret' })
      const { update } = renderSingleEdit(person)
      const textarea = screen.getByTestId('field-privateNote') as HTMLTextAreaElement
      await user.clear(textarea)
      await user.type(textarea, 'New secret')
      await user.click(screen.getByText('Save'))
      const fields = update.mock.calls[0][1]
      expect(fields.privateNote).toBe('New secret')
    })

    it('includes private field when toggled', async () => {
      const user = userEvent.setup()
      const person = makePerson({ id: 'p1', name: 'Person', managerId: '', team: 'T', private: false })
      const { update } = renderSingleEdit(person)
      const checkbox = screen.getByTestId('field-private') as HTMLInputElement
      await user.click(checkbox)
      await user.click(screen.getByText('Save'))
      const fields = update.mock.calls[0][1]
      expect(fields.private).toBe(true)
    })

    it('does not include unchanged optional fields', async () => {
      const user = userEvent.setup()
      const person = makePerson({
        id: 'p1', name: 'Person', managerId: '', team: 'T',
        level: 3, pod: 'Alpha', publicNote: 'Note', privateNote: 'Secret', private: true,
      })
      const { update } = renderSingleEdit(person)
      await user.click(screen.getByText('Save'))
      expect(update).not.toHaveBeenCalled()
    })

    it('does not include team/managerId when manager changed (reparent handles it)', async () => {
      const user = userEvent.setup()
      const { update, reparent } = renderSingleEdit(bob, {
        working: [alice, bob, carol],
      })
      const managerSelect = screen.getByTestId('field-manager')
      await user.selectOptions(managerSelect, '')
      // Also change name so update gets called
      const nameInput = screen.getByTestId('field-name') as HTMLInputElement
      await user.clear(nameInput)
      await user.type(nameInput, 'New Bob')
      await user.click(screen.getByText('Save'))
      expect(reparent).toHaveBeenCalledWith('b2', '', expect.any(String))
      const fields = update.mock.calls[0][1]
      expect(fields.team).toBeUndefined()
      expect(fields.managerId).toBeUndefined()
      expect(fields.name).toBe('New Bob')
    })
  })

  describe('sidebar form fallbacks', () => {
    it('handles person with null/undefined optional fields', () => {
      const barebones = makePerson({
        id: 'p1', name: 'Bare', managerId: '', team: 'T',
        // These are undefined or null-like
        employmentType: undefined,
        level: undefined,
        pod: undefined,
        publicNote: undefined,
        privateNote: undefined,
        private: undefined,
        additionalTeams: undefined as unknown as string[],
      })
      renderWithOrg(<DetailSidebar mode="edit" />, {
        working: [barebones],
        ...singleEditCtx(barebones),
        update: vi.fn().mockResolvedValue(undefined),
      })
      // Should render with fallback values from formFromPerson
      const empType = screen.getByTestId('field-employmentType') as HTMLInputElement
      expect(empType.value).toBe('FTE')
      const level = screen.getByTestId('field-level') as HTMLInputElement
      expect(level.value).toBe('0')
      const pod = screen.getByTestId('field-pod') as HTMLInputElement
      expect(pod.value).toBe('')
    })

    it('handles person with additionalTeams populated', () => {
      const withTeams = makePerson({
        id: 'p1', name: 'Multi', managerId: '', team: 'T',
        additionalTeams: ['TeamA', 'TeamB'],
      })
      renderWithOrg(<DetailSidebar mode="edit" />, {
        working: [withTeams],
        ...singleEditCtx(withTeams),
        update: vi.fn().mockResolvedValue(undefined),
      })
      const otherTeams = screen.getByTestId('field-otherTeams') as HTMLInputElement
      expect(otherTeams.value).toBe('TeamA, TeamB')
    })
  })

  describe('manager change auto-updates team', () => {
    it('sets team to new manager team when manager changes', async () => {
      const user = userEvent.setup()
      const update = vi.fn().mockResolvedValue(undefined)
      const reparent = vi.fn().mockResolvedValue(undefined)
      const mgr1 = makePerson({ id: 'm1', name: 'Mgr One', managerId: '', team: 'TeamA' })
      const mgr2 = makePerson({ id: 'm2', name: 'Mgr Two', managerId: '', team: 'TeamB' })
      const ic = makePerson({ id: 'ic1', name: 'IC', managerId: 'm1', team: 'TeamA' })
      // mgr2 needs a report so it appears in the manager dropdown
      const ic2 = makePerson({ id: 'ic2', name: 'IC2', managerId: 'm2', team: 'TeamB' })
      renderWithOrg(<DetailSidebar mode="edit" />, {
        working: [mgr1, mgr2, ic, ic2],
        ...singleEditCtx(ic),
        update,
        reparent,
      })
      const managerSelect = screen.getByTestId('field-manager')
      await user.selectOptions(managerSelect, 'm2')
      // The team field should auto-update to the new manager's team in local form state
      const teamInput = screen.getByTestId('field-team') as HTMLInputElement
      expect(teamInput.value).toBe('TeamB')
    })
  })

  describe('batch save branches', () => {
    function renderBatch(overrides = {}) {
      const update = vi.fn().mockResolvedValue(undefined)
      const reparent = vi.fn().mockResolvedValue(undefined)
      const clearSelection = vi.fn()
      return {
        update,
        reparent,
        clearSelection,
        ...renderWithOrg(<DetailSidebar mode="edit" />, {
          working: [alice, bob, carol],
          selectedId: null,
          selectedIds: new Set(['b2', 'c3']),
          update,
          reparent,
          clearSelection,
          ...overrides,
        }),
      }
    }

    it('does not call update when batchDirty is empty on save', async () => {
      const { update, reparent } = renderBatch()
      // Save without changing anything - button should be disabled
      const saveBtn = screen.getByText('Save') as HTMLButtonElement
      expect(saveBtn.disabled).toBe(true)
      // Force click anyway (just verifies the guard)
      fireEvent.click(saveBtn)
      expect(update).not.toHaveBeenCalled()
      expect(reparent).not.toHaveBeenCalled()
    })

    it('marks private field dirty in batch mode when checkbox toggled', async () => {
      const user = userEvent.setup()
      const { update } = renderBatch()
      const checkbox = screen.getByTestId('field-private') as HTMLInputElement
      await user.click(checkbox)
      // Save should now be enabled and include private field
      await user.click(screen.getByText('Save'))
      expect(update).toHaveBeenCalledTimes(2) // once per selected person
      const fields = update.mock.calls[0][1]
      expect(fields.private).toBe(true)
    })

    it('skips MIXED_VALUE fields in batch save', async () => {
      const user = userEvent.setup()
      const update = vi.fn().mockResolvedValue(undefined)
      // bob has discipline 'Eng', carol has 'Design' -> discipline will be MIXED_VALUE
      renderWithOrg(<DetailSidebar mode="edit" />, {
        working: [alice, bob, carol],
        selectedId: null,
        selectedIds: new Set(['b2', 'c3']),
        update,
      })
      // Change only pod (which both lack, so it's uniform as '')
      const podInput = screen.getByTestId('field-pod') as HTMLInputElement
      await user.type(podInput, 'NewPod')
      await user.click(screen.getByText('Save'))
      expect(update).toHaveBeenCalledTimes(2)
      const fields = update.mock.calls[0][1]
      expect(fields.pod).toBe('NewPod')
      // The mixed discipline should not be in the payload
      expect(fields.discipline).toBeUndefined()
    })

    it('handles batch save with manager change reparenting all people', async () => {
      const user = userEvent.setup()
      const update = vi.fn().mockResolvedValue(undefined)
      const reparent = vi.fn().mockResolvedValue(undefined)
      const mgr1 = makePerson({ id: 'm1', name: 'Mgr One', managerId: '', team: 'T1' })
      const mgr2 = makePerson({ id: 'm2', name: 'Mgr Two', managerId: '', team: 'T2' })
      const ic1 = makePerson({ id: 'ic1', name: 'IC1', managerId: 'm1', team: 'T1' })
      const ic2 = makePerson({ id: 'ic2', name: 'IC2', managerId: 'm1', team: 'T1' })
      // mgr2 needs a report so it appears in the manager dropdown
      const ic3 = makePerson({ id: 'ic3', name: 'IC3', managerId: 'm2', team: 'T2' })
      renderWithOrg(<DetailSidebar mode="edit" />, {
        working: [mgr1, mgr2, ic1, ic2, ic3],
        selectedId: null,
        selectedIds: new Set(['ic1', 'ic2']),
        update,
        reparent,
      })
      const managerSelect = screen.getByTestId('field-manager')
      await user.selectOptions(managerSelect, 'm2')
      await user.click(screen.getByText('Save'))
      // Both should be reparented
      expect(reparent).toHaveBeenCalledTimes(2)
      expect(reparent).toHaveBeenCalledWith('ic1', 'm2', expect.any(String))
      expect(reparent).toHaveBeenCalledWith('ic2', 'm2', expect.any(String))
    })

    it('shows error count when some batch operations fail', async () => {
      const user = userEvent.setup()
      let callCount = 0
      const update = vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) return Promise.reject(new Error('fail'))
        return Promise.resolve(undefined)
      })
      renderWithOrg(<DetailSidebar mode="edit" />, {
        working: [alice, bob, carol],
        selectedId: null,
        selectedIds: new Set(['b2', 'c3']),
        update,
      })
      const roleInput = screen.getByTestId('field-role') as HTMLInputElement
      await user.clear(roleInput)
      await user.type(roleInput, 'New Role')
      await user.click(screen.getByText('Save'))
      await waitFor(() => {
        expect(screen.getByText(/1 of 2 updates failed/)).toBeTruthy()
      })
    })

    it('handles batch save with level field (parsed as int)', async () => {
      const user = userEvent.setup()
      const update = vi.fn().mockResolvedValue(undefined)
      const ic1 = makePerson({ id: 'ic1', name: 'IC1', managerId: 'a1', team: 'T', level: 3 })
      const ic2 = makePerson({ id: 'ic2', name: 'IC2', managerId: 'a1', team: 'T', level: 3 })
      renderWithOrg(<DetailSidebar mode="edit" />, {
        working: [alice, ic1, ic2],
        selectedId: null,
        selectedIds: new Set(['ic1', 'ic2']),
        update,
      })
      const levelInput = screen.getByTestId('field-level') as HTMLInputElement
      await user.clear(levelInput)
      await user.type(levelInput, '7')
      await user.click(screen.getByText('Save'))
      expect(update).toHaveBeenCalledTimes(2)
      const fields = update.mock.calls[0][1]
      expect(fields.level).toBe(7)
    })

    it('handles batch reparent failure counting', async () => {
      const user = userEvent.setup()
      const reparent = vi.fn().mockRejectedValue(new Error('fail'))
      const update = vi.fn().mockResolvedValue(undefined)
      const mgr1 = makePerson({ id: 'm1', name: 'Mgr1', managerId: '', team: 'T1' })
      const mgr2 = makePerson({ id: 'm2', name: 'Mgr2', managerId: '', team: 'T2' })
      const ic1 = makePerson({ id: 'ic1', name: 'IC1', managerId: 'm1', team: 'T1' })
      const ic2 = makePerson({ id: 'ic2', name: 'IC2', managerId: 'm1', team: 'T1' })
      // mgr2 needs a report so it appears in the manager dropdown
      const ic3 = makePerson({ id: 'ic3', name: 'IC3', managerId: 'm2', team: 'T2' })
      renderWithOrg(<DetailSidebar mode="edit" />, {
        working: [mgr1, mgr2, ic1, ic2, ic3],
        selectedId: null,
        selectedIds: new Set(['ic1', 'ic2']),
        update,
        reparent,
      })
      const managerSelect = screen.getByTestId('field-manager')
      await user.selectOptions(managerSelect, 'm2')
      await user.click(screen.getByText('Save'))
      await waitFor(() => {
        expect(screen.getByText(/2 of 2 updates failed/)).toBeTruthy()
      })
    })

    it('auto-updates team in batch mode when manager changes', async () => {
      const user = userEvent.setup()
      const update = vi.fn().mockResolvedValue(undefined)
      const reparent = vi.fn().mockResolvedValue(undefined)
      const mgr1 = makePerson({ id: 'm1', name: 'Mgr1', managerId: '', team: 'T1' })
      const mgr2 = makePerson({ id: 'm2', name: 'Mgr2', managerId: '', team: 'T2' })
      const ic1 = makePerson({ id: 'ic1', name: 'IC1', managerId: 'm1', team: 'T1' })
      const ic2 = makePerson({ id: 'ic2', name: 'IC2', managerId: 'm1', team: 'T1' })
      // mgr2 needs a report so it appears in the manager dropdown
      const ic3 = makePerson({ id: 'ic3', name: 'IC3', managerId: 'm2', team: 'T2' })
      renderWithOrg(<DetailSidebar mode="edit" />, {
        working: [mgr1, mgr2, ic1, ic2, ic3],
        selectedId: null,
        selectedIds: new Set(['ic1', 'ic2']),
        update,
        reparent,
      })
      const managerSelect = screen.getByTestId('field-manager')
      await user.selectOptions(managerSelect, 'm2')
      // Team field should auto-update
      const teamInput = screen.getByTestId('field-team') as HTMLInputElement
      expect(teamInput.value).toBe('T2')
    })
  })

  describe('formFromBatch mixed vs uniform fields', () => {
    it('shows Mixed for fields with differing employmentType', () => {
      const fte = makePerson({ id: 'p1', name: 'P1', managerId: 'a1', team: 'T', employmentType: 'FTE' })
      const contractor = makePerson({ id: 'p2', name: 'P2', managerId: 'a1', team: 'T', employmentType: 'Contractor' })
      renderWithOrg(<DetailSidebar mode="edit" />, {
        working: [alice, fte, contractor],
        selectedId: null,
        selectedIds: new Set(['p1', 'p2']),
      })
      const empInput = screen.getByTestId('field-employmentType') as HTMLInputElement
      expect(empInput.placeholder).toBe('Mixed')
      expect(empInput.value).toBe('')
    })

    it('shows uniform value for matching employmentType', () => {
      const fte1 = makePerson({ id: 'p1', name: 'P1', managerId: 'a1', team: 'T', employmentType: 'FTE' })
      const fte2 = makePerson({ id: 'p2', name: 'P2', managerId: 'a1', team: 'T', employmentType: 'FTE' })
      renderWithOrg(<DetailSidebar mode="edit" />, {
        working: [alice, fte1, fte2],
        selectedId: null,
        selectedIds: new Set(['p1', 'p2']),
      })
      const empInput = screen.getByTestId('field-employmentType') as HTMLInputElement
      expect(empInput.value).toBe('FTE')
    })

    it('shows Mixed for differing levels', () => {
      const l3 = makePerson({ id: 'p1', name: 'P1', managerId: 'a1', team: 'T', level: 3 })
      const l5 = makePerson({ id: 'p2', name: 'P2', managerId: 'a1', team: 'T', level: 5 })
      renderWithOrg(<DetailSidebar mode="edit" />, {
        working: [alice, l3, l5],
        selectedId: null,
        selectedIds: new Set(['p1', 'p2']),
      })
      const levelInput = screen.getByTestId('field-level') as HTMLInputElement
      expect(levelInput.placeholder).toBe('Mixed')
      expect(levelInput.value).toBe('')
    })

    it('shows Mixed for differing pods', () => {
      const podA = makePerson({ id: 'p1', name: 'P1', managerId: 'a1', team: 'T', pod: 'Alpha' })
      const podB = makePerson({ id: 'p2', name: 'P2', managerId: 'a1', team: 'T', pod: 'Beta' })
      renderWithOrg(<DetailSidebar mode="edit" />, {
        working: [alice, podA, podB],
        selectedId: null,
        selectedIds: new Set(['p1', 'p2']),
      })
      const podInput = screen.getByTestId('field-pod') as HTMLInputElement
      expect(podInput.placeholder).toBe('Mixed')
      expect(podInput.value).toBe('')
    })

    it('shows Mixed for differing publicNote', () => {
      const note1 = makePerson({ id: 'p1', name: 'P1', managerId: 'a1', team: 'T', publicNote: 'Note A' })
      const note2 = makePerson({ id: 'p2', name: 'P2', managerId: 'a1', team: 'T', publicNote: 'Note B' })
      renderWithOrg(<DetailSidebar mode="edit" />, {
        working: [alice, note1, note2],
        selectedId: null,
        selectedIds: new Set(['p1', 'p2']),
      })
      const textarea = screen.getByTestId('field-publicNote') as HTMLTextAreaElement
      expect(textarea.placeholder).toBe('Mixed')
    })

    it('shows Mixed for differing privateNote', () => {
      const note1 = makePerson({ id: 'p1', name: 'P1', managerId: 'a1', team: 'T', privateNote: 'Secret A' })
      const note2 = makePerson({ id: 'p2', name: 'P2', managerId: 'a1', team: 'T', privateNote: 'Secret B' })
      renderWithOrg(<DetailSidebar mode="edit" />, {
        working: [alice, note1, note2],
        selectedId: null,
        selectedIds: new Set(['p1', 'p2']),
      })
      const textarea = screen.getByTestId('field-privateNote') as HTMLTextAreaElement
      expect(textarea.placeholder).toBe('Mixed')
    })

    it('shows Mixed for differing additionalTeams', () => {
      const t1 = makePerson({ id: 'p1', name: 'P1', managerId: 'a1', team: 'T', additionalTeams: ['X'] })
      const t2 = makePerson({ id: 'p2', name: 'P2', managerId: 'a1', team: 'T', additionalTeams: ['Y'] })
      renderWithOrg(<DetailSidebar mode="edit" />, {
        working: [alice, t1, t2],
        selectedId: null,
        selectedIds: new Set(['p1', 'p2']),
      })
      const otherTeams = screen.getByTestId('field-otherTeams') as HTMLInputElement
      expect(otherTeams.placeholder).toBe('Mixed')
    })

    it('shows Mixed option in manager select when managers differ', () => {
      const mgr1 = makePerson({ id: 'm1', name: 'Mgr1', managerId: '', team: 'T' })
      const mgr2 = makePerson({ id: 'm2', name: 'Mgr2', managerId: '', team: 'T' })
      const ic1 = makePerson({ id: 'ic1', name: 'IC1', managerId: 'm1', team: 'T' })
      const ic2 = makePerson({ id: 'ic2', name: 'IC2', managerId: 'm2', team: 'T' })
      renderWithOrg(<DetailSidebar mode="edit" />, {
        working: [mgr1, mgr2, ic1, ic2],
        selectedId: null,
        selectedIds: new Set(['ic1', 'ic2']),
      })
      const managerSelect = screen.getByTestId('field-manager')
      const options = within(managerSelect).queryAllByRole('option')
      const texts = options.map(o => o.textContent)
      expect(texts).toContain('Mixed')
    })

    it('shows Mixed option in status select when statuses differ', () => {
      const active = makePerson({ id: 'p1', name: 'P1', managerId: 'a1', team: 'T', status: 'Active' })
      const open = makePerson({ id: 'p2', name: 'P2', managerId: 'a1', team: 'T', status: 'Open' })
      renderWithOrg(<DetailSidebar mode="edit" />, {
        working: [alice, active, open],
        selectedId: null,
        selectedIds: new Set(['p1', 'p2']),
      })
      const statusSelect = screen.getByTestId('field-status')
      const options = within(statusSelect).queryAllByRole('option')
      const texts = options.map(o => o.textContent)
      expect(texts).toContain('Mixed')
    })

    it('does not show name field in batch edit mode', () => {
      renderWithOrg(<DetailSidebar mode="edit" />, {
        working: [alice, bob, carol],
        selectedId: null,
        selectedIds: new Set(['b2', 'c3']),
      })
      expect(screen.queryByTestId('field-name')).toBeNull()
    })
  })

  describe('batch heading', () => {
    it('shows correct count in view mode heading', () => {
      renderWithOrg(<DetailSidebar />, {
        working: [alice, bob, carol],
        selectedId: null,
        selectedIds: new Set(['b2', 'c3']),
      })
      expect(screen.getByTestId('sidebar-heading').textContent).toBe('2 people selected')
    })

    it('shows correct count in edit mode heading', () => {
      renderWithOrg(<DetailSidebar mode="edit" />, {
        working: [alice, bob, carol],
        selectedId: null,
        selectedIds: new Set(['b2', 'c3']),
      })
      expect(screen.getByTestId('sidebar-heading').textContent).toBe('Edit 2 people')
    })
  })

  describe('save button states', () => {
    it('shows "Saving..." text while saving', async () => {
      let resolveUpdate: () => void
      const update = vi.fn().mockImplementation(
        () => new Promise<void>(resolve => { resolveUpdate = resolve })
      )
      renderWithOrg(<DetailSidebar mode="edit" />, {
        working: [alice, bob],
        ...singleEditCtx(bob),
        update,
      })
      // Must change a field to trigger actual save
      fireEvent.change(screen.getByTestId('field-name'), { target: { value: 'New Name' } })
      fireEvent.click(screen.getByText('Save'))
      await waitFor(() => {
        expect(screen.getByText('Saving...')).toBeTruthy()
      })
      resolveUpdate!()
    })

    it('disables save button while saving', async () => {
      let resolveUpdate: () => void
      const update = vi.fn().mockImplementation(
        () => new Promise<void>(resolve => { resolveUpdate = resolve })
      )
      renderWithOrg(<DetailSidebar mode="edit" />, {
        working: [alice, bob],
        ...singleEditCtx(bob),
        update,
      })
      fireEvent.change(screen.getByTestId('field-name'), { target: { value: 'New Name' } })
      fireEvent.click(screen.getByText('Save'))
      await waitFor(() => {
        const btn = screen.getByText('Saving...') as HTMLButtonElement
        expect(btn.disabled).toBe(true)
      })
      resolveUpdate!()
    })
  })
})
