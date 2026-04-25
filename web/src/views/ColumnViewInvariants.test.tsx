// Render invariant: every node produced by the layout tree must materialize a
// `data-person-id` DOM element. Catches a "new layout variant added but no
// React component renders it" regression at unit-test time — one of the
// classes of bug the products feature shipped with.
//
// Gap: this does NOT catch the related "rendered but cardRef={setNodeRef(...)}
// was forgotten" failure mode (data-person-id exists, nodeRefs map doesn't).
// That requires either real layout/measurement (Playwright) or exposing
// nodeRefs through ChartContext for inspection. Documented in the principal
// review as a follow-up.
//
// This file purposefully does NOT mock useChartLayout so we exercise the real
// ref-registration path. It still mocks dnd-kit since drag wiring isn't under
// test here.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import ColumnView from './ColumnView'
import { computeLayoutTree, type LayoutNode } from './layoutTree'
import { buildOrgTree } from './shared'
import { makeNode, renderWithViewData } from '../test-helpers'
import type { OrgNode } from '../api/types'

vi.mock('@dnd-kit/core')
vi.mock('../hooks/useDragDrop')

// jsdom doesn't ship ResizeObserver; useChartLayout subscribes to one to
// recompute edge geometry on container resize. The invariant being tested
// here only cares about ref registration, so a no-op stub is fine.
class ResizeObserverStub {
  constructor(_cb: ResizeObserverCallback) {}
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver

afterEach(() => cleanup())

function collectLayoutIds(nodes: LayoutNode[], out: string[] = []): string[] {
  for (const n of nodes) {
    switch (n.type) {
      case 'manager':
        out.push(n.person.id)
        collectLayoutIds(n.children, out)
        break
      case 'ic':
        out.push(n.person.id)
        break
      case 'podGroup':
      case 'teamGroup':
        out.push(n.collapseKey)
        for (const m of n.members) out.push(m.person.id)
        break
      case 'productGroup':
        // productGroup renders header-less — no DOM node for its collapseKey.
        for (const m of n.members) out.push(m.person.id)
        break
      case 'product':
        out.push(n.person.id)
        break
    }
  }
  return out
}

describe('ColumnView render invariants', () => {
  it('every layout-tree node renders a data-person-id element', () => {
    const people: OrgNode[] = [
      makeNode({ id: 'mgr', name: 'Manager Alice' }),
      makeNode({ id: 'eng1', name: 'Eng Bob', managerId: 'mgr' }),
      makeNode({ id: 'eng2', name: 'Eng Carol', managerId: 'mgr', pod: 'Backend' }),
      makeNode({ id: 'eng3', name: 'Eng Dave', managerId: 'mgr', pod: 'Backend' }),
      makeNode({ id: 'prod1', name: 'Widget', managerId: 'mgr', type: 'product' }),
      makeNode({ id: 'prod2', name: 'Gadget', managerId: 'mgr', type: 'product' }),
    ]
    const { container } = renderWithViewData(<ColumnView />, { working: people, original: people, loaded: true })

    const layoutIds = collectLayoutIds(computeLayoutTree(buildOrgTree(people)))
    expect(layoutIds.length).toBeGreaterThan(0)

    const missing: string[] = []
    for (const id of layoutIds) {
      // IDs (UUIDs) and collapseKeys (e.g. "products:abc") have no quote chars,
      // so a plain quoted attribute selector is safe without CSS.escape.
      const el = container.querySelector(`[data-person-id="${id}"]`)
      if (!el) missing.push(id)
    }
    expect(missing, `layout nodes without DOM: ${missing.join(', ')}`).toEqual([])
  })
})
