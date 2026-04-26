import { describe, it, expect } from 'vitest'
import type { OrgNode } from '../api/types'
import { applyUpdate, applyMove, applyReorder } from './optimistic'

const node = (id: string, fields: Partial<OrgNode> = {}): OrgNode => ({
  id,
  name: id,
  role: '',
  discipline: '',
  status: 'Active',
  managerId: '',
  team: '',
  additionalTeams: [],
  ...fields,
})

describe('applyUpdate', () => {
  it('patches matching node fields, leaves others untouched', () => {
    const nodes = [node('a', { name: 'Alice' }), node('b', { name: 'Bob' })]
    const out = applyUpdate(nodes, 'a', { name: 'Alicia' })
    expect(out).not.toBe(nodes)
    expect(out[0]).toEqual({ ...nodes[0], name: 'Alicia' })
    expect(out[1]).toBe(nodes[1])
  })
  it('returns same array reference when id not found', () => {
    const nodes = [node('a')]
    const out = applyUpdate(nodes, 'missing', { name: 'X' })
    expect(out).toBe(nodes)
  })
  it('parses comma-separated additionalTeams string into trimmed string[]', () => {
    const nodes = [node('a', { additionalTeams: ['Old'] })]
    const out = applyUpdate(nodes, 'a', { additionalTeams: 'Alpha, Beta ,, Gamma' })
    expect(out[0].additionalTeams).toEqual(['Alpha', 'Beta', 'Gamma'])
  })
})

describe('applyMove', () => {
  it('updates managerId and team on matching node', () => {
    const nodes = [node('a', { managerId: 'm1', team: 'T1' })]
    const out = applyMove(nodes, 'a', 'm2', 'T2')
    expect(out[0].managerId).toBe('m2')
    expect(out[0].team).toBe('T2')
    expect(out[0].pod).toBeUndefined()
  })
  it('sets pod when newPod provided', () => {
    const nodes = [node('a')]
    const out = applyMove(nodes, 'a', 'm1', 'T1', 'Pod1')
    expect(out[0].pod).toBe('Pod1')
  })
  it('clears pod when newPod is empty string', () => {
    const nodes = [node('a', { pod: 'Old' })]
    const out = applyMove(nodes, 'a', 'm1', 'T1', '')
    expect(out[0].pod).toBe('')
  })
  it('leaves pod untouched when newPod is undefined', () => {
    const nodes = [node('a', { pod: 'Keep' })]
    const out = applyMove(nodes, 'a', 'm1', 'T1', undefined)
    expect(out[0].pod).toBe('Keep')
  })
  it('returns same array reference when id not found', () => {
    const nodes = [node('a')]
    expect(applyMove(nodes, 'missing', 'm', 't')).toBe(nodes)
  })
})

describe('applyReorder', () => {
  it('sets sortIndex on each listed id matching its position; leaves others untouched', () => {
    const nodes = [
      node('a', { sortIndex: 99 }),
      node('b', { sortIndex: 99 }),
      node('c', { sortIndex: 99 }),
      node('d', { sortIndex: 99 }),
    ]
    const out = applyReorder(nodes, ['c', 'a'])
    // Slice order unchanged
    expect(out.map((n) => n.id)).toEqual(['a', 'b', 'c', 'd'])
    // 'c' got sortIndex 0 (position in personIds), 'a' got 1
    expect(out.find((n) => n.id === 'a')!.sortIndex).toBe(1)
    expect(out.find((n) => n.id === 'c')!.sortIndex).toBe(0)
    // 'b' and 'd' untouched
    expect(out.find((n) => n.id === 'b')).toBe(nodes[1])
    expect(out.find((n) => n.id === 'd')).toBe(nodes[3])
  })
  it('no-op when id list empty', () => {
    const nodes = [node('a'), node('b')]
    expect(applyReorder(nodes, [])).toBe(nodes)
  })
  it('ignores ids not present in nodes', () => {
    const nodes = [node('a', { sortIndex: 5 }), node('b', { sortIndex: 5 })]
    const out = applyReorder(nodes, ['ghost', 'a'])
    // 'ghost' skipped; 'a' gets position-in-filtered-list = 0
    expect(out.find((n) => n.id === 'a')!.sortIndex).toBe(0)
    expect(out.find((n) => n.id === 'b')!.sortIndex).toBe(5)
  })
})
