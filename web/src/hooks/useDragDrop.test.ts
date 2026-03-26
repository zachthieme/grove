import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import React, { createElement } from 'react'
import { useDragDrop } from './useDragDrop'
import type { DragEndEvent } from '@dnd-kit/core'
import { TEAM_DROP_PREFIX, POD_DROP_PREFIX } from '../constants'
import { OrgOverrideProvider } from '../store/OrgContext'
import { makeOrgContext } from '../test-helpers'

const mockMove = vi.fn().mockResolvedValue(undefined)
const mockReparent = vi.fn().mockResolvedValue(undefined)
let mockSelectedIds = new Set<string>()
const mockPods = [
  { id: 'pod-1', name: 'Alpha', team: 'Platform', managerId: 'mgr-1', publicNote: '' },
  { id: 'pod-2', name: 'Beta', team: 'Infra', managerId: 'mgr-2', publicNote: '' },
]

function renderDragDrop(selectedIds?: Set<string>) {
  const ctx = makeOrgContext({
    move: mockMove,
    reparent: mockReparent,
    selectedIds: selectedIds ?? mockSelectedIds,
    pods: mockPods,
  })
  return renderHook(() => useDragDrop(), {
    wrapper: ({ children }: { children: React.ReactNode }) => createElement(OrgOverrideProvider, { value: ctx, children }),
  })
}

function makeDragEndEvent(activeId: string, overId: string | null): DragEndEvent {
  return {
    active: { id: activeId, data: { current: undefined }, rect: { current: { initial: null, translated: null } } },
    over: overId ? { id: overId, data: { current: undefined }, rect: { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }, disabled: false } : null,
    collisions: null,
    delta: { x: 0, y: 0 },
    activatorEvent: new Event('pointer'),
  } as unknown as DragEndEvent
}

describe('useDragDrop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSelectedIds = new Set<string>()
  })

  it('calls reparent when dropping a person onto another person', async () => {
    const { result } = renderDragDrop()

    await result.current.onDragEnd(makeDragEndEvent('person-1', 'person-2'))

    expect(mockReparent).toHaveBeenCalledTimes(1)
    expect(mockReparent).toHaveBeenCalledWith('person-1', 'person-2')
    expect(mockMove).not.toHaveBeenCalled()
  })

  it('calls move with team name when dropping onto a team drop target', async () => {
    const { result } = renderDragDrop()
    const teamTarget = `${TEAM_DROP_PREFIX}Engineering`

    await result.current.onDragEnd(makeDragEndEvent('person-1', teamTarget))

    expect(mockMove).toHaveBeenCalledTimes(1)
    expect(mockMove).toHaveBeenCalledWith('person-1', '', 'Engineering')
    expect(mockReparent).not.toHaveBeenCalled()
  })

  it('moves all selected people when dragged person is in selectedIds', async () => {
    const { result } = renderDragDrop(new Set(['person-1', 'person-2', 'person-3']))

    await result.current.onDragEnd(makeDragEndEvent('person-1', 'person-4'))

    expect(mockReparent).toHaveBeenCalledTimes(3)
    expect(mockReparent).toHaveBeenCalledWith('person-1', 'person-4')
    expect(mockReparent).toHaveBeenCalledWith('person-2', 'person-4')
    expect(mockReparent).toHaveBeenCalledWith('person-3', 'person-4')
  })

  it('excludes the drop target from multi-selection moves', async () => {
    const { result } = renderDragDrop(new Set(['person-1', 'person-2', 'person-3']))

    // Drop onto person-2 who is also in the selection
    await result.current.onDragEnd(makeDragEndEvent('person-1', 'person-2'))

    // person-2 should be excluded since it is the target
    const calledIds = mockReparent.mock.calls.map((c: unknown[]) => c[0])
    expect(calledIds).toContain('person-1')
    expect(calledIds).toContain('person-3')
    expect(calledIds).not.toContain('person-2')
    expect(mockReparent).toHaveBeenCalledTimes(2)
  })

  it('moves all selected people to team drop target', async () => {
    const { result } = renderDragDrop(new Set(['person-1', 'person-2']))
    const teamTarget = `${TEAM_DROP_PREFIX}Platform`

    await result.current.onDragEnd(makeDragEndEvent('person-1', teamTarget))

    expect(mockMove).toHaveBeenCalledTimes(2)
    expect(mockMove).toHaveBeenCalledWith('person-1', '', 'Platform')
    expect(mockMove).toHaveBeenCalledWith('person-2', '', 'Platform')
  })

  it('does nothing when there is no drop target', async () => {
    const { result } = renderDragDrop()

    await result.current.onDragEnd(makeDragEndEvent('person-1', null))

    expect(mockMove).not.toHaveBeenCalled()
    expect(mockReparent).not.toHaveBeenCalled()
  })

  it('does nothing when dropping onto self', async () => {
    const { result } = renderDragDrop()

    await result.current.onDragEnd(makeDragEndEvent('person-1', 'person-1'))

    expect(mockMove).not.toHaveBeenCalled()
    expect(mockReparent).not.toHaveBeenCalled()
  })

  it('moves only the dragged person when not in selectedIds', async () => {
    const { result } = renderDragDrop(new Set(['person-2', 'person-3']))

    // person-1 is not in the selection
    await result.current.onDragEnd(makeDragEndEvent('person-1', 'person-4'))

    expect(mockReparent).toHaveBeenCalledTimes(1)
    expect(mockReparent).toHaveBeenCalledWith('person-1', 'person-4')
  })

  it('calls move with pod manager and team when dropping onto a pod target', async () => {
    const { result } = renderDragDrop()
    const podTarget = `${POD_DROP_PREFIX}mgr-1:Alpha`

    await result.current.onDragEnd(makeDragEndEvent('person-1', podTarget))

    expect(mockMove).toHaveBeenCalledTimes(1)
    expect(mockMove).toHaveBeenCalledWith('person-1', 'mgr-1', 'Platform', undefined, 'Alpha')
    expect(mockReparent).not.toHaveBeenCalled()
  })

  it('moves all selected people to pod target', async () => {
    const { result } = renderDragDrop(new Set(['person-1', 'person-2']))
    const podTarget = `${POD_DROP_PREFIX}mgr-2:Beta`

    await result.current.onDragEnd(makeDragEndEvent('person-1', podTarget))

    expect(mockMove).toHaveBeenCalledTimes(2)
    expect(mockMove).toHaveBeenCalledWith('person-1', 'mgr-2', 'Infra', undefined, 'Beta')
    expect(mockMove).toHaveBeenCalledWith('person-2', 'mgr-2', 'Infra', undefined, 'Beta')
  })

  it('falls back to pod name as team when pod is not found', async () => {
    const { result } = renderDragDrop()
    const podTarget = `${POD_DROP_PREFIX}mgr-99:UnknownPod`

    await result.current.onDragEnd(makeDragEndEvent('person-1', podTarget))

    expect(mockMove).toHaveBeenCalledTimes(1)
    expect(mockMove).toHaveBeenCalledWith('person-1', 'mgr-99', 'UnknownPod', undefined, 'UnknownPod')
  })

  it('moves only dragged person when selectedIds has size 1', async () => {
    const { result } = renderDragDrop(new Set(['person-1']))

    await result.current.onDragEnd(makeDragEndEvent('person-1', 'person-2'))

    // size === 1 so multi-select path is not taken
    expect(mockReparent).toHaveBeenCalledTimes(1)
    expect(mockReparent).toHaveBeenCalledWith('person-1', 'person-2')
  })
})
