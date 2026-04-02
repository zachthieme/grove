import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { SelectionProvider, useSelection } from './SelectionContext'

let captured: ReturnType<typeof useSelection> | null = null

function Harness() {
  captured = useSelection()
  return null
}

function renderWithProvider() {
  return render(
    <SelectionProvider>
      <Harness />
    </SelectionProvider>
  )
}

afterEach(() => {
  captured = null
  cleanup()
})

describe('SelectionContext', () => {
  it('[SELECT-001] toggleSelect(id, false) single select — selects one, replaces previous', () => {
    renderWithProvider()

    act(() => { captured!.toggleSelect('a1', false) })
    expect(captured!.selectedIds.has('a1')).toBe(true)
    expect(captured!.selectedId).toBe('a1')

    // Selecting a different id replaces the previous selection
    act(() => { captured!.toggleSelect('b2', false) })
    expect(captured!.selectedIds.has('b2')).toBe(true)
    expect(captured!.selectedIds.has('a1')).toBe(false)
    expect(captured!.selectedIds.size).toBe(1)
    expect(captured!.selectedId).toBe('b2')
  })

  it('[SELECT-001] toggleSelect(id, true) multi select — adds to existing selection', () => {
    renderWithProvider()

    act(() => { captured!.toggleSelect('a1', false) })
    act(() => { captured!.toggleSelect('b2', true) })

    expect(captured!.selectedIds.size).toBe(2)
    expect(captured!.selectedIds.has('a1')).toBe(true)
    expect(captured!.selectedIds.has('b2')).toBe(true)
  })

  it('[SELECT-001] toggleSelect same id twice with multi=true deselects', () => {
    renderWithProvider()

    act(() => { captured!.toggleSelect('a1', true) })
    expect(captured!.selectedIds.has('a1')).toBe(true)

    act(() => { captured!.toggleSelect('a1', true) })
    expect(captured!.selectedIds.has('a1')).toBe(false)
    expect(captured!.selectedIds.size).toBe(0)
  })

  it('[SELECT-001] clearSelection empties selectedIds', () => {
    renderWithProvider()

    act(() => { captured!.toggleSelect('a1', false) })
    act(() => { captured!.toggleSelect('b2', true) })
    expect(captured!.selectedIds.size).toBe(2)

    act(() => { captured!.clearSelection() })
    expect(captured!.selectedIds.size).toBe(0)
    expect(captured!.selectedId).toBeNull()
  })

  it('[SELECT-001] setSelectedId with pod collapseKey selects the pod and clears person selection', () => {
    renderWithProvider()

    // Select a person first
    act(() => { captured!.toggleSelect('a1', false) })
    expect(captured!.selectedIds.size).toBe(1)

    // Select a pod via collapseKey
    act(() => { captured!.setSelectedId('pod:m1:Alpha') })
    expect(captured!.selectedId).toBe('pod:m1:Alpha')
    expect(captured!.selectedIds.size).toBe(1)
    expect(captured!.selectedIds.has('pod:m1:Alpha')).toBe(true)
  })

  it('[SELECT-001] batchSelect sets exact set of IDs', () => {
    renderWithProvider()

    act(() => { captured!.batchSelect(new Set(['a1', 'b2', 'c3'])) })
    expect(captured!.selectedIds.size).toBe(3)
    expect(captured!.selectedIds.has('a1')).toBe(true)
    expect(captured!.selectedIds.has('b2')).toBe(true)
    expect(captured!.selectedIds.has('c3')).toBe(true)
  })

  it('[SELECT-001] batchSelect replaces previous pod collapseKey selection', () => {
    renderWithProvider()

    act(() => { captured!.setSelectedId('pod:m1:Alpha') })
    expect(captured!.selectedId).toBe('pod:m1:Alpha')

    act(() => { captured!.batchSelect(new Set(['a1'])) })
    expect(captured!.selectedIds.has('a1')).toBe(true)
    expect(captured!.selectedIds.has('pod:m1:Alpha')).toBe(false)
  })

  it('[SELECT-001] selectedId returns the single ID when exactly one selected, null otherwise', () => {
    renderWithProvider()

    // No selection
    expect(captured!.selectedId).toBeNull()

    // One selected
    act(() => { captured!.toggleSelect('a1', false) })
    expect(captured!.selectedId).toBe('a1')

    // Two selected — should be null
    act(() => { captured!.toggleSelect('b2', true) })
    expect(captured!.selectedId).toBeNull()

    // Back to one
    act(() => { captured!.toggleSelect('a1', true) })
    expect(captured!.selectedId).toBe('b2')
  })

  it('[SELECT-002] toggleSelect(id, false) on already-selected person is a no-op', () => {
    renderWithProvider()

    act(() => { captured!.toggleSelect('a1', false) })
    expect(captured!.selectedIds.has('a1')).toBe(true)

    // Clicking the same person again should NOT deselect
    act(() => { captured!.toggleSelect('a1', false) })
    expect(captured!.selectedIds.has('a1')).toBe(true)
    expect(captured!.selectedId).toBe('a1')
  })

  it('[SELECT-002] interaction mode starts as idle', () => {
    renderWithProvider()
    expect(captured!.interactionMode).toBe('idle')
  })

  it('[SELECT-002] selecting a person transitions interaction to selected', () => {
    renderWithProvider()
    act(() => { captured!.toggleSelect('a1', false) })
    expect(captured!.interactionMode).toBe('selected')
  })

  it('[SELECT-002] clearSelection transitions interaction to idle', () => {
    renderWithProvider()
    act(() => { captured!.toggleSelect('a1', false) })
    expect(captured!.interactionMode).toBe('selected')
    act(() => { captured!.clearSelection() })
    expect(captured!.interactionMode).toBe('idle')
  })

  it('[SELECT-001] useSelection throws when used outside provider', () => {
    function BadComponent() {
      useSelection()
      return null
    }

    expect(() => {
      render(<BadComponent />)
    }).toThrow('useSelection must be used within a SelectionProvider')
  })
})
