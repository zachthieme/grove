import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { Person } from '../api/types'
import * as api from '../api/client'

type ViewMode = 'tree' | 'columns' | 'headcount'
type DataView = 'original' | 'working' | 'diff'

interface OrgState {
  original: Person[]
  working: Person[]
  loaded: boolean
  viewMode: ViewMode
  dataView: DataView
  selectedId: string | null
}

interface OrgActions {
  setViewMode: (mode: ViewMode) => void
  setDataView: (view: DataView) => void
  setSelectedId: (id: string | null) => void
  upload: (file: File) => Promise<void>
  move: (personId: string, newManagerId: string, newTeam: string) => Promise<void>
  update: (personId: string, fields: Record<string, string>) => Promise<void>
  add: (person: Omit<Person, 'id'>) => Promise<void>
  remove: (personId: string) => Promise<void>
}

type OrgContextValue = OrgState & OrgActions

const OrgContext = createContext<OrgContextValue | null>(null)

export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext)
  if (!ctx) {
    throw new Error('useOrg must be used within an OrgProvider')
  }
  return ctx
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OrgState>({
    original: [],
    working: [],
    loaded: false,
    viewMode: 'tree',
    dataView: 'working',
    selectedId: null,
  })

  // Try to load existing org data on mount
  useEffect(() => {
    api.getOrg().then((data) => {
      if (data) {
        setState((s) => ({
          ...s,
          original: data.original,
          working: data.working,
          loaded: true,
        }))
      }
    }).catch(() => {
      // No existing data — stay in upload state
    })
  }, [])

  const setViewMode = useCallback((viewMode: ViewMode) => {
    setState((s) => ({ ...s, viewMode }))
  }, [])

  const setDataView = useCallback((dataView: DataView) => {
    setState((s) => ({ ...s, dataView }))
  }, [])

  const setSelectedId = useCallback((selectedId: string | null) => {
    setState((s) => ({ ...s, selectedId }))
  }, [])

  const upload = useCallback(async (file: File) => {
    const data = await api.uploadFile(file)
    setState((s) => ({
      ...s,
      original: data.original,
      working: data.working,
      loaded: true,
    }))
  }, [])

  const move = useCallback(async (personId: string, newManagerId: string, newTeam: string) => {
    const working = await api.movePerson({ personId, newManagerId, newTeam })
    setState((s) => ({ ...s, working }))
  }, [])

  const update = useCallback(async (personId: string, fields: Record<string, string>) => {
    const working = await api.updatePerson({ personId, fields })
    setState((s) => ({ ...s, working }))
  }, [])

  const add = useCallback(async (person: Omit<Person, 'id'>) => {
    const working = await api.addPerson(person)
    setState((s) => ({ ...s, working }))
  }, [])

  const remove = useCallback(async (personId: string) => {
    const working = await api.deletePerson({ personId })
    setState((s) => ({ ...s, working }))
  }, [])

  const value: OrgContextValue = {
    ...state,
    setViewMode,
    setDataView,
    setSelectedId,
    upload,
    move,
    update,
    add,
    remove,
  }

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>
}
