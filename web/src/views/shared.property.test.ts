import { describe, test, expect } from 'vitest'
import fc from 'fast-check'
import { buildOrgTree } from './shared'
import type { Person } from '../api/types'
import type { OrgNode } from './shared'

/** Recursively collect all Person objects from a tree of OrgNodes. */
function flattenTree(nodes: OrgNode[]): Person[] {
  const result: Person[] = []
  function walk(node: OrgNode) {
    result.push(node.person)
    for (const child of node.children) {
      walk(child)
    }
  }
  for (const root of nodes) {
    walk(root)
  }
  return result
}

/**
 * Compute the set of person IDs reachable from roots (acyclic chain to a root).
 * A root is a person with empty managerId or managerId not in the people set.
 * Reachable people are roots plus anyone whose manager chain leads to a root
 * without encountering a cycle.
 */
function computeReachableIds(people: Person[]): Set<string> {
  const idSet = new Set(people.map((p) => p.id))
  const byId = new Map(people.map((p) => [p.id, p]))
  const reachable = new Set<string>()
  const visiting = new Set<string>()
  const cache = new Map<string, boolean>()

  function isReachable(id: string): boolean {
    if (cache.has(id)) return cache.get(id)!
    if (visiting.has(id)) {
      // cycle detected
      cache.set(id, false)
      return false
    }
    const person = byId.get(id)
    if (!person) {
      cache.set(id, false)
      return false
    }
    // root node
    if (!person.managerId || !idSet.has(person.managerId)) {
      cache.set(id, true)
      return true
    }
    visiting.add(id)
    const result = isReachable(person.managerId)
    visiting.delete(id)
    cache.set(id, result)
    return result
  }

  for (const p of people) {
    if (isReachable(p.id)) {
      reachable.add(p.id)
    }
  }
  return reachable
}

/**
 * Generate an array of Person objects with unique IDs.
 * managerId may point to any other person or be empty, allowing cycles.
 */
function makePeopleArb(minSize: number, maxSize: number): fc.Arbitrary<Person[]> {
  return fc.integer({ min: minSize, max: maxSize }).chain((n) => {
    const ids = Array.from({ length: n }, (_, i) => `id-${i}`)
    const personArbs = ids.map((id, i) =>
      fc.record({
        id: fc.constant(id),
        name: fc.string({ minLength: 1, maxLength: 20 }),
        managerId:
          i === 0
            ? fc.constant('')
            : fc.oneof(
                fc.constant(''),
                fc.constantFrom(...ids.filter((x) => x !== id)),
              ),
        sortIndex: fc.option(fc.integer({ min: 0, max: 100 }), {
          nil: undefined,
        }),
      }),
    )
    return fc
      .tuple(...personArbs)
      .map((records) => records as unknown as Person[])
  })
}

/**
 * Generate an array of Person objects with unique IDs and no cycles.
 * Each person's managerId either is empty or points to a person with a lower index,
 * guaranteeing a DAG (and therefore no cycles).
 */
function makeAcyclicPeopleArb(minSize: number, maxSize: number): fc.Arbitrary<Person[]> {
  return fc.integer({ min: minSize, max: maxSize }).chain((n) => {
    const ids = Array.from({ length: n }, (_, i) => `id-${i}`)
    const personArbs = ids.map((id, i) =>
      fc.record({
        id: fc.constant(id),
        name: fc.string({ minLength: 1, maxLength: 20 }),
        managerId:
          i === 0
            ? fc.constant('')
            : fc.oneof(
                fc.constant(''),
                fc.constantFrom(...ids.slice(0, i)),
              ),
        sortIndex: fc.option(fc.integer({ min: 0, max: 100 }), {
          nil: undefined,
        }),
      }),
    )
    return fc
      .tuple(...personArbs)
      .map((records) => records as unknown as Person[])
  })
}

describe('buildOrgTree property-based tests', () => {
  test('every person appears exactly once in the tree (acyclic input)', () => {
    fc.assert(
      fc.property(makeAcyclicPeopleArb(1, 30), (people) => {
        const tree = buildOrgTree(people)
        const flat = flattenTree(tree)
        expect(flat).toHaveLength(people.length)
        const ids = flat.map((p) => p.id)
        expect(new Set(ids).size).toBe(people.length)
      }),
    )
  })

  test('output contains exactly the reachable (non-cyclic) people', () => {
    fc.assert(
      fc.property(makePeopleArb(1, 30), (people) => {
        const tree = buildOrgTree(people)
        const flat = flattenTree(tree)
        const outputIds = new Set(flat.map((p) => p.id))
        const expectedIds = computeReachableIds(people)
        expect(outputIds).toEqual(expectedIds)
      }),
    )
  })

  test('root nodes have no manager or an unresolvable manager', () => {
    fc.assert(
      fc.property(makePeopleArb(1, 30), (people) => {
        const tree = buildOrgTree(people)
        const idSet = new Set(people.map((p) => p.id))
        for (const root of tree) {
          const mid = root.person.managerId
          expect(!mid || !idSet.has(mid)).toBe(true)
        }
      }),
    )
  })

  test('parent-child relationships are correct', () => {
    fc.assert(
      fc.property(makePeopleArb(1, 30), (people) => {
        const tree = buildOrgTree(people)
        function check(node: OrgNode) {
          for (const child of node.children) {
            expect(child.person.managerId).toBe(node.person.id)
            check(child)
          }
        }
        for (const root of tree) {
          check(root)
        }
      }),
    )
  })

  test('empty input produces empty output', () => {
    const result = buildOrgTree([])
    expect(result).toEqual([])
  })

  test('single person is always a root with no children', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 10 }),
          name: fc.string({ minLength: 1, maxLength: 20 }),
          managerId: fc.constant(''),
          sortIndex: fc.option(fc.integer({ min: 0, max: 100 }), {
            nil: undefined,
          }),
        }),
        (person) => {
          const tree = buildOrgTree([person as unknown as Person])
          expect(tree).toHaveLength(1)
          expect(tree[0].person).toBe(person)
          expect(tree[0].children).toEqual([])
        },
      ),
    )
  })

  test('children are sorted by sortIndex (non-decreasing)', () => {
    fc.assert(
      fc.property(makePeopleArb(1, 30), (people) => {
        const tree = buildOrgTree(people)
        function check(node: OrgNode) {
          for (let i = 1; i < node.children.length; i++) {
            const prev = node.children[i - 1].person.sortIndex ?? 0
            const curr = node.children[i].person.sortIndex ?? 0
            expect(curr).toBeGreaterThanOrEqual(prev)
          }
          for (const child of node.children) {
            check(child)
          }
        }
        for (const root of tree) {
          check(root)
        }
      }),
    )
  })

  test('no duplicate IDs in output', () => {
    fc.assert(
      fc.property(makePeopleArb(1, 30), (people) => {
        const tree = buildOrgTree(people)
        const flat = flattenTree(tree)
        const ids = flat.map((p) => p.id)
        expect(new Set(ids).size).toBe(ids.length)
      }),
    )
  })
})
