import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { fireEvent } from '@testing-library/dom'
import { useVimNav } from './useVimNav'
import type { OrgNode } from '../api/types'

function makePerson(overrides: Partial<OrgNode> = {}): OrgNode {
  return {
    id: 'p1',
    name: 'Alice',
    role: 'Engineer',
    discipline: 'Engineering',
    managerId: '',
    team: 'Platform',
    additionalTeams: [],
    status: 'Active',
    ...overrides,
  }
}

function makeProduct(overrides: Partial<OrgNode> = {}): OrgNode {
  return {
    id: 'prod1',
    type: 'product',
    name: 'Widget',
    role: '',
    discipline: '',
    managerId: 'p1',
    team: 'Platform',
    additionalTeams: [],
    status: 'Active',
    ...overrides,
  }
}

describe('useVimNav', () => {
  it('[VIM-002] o on a product creates a sibling product (same parent + team + pod)', () => {
    const onAddReport = vi.fn()
    const onAddProduct = vi.fn()
    const alice = makePerson()
    const widget = makeProduct({ id: 'prod1', managerId: alice.id, team: 'Platform', pod: 'Alpha' })

    renderHook(() =>
      useVimNav({
        working: [alice, widget],
        pods: [],
        selectedId: widget.id,
        onAddReport,
        onAddProduct,
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'o' })

    expect(onAddProduct).toHaveBeenCalledTimes(1)
    expect(onAddProduct).toHaveBeenCalledWith(alice.id, 'Platform', 'Alpha')
    expect(onAddReport).not.toHaveBeenCalled()
  })

  it('[VIM-002] o on a person creates a report (legacy behavior)', () => {
    const onAddReport = vi.fn()
    const onAddProduct = vi.fn()
    const alice = makePerson({ id: 'p1' })

    renderHook(() =>
      useVimNav({
        working: [alice],
        pods: [],
        selectedId: alice.id,
        onAddReport,
        onAddProduct,
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'o' })

    expect(onAddReport).toHaveBeenCalledTimes(1)
    expect(onAddReport).toHaveBeenCalledWith(alice.id)
    expect(onAddProduct).not.toHaveBeenCalled()
  })
})
