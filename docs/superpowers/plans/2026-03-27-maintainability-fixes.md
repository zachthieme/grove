# Maintainability Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 6 maintainability issues from principal engineer review: handler boilerplate, Update() god function, frontend prop drilling, oversized views, O(n^2) validation, duplicate state setup.

**Architecture:** Backend: extract helpers to reduce duplication and complexity. Frontend: create a ChartContext for shared tree-view props so recursive components consume context instead of prop-drilling 12+ callbacks. All changes are refactors — no behavior changes.

**Tech Stack:** Go 1.25, React 19, TypeScript 5.7

---

### Task 1: Extract `resetState()` on OrgService (Go)

**Files:**
- Modify: `internal/api/service.go` (add resetState method)
- Modify: `internal/api/service_import.go` (use resetState in Upload, ConfirmMapping)
- Modify: `internal/api/zipimport.go` (use resetState in UploadZip, ConfirmMapping ZIP path)

- [ ] **Step 1: Add resetState method to service.go**

```go
// resetState replaces the full org state. Must be called with s.mu held.
func (s *OrgService) resetState(original []Person, snaps map[string]snapshotData) {
	s.original = original
	s.working = deepCopyPeople(original)
	s.recycled = nil
	s.snaps.ReplaceAll(snaps)
	s.pods = SeedPods(s.working)
	s.originalPods = CopyPods(s.pods)
	_ = SeedPods(s.original)
	s.settings = Settings{DisciplineOrder: deriveDisciplineOrder(s.working)}
	s.pending = nil
}
```

- [ ] **Step 2: Replace duplicated blocks in service_import.go and zipimport.go with resetState calls**

In Upload(): replace lines 30-42 with `s.resetState(people, nil)`
In ConfirmMapping() CSV path: replace lines 143-151 with `s.resetState(people, nil)`
In ConfirmMapping() ZIP path: replace lines 84-90 with `s.resetState(orig, snaps)` then follow with sidecar handling
In UploadZip(): replace lines 276-284 with `s.resetState(orig, snaps)` then follow with sidecar handling

- [ ] **Step 3: Run tests**

Run: `go test ./internal/api/ -count=1 -race`

- [ ] **Step 4: Commit**

---

### Task 2: Extract per-field update functions (Go)

**Files:**
- Modify: `internal/api/service_people.go` (extract field handlers from Update)

- [ ] **Step 1: Extract field handler functions**

Create helper methods called from the switch in Update(). Each handles one field's logic:

```go
func (s *OrgService) applyTeamChange(p *Person, personId, team string) {
	p.Team = team
	s.pods = ReassignPersonPod(s.pods, p)
	if isFrontlineManager(s.working, personId) {
		for i := range s.working {
			if s.working[i].ManagerId == personId {
				s.working[i].Team = team
				s.pods = ReassignPersonPod(s.pods, &s.working[i])
			}
		}
	}
	s.pods = CleanupEmptyPods(s.pods, s.working)
}

func (s *OrgService) applyManagerChange(p *Person, personId, newManagerId string, fields map[string]string) error {
	if newManagerId != "" {
		if err := validateManagerChange(s.working, personId, newManagerId); err != nil {
			return err
		}
		if _, hasTeam := fields["team"]; !hasTeam {
			if _, mgr := s.findWorking(newManagerId); mgr != nil {
				p.Team = mgr.Team
			}
		}
	}
	p.ManagerId = newManagerId
	s.pods = ReassignPersonPod(s.pods, p)
	s.pods = CleanupEmptyPods(s.pods, s.working)
	return nil
}

func (s *OrgService) applyPodChange(p *Person, podName string) {
	if podName == "" {
		p.Pod = ""
		s.pods = CleanupEmptyPods(s.pods, s.working)
		return
	}
	pod := FindPod(s.pods, podName, p.ManagerId)
	if pod == nil {
		s.pods = append(s.pods, Pod{
			Id: uuid.NewString(), Name: podName,
			Team: p.Team, ManagerId: p.ManagerId,
		})
	}
	p.Pod = podName
}

func parseAdditionalTeams(v string) []string {
	if v == "" {
		return nil
	}
	teams := strings.Split(v, ",")
	result := make([]string, 0, len(teams))
	for _, t := range teams {
		t = strings.TrimSpace(t)
		if t != "" {
			result = append(result, t)
		}
	}
	return result
}
```

- [ ] **Step 2: Simplify Update() switch to delegate to helpers**

- [ ] **Step 3: Run tests**

Run: `go test ./internal/api/ -count=1 -race`

---

### Task 3: Build person-by-ID index for O(1) lookups (Go)

**Files:**
- Modify: `internal/api/validate.go` (replace O(n) findInSlice and O(n^2) isFrontlineManager)

- [ ] **Step 1: Add buildPersonIndex and buildReportsIndex helpers**

