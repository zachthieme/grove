import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { SelectionProvider, useSelection } from './SelectionContext'
import type { OrgNode } from '../api/types'

const testPerson: OrgNode = {
  id: 'p1', name: 'Alice', role: 'Engineer', discipline: 'Eng',
  team: 'Core', managerId: '', status: 'Active', additionalTeams: [],
}

let captured: ReturnType<typeof useSelection> | null = null

function Harness() {
  captured = useSelection()
  return null
}

function renderWithProvider() {
  return render(<SelectionProvider><Harness /></SelectionProvider>)
}

afterEach(() => { captured = null; cleanup() })

describe('Interaction state integration', () => {
  it('[SELECT-002] full flow: idle → select → edit → commit → selected', () => {
    renderWithProvider()
    expect(captured!.interactionMode).toBe('idle')

    // Select
    act(() => captured!.toggleSelect('p1', false))
    expect(captured!.interactionMode).toBe('selected')
    expect(captured!.selectedId).toBe('p1')

    // Enter editing
    act(() => captured!.enterEditing(testPerson))
    expect(captured!.interactionMode).toBe('editing')
    expect(captured!.editBuffer).toEqual(expect.objectContaining({ name: 'Alice' }))

    // Modify
    act(() => captured!.updateBuffer('name', 'Bob'))
    expect(captured!.editBuffer!.name).toBe('Bob')

    // Commit
    let dirty: Record<string, string | boolean | number> | null = null
    act(() => { dirty = captured!.commitEdits() })
    expect(dirty).toEqual({ name: 'Bob' })
    expect(captured!.interactionMode).toBe('selected')
    expect(captured!.editBuffer).toBeNull()
  })

  it('[SELECT-002] full flow: editing → revert → selected (no changes)', () => {
    renderWithProvider()
    act(() => captured!.toggleSelect('p1', false))
    act(() => captured!.enterEditing(testPerson))
    act(() => captured!.updateBuffer('name', 'Bob'))

    // Revert
    act(() => captured!.revertEdits())
    expect(captured!.interactionMode).toBe('selected')
    expect(captured!.editBuffer).toBeNull()
  })

  it('[SELECT-002] selecting different person while editing commits and transitions', () => {
    renderWithProvider()
    act(() => captured!.toggleSelect('p1', false))
    act(() => captured!.enterEditing(testPerson))
    act(() => captured!.updateBuffer('role', 'Manager'))

    // Select different person — should commit and go to selected
    act(() => captured!.toggleSelect('p2', false))
    expect(captured!.interactionMode).toBe('selected')
    expect(captured!.selectedId).toBe('p2')
    expect(captured!.editBuffer).toBeNull()
  })

  it('[SELECT-002] clearSelection while editing commits and goes idle', () => {
    renderWithProvider()
    act(() => captured!.toggleSelect('p1', false))
    act(() => captured!.enterEditing(testPerson))

    act(() => captured!.clearSelection())
    expect(captured!.interactionMode).toBe('idle')
    expect(captured!.selectedIds.size).toBe(0)
  })
})
