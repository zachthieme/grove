import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { fireEvent } from '@testing-library/dom'
import { useOutsideClick } from './useOutsideClick'
import { createRef } from 'react'

describe('useOutsideClick', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container)
    }
  })

  function setup(active: boolean = true) {
    container = document.createElement('div')
    document.body.appendChild(container)

    const ref = createRef<HTMLDivElement>()
    // Assign the container to the ref by rendering with the ref
    ;(ref as { current: HTMLDivElement }).current = container

    const callback = vi.fn()
    const hookResult = renderHook(() => useOutsideClick(ref, callback, active))

    return { ref, callback, hookResult }
  }

  it('calls callback on mousedown outside the ref element', () => {
    const { callback } = setup(true)

    // Click on the document body (outside the ref element)
    fireEvent.mouseDown(document.body)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('does not call callback on mousedown inside the ref element', () => {
    const { callback } = setup(true)

    // Click inside the container
    fireEvent.mouseDown(container)
    expect(callback).not.toHaveBeenCalled()
  })

  it('does not call callback on mousedown on a child of the ref element', () => {
    const { callback } = setup(true)

    const child = document.createElement('span')
    container.appendChild(child)

    fireEvent.mouseDown(child)
    expect(callback).not.toHaveBeenCalled()
  })

  it('does not call callback when not active', () => {
    const { callback } = setup(false)

    fireEvent.mouseDown(document.body)
    expect(callback).not.toHaveBeenCalled()
  })

  it('stops listening when unmounted', () => {
    const { callback, hookResult } = setup(true)

    hookResult.unmount()
    fireEvent.mouseDown(document.body)
    expect(callback).not.toHaveBeenCalled()
  })
})
