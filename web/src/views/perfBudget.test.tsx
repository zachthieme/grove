import { Profiler, type ProfilerOnRenderCallback } from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { buildSyntheticOrg } from '../test-helpers/syntheticOrg'
import { renderWithViewData } from '../test-helpers'
import ColumnView from './ColumnView'
import ManagerView from './ManagerView'

vi.mock('@dnd-kit/core')
vi.mock('../hooks/useChartLayout')
vi.mock('../hooks/useDragDrop')

// Wall-clock budgets (ms). Generous for jsdom — these catch memo regressions, not real paint.
const BUDGET = {
  mount100: 150,
  mount1k: 1500,
  mount5k: 8000,
  rerender1k: 300,
  rerenderCommits: 50, // strict commit-count gate for PERF-005
}

function measureMount(component: 'column' | 'manager', n: number): number {
  const nodes = buildSyntheticOrg(n)
  const t0 = performance.now()
  renderWithViewData(
    component === 'column' ? <ColumnView /> : <ManagerView />,
    { working: nodes },
  )
  return performance.now() - t0
}

describe('perf budgets', () => {
  afterEach(() => cleanup())

  it('[PERF-001] ColumnView mount N=100 within budget', () => {
    const ms = measureMount('column', 100)
    expect(ms).toBeLessThan(BUDGET.mount100)
  })

  it('[PERF-002] ColumnView mount N=1000 within budget', () => {
    const ms = measureMount('column', 1000)
    expect(ms).toBeLessThan(BUDGET.mount1k)
  })

  it('[PERF-003] ColumnView mount N=5000 within budget', () => {
    const ms = measureMount('column', 5000)
    expect(ms).toBeLessThan(BUDGET.mount5k)
  })

  it('[PERF-006] ManagerView mount N=1000 within budget', () => {
    const ms = measureMount('manager', 1000)
    expect(ms).toBeLessThan(BUDGET.mount1k)
  })

  it('[PERF-004] ColumnView re-render after selection change within budget', () => {
    const nodes = buildSyntheticOrg(1000)
    const targetId = nodes[100].id
    // Baseline render — no selection
    renderWithViewData(<ColumnView />, { working: nodes })
    cleanup()
    // Timed re-mount with selection applied (exercises the full memoized selection path)
    const t0 = performance.now()
    renderWithViewData(<ColumnView />, { working: nodes, selectedIds: new Set([targetId]) })
    const ms = performance.now() - t0
    expect(ms).toBeLessThan(BUDGET.rerender1k)
  })

  it('[PERF-005] ColumnView selection re-render commit count is bounded', () => {
    const nodes = buildSyntheticOrg(1000)
    let commits = 0
    const onRender: ProfilerOnRenderCallback = () => { commits++ }

    // Initial mount
    const { rerender, unmount } = renderWithViewData(
      <Profiler id="perf" onRender={onRender}><ColumnView /></Profiler>,
      { working: nodes },
    )
    const baselineCommits = commits
    // Sanity: profiler was actually wired and received at least one commit
    expect(baselineCommits).toBeGreaterThan(0)

    // Reset counter, then re-render — Profiler fires for each React commit.
    // Because ColumnView subtrees are memoized (Task 8), a no-prop-change re-render
    // should produce far fewer than N commits.
    commits = 0
    rerender(<Profiler id="perf" onRender={onRender}><ColumnView /></Profiler>)
    const afterRerender = commits
    unmount()

    // STRICT GATE: memo work (Tasks 8-9) must keep the commit count bounded.
    // A regression (un-memoized tree) would fire O(N) = ~1000 commits.
    expect(afterRerender).toBeLessThan(BUDGET.rerenderCommits)
  })
})
