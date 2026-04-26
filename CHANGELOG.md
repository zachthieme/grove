# Changelog

## v0.14.0

### Breaking Changes
- **Vim `P` → `+` for add product**: The capital-P binding (paste-before in vim's mental model) is freed up; products are now added with bare `+`, mirroring the `+◆` button in the chart UI. [VIM-003]
- **Sidebar Esc commits instead of reverting**: Pressing Esc while editing in `NodeEditSidebar` now saves the form (via `update`) instead of silently reverting the in-progress changes — required for the rapid-add flow (`o → type → Esc → o`). [VIM-006]

### Major Features

#### Products as a first-class node type
- New `type: "person" | "product"` field on `OrgNode`. Products have distinct slate styling, separate group rendering (`ProductGroupLayout`), and are excluded from headcount, recruiting, span-of-control, and other person-only metrics.
- Type can be changed via the update API; switching to product clears person-only fields and revalidates status.
- Products nest inside pods as a side-by-side column next to the pod's people; pods containing only products still render with the pod label preserved.
- CSV import/export round-trips a `type` column (defaults to "person" when absent).
- Toolbar Filters dropdown gained a Products checkbox (PROD-012).
- `+◆` action on person/manager cards adds a product; vim `+` mirrors it. [PROD-001..016]

#### Vim mode — full keymap expansion
- **Rapid add**: After `o`/`O`/`+` creates a node, the new node auto-selects and the sidebar focuses the name input. Esc commits typed value; flow becomes `o → type → Esc → o → type`. [VIM-006]
- **Tree navigation**: `gg` jumps to root manager, `G` to deepest leaf in current subtree, `gp` to parent of selection (handles person ids and synthetic `pod:`/`team:`/`products:` keys). 500 ms two-key prefix. [VIM-008]
- **Sibling**: `a` appends a sibling at the current level (mirrors `o` sideways; products → sibling product). [VIM-007]
- **Undo/Redo**: bare `u` / `Ctrl+R` alongside the existing `Cmd+Z`/`Cmd+Shift+Z`. [VIM-009]
- **Focus subtree**: `f` sets head to selected person; Esc clears via the existing useUnifiedEscape priority chain. [VIM-010]
- **Toggle fold**: `za` collapses/expands the selected manager or pod. [VIM-011]
- **Yank + paste-as-copy**: `y` yanks selection (mutex with cut); `p` pastes — copies if yanked (via new copy-subtree endpoint), moves if cut. Yanked banner mirrors the cut banner. [VIM-012]
- **Visual mode**: `v` enters additive selection — motion keys add neighbors to `selectedIds` while keeping the anchor. Esc or `v` exits; selection persists. [VIM-013]
- **Cheat sheet**: `?` opens a modal listing every binding, grouped by category. [VIM-004]
- **Pod selection**: `o` on a pod now adds a person via `onAddToTeam` regardless of pod size; `+` on a pod adds a product into the pod. [VIM-002, VIM-003]
- **Multi-select ops**: `d`/`x`/`y` apply to all selected when `selectedIds.size > 1`.

#### Backend: copy-subtree endpoint
- New `POST /api/people/copy-subtree` and `OrgService.CopySubtree(rootIds, targetParentId)`. Walks each root's descendants, generates fresh UUIDs, remaps internal manager edges, duplicates pods owned by copied managers. Returns `idMap` (oldId → newId) so the client can locate the new copies. [ORG-020]

#### Frontend optimistic mutations
- `move`, `reparent`, `reorder`, and `update` now apply an optimistic patch synchronously; failures revert from a pre-mutation snapshot and surface the error. Single `dispatch` helper in `useOrgMutations.ts` replaces per-mutation try/catch boilerplate.

#### Performance optimizations
- ColumnView and ManagerView subtrees are now memo-ed; per-id selector hooks (`useIsSelected`, `useIsCollapsed`) prevent whole-tree re-renders on per-node state changes. ChartActions deps stabilized for memo-friendliness.
- E2E performance budget tests (`web/e2e/performance.spec.ts`) and a `buildSyntheticOrg` fixture for repeatable timing baselines. [PERF-001..006]

### Bug Fixes
- **Pod header count excludes products** (PROD-016): pod cards previously showed `members.length + products.length` under a "people" label; now shows only people, hides the line entirely for product-only pods.
- **SelectionPruner preserves synthetic group keys** (SELECT-007): pod/team/products collapseKeys are no longer pruned from `selectedIds` on every working update. Fixes a subtle race where vim actions would clear pod selections.
- **Vim `d`/`x` on multi-selection**: previously no-op'd when `selectedId` was null; now applies to every id in `selectedIds`.
- **Vim `o` on pod**: now correctly adds a person via `onAddToTeam` (works for any pod size, not just single-member pods).
- **Vim `o` on a product**: creates a sibling product instead of a child (products can't have reports).
- **Persist node type changes**: type changes now flow through the update API.
- **ColumnView edges to product groups**: edges now draw to product clusters under managers.
- **InferMapping**: rejects duplicate header values instead of silently overwriting.
- **Chart edges**: anchor to the bottom of expanded card+notes, not just the card.
- **`getConfig` failure**: warns instead of silently swallowing.
- **Telemetry drop counter**: replaces silent `log POST` catch with a counter so dropped events are observable.
- **Pre-existing e2e gaps** closed (3 specs); sidebar Delete button scoped to disambiguate from card hover action.

### Refactoring
- **`internal/api` split into 7 packages**: `apitypes`, `logbuf`, `autosave`, `pod`, `snapshot`, `org`, `httpapi`. Strict downward dependencies, no cycles. [Design doc in `docs/design/`]
- **SnapshotService extracted from OrgService**: own `sync.RWMutex`, no nested locks. Snapshot saves now run concurrently with org edits. Epoch counter (`snapshot.ConflictError`) guards against `Reset`/`Create`/`Upload` racing with in-flight saves. [SNAP-010, SNAP-011]
- **`layoutTree.ts` split** (365L → 5 helpers): `layoutAffinity`, `layoutICs`, `layoutOrphans`, `layoutTypes`, with `layoutTree` as the composing entry point.
- **`api/client.ts` split** (549L by resource): `core`, `org`, `imports`, `pods`, `snapshots`, `autosave`, `settings`, `logs`. Public barrel re-exports.
- **`httpapi/handlers.go` split by resource**: `handlers_org.go`, `handlers_pod.go`, `handlers_snapshot.go`, `handlers_import.go`, `handlers_settings.go`, `autosave_handlers.go`. Shared helpers (`jsonHandlerCtx`, etc.) stay in `handlers.go`.

### Testing
- **Property-based tests** for org service via `pgregory.net/rapid`.
- **Mutation testing** via `gremlins` in nightly CI.
- **Per-package coverage floors** enforced by `make coverage-check` (httpapi 85, pod 95, model 90, org 80, snapshot 80, parser 80, autosave 60, logbuf 70).
- **Pod manager** test coverage: 55% → 99%.
- **Snapshot** concurrent + error-path coverage: → 84%, including epoch-guard race tests.
- **apitypes** JSON round-trip coverage for all DTOs.
- **Flake detector** weekly cron (Go ×10, frontend ×5).

### Build / CI
- **Lefthook** pre-commit hooks (`lefthook.yml`).
- **golangci-lint v2** pin with explicit `.golangci.yml` config.
- **TS type codegen via tygo**: `web/src/api/types.generated.ts` is generated from `internal/apitypes/types.go`. CI guards staleness with `make types-gen-check`.
- **`make ci`** is the canonical pre-tag gate (typecheck, lint, test-all, e2e, bench, fuzz, check-scenarios).

### UX / Accessibility
- **Distinct color** for product nodes and product group header (slate vs green).
- **Vim cheat sheet** (`?`) — fully discoverable from Settings; `aria-modal="true"` dialog with Esc/click-outside dismissal.
- **Tour**: added Products step.
- **TableView**: Type column + filter fix for managers that exist only in original.

---

## v0.13.0

### Breaking Changes
- **Sidebar always editable**: Removed the view/edit toggle — selecting a person, batch, or pod immediately shows the editable form. `PersonViewSidebar` and `BatchViewSidebar` removed.
- **Unified selection model**: Removed `selectedPodId`/`selectPod`/`onPodSelect` — all nodes (person, pod, team group) use `selectedIds` with collapseKeys. One selection path for everything.

### Features
- **Unified node behavior**: All nodes on screen (person, manager, pod group, team group, orphan group) share identical selection, vim navigation, cut/paste, and drag-and-drop behavior
- **Pod search**: Search bar now includes pod groups alongside people, showing "Pod · TeamName" in results
- **Vim cut/paste for groups**: Cutting a pod or team group cuts all members; pasting moves them to the target via shared `moveToTarget()` utility (same code path as drag-and-drop)
- **Sidebar keyboard navigation**: Tab focuses the sidebar from the chart; Esc or Shift+Tab from first field reverts changes and returns to chart navigation; Cmd+S / Ctrl+S saves — works in all sidebars (person, batch, pod) regardless of vim mode
- **Vim `i` enters sidebar**: Pressing `i` in vim mode focuses the sidebar's first input field
- **Search blur on select**: Selecting a search result blurs the input so vim navigation works immediately

### Refactoring
- **Person type deduplication** (#112): Extracted `model.PersonFields` with 16 shared fields — embedded in both `model.Person` and `api.Person`. Adding a new person field is now a one-place change.
- **Shared `moveToTarget()`**: Drag-and-drop and vim cut/paste share the same target resolution logic (person, pod, team, orphan targets)
- **Shared `SidebarShell`**: All sidebars (person, batch, pod) use `SidebarShell` for consistent keyboard handling (Tab/Esc/Shift+Tab/Cmd+S)
- **Generic drag overlay**: `DragBadgeOverlay` clones the visual content of any dragged node from the DOM — no type-specific rendering
- **Removed `vimAddReport` duplication**: Vim nav uses `handleAddReport` from `ViewDataContext` instead of reimplementing it
- **Lasso skip unified**: Lasso selection skips all group nodes uniformly (`id.includes(':')`) instead of only pods

### Accessibility
- **Form labels** (#115): All 13 PersonForm fields have `htmlFor`/`id` associations for screen readers
- **aria-live on save status**: Save buttons in all sidebars have `aria-live="polite"`; save errors have `role="alert"`

---

## v0.12.0

### Bug Fixes
- **Upload/ConfirmMapping race** (#107): Added epoch counter to detect when a concurrent upload supersedes pending data — ConfirmMapping returns 409 conflict instead of silently losing the second upload
- **Snapshot persistence race** (#108): Moved snapshot persistence inside OrgService mutex so concurrent saves can't overwrite each other on disk; removed CopyAll/PersistCopy pattern
- **ManagerView orphan nodes** (#105): ManagerView now renders teamGroup and podGroup nodes instead of silently dropping them
- **Search navigation** (#106): Search result selection scrolls to person card by stable UUID instead of name, fixing duplicate-name lookup failures
- **Autosave retry** (#113): Server autosave failures now retry 3 times with exponential backoff (1s/2s/4s) instead of fire-and-forget

### Features
- **Pod/group selection** (#99): Pod and team group headers highlight when selected, with `selectedPodId` threaded through ChartContext
- **Group drag** (#98): Dragging a pod or team group header bulk-moves all members via `dragData.memberIds`
- **usePersonNodeProps hook** (#102): Centralized ChartContext-to-PersonNode prop mapping — ColumnView LayoutSubtree destructure reduced from 23 to 7 properties
- **Arrow key navigation** (#115): Arrow keys (Up/Down/Left/Right) work as aliases for vim navigation (k/j/h/l)
- **Ctrl+A select-all** (#115): Ctrl+A / Cmd+A selects all visible people
- **Keyboard drag-drop** (#115): Enabled dnd-kit KeyboardSensor — Space to pick up, arrow keys to move, Space to drop, Escape to cancel

### Security
- **Snapshot name validation** (#114): Names validated against `^[a-zA-Z0-9][a-zA-Z0-9 _\-\.]*$`, max 100 characters, rejects empty/path-traversal strings
- **CSRF protection** (#114): All POST/DELETE endpoints require `X-Requested-With: XMLHttpRequest` header; frontend API client sends it automatically

### Performance
- **TableView virtualization** (#109): Rows rendered with `@tanstack/react-virtual` — scales to 5000+ rows with overscan of 20
- **Edge culling** (#109): SVG edge lines skip computation for edges where both endpoints are off-screen; moved from `useLayoutEffect` to `useEffect` (non-blocking)
- **React.memo audit** (#109): Memoized ICNode, LayoutTeamGroup, ManagerLayoutSubtree, GroupHeaderNode to prevent unnecessary re-renders

### Refactoring
- **Layout tree pipeline** (#100): Decomposed 120-line `buildManagerLayout` into `classifyICs` and `groupUnaffiliated` sub-functions
- **crossTeamICs removed** (#104): Removed `crossTeamICs` field from `ManagerLayout` — views derive cross-team ICs from children array by `affiliation`
- **PodGroupLayout semantics** (#101): `PodGroupLayout` only created for actual pods; team groups use `TeamGroupLayout` with `team:{managerId}:{name}` collapse keys
- **LayoutNode edges** (#103): ManagerView `computeManagerEdges` walks `LayoutNode` trees instead of `OrgNode` trees
- **Consolidated storage paths** (#112): Extracted shared `groveDir()` function replacing duplicate `~/.grove` path computation in snapshot_store.go and autosave.go

### Accessibility
- **aria-live** (#115): Added `role="alert"` to cut notification banner; added `aria-label` to AutosaveBanner and DetailSidebar action buttons
- **Shift+Tab** (#115): Reverse field cycling in PersonNode edit mode (name ← team ← role ← name)

### Testing
- **E2E integration flow** (#111): Playwright test chaining upload → edit → autosave → snapshot → restore in a single continuous flow
- **Concurrency scenarios**: CONC-004 (epoch race), CONC-005 (concurrent snapshot saves)
- **Security scenarios**: SNAP-009 (name validation), SEC-001 (CSRF protection)

### Closed (already resolved)
- **Collapsible pods** (#97): Already working via BaseNode collapse toggle wired through GroupHeaderNode
- **AppContent mega-destructure** (#96): Already split into AppToolbar, AppBanners, AppWorkspace, AppOverlays sub-components
- **Split ChartContext** (#110): Deprioritized — 4 consumers, 2 heavy ones use 19-23 of 24 properties, split would add complexity without meaningful perf gain

---

## v0.11.0

### Features
- **BaseNode hierarchy**: Unified PersonNode and GroupHeaderNode (pod/team headers) under a shared BaseNode component — consistent drag, drop, collapse, selection, and hover actions across all node types
- **Unified layout tree**: Extracted `computeLayoutTree` and `buildManagerLayout` into `layoutTree.ts` — single layout computation layer for both ColumnView and ManagerView
- **Pod collapse**: Pod group headers gained collapse/expand toggles (same as manager nodes)

### Bug Fixes
- **Cross-team IC layout**: Dual placement strategy — single-affiliation ICs render beside their affiliated manager, multi-affiliation ICs render between managers
- **Edge line anchoring**: SVG connector lines anchor to the `.node` card element, not the wrapper with collapse toggle
- **Note icon position**: Note icons position relative to the card area, not the outer wrapper
- **Orphan team collapse**: Orphan team groups support collapse/expand
- **E2E stability**: Added retries in CI, increased webkit autosave banner timeout, stabilized flaky drag test, suppressed tour overlay in e2e tests
- **Coverage thresholds**: Lowered to match actual coverage after refactors

### Refactoring
- **AppContent split** (#96): Decomposed into AppToolbar, AppBanners, AppWorkspace, AppOverlays sub-components
- **Tech debt batch**: Addressed issues #84, #86, #88, #91, #92, #93 (various cleanup and consistency fixes)

---

## v0.10.0

### Features
- **Theme toggle**: Light / Dark / System appearance selector in Settings, CSS migrated from media query to `data-theme` attribute
- **Vim navigation**: Opt-in vim keybindings (hjkl navigation, o/O add report/parent, d delete, x/p cut/paste, i inline edit, I sidebar edit, / search) with toggle in Settings
- **Sidebar view/edit modes**: Sidebar defaults to read-only view when selecting a person; Edit button, shift-I, or edit icon enters edit mode; Escape returns to view mode
- **Inline editing**: Double-click name/role/team on person cards to edit in place; Tab cycles between fields; Enter commits; blur saves
- **Multi-select view mode**: Shift/cmd-click or lasso to multi-select shows read-only summary with common fields; Edit button enters batch edit
- **Create from scratch**: "Start from scratch" on upload prompt and "New" button in toolbar to create an org chart without importing a file
- **Add parent**: Insert a manager above any root-level person via O key or up-arrow icon
- **Collapse/expand**: Toggle subtree visibility on manager nodes with triangle buttons; edge lines update correctly
- **Global search**: Cmd+K to focus search bar, / in vim mode
- **Undo/redo**: Cmd+Z / Cmd+Shift+Z for working state changes
- **Product tour**: Auto-start guided tour on first visit with driver.js
- **Breadcrumbs**: Always-visible breadcrumb bar showing current position in org hierarchy
- **Delete confirmation**: Confirmation popover showing consequences (report reparenting) before deletion

### Bug Fixes
- **Vim focus**: Fixed vim navigation breaking after one motion — blur active element after selection changes, removed unused dnd-kit KeyboardSensor
- **Unified escape**: Single prioritized escape handler replaces multiple independent hooks that fired simultaneously; priority: popover > cut > sidebar edit > selection > head
- **Dark mode readability**: Cancel buttons, table view controls (Paste, Columns, expand/delete), alternating rows, cell inputs, and filter search all use CSS variables for proper dark mode contrast
- **Autosave restore**: Fixed infinite re-render loop on restore caused by unstable `layoutDeps` array reference in `useChartLayout`
- **Edge lines on collapse**: Edge lines now recalculate when nodes are collapsed/expanded via stable `collapseKey` counter
- **Inline edit save**: Inline card edits now commit on Enter/Tab/blur via `onCommitEdits` pipeline
- **Sidebar/inline isolation**: Sidebar editing uses its own local form state, independent from inline card editing — no dual-edit conflicts
- **Space key in inline edit**: `stopPropagation` on edit keydown prevents parent div from capturing space
- **Manager gradient**: Removed hardcoded `#f9faf8` gradient on manager nodes that didn't adapt to dark mode
- **Batch save guard**: Fixed "Saving..." button getting stuck when clicking Save with no changes in batch mode
- **A11y contrast**: Upload prompt pronunciation text uses `text-tertiary` for better contrast; tour popover excluded from a11y checks
- **Spatial vim navigation**: Bucket-based level preference for consistent h/l movement between org chart columns

### Refactoring
- **ChartShell extraction**: Shared chart rendering shell (hooks, DndContext, edge SVG, lasso overlay) extracted from ColumnView/ManagerView into `ChartShell` component
- **ViewDataProvider split**: Single ViewDataContext split into 4 granular contexts (People, Changes, Actions, Columns) to reduce unnecessary re-renders
- **Typed update structs**: `PersonUpdate` and `PodUpdate` Go structs with pointer fields replace `map[string]string`; contract tests verify field name alignment
- **Service interfaces**: `OrgService` decomposed into 6 domain interfaces (`PersonService`, `OrgReader`, etc.); handlers depend on minimal interfaces
- **Interaction state**: `useInteractionState` hook manages editing/selected/idle modes with edit buffer and commit/revert
- **Granular hook migration**: Removed `useOrg()` mega-hook; all consumers use `useOrgData()`, `useUI()`, `useSelection()`
- **Golden test migration**: 19 components covered by golden file snapshot tests (81 fixtures)

## v0.9.0

### Features
- **Pods**: Full pod system — auto-seeded from team groupings, CRUD endpoints, lifecycle management (auto-create, zero-member cleanup, rename cascading), pod reassignment on move/team/manager changes, pods.csv sidecar for ZIP round-trip
- **Pod UI**: Pod selection and editing sidebar, clickable pod headers in org chart, note icons with slide-out panels, drag-and-drop onto pods, free-text pod field in table and sidebar
- **Table view**: Spreadsheet-style third view mode with inline-editable cells, per-column Excel-style filters, column sorting, column visibility toggle, context-aware row add, bulk paste from clipboard, diff mode coloring, read-only mode for original data
- **Notes**: Public and private note fields on people and pods, note preview icons on person cards, note textareas in detail sidebar
- **Level field**: Numeric level field on Person at all layers (model, API, TypeScript, parser, export, inference, sidebar)
- **Settings**: Settings modal with discipline ordering, settings persisted in autosave/snapshots/ZIP sidecar
- **Lasso multi-select**: Click-drag marquee selection in Detail and Manager chart views for batch editing
- **Deep linking**: URL query params for view mode, selection, and head person — shareable links to specific states
- **Team cascade**: Changing a front-line manager's team propagates to all their direct reports
- **Logging**: Optional HTTP request logging with ring buffer, correlation IDs threaded through API client, log viewer panel in toolbar
- **Scenario contracts**: `scenarios/` directory as source of truth for expected behavior, `make check-scenarios` enforcement, scenario ID prefixes on all test names

### Bug Fixes
- **Selection pruning**: Multi-selected people now removed from selection when deleted — sidebar count decrements correctly instead of showing stale "Edit N people" (#26-related)
- **Pod sidebar close button**: Pod detail sidebar now has a close button matching the person detail sidebar
- **Lasso z-index**: Split lasso overlay into separate SVGs so "other team" dotted lines no longer render on top of person cards during lasso selection
- **Sticky table header**: Table view header row (toolbar, column headers) stays fixed while rows scroll — fixed competing scroll containers and inline `position: relative` overriding `position: sticky` (#26)
- **Sidebar layout**: Save/delete buttons sticky at bottom of sidebar so they're always visible (#19)
- **Sidebar overlay**: DetailSidebar no longer covers org chart nodes on the right edge (#22, #23)
- **Auto-scroll on select**: Chart smoothly scrolls to keep selected node visible when sidebar opens (#23)
- **Pod rendering**: Pod headings and edges now render correctly in mixed-children layout (#24)
- **Pod save button**: PodSidebar now has explicit Save button with dirty tracking and feedback instead of auto-save on blur (#25)
- **Selection highlight**: Person node selection highlight persists on hover
- **Drag onto pods**: Dropping a person onto a pod correctly sets manager, team, and pod fields
- **Spurious IC edges**: Fixed connecting lines from deeply-nested ICs back to their manager in all-IC stacks
- **Clear selection**: Clicking empty space or pressing Escape clears multi-selection
- **Autosave restore**: Restored autosave state now synced to backend so mutations work
- **Table view fixes**: Filter dropdown portal positioning, column toggle dropdown, auto-scroll/focus new draft rows, hide unparented bar
- **ZIP diff**: Stable UUIDs shared across ZIP entries so diff works on multi-file imports
- **Clear manager**: Clearing manager to "no manager" in DetailSidebar now works
- **ColumnView stability**: Stabilized useMemo deps with useCallback wrappers
- **Settings validation**: Added validation and aggregated ZIP parse warnings
- **O(1) reorder**: Pod cleanup, DRY warning merging, background org load, dirty tracking guard

### Refactoring
- Split OrgService into domain files: `service_import.go`, `service_people.go`, `service_pods.go`, `service_settings.go`
- Extract `useOrgMutations` hook from OrgDataContext
- Extract `useSaveStatus` hook for shared save-state logic
- Add `SelectionPruner` bridge component for cross-context selection cleanup
- Typed `PersonUpdatePayload` and `PodUpdatePayload` replacing `Record<string, string>` at API boundaries
- Granular context hooks (`useOrgData`, `useUI`, `useSelection`) and consumer migration
- `OrgOverrideProvider` test helper replaces `vi.mock` in all 28 test files (mock count 127 → 13)
- Golden file snapshot tests for 19 components (81 fixtures)
- Person ID index for O(1) lookups in OrgService
- Dead code removal, reduced unnecessary exports
- ESLint with typescript-eslint for static analysis
- Tidied project root: moved `grove-banner.svg`, `grove-icon.svg` → `docs/`, `bench-baseline.txt` → `testdata/`, `scenarios/` → `docs/scenarios/`
- Added `make lint` and `make ci` targets mirroring CI pipeline for local pre-push checks

### Testing
- **429 frontend tests** across 61 test files
- **17 integration tests** for OrgContext (upload, mutations, snapshots, selection pruning)
- **19 Playwright E2E tests** (smoke + feature) across Chromium, Firefox, WebKit
- **Concurrency tests** (6): parallel moves, updates, reads/writes, delete/restore, snapshots
- **Large dataset tests** (8): 200–500 person orgs
- **Adversarial input tests** (18): BOM, Unicode, XSS/SQLi payloads, oversized fields
- **Go fuzz tests** (5): InferMapping, CSV upload, AllRequiredHigh, Update fields
- **Frontend property tests** (8): buildOrgTree invariants via fast-check
- Frontend coverage thresholds raised to 80/75/75/80
- `t.Parallel()` added to ~230 Go test functions
- `@testing-library/user-event` migration across 17 test files

---

## v0.8.0

### Features
- **Accessibility**: ARIA labels on all interactive controls, `aria-expanded` on dropdown menus, `aria-selected` on person nodes, `aria-pressed` on toggle buttons, `role="alert"` on error/warning banners, `role="menuitemcheckbox"` on filter items, screen reader text for status emojis, Space key support for all `role="button"` elements
- **API client timeouts**: All API requests now have a 30-second timeout (120 seconds for file uploads) via `AbortSignal.timeout`, preventing hung requests
- **Persistence warnings**: Snapshot save/delete errors during upload are now surfaced to the user via a warning banner instead of being silently swallowed

### Bug Fixes
- Atomic file writes for snapshots and autosave prevent data corruption on crash (temp file → sync → chmod → rename)
- TOCTOU race in Delete/Restore eliminated — both working and recycled arrays returned atomically via `MutationResult`
- Disk I/O moved outside mutex in `ConfirmMapping` and `UploadZip` (prevents long-held locks)
- Snapshots preserved when upload parsing fails (cleared only when mapping is confirmed)
- Status and managerId validated in `Add` method
- `limitBody` (1MB) applied to all mutation handlers including `handleReset`
- Sequential batch updates prevent concurrent mutation races
- golangci-lint errcheck and staticcheck findings resolved
- Dead code removed (unreachable nil check, unused parser fallback)

### Refactoring
- `OrgContext` split into three focused contexts: `OrgDataContext`, `UIContext`, `SelectionContext` (reduces unnecessary re-renders)
- Shared `useChartLayout` hook extracted with `KeyboardSensor` for drag-and-drop
- `OrphanGroup` component extracted from ColumnView and ManagerView (eliminates ~80 lines of duplication)
- `BatchEditSidebar` extracted from `DetailSidebar` (440 → 200 + 170 lines)
- Magic strings (`team::`, `__mixed__`, `__export_temp__`, `__original__`) extracted to `constants.ts`

### Testing
- 142 frontend tests across 20 test files (was 88 across 12)
- New component tests: DetailSidebar (35 tests), ColumnView, ManagerView
- Smoke tests for all remaining components: Toolbar, RecycleBinDrawer, SnapshotsDropdown, AutosaveBanner, UploadPrompt, Breadcrumbs, EmploymentTypeFilter, RecycleBinButton
- Go test suite unchanged (all passing with `-race`)

---

## v0.7.0

### Features
- **ZIP snapshot export**: Export all snapshots as a single ZIP in any format (CSV, XLSX, PNG, SVG) with numeric-prefixed filenames for round-trip ordering
- **ZIP snapshot import**: Upload a ZIP of CSV/XLSX files to restore a full snapshot set. Prefix convention: 0=original, 1=working, 2+=snapshots
- **Snapshot persistence**: Snapshots now saved to `~/.grove/snapshots.json` and survive server restarts
- **Auto-open browser**: `grove serve` opens your default browser automatically (skipped in `--dev` mode)
- **Tight image cropping**: PNG/SVG exports crop to chart content with 32px padding, removing dead space
- **Per-snapshot data export**: New `GET /api/export/snapshot` endpoint for exporting individual snapshots as CSV/XLSX
- **Lenient import**: Only the Name column is required — all other fields are optional and default to empty

### Bug Fixes
- SVG connector lines recompute on container resize (fixes shifted lines when sidebar opens/closes)
- Browser opens only after TCP port is bound (net.Listen before Serve)
- Snapshot persistence writes happen outside the mutex (no longer blocks concurrent API requests)
- Reserved `__export_temp__` snapshot name prevents data loss during image export
- `limitBody` (1MB) wired to all JSON mutation handlers (was only on autosave)
- Corrupt localStorage autosave no longer traps the app in a broken state
- Autosave suppression during snapshot export uses ref (synchronous) instead of state (async)
- Error messages don't leak user input (export format sanitized)

### Code Quality
- OrgContext.tsx split into orgTypes.ts + useDirtyTracking.ts (480 → 392 lines)
- 15 OrgContext integration tests covering upload, mutations, snapshots, and selection flows
- Snapshot store test globals properly cleaned up with defer
- CLAUDE.md updated to reflect current architecture

### Testing
- 240 total tests (152 Go + 88 frontend)
- Go test-to-production ratio: 1.66x
- Zero static analysis warnings (go vet + tsc)

---

## v0.6.0

### Bug Fixes
- Manager green bar now based solely on direct reports — role titles like "Lead" or "Manager" no longer trigger it without actual reports (fixes #1)
- Cross-team-connected teams (e.g. SEC and SEC-2) now render adjacent in the layout via affinity graph clustering (fixes #2)
- Root nodes no longer appear in "unparented" indicator; only truly orphaned people (those who lost their manager) are shown (fixes #3)
- Unparented indicator changed from full-width top bar to a small collapsible floating notice in the bottom-left corner

### Hardening
- Input field length validation (500 char max) on all API mutations
- Autosave handler body size limit (1MB)
- Graceful HTTP server shutdown on SIGINT with 5-second connection drain
- Read/write/idle timeouts on the HTTP server (30s/60s/120s)
- Health check endpoint (`GET /api/health`)
- Error messages no longer leak user input (export format error sanitized)

### Code Quality
- Extracted shared `validateManagerChange` helper — DRY'd cycle detection from Move and Update
- ColumnView/ManagerView no longer redraw SVG lines on selection changes (perf fix)
- DetailSidebar uses explicit template literal instead of JSON.stringify for dep tracking
- Toolbar export buttons use existing `exportDataUrl` helper instead of inline fetch
- `interface{}` → `any` in Go test files

### Testing
- Added field length validation tests (Update rejects/accepts, Add rejects)
- Added manager change validation tests (self-ref, cycle, nonexistent manager)
- Added health endpoint handler test
- Added export format sanitization test
- Added cross-team affinity layout test
- Updated isManager tests to reflect direct-reports-only behavior

---

## v0.5.1

### Features
- **Version flag**: `grove --version` via ldflags injection from GoReleaser
- **Windows binaries**: Added Windows to GoReleaser build config

---

## v0.5.0 — First Release

Grove is an interactive web-based org chart tool. Single Go binary, embedded React frontend.

### Views & Layout
- Detail view: managers horizontal, ICs stacked vertically, team-grouped columns
- Manager-only view: IC summary cards by discipline/status
- Cross-team people (with additional teams) render horizontally for dotted-line visibility
- Single-team ICs stack vertically under their manager
- Team header nodes with + button for adding to specific teams
- Dashed right-angle lines for cross-team relationships
- Drag overlay with green drop-target highlighting
- Subtree focus mode with breadcrumb navigation (Escape to exit)
- Scrollable canvas, consistent 160px node sizing, reflow button

### Editing
- Hover actions (+/edit/delete/info) on all nodes
- Detail sidebar with field editing, manager dropdown, status info popover
- Soft-delete with recycle bin drawer, restore, and empty bin
- Multi-select via Shift/Ctrl+click with batch edit form
- Multi-select drag-and-drop (all selected people reparent together)
- Employment type filter with show/hide toggles and hidden-count badge
- Employment type field with purple accent bar for non-FTE types

### Data Integrity
- Cycle detection prevents circular manager chains in Move and Update
- Status validation against 7 known types (Active, Open, Pending Open, Transfer In, Transfer Out, Backfill, Planned)
- All API returns are deep-copied — no mutation of internal state
- All frontend mutations surface errors to the UI
- Batch edit failures report count and allow retry

### Smart Upload
- Column inference with exact/synonym/fuzzy matching and confidence scores
- Fallback mapping UI with data preview when inference is uncertain
- Backwards-compatible parsing of legacy Hiring/Transfer values
- Graceful imports: broken rows get warning badges, not upload failures

### Snapshots & Persistence
- Named snapshots: save, load, delete, branch between org versions
- Autosave: debounced dual persistence (localStorage + ~/.grove/autosave.json)
- Restore previous session banner on reload
- Browser navigation guard for unsaved changes

### Export
- PNG and SVG via html-to-image with error handling and loading state
- CSV and XLSX download from working state

### Design
- Botanical design system: Fraunces + DM Sans fonts, warm earthy palette
- CSS modules throughout (no inline styles in production components)
- Grove tree icon, paper noise texture, green focus rings

### Error Handling
- React ErrorBoundary wraps the entire app with recovery UI
- JSON encoding errors logged server-side
- Export handler sets Content-Length, logs write failures
- Server autosave failure surfaced via warning banner

### Testing
- Go: 90%+ coverage — service, handlers, model, parser, infer, convert, export, snapshots, autosave
- Frontend: 69 vitest tests — hooks, components, tree building, layout, edge computation

### Architecture
- Single Go binary with `go:embed` for frontend assets
- Cobra CLI: `grove serve [-p port] [--dev]`
- Layered backend: model → service (mutex-protected) → HTTP handlers
- React 19, dnd-kit, Vite, TypeScript strict mode
- CI: GitHub Actions (test + lint), GoReleaser, Nix flake with auto-hash-update

---

## v0.0.1 — Prototype

Go CLI tool generating Mermaid flowchart diagrams from CSV/XLSX spreadsheets.

- People view and headcount view as Mermaid `flowchart TD`
- Cross-team edges, planned state flag
