import type { ReactElement } from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import { OrgOverrideProvider } from './store/OrgContext'
import type { Person } from './api/types'
import type { OrgContextValue } from './store/orgTypes'

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

const noop = () => {}
const asyncNoop = async () => {}

export function makeOrgContext(overrides: Partial<OrgContextValue> = {}): OrgContextValue {
  return {
    original: [],
    working: [],
    recycled: [],
    pods: [],
    originalPods: [],
    settings: { disciplineOrder: [] },
    loaded: true,
    viewMode: 'detail',
    dataView: 'working',
    selectedIds: new Set(),
    selectedId: null,
    selectedPodId: null,
    hiddenEmploymentTypes: new Set(),
    headPersonId: null,
    binOpen: false,
    layoutKey: 0,
    pendingMapping: null,
    snapshots: [],
    currentSnapshotName: null,
    autosaveAvailable: null,
    error: null,
    showPrivate: false,
    setViewMode: noop,
    setDataView: noop,
    setSelectedId: noop,
    toggleSelect: noop,
    clearSelection: noop,
    upload: asyncNoop,
    move: asyncNoop,
    reparent: asyncNoop,
    reorder: asyncNoop,
    update: asyncNoop,
    add: asyncNoop,
    remove: asyncNoop,
    restore: asyncNoop,
    emptyBin: asyncNoop,
    setBinOpen: noop,
    confirmMapping: asyncNoop,
    cancelMapping: noop,
    reflow: noop,
    saveSnapshot: asyncNoop,
    loadSnapshot: asyncNoop,
    deleteSnapshot: asyncNoop,
    restoreAutosave: noop,
    dismissAutosave: asyncNoop,
    toggleEmploymentTypeFilter: noop,
    showAllEmploymentTypes: noop,
    hideAllEmploymentTypes: noop,
    setHead: noop,
    clearError: noop,
    setShowPrivate: noop,
    selectPod: noop,
    batchSelect: noop,
    updatePod: asyncNoop,
    createPod: asyncNoop,
    updateSettings: asyncNoop,
    ...overrides,
  }
}

/** Render a component wrapped in OrgOverrideProvider. */
export function renderWithOrg(
  ui: ReactElement,
  orgOverrides: Partial<OrgContextValue> = {},
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
