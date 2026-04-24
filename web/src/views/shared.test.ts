import { describe, it, expect } from 'vitest'
import { buildOrgTree } from './shared'
import type { OrgNode } from '../api/types'

const makeNode = (overrides: Partial<OrgNode> & { id: string; name: string }): OrgNode => ({
  role: 'Engineer',
  discipline: 'Eng',
  managerId: '',
  team: 'Team A',
  additionalTeams: [],
  status: 'Active',
  ...overrides,
})

describe('buildOrgTree', () => {
  it('[VIEW-005] returns empty array for empty input', () => {
    expect(buildOrgTree([])).toEqual([])
  })

  it('[VIEW-005] returns single root with no children', () => {
    const people = [makeNode({ id: '1', name: 'Alice' })]
    const tree = buildOrgTree(people)
    expect(tree).toHaveLength(1)
    expect(tree[0].person.name).toBe('Alice')
    expect(tree[0].children).toHaveLength(0)
  })

  it('[VIEW-005] builds parent-child relationship', () => {
    const people = [
      makeNode({ id: '1', name: 'Alice' }),
      makeNode({ id: '2', name: 'Bob', managerId: '1' }),
    ]
    const tree = buildOrgTree(people)
    expect(tree).toHaveLength(1)
    expect(tree[0].person.name).toBe('Alice')
    expect(tree[0].children).toHaveLength(1)
    expect(tree[0].children[0].person.name).toBe('Bob')
  })

  it('[VIEW-005] handles multiple roots', () => {
    const people = [
      makeNode({ id: '1', name: 'Alice' }),
      makeNode({ id: '2', name: 'Bob' }),
    ]
    const tree = buildOrgTree(people)
    expect(tree).toHaveLength(2)
  })

  it('[VIEW-005] treats person with missing manager as root', () => {
    const people = [
      makeNode({ id: '1', name: 'Alice', managerId: 'nonexistent' }),
    ]
    const tree = buildOrgTree(people)
    expect(tree).toHaveLength(1)
    expect(tree[0].person.name).toBe('Alice')
  })

  it('[VIEW-005] sorts children by sortIndex', () => {
    const people = [
      makeNode({ id: '1', name: 'Alice' }),
      makeNode({ id: '2', name: 'Bob', managerId: '1', sortIndex: 2 }),
      makeNode({ id: '3', name: 'Carol', managerId: '1', sortIndex: 1 }),
    ]
    const tree = buildOrgTree(people)
    expect(tree[0].children[0].person.name).toBe('Carol')
    expect(tree[0].children[1].person.name).toBe('Bob')
  })

  it('[VIEW-005] builds deep nested tree', () => {
    const people = [
      makeNode({ id: '1', name: 'Alice' }),
      makeNode({ id: '2', name: 'Bob', managerId: '1' }),
      makeNode({ id: '3', name: 'Carol', managerId: '2' }),
    ]
    const tree = buildOrgTree(people)
    expect(tree).toHaveLength(1)
    expect(tree[0].children[0].children[0].person.name).toBe('Carol')
  })

  it('[VIEW-005] handles multiple children per manager', () => {
    const people = [
      makeNode({ id: '1', name: 'Alice' }),
      makeNode({ id: '2', name: 'Bob', managerId: '1' }),
      makeNode({ id: '3', name: 'Carol', managerId: '1' }),
      makeNode({ id: '4', name: 'Dave', managerId: '1' }),
    ]
    const tree = buildOrgTree(people)
    expect(tree[0].children).toHaveLength(3)
  })
})
