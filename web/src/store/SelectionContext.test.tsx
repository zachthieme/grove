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
  it('toggleSelect(id, false) single select — selects one, replaces previous', () => {
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

  it('toggleSelect(id, true) multi select — adds to existing selection', () => {
    renderWithProvider()

    act(() => { captured!.toggleSelect('a1', false) })
    act(() => { captured!.toggleSelect('b2', true) })

    expect(captured!.selectedIds.size).toBe(2)
    expect(captured!.selectedIds.has('a1')).toBe(true)
    expect(captured!.selectedIds.has('b2')).toBe(true)
  })

  it('toggleSelect same id twice with multi=true deselects', () => {
    renderWithProvider()

    act(() => { captured!.toggleSelect('a1', true) })
    expect(captured!.selectedIds.has('a1')).toBe(true)

    act(() => { captured!.toggleSelect('a1', true) })
    expect(captured!.selectedIds.has('a1')).toBe(false)
    expect(captured!.selectedIds.size).toBe(0)
  })

  it('clearSelection empties selectedIds', () => {
    renderWithProvider()

    act(() => { captured!.toggleSelect('a1', false) })
    act(() => { captured!.toggleSelect('b2', true) })
    expect(captured!.selectedIds.size).toBe(2)

    act(() => { captured!.clearSelection() })
    expect(captured!.selectedIds.size).toBe(0)
    expect(captured!.selectedId).toBeNull()
  })

  it('selectPod sets pod id and clears person selection', () => {
    renderWithProvider()

    // Select a person first
    act(() => { captured!.toggleSelect('a1', false) })
    expect(captured!.selectedIds.size).toBe(1)

    // Select a pod
    act(() => { captured!.selectPod('pod-1') })
    expect(captured!.selectedPodId).toBe('pod-1')
    expect(captured!.selectedIds.size).toBe(0)
    expect(captured!.selectedId).toBeNull()
  })

  it('batchSelect sets exact set of IDs', () => {
    renderWithProvider()

    act(() => { captured!.batchSelect(new Set(['a1', 'b2', 'c3'])) })
    expect(captured!.selectedIds.size).toBe(3)
    expect(captured!.selectedIds.has('a1')).toBe(true)
    expect(captured!.selectedIds.has('b2')).toBe(true)
    expect(captured!.selectedIds.has('c3')).toBe(true)
    // Also clears pod selection
    expect(captured!.selectedPodId).toBeNull()
  })

  it('batchSelect clears previous pod selection', () => {
    renderWithProvider()

    act(() => { captured!.selectPod('pod-1') })
    expect(captured!.selectedPodId).toBe('pod-1')

    act(() => { captured!.batchSelect(new Set(['a1'])) })
    expect(captured!.selectedPodId).toBeNull()
    expect(captured!.selectedIds.has('a1')).toBe(true)
  })

  it('selectedId returns the single ID when exactly one selected, null otherwise', () => {
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

  it('useSelection throws when used outside provider', () => {
    function BadComponent() {
      useSelection()
      return null
    }

    expect(() => {
      render(<BadComponent />)
    }).toThrow('useSelection must be used within a SelectionProvider')
  })
})
