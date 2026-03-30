import { useState, useCallback, useRef } from 'react'
import type { Person } from '../api/types'

export type InteractionMode = 'idle' | 'selected' | 'editing'

export interface EditBuffer {
  name: string
  role: string
  discipline: string
  team: string
  managerId: string
  status: string
  employmentType: string
  level: string
  pod: string
  publicNote: string
  privateNote: string
  private: boolean
  otherTeams: string
}

function bufferFromPerson(p: Person): EditBuffer {
  return {
    name: p.name,
    role: p.role,
    discipline: p.discipline,
    team: p.team,
    managerId: p.managerId,
    status: p.status,
    employmentType: p.employmentType || 'FTE',
    level: String(p.level ?? 0),
    pod: p.pod ?? '',
    publicNote: p.publicNote ?? '',
    privateNote: p.privateNote ?? '',
    private: p.private ?? false,
    otherTeams: (p.additionalTeams || []).join(', '),
  }
}

export function useInteractionState() {
  const [mode, setMode] = useState<InteractionMode>('idle')
  const [editBuffer, setEditBuffer] = useState<EditBuffer | null>(null)
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null)
  const originalRef = useRef<EditBuffer | null>(null)

  const enterSelected = useCallback(() => {
    setMode('selected')
    setEditBuffer(null)
    setEditingPersonId(null)
    originalRef.current = null
  }, [])

  const enterEditing = useCallback((person: Person) => {
    const buf = bufferFromPerson(person)
    setMode('editing')
    setEditBuffer(buf)
    setEditingPersonId(person.id)
    originalRef.current = { ...buf }
  }, [])

  const updateBuffer = useCallback((field: keyof EditBuffer, value: string | boolean) => {
    setEditBuffer(prev => prev ? { ...prev, [field]: value } : prev)
  }, [])

  const commitEdits = useCallback((): Record<string, string | boolean | number> | null => {
    const orig = originalRef.current
    const buf = editBuffer
    if (!orig || !buf) {
      setMode('selected')
      setEditBuffer(null)
      setEditingPersonId(null)
      originalRef.current = null
      return null
    }

    const dirty: Record<string, string | boolean | number> = {}
    for (const key of Object.keys(orig) as (keyof EditBuffer)[]) {
      if (buf[key] !== orig[key]) {
        dirty[key] = buf[key]
      }
    }

    setMode('selected')
    setEditBuffer(null)
    setEditingPersonId(null)
    originalRef.current = null

    return Object.keys(dirty).length > 0 ? dirty : null
  }, [editBuffer])

  const revertEdits = useCallback(() => {
    setMode('selected')
    setEditBuffer(null)
    setEditingPersonId(null)
    originalRef.current = null
  }, [])

  const exitToIdle = useCallback(() => {
    setMode('idle')
    setEditBuffer(null)
    setEditingPersonId(null)
    originalRef.current = null
  }, [])

  return {
    mode,
    editBuffer,
    editingPersonId,
    enterSelected,
    enterEditing,
    updateBuffer,
    commitEdits,
    revertEdits,
    exitToIdle,
  }
}
