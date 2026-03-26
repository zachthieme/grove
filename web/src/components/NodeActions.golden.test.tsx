import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { normalizeHTML } from '../test-helpers'
import NodeActions from './NodeActions'

function defaultProps(overrides: Partial<Parameters<typeof NodeActions>[0]> = {}) {
  return {
    showAdd: true,
    showInfo: false,
    showFocus: false,
    showEdit: true,
    showDelete: true,
    onAdd: vi.fn(),
    onDelete: vi.fn(),
    onEdit: vi.fn(),
    onInfo: vi.fn(),
    onFocus: undefined as ((e: React.MouseEvent) => void) | undefined,
    ...overrides,
  }
}

describe('NodeActions golden', () => {
  afterEach(() => cleanup())

  it('default: add, edit, delete visible', () => {
    const { container } = render(<NodeActions {...defaultProps()} />)
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/node-actions-default.golden')
  })

  it('showAdd=false hides add button', () => {
    const { container } = render(<NodeActions {...defaultProps({ showAdd: false })} />)
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/node-actions-no-add.golden')
  })

  it('showDelete=false hides delete button', () => {
    const { container } = render(<NodeActions {...defaultProps({ showDelete: false })} />)
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/node-actions-no-delete.golden')
  })

  it('showEdit=false hides edit button', () => {
    const { container } = render(<NodeActions {...defaultProps({ showEdit: false })} />)
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/node-actions-no-edit.golden')
  })

  it('showInfo=true shows info button', () => {
    const { container } = render(<NodeActions {...defaultProps({ showInfo: true })} />)
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/node-actions-with-info.golden')
  })

  it('showFocus=true with onFocus shows focus button', () => {
    const onFocus = vi.fn()
    const { container } = render(<NodeActions {...defaultProps({ showFocus: true, onFocus })} />)
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/node-actions-with-focus.golden')
  })

  it('showFocus=true without onFocus hides focus button', () => {
    const { container } = render(<NodeActions {...defaultProps({ showFocus: true, onFocus: undefined })} />)
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/node-actions-focus-no-handler.golden')
  })

  it('all buttons visible', () => {
    const onFocus = vi.fn()
    const { container } = render(
      <NodeActions {...defaultProps({ showInfo: true, showFocus: true, onFocus })} />
    )
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/node-actions-all-visible.golden')
  })
})