```go
// buildPersonIndex returns a map from person ID to slice index.
func buildPersonIndex(people []Person) map[string]int {
	idx := make(map[string]int, len(people))
	for i := range people {
		idx[people[i].Id] = i
	}
	return idx
}

// buildReportsSet returns the set of person IDs that have at least one direct report.
func buildReportsSet(people []Person) map[string]bool {
	has := make(map[string]bool, len(people)/2)
	for _, p := range people {
		if p.ManagerId != "" {
			has[p.ManagerId] = true
		}
	}
	return has
}
```

- [ ] **Step 2: Rewrite isFrontlineManager to O(n)**

```go
func isFrontlineManager(working []Person, personId string) bool {
	hasReports := false
	reportsSet := buildReportsSet(working)
	for _, p := range working {
		if p.ManagerId == personId {
			hasReports = true
			if reportsSet[p.Id] {
				return false // has a sub-manager
			}
		}
	}
	return hasReports
}
```

- [ ] **Step 3: Run tests**

Run: `go test ./internal/api/ -count=1 -race`

---

### Task 4: Reduce handler boilerplate (Go)

**Files:**
- Modify: `internal/api/handlers.go` (add jsonHandler helper, refactor repetitive handlers)

- [ ] **Step 1: Add a decode-call-respond helper**

```go
// jsonHandler creates a handler that decodes JSON into req, calls fn, and writes the result.
func jsonHandler[Req any, Resp any](fn func(Req) (Resp, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limitBody(w, r)
		var req Req
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		resp, err := fn(req)
		if err != nil {
			serviceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, resp)
	}
}
```

- [ ] **Step 2: Convert the most repetitive handlers to use jsonHandler**

Handlers that match the decode→call→serviceError→writeJSON pattern:
- handleConfirmMapping, handleMove, handleUpdate, handleAdd, handleDelete, handleRestore
- handleSaveSnapshot, handleLoadSnapshot, handleDeleteSnapshot
- handleUpdatePod, handleCreatePod, handleReorder

- [ ] **Step 3: Run tests**

Run: `go test ./internal/api/ -count=1 -race`

---

### Task 5: Create ChartContext to reduce prop drilling (Frontend)

**Files:**
- Create: `web/src/views/ChartContext.tsx`
- Modify: `web/src/App.tsx` (provide ChartContext)
- Modify: `web/src/views/ColumnView.tsx` (consume ChartContext in SubtreeNode)
- Modify: `web/src/views/ManagerView.tsx` (consume ChartContext in ManagerSubtree)

- [ ] **Step 1: Create ChartContext**

A context for tree-view callbacks and state that currently get prop-drilled through every recursive component.

```tsx
import { createContext, useContext } from 'react'
import type { Person, Pod } from '../api/types'
import type { PersonChange } from '../hooks/useOrgDiff'

export interface ChartContextValue {
  selectedIds: Set<string>
  changes?: Map<string, PersonChange>
  managerSet?: Set<string>
  pods?: Pod[]
  onSelect: (id: string, event?: React.MouseEvent) => void
  onBatchSelect?: (ids: Set<string>) => void
  onAddReport?: (id: string) => void
  onAddToTeam?: (parentId: string, team: string, podName?: string) => void
  onDeletePerson?: (id: string) => void
  onInfo?: (id: string) => void
  onFocus?: (id: string) => void
  onPodSelect?: (podId: string) => void
}

const ChartContext = createContext<ChartContextValue | null>(null)

export const ChartProvider = ChartContext.Provider

export function useChart(): ChartContextValue {
  const ctx = useContext(ChartContext)
  if (!ctx) throw new Error('useChart must be used within a ChartProvider')
  return ctx
}
```

- [ ] **Step 2: Provide ChartContext in ColumnView and ManagerView**

Wrap the DndContext content with ChartProvider, passing all callbacks/state.

- [ ] **Step 3: Simplify SubtreeNode and ManagerSubtree**

Remove all callback/state props that are now in ChartContext. Call `useChart()` inside these components.

- [ ] **Step 4: Update App.tsx to remove props that are now in ChartContext**

ColumnView and ManagerView still receive `people` and `ghostPeople` as props (these are computed/filtered). All callback and selection state moves to context.

- [ ] **Step 5: Run tests**

Run: `cd web && npm test`

---

### Task 6: Extract DragOverlay and LassoOverlay shared components (Frontend)

**Files:**
- Create: `web/src/views/DragBadgeOverlay.tsx`
- Create: `web/src/views/LassoSvgOverlay.tsx`
- Modify: `web/src/views/ColumnView.tsx` (use shared components)
- Modify: `web/src/views/ManagerView.tsx` (use shared components)

- [ ] **Step 1: Extract DragBadgeOverlay**

The DragOverlay + badge count rendering is identical in ColumnView and ManagerView.

- [ ] **Step 2: Extract LassoSvgOverlay**

The SVG overlay with lasso rect rendering is identical in both views.

- [ ] **Step 3: Use shared components in both views**

- [ ] **Step 4: Run tests**

Run: `cd web && npm test`

---
