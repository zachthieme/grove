# Issue Prioritization Plan

Prioritized execution order for the 20 open GitHub issues, based on dependency analysis.

## Wave 1: Concurrency bugs (independent, correctness-critical)

| # | Issue | Why now |
|---|-------|---------|
| 1 | **#107** — Upload/ConfirmMapping race (silent data loss) | Data loss bug. Backend-only, no dependencies. |
| 2 | **#108** — Snapshot persistence race (concurrent saves overwrite) | Data corruption bug. Backend-only, no dependencies. |

These are real correctness issues that don't touch any frontend refactors. Fix first so we're not building on a buggy foundation.

**Files:** `internal/api/service_import.go`, `internal/api/handlers.go`, `internal/api/snapshot_manager.go`

## Wave 2: Layout tree refactor (the critical path)

| # | Issue | Why this order |
|---|-------|----------------|
| 3 | **#100** — Decompose buildManagerLayout | **Foundation.** #101, #103, #104, #105 all modify this function. Decompose first so subsequent work is cleaner and less conflict-prone. |
| 4 | **#104** — Extract crossTeamICs from model | Natural companion to #100 — move this rendering concern out during decomposition. |
| 5 | **#101** — Rename/split PodGroupLayout | With buildManagerLayout decomposed, the semantic overload becomes clear and fixable. |
| 6 | **#105** — Fix orphan nodes dropped in ManagerView | Now that layout types are clean, ManagerView can render teamGroup/podGroup nodes properly. |
| 7 | **#103** — computeManagerEdges walks LayoutNodes | Depends on clean LayoutNode structure from #100+#101. Align ManagerView edge computation with ColumnView. |

This wave is the "layout/placement unification" refactor identified in the BaseNode hierarchy follow-up.

**Files:** `web/src/views/layoutTree.ts`, `web/src/views/ManagerView.tsx`, `web/src/views/ColumnView.tsx`, `web/src/views/shared.tsx`

## Wave 3: Pod/group interactions (blocked on Wave 2)

| # | Issue | Why this order |
|---|-------|----------------|
| 8 | **#97** — Collapsible pods (like teams) | Wire collapse state for pod groups. Needs ManagerView to render them (#105). |
| 9 | **#99** — Selection on GroupHeaderNode | Needs pod groups rendered in ManagerView. |
| 10 | **#98** — Drag on GroupHeaderNode | Needs both rendering (#105) and selection (#99) working. |

**Files:** `web/src/components/GroupHeaderNode.tsx`, `web/src/views/ManagerView.tsx`, `web/src/views/ColumnView.tsx`, `web/src/hooks/useDragDrop.ts`

## Wave 4: Context/prop drilling refactor (orthogonal to Waves 2-3)

| # | Issue | Why this order |
|---|-------|----------------|
| 11 | **#110** — Split ChartContext into micro-contexts | 32-property mega-context causing O(n) re-renders. Do before #102/#96 since they build on it. |
| 12 | **#102** — Extract usePersonNodeProps hook | Much cleaner after #110 splits the contexts. |
| 13 | **#96** — AppContent mega-destructure | Benefits from #110's split contexts. |

Could be parallelized with Wave 3 but sequencing avoids merge conflicts in shared view files.

**Files:** `web/src/views/ChartContext.tsx`, `web/src/views/ChartShell.tsx`, `web/src/components/PersonNode.tsx`, `web/src/components/GroupHeaderNode.tsx`, `App.tsx`

## Wave 5: Quick wins + infrastructure

| # | Issue | Why this order |
|---|-------|----------------|
| 14 | **#106** — Search navigates to person card | Independent, small UX fix. |
| 15 | **#112** — Consolidate ~/.grove paths, dedupe Person types | Cleanup. |
| 16 | **#113** — Autosave retry on server failure | Independent backend improvement. |
| 17 | **#111** — E2E upload-edit-autosave-snapshot flow | Good to add after bugs are fixed. |
| 18 | **#114** — Snapshot name validation + CSRF | Security hardening. |
| 19 | **#115** — A11y (keyboard nav, aria-live, form labels) | Larger effort, benefits from stable component tree. |
| 20 | **#109** — Virtualization for large orgs | Perf optimization — do last when architecture is stable. |

## Dependency graph

```
#107, #108 (independent, do first)

#100 (decompose buildManagerLayout)
  ├── #104 (crossTeamICs — do with #100)
  ├── #101 (PodGroupLayout — after #100)
  │     ├── #105 (orphan nodes — after #100+#101)
  │     │     ├── #97 (collapsible pods — after #105)
  │     │     ├── #99 (selection on GroupHeaderNode — after #105)
  │     │     │     └── #98 (drag on GroupHeaderNode — after #99)
  │     └── #103 (edges walk LayoutNodes — after #100+#101)

#110 (split ChartContext — independent)
  ├── #102 (usePersonNodeProps — after #110)
  └── #96 (AppContent destructure — after #110)

#106, #112, #113, #111, #114, #115, #109 (independent, low priority)
```

## Key rationale

- **Bugs before refactors.** #107/#108 are data-loss risks and touch no frontend code.
- **#100 is the bottleneck.** Five issues depend on decomposing buildManagerLayout.
- **Waves 2+3 are the layout unification** — the "unify scattered layout/placement logic" refactor planned after BaseNode hierarchy.
- **Wave 4 is orthogonal** to layout work. Could run in parallel with Wave 3.
- **Wave 5 is low-dependency** work that can be picked off opportunistically.
