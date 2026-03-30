import { describe, it, expect, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useInteractionState } from './useInteractionState'

afterEach(cleanup)

describe('useInteractionState', () => {
  it('[SELECT-002] starts in idle mode with empty edit buffer', () => {
    const { result } = renderHook(() => useInteractionState())
    expect(result.current.mode).toBe('idle')
    expect(result.current.editBuffer).toBeNull()
    expect(result.current.editingPersonId).toBeNull()
  })

  it('[SELECT-002] enterSelected transitions from idle to selected', () => {
    const { result } = renderHook(() => useInteractionState())
    act(() => result.current.enterSelected())
    expect(result.current.mode).toBe('selected')
    expect(result.current.editBuffer).toBeNull()
  })

  it('[SELECT-002] enterEditing transitions to editing with buffer from person data', () => {
    const { result } = renderHook(() => useInteractionState())
    const person = { id: 'p1', name: 'Alice', role: 'Eng', discipline: '', team: 'Core', managerId: '', status: 'Active' as const, additionalTeams: [] }
    act(() => result.current.enterEditing(person))
    expect(result.current.mode).toBe('editing')
    expect(result.current.editingPersonId).toBe('p1')
    expect(result.current.editBuffer).toEqual(expect.objectContaining({ name: 'Alice', role: 'Eng', team: 'Core' }))
  })

  it('[SELECT-002] updateBuffer updates a field in the edit buffer', () => {
    const { result } = renderHook(() => useInteractionState())
    const person = { id: 'p1', name: 'Alice', role: 'Eng', discipline: '', team: 'Core', managerId: '', status: 'Active' as const, additionalTeams: [] }
    act(() => result.current.enterEditing(person))
    act(() => result.current.updateBuffer('name', 'Bob'))
    expect(result.current.editBuffer!.name).toBe('Bob')
  })

  it('[SELECT-002] commitEdits returns dirty fields and transitions to selected', () => {
    const { result } = renderHook(() => useInteractionState())
    const person = { id: 'p1', name: 'Alice', role: 'Eng', discipline: '', team: 'Core', managerId: '', status: 'Active' as const, additionalTeams: [] }
    act(() => result.current.enterEditing(person))
    act(() => result.current.updateBuffer('name', 'Bob'))
    let dirty: Record<string, string | boolean | number> | null = null
    act(() => { dirty = result.current.commitEdits() })
    expect(dirty).toEqual({ name: 'Bob' })
    expect(result.current.mode).toBe('selected')
    expect(result.current.editBuffer).toBeNull()
  })

  it('[SELECT-002] commitEdits returns null when nothing changed', () => {
    const { result } = renderHook(() => useInteractionState())
    const person = { id: 'p1', name: 'Alice', role: 'Eng', discipline: '', team: 'Core', managerId: '', status: 'Active' as const, additionalTeams: [] }
    act(() => result.current.enterEditing(person))
    let dirty: Record<string, string | boolean | number> | null = null
    act(() => { dirty = result.current.commitEdits() })
    expect(dirty).toBeNull()
    expect(result.current.mode).toBe('selected')
  })

  it('[SELECT-002] revertEdits discards buffer and transitions to selected', () => {
    const { result } = renderHook(() => useInteractionState())
    const person = { id: 'p1', name: 'Alice', role: 'Eng', discipline: '', team: 'Core', managerId: '', status: 'Active' as const, additionalTeams: [] }
    act(() => result.current.enterEditing(person))
    act(() => result.current.updateBuffer('name', 'Bob'))
    act(() => result.current.revertEdits())
    expect(result.current.mode).toBe('selected')
    expect(result.current.editBuffer).toBeNull()
  })

  it('[SELECT-002] exitToIdle clears everything', () => {
    const { result } = renderHook(() => useInteractionState())
    const person = { id: 'p1', name: 'Alice', role: 'Eng', discipline: '', team: 'Core', managerId: '', status: 'Active' as const, additionalTeams: [] }
    act(() => result.current.enterEditing(person))
    act(() => result.current.updateBuffer('name', 'Bob'))
    act(() => result.current.exitToIdle())
    expect(result.current.mode).toBe('idle')
    expect(result.current.editBuffer).toBeNull()
    expect(result.current.editingPersonId).toBeNull()
  })
})
