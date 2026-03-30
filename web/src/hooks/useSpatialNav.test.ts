import { describe, it, expect } from 'vitest'
import { findSpatialNeighbor } from './useSpatialNav'

function rect(x: number, y: number, w = 100, h = 40): DOMRect {
  return { x, y, width: w, height: h, top: y, left: x, right: x + w, bottom: y + h, toJSON: () => ({}) } as DOMRect
}

describe('findSpatialNeighbor', () => {
  const nodes = new Map<string, DOMRect>([
    ['a', rect(0, 0)],
    ['b', rect(150, 0)],
    ['c', rect(0, 100)],
    ['d', rect(150, 100)],
  ])

  it('[VIM-001] h from top-right finds top-left', () => {
    expect(findSpatialNeighbor('b', nodes, 'h')).toBe('a')
  })

  it('[VIM-001] l from top-left finds top-right', () => {
    expect(findSpatialNeighbor('a', nodes, 'l')).toBe('b')
  })

  it('[VIM-001] j from top-left finds bottom-left', () => {
    expect(findSpatialNeighbor('a', nodes, 'j')).toBe('c')
  })

  it('[VIM-001] k from bottom-left finds top-left', () => {
    expect(findSpatialNeighbor('c', nodes, 'k')).toBe('a')
  })

  it('[VIM-001] returns null when no candidate in direction', () => {
    expect(findSpatialNeighbor('a', nodes, 'h')).toBeNull()
    expect(findSpatialNeighbor('a', nodes, 'k')).toBeNull()
  })

  it('[VIM-001] directional bias prefers primary axis', () => {
    expect(findSpatialNeighbor('d', nodes, 'h')).toBe('c')
  })

  it('[VIM-001] handles single node gracefully', () => {
    const single = new Map([['only', rect(0, 0)]])
    expect(findSpatialNeighbor('only', single, 'j')).toBeNull()
  })

  it('[VIM-001] handles unknown current id', () => {
    expect(findSpatialNeighbor('missing', nodes, 'j')).toBeNull()
  })

  it('[VIM-001] h prefers same-level node over closer diagonal node', () => {
    // Org chart scenario: manager at top-left, two ICs at bottom
    // From IC-right, h should go to IC-left (same level), not manager (closer diagonally)
    const orgNodes = new Map<string, DOMRect>([
      ['manager', rect(50, 0)],      // manager: top center
      ['ic-left', rect(0, 100)],     // IC: bottom left
      ['ic-right', rect(200, 100)],  // IC: bottom right
    ])
    // From ic-right, pressing h: manager is at (-150, -100), ic-left is at (-200, 0)
    // ic-left is same level (dy=0), manager is different level (dy=100)
    expect(findSpatialNeighbor('ic-right', orgNodes, 'h')).toBe('ic-left')
  })

  it('[VIM-001] l prefers same-level node over closer diagonal node', () => {
    const orgNodes = new Map<string, DOMRect>([
      ['manager', rect(150, 0)],
      ['ic-left', rect(0, 100)],
      ['ic-right', rect(200, 100)],
    ])
    expect(findSpatialNeighbor('ic-left', orgNodes, 'l')).toBe('ic-right')
  })

  it('[VIM-001] falls back to diagonal when no same-level candidates', () => {
    // Only candidate to the left is above
    const diag = new Map<string, DOMRect>([
      ['above-left', rect(0, 0)],
      ['current', rect(200, 100)],
    ])
    expect(findSpatialNeighbor('current', diag, 'h')).toBe('above-left')
  })
})
