import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { fireEvent } from '@testing-library/dom'
import { useUnifiedEscape } from './useUnifiedEscape'

function makeActions(overrides: Partial<Parameters<typeof useUnifiedEscape>[0]> = {}) {
  return {
    infoPopoverOpen: false,
    onCloseInfoPopover: vi.fn(),
    cutActive: false,
    onCancelCut: vi.fn(),
    sidebarEditMode: false,
    onExitSidebarEdit: vi.fn(),
    hasSelection: false,
    onClearSelection: vi.fn(),
    hasHead: false,
    onClearHead: vi.fn(),
    enabled: true,
    ...overrides,
  }
}

describe('useUnifiedEscape', () => {
  it('[SELECT-002] fires only the highest-priority action', () => {
    const actions = makeActions({
      cutActive: true,
      hasSelection: true,
      hasHead: true,
    })
    renderHook(() => useUnifiedEscape(actions))
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(actions.onCancelCut).toHaveBeenCalledTimes(1)
    expect(actions.onClearSelection).not.toHaveBeenCalled()
    expect(actions.onClearHead).not.toHaveBeenCalled()
  })

  it('[SELECT-002] info popover has highest priority', () => {
    const actions = makeActions({
      infoPopoverOpen: true,
      cutActive: true,
      sidebarEditMode: true,
      hasSelection: true,
    })
    renderHook(() => useUnifiedEscape(actions))
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(actions.onCloseInfoPopover).toHaveBeenCalledTimes(1)
    expect(actions.onCancelCut).not.toHaveBeenCalled()
    expect(actions.onExitSidebarEdit).not.toHaveBeenCalled()
    expect(actions.onClearSelection).not.toHaveBeenCalled()
  })

  it('[SELECT-002] sidebar edit mode exits to view mode', () => {
    const actions = makeActions({
      sidebarEditMode: true,
      hasSelection: true,
    })
    renderHook(() => useUnifiedEscape(actions))
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(actions.onExitSidebarEdit).toHaveBeenCalledTimes(1)
    expect(actions.onClearSelection).not.toHaveBeenCalled()
  })

  it('[SELECT-002] clears selection when in view mode', () => {
    const actions = makeActions({ hasSelection: true, hasHead: true })
    renderHook(() => useUnifiedEscape(actions))
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(actions.onClearSelection).toHaveBeenCalledTimes(1)
    expect(actions.onClearHead).not.toHaveBeenCalled()
  })

  it('[SELECT-002] clears head when nothing else is active', () => {
    const actions = makeActions({ hasHead: true })
    renderHook(() => useUnifiedEscape(actions))
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(actions.onClearHead).toHaveBeenCalledTimes(1)
  })

  it('[SELECT-002] skips when focus is in an input', () => {
    const actions = makeActions({ hasSelection: true })
    renderHook(() => useUnifiedEscape(actions))

    const input = document.createElement('input')
    document.body.appendChild(input)
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(actions.onClearSelection).not.toHaveBeenCalled()
    document.body.removeChild(input)
  })

  it('[SELECT-002] does nothing when disabled', () => {
    const actions = makeActions({ hasSelection: true, enabled: false })
    renderHook(() => useUnifiedEscape(actions))
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(actions.onClearSelection).not.toHaveBeenCalled()
  })

  it('[SELECT-002] does not fire on non-Escape keys', () => {
    const actions = makeActions({ hasSelection: true })
    renderHook(() => useUnifiedEscape(actions))
    fireEvent.keyDown(document, { key: 'Enter' })

    expect(actions.onClearSelection).not.toHaveBeenCalled()
  })
})
