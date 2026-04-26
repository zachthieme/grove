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

  it('[VIM-002] d on a multi-selection deletes every selected id', () => {
    const onDelete = vi.fn()
    const a = makePerson({ id: 'p1' })
    const b = makePerson({ id: 'p2', name: 'Bob' })
    const c = makePerson({ id: 'p3', name: 'Carol' })

    renderHook(() =>
      useVimNav({
        working: [a, b, c],
        pods: [],
        selectedId: null,                       // App sets selectedId=null when size>1
        selectedIds: new Set(['p1', 'p3']),
        onDelete,
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'd' })

    expect(onDelete).toHaveBeenCalledTimes(2)
    expect(onDelete).toHaveBeenCalledWith('p1')
    expect(onDelete).toHaveBeenCalledWith('p3')
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

  it('[VIM-003] P on a person creates a child product', () => {
    const onAddProduct = vi.fn()
    const alice = makePerson({ id: 'p1', team: 'Platform', pod: 'Alpha' })

    renderHook(() =>
      useVimNav({
        working: [alice],
        pods: [],
        selectedId: alice.id,
        onAddProduct,
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'P' })

    expect(onAddProduct).toHaveBeenCalledTimes(1)
    expect(onAddProduct).toHaveBeenCalledWith(alice.id, 'Platform', 'Alpha')
  })

  it('[VIM-003] P on a product creates a sibling product (no nesting)', () => {
    const onAddProduct = vi.fn()
    const alice = makePerson({ id: 'p1' })
    const widget = makeProduct({ id: 'prod1', managerId: alice.id, team: 'Platform', pod: 'Alpha' })

    renderHook(() =>
      useVimNav({
        working: [alice, widget],
        pods: [],
        selectedId: widget.id,
        onAddProduct,
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'P' })

    expect(onAddProduct).toHaveBeenCalledTimes(1)
    expect(onAddProduct).toHaveBeenCalledWith(alice.id, 'Platform', 'Alpha')
  })

  it('[VIM-002] o on a pod adds a person to that pod (regardless of pod size)', () => {
    const onAddReport = vi.fn()
    const onAddToTeam = vi.fn()
    const alice = makePerson({ id: 'p1' })
    // Two members already in the pod — earlier behavior no-op'd because resolvePersonIds returned 2.
    const ic1 = makePerson({ id: 'ic1', managerId: 'p1', team: 'Platform', pod: 'Alpha' })
    const ic2 = makePerson({ id: 'ic2', managerId: 'p1', team: 'Platform', pod: 'Alpha' })
    const pods = [{ id: 'pod-1', managerId: 'p1', name: 'Alpha', team: 'Platform', publicNote: '' } as never]

    renderHook(() =>
      useVimNav({
        working: [alice, ic1, ic2],
        pods,
        selectedId: 'pod:p1:Alpha',
        onAddReport,
        onAddToTeam,
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'o' })

    expect(onAddToTeam).toHaveBeenCalledTimes(1)
    expect(onAddToTeam).toHaveBeenCalledWith('p1', 'Platform', 'Alpha')
    expect(onAddReport).not.toHaveBeenCalled()
  })

  it('[VIM-003] P on a pod adds a product to that pod', () => {
    const onAddProduct = vi.fn()
    const alice = makePerson({ id: 'p1' })
    const pods = [{ id: 'pod-1', managerId: 'p1', name: 'Alpha', team: 'Platform', publicNote: '' } as never]

    renderHook(() =>
      useVimNav({
        working: [alice],
        pods,
        selectedId: 'pod:p1:Alpha',
        onAddProduct,
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'P' })

    expect(onAddProduct).toHaveBeenCalledTimes(1)
    expect(onAddProduct).toHaveBeenCalledWith('p1', 'Platform', 'Alpha')
  })
})
