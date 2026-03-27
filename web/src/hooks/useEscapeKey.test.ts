import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { fireEvent } from '@testing-library/dom'
import { useEscapeKey } from './useEscapeKey'

describe('useEscapeKey', () => {
  it('[SELECT-002] calls callback on Escape press when enabled', () => {
    const callback = vi.fn()
    renderHook(() => useEscapeKey(callback, true))

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('[SELECT-002] does not call callback on non-Escape key press', () => {
    const callback = vi.fn()
    renderHook(() => useEscapeKey(callback, true))

    fireEvent.keyDown(document, { key: 'Enter' })
    expect(callback).not.toHaveBeenCalled()
  })

  it('[SELECT-002] does not call callback when disabled', () => {
    const callback = vi.fn()
    renderHook(() => useEscapeKey(callback, false))

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(callback).not.toHaveBeenCalled()
  })

  it('[SELECT-002] does not call callback when focus is in an INPUT', () => {
    const callback = vi.fn()
    renderHook(() => useEscapeKey(callback, true))

    const input = document.createElement('input')
    document.body.appendChild(input)
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(callback).not.toHaveBeenCalled()
    document.body.removeChild(input)
  })

  it('[SELECT-002] does not call callback when focus is in a SELECT', () => {
    const callback = vi.fn()
    renderHook(() => useEscapeKey(callback, true))

    const select = document.createElement('select')
    document.body.appendChild(select)
    fireEvent.keyDown(select, { key: 'Escape' })
    expect(callback).not.toHaveBeenCalled()
    document.body.removeChild(select)
  })

  it('[SELECT-002] does not call callback when focus is in a TEXTAREA', () => {
    const callback = vi.fn()
    renderHook(() => useEscapeKey(callback, true))

    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)
    fireEvent.keyDown(textarea, { key: 'Escape' })
    expect(callback).not.toHaveBeenCalled()
    document.body.removeChild(textarea)
  })

  // Note: jsdom does not support isContentEditable, so we skip the
  // contentEditable guard test. The hook correctly checks el.isContentEditable
  // in real browsers.

  it('[SELECT-002] stops listening when unmounted', () => {
    const callback = vi.fn()
    const { unmount } = renderHook(() => useEscapeKey(callback, true))

    unmount()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(callback).not.toHaveBeenCalled()
  })
})
