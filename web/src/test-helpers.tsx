import type { ReactElement } from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import { OrgOverrideProvider } from './store/OrgContext'
import { ViewDataProvider } from './store/ViewDataContext'
import type { Person } from './api/types'
import { type PersonFormValues, personToForm } from './utils/personFormUtils'
import type { OrgDataStateValue, OrgMutationsValue, UIContextValue, SelectionContextValue } from './store/orgTypes'

type OrgTestContext = OrgDataStateValue & OrgMutationsValue & UIContextValue & SelectionContextValue

export function normalizeHTML(html: string): string {
  return html
    .replace(/\s*style="[^"]*"/g, '')
    .replace(/\s+/g, ' ')
    .replace(/> </g, '>\n<')
    .trim()
}

export function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: 'default-id',
    name: 'Default Person',
    role: 'Engineer',
    discipline: 'Engineering',
    managerId: '',
    team: 'Platform',
    additionalTeams: [],
    status: 'Active',
    ...overrides,
  }
}

/** Create a PersonFormValues from a Person for test assertions. */
export function makeEditBuffer(p: Person): PersonFormValues {
  return personToForm(p)
}

const noop = () => {}
const asyncNoop = async () => {}

export function makeOrgContext(overrides: Partial<OrgTestContext> = {}): OrgTestContext {
  return {
    // OrgData
    original: [],
    working: [],
    recycled: [],
    pods: [],
    originalPods: [],
    settings: { disciplineOrder: [] },
    loaded: true,
    pendingMapping: null,
    snapshots: [],
    currentSnapshotName: null,
    autosaveAvailable: null,
    upload: asyncNoop,
    createOrg: async () => undefined,
    move: asyncNoop,
    reparent: asyncNoop,
    reorder: asyncNoop,
    update: asyncNoop,
    add: asyncNoop,
    addParent: asyncNoop,
    remove: asyncNoop,
    restore: asyncNoop,
    emptyBin: asyncNoop,
    confirmMapping: asyncNoop,
    cancelMapping: noop,
    saveSnapshot: asyncNoop,
    loadSnapshot: asyncNoop,
    deleteSnapshot: asyncNoop,
    restoreAutosave: noop,
    dismissAutosave: asyncNoop,
    updatePod: asyncNoop,
    createPod: asyncNoop,
    updateSettings: asyncNoop,
    undo: noop,
    redo: noop,
    canUndo: false,
    canRedo: false,
    // UI
    viewMode: 'detail',
    dataView: 'working',
    hiddenEmploymentTypes: new Set(),
    headPersonId: null,
    binOpen: false,
    layoutKey: 0,
    error: null,
    showPrivate: false,
    setViewMode: noop,
    setDataView: noop,
    setBinOpen: noop,
    toggleEmploymentTypeFilter: noop,
    showAllEmploymentTypes: noop,
    hideAllEmploymentTypes: noop,
    setHead: noop,
    reflow: noop,
    setError: noop,
    clearError: noop,
    setShowPrivate: noop,
    // Selection
    selectedIds: new Set(),
    selectedId: null,
    selectedPodId: null,
    interactionMode: 'idle' as const,
    editBuffer: null,
    editingPersonId: null,
    setSelectedId: noop,
    toggleSelect: noop,
    clearSelection: noop,
    selectPod: noop,
    batchSelect: noop,
    enterEditing: noop,
    commitEdits: () => null,
    revertEdits: noop,
    updateBuffer: noop,
    ...overrides,
  }
}

/** Render a component wrapped in OrgOverrideProvider. */
export function renderWithOrg(
  ui: ReactElement,
  orgOverrides: Partial<OrgTestContext> = {},
  renderOptions?: RenderOptions,
) {
  const ctx = makeOrgContext(orgOverrides)
  return render(ui, {
    wrapper: ({ children }) => (
      <OrgOverrideProvider value={ctx}>{children}</OrgOverrideProvider>
    ),
    ...renderOptions,
  })
}

/** Render a component wrapped in OrgOverrideProvider + ViewDataProvider.
 *  Use this for components that consume usePeople/useChanges/useActions (ColumnView, ManagerView, TableView). */
export function renderWithViewData(
  ui: ReactElement,
  orgOverrides: Partial<OrgTestContext> = {},
  renderOptions?: RenderOptions,
) {
  const ctx = makeOrgContext(orgOverrides)
  return render(ui, {
    wrapper: ({ children }) => (
      <OrgOverrideProvider value={ctx}>
        <ViewDataProvider>{children}</ViewDataProvider>
      </OrgOverrideProvider>
    ),
    ...renderOptions,
  })
}
