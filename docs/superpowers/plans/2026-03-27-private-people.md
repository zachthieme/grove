# Private People Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `private` boolean field to Person that hides people from the display for planning purposes, with a toolbar toggle to reveal/hide them and placeholder nodes for hidden managers.

**Architecture:** Add `Private` field to both Go and TypeScript Person models. Extend the existing `useFilteredPeople` hook to strip private people and inject placeholder manager nodes when `showPrivate` is false. Add a `PrivateToggle` toolbar component that only renders when private people exist. The `private` column round-trips through CSV/XLSX import/export.

**Tech Stack:** Go, React/TypeScript, Vitest, CSS Modules

---

### Task 1: Add `Private` field to Go domain model

**Files:**
- Modify: `internal/model/model.go:29-45`
- Modify: `internal/api/model.go:3-21`
- Modify: `internal/api/convert.go:52-69`

- [ ] **Step 1: Add `Private` field to domain model**

In `internal/model/model.go`, add `Private bool` to the `Person` struct after the `Level` field:

```go
type Person struct {
	Name            string
	Role            string
	Discipline      string
	Manager         string
	Team            string
	AdditionalTeams []string
	Status          string
	EmploymentType  string
	NewRole         string
	NewTeam         string
	Warning         string // non-empty if this row had validation issues
	Pod             string
	PublicNote      string
	PrivateNote     string
	Level           int
	Private         bool
}
```

- [ ] **Step 2: Add `Private` field to API model**

In `internal/api/model.go`, add `Private bool` to the `Person` struct after the `Level` field:

```go
	Private         bool     `json:"private,omitempty"`
```

- [ ] **Step 3: Add `Private` to ConvertOrgWithIDMap**

In `internal/api/convert.go`, add `Private: p.Private,` to the `Person` literal in the conversion loop (after `Level: p.Level,`):

```go
		result[i] = Person{
			Id:              indexToID[i],
			Name:            p.Name,
			Role:            p.Role,
			Discipline:      p.Discipline,
			ManagerId:       managerID,
			Team:            p.Team,
			AdditionalTeams: p.AdditionalTeams,
			Status:          p.Status,
			EmploymentType:  p.EmploymentType,
			Warning:         p.Warning,
			NewRole:         p.NewRole,
			NewTeam:         p.NewTeam,
			Pod:             p.Pod,
			PublicNote:      p.PublicNote,
			PrivateNote:     p.PrivateNote,
			Level:           p.Level,
			Private:         p.Private,
		}
```

- [ ] **Step 4: Run Go tests to verify nothing is broken**

Run: `go test ./...`
Expected: All tests PASS (the new field defaults to `false`, no behavior change)

- [ ] **Step 5: Commit**

```
feat: add Private field to Go Person models
```

---

### Task 2: Add `private` to parser and column inference

**Files:**
- Modify: `internal/parser/parser.go:60-73`
- Modify: `internal/api/infer.go:9-24`
- Test: `internal/api/infer_test.go`

- [ ] **Step 1: Write failing test for `private` column inference**

Find the existing test file for inference. Add a test that a header `"private"` is mapped with high confidence:

```go
func TestInferMapping_Private(t *testing.T) {
	headers := []string{"Name", "Role", "private"}
	result := InferMapping(headers)
	mc, ok := result["private"]
	if !ok {
		t.Fatal("expected 'private' to be mapped")
	}
	if mc.Confidence != "high" {
		t.Errorf("expected high confidence, got %s", mc.Confidence)
	}
	if mc.Column != "private" {
		t.Errorf("expected column 'private', got %s", mc.Column)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/api/ -run TestInferMapping_Private -v`
Expected: FAIL — `"private"` not in exactMatches

- [ ] **Step 3: Add `"private"` to exactMatches**

In `internal/api/infer.go`, add to the `exactMatches` map:

```go
	"private":       "private",
```

Place it after the `"level"` entry.

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/api/ -run TestInferMapping_Private -v`
Expected: PASS

- [ ] **Step 5: Add `Private` parsing to `BuildPeopleWithMapping`**

In `internal/parser/parser.go`, after the block that sets `p.Level` (around line 75-79), add parsing for the `private` field:

```go
		if raw := get("private"); raw != "" {
			low := strings.ToLower(raw)
			p.Private = low == "true" || low == "1" || low == "yes"
		}
```

And add `Private` to the `Person` literal construction — but since `Private` defaults to `false` (zero value for bool), and we set it conditionally above, just ensure the conditional block above runs after the `Person` struct is constructed. Move it after the `p.Level` block:

```go
		if raw := get("private"); raw != "" {
			low := strings.ToLower(raw)
			p.Private = low == "true" || low == "1" || low == "yes"
		}
```

- [ ] **Step 6: Run all Go tests**

Run: `go test ./...`
Expected: All PASS

- [ ] **Step 7: Commit**

```
feat: add private column to inference and parser
```

---

### Task 3: Add `private` to CSV/XLSX export

**Files:**
- Modify: `internal/api/export.go:13,103-114`
- Test: `internal/api/export_test.go`

- [ ] **Step 1: Write failing test for private in export**

Add a test that verifies the `Private` column appears in CSV output:

```go
func TestExportCSV_IncludesPrivateColumn(t *testing.T) {
	people := []Person{
		{Id: "1", Name: "Alice", Role: "Eng", Discipline: "Eng", Team: "T", Status: "Active", Private: true},
		{Id: "2", Name: "Bob", Role: "Eng", Discipline: "Eng", Team: "T", Status: "Active", Private: false},
	}
	data, err := ExportCSV(people)
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(string(data), "\n")
	// Header should contain "Private"
	if !strings.Contains(lines[0], "Private") {
		t.Errorf("expected header to contain 'Private', got: %s", lines[0])
	}
	// Alice's row should have "true"
	if !strings.Contains(lines[1], "true") {
		t.Errorf("expected Alice's row to contain 'true', got: %s", lines[1])
	}
	// Bob's row should have "false"
	if !strings.Contains(lines[2], "false") {
		t.Errorf("expected Bob's row to contain 'false', got: %s", lines[2])
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/api/ -run TestExportCSV_IncludesPrivateColumn -v`
Expected: FAIL — no "Private" header or value

- [ ] **Step 3: Add `Private` to export**

In `internal/api/export.go`:

1. Add `"Private"` to `exportHeaders`:

```go
var exportHeaders = []string{"Name", "Role", "Discipline", "Manager", "Team", "Additional Teams", "Status", "Employment Type", "New Role", "New Team", "Level", "Pod", "Public Note", "Private Note", "Private"}
```

2. Add the private value to `personToRow`. After the last field in the return slice, add the boolean as a string:

```go
func personToRow(p Person, idToName map[string]string) []string {
	managerName := idToName[p.ManagerId]
	levelStr := ""
	if p.Level != 0 {
		levelStr = strconv.Itoa(p.Level)
	}
	privateStr := "false"
	if p.Private {
		privateStr = "true"
	}
	return []string{
		p.Name, p.Role, p.Discipline, managerName, p.Team,
		strings.Join(p.AdditionalTeams, ","), p.Status, p.EmploymentType,
		p.NewRole, p.NewTeam, levelStr, p.Pod, p.PublicNote, p.PrivateNote,
		privateStr,
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/api/ -run TestExportCSV_IncludesPrivateColumn -v`
Expected: PASS

- [ ] **Step 5: Run all Go tests**

Run: `go test ./...`
Expected: All PASS. Some existing tests that assert on export column count or exact output may need updating if they exist — fix any that break.

- [ ] **Step 6: Commit**

```
feat: include private field in CSV/XLSX export
```

---

### Task 4: Add `private` to Go Update handler

**Files:**
- Modify: `internal/api/service_people.go:58-107`

- [ ] **Step 1: Write failing test for update private field**

```go
func TestUpdate_PrivateField(t *testing.T) {
	svc := newTestService(t, testPeople())
	result, err := svc.Update(idAlice, map[string]string{"private": "true"})
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range result.Working {
		if p.Id == idAlice {
			if !p.Private {
				t.Error("expected Alice to be private after update")
			}
			return
		}
	}
	t.Error("Alice not found in working")
}
```

Adapt the test helper names (`newTestService`, `testPeople`, `idAlice`) to match the existing test helpers in the codebase. Check `internal/api/service_test.go` or similar files for the pattern used.

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/api/ -run TestUpdate_PrivateField -v`
Expected: FAIL — "unknown field: private"

- [ ] **Step 3: Add `private` case to Update switch**

In `internal/api/service_people.go`, in the `Update` method's `switch k` block, add a case after `"pod"`:

```go
		case "private":
			p.Private = v == "true" || v == "1" || v == "yes"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/api/ -run TestUpdate_PrivateField -v`
Expected: PASS

- [ ] **Step 5: Run all Go tests**

Run: `go test ./...`
Expected: All PASS

- [ ] **Step 6: Commit**

```
feat: support private field in person update API
```

---

### Task 5: Add `private` to TypeScript Person type and update payload

**Files:**
- Modify: `web/src/api/types.ts:1-19,54-69`

- [ ] **Step 1: Add `private` to `Person` interface**

In `web/src/api/types.ts`, add `private?: boolean` after the `level` field:

```typescript
export interface Person {
  id: string
  name: string
  role: string
  discipline: string
  managerId: string
  team: string
  additionalTeams: string[]
  status: 'Active' | 'Open' | 'Pending Open' | 'Transfer In' | 'Transfer Out' | 'Backfill' | 'Planned'
  employmentType?: string
  newRole?: string
  newTeam?: string
  warning?: string
  sortIndex?: number
  pod?: string
  publicNote?: string
  privateNote?: string
  level?: number
  private?: boolean
}
```

- [ ] **Step 2: Add `private` to `PersonUpdatePayload`**

In the same file, add `private?: string` to `PersonUpdatePayload`:

```typescript
export interface PersonUpdatePayload {
  name?: string
  role?: string
  discipline?: string
  team?: string
  managerId?: string
  status?: string
  employmentType?: string
  additionalTeams?: string
  newRole?: string
  newTeam?: string
  level?: string
  pod?: string
  publicNote?: string
  privateNote?: string
  private?: string
}
```

- [ ] **Step 3: Run frontend tests to verify nothing breaks**

Run: `cd web && npm test -- --run`
Expected: All PASS

- [ ] **Step 4: Commit**

```
feat: add private field to TypeScript Person types
```

---

### Task 6: Add `showPrivate` to UIContext

**Files:**
- Modify: `web/src/store/orgTypes.ts:90-108`
- Modify: `web/src/store/UIContext.tsx`
- Modify: `web/src/store/OrgContext.tsx`

- [ ] **Step 1: Add `showPrivate` and `setShowPrivate` to `UIContextValue`**

In `web/src/store/orgTypes.ts`, add to the `UIContextValue` interface:

```typescript
export interface UIContextValue {
  viewMode: ViewMode
  dataView: DataView
  binOpen: boolean
  hiddenEmploymentTypes: Set<string>
  headPersonId: string | null
  layoutKey: number
  error: string | null
  showPrivate: boolean
  setViewMode: (mode: ViewMode) => void
  setDataView: (view: DataView) => void
  setBinOpen: (open: boolean) => void
  toggleEmploymentTypeFilter: (type: string) => void
  showAllEmploymentTypes: () => void
  hideAllEmploymentTypes: (types: string[]) => void
  setHead: (id: string | null) => void
  reflow: () => void
  setError: (error: string | null) => void
  clearError: () => void
  setShowPrivate: (show: boolean) => void
}
```

Also add to `OrgState`:

```typescript
  showPrivate: boolean
```

And to `OrgActions`:

```typescript
  setShowPrivate: (show: boolean) => void
```

- [ ] **Step 2: Implement in UIProvider**

In `web/src/store/UIContext.tsx`, add state and include in the value:

```typescript
const [showPrivate, setShowPrivate] = useState(false)
```

Add `showPrivate` and `setShowPrivate` to the `value` object and the `useMemo` dependency array.

- [ ] **Step 3: Wire through OrgContext**

In `web/src/store/OrgContext.tsx`, in the `useOrg()` hook, add to the returned object:

```typescript
    // UI state
    showPrivate: ui.showPrivate,

    // UI actions
    setShowPrivate: ui.setShowPrivate,
```

- [ ] **Step 4: Run frontend tests**

Run: `cd web && npm test -- --run`
Expected: All PASS (some tests may need the new field added to mock values — fix if needed)

- [ ] **Step 5: Commit**

```
feat: add showPrivate state to UIContext
```

---

### Task 7: Extend `useFilteredPeople` to filter private people and inject placeholders

**Files:**
- Modify: `web/src/hooks/useFilteredPeople.ts`
- Modify: `web/src/hooks/useFilteredPeople.test.ts`

- [ ] **Step 1: Write failing tests for private filtering**

Add tests to `web/src/hooks/useFilteredPeople.test.ts`:

```typescript
const eve = makePerson({ id: '5', name: 'Eve', managerId: '1', private: true })

describe('private people filtering', () => {
  it('[FILTER-004] hides private people when showPrivate is false', () => {
    const all = [alice, bob, eve]
    const { result } = renderHook(() =>
      useFilteredPeople(all, all, all, new Set(), null, false, false),
    )
    expect(result.current.people.map(p => p.name)).toEqual(['Alice', 'Bob'])
  })

  it('[FILTER-004] shows private people when showPrivate is true', () => {
    const all = [alice, bob, eve]
    const { result } = renderHook(() =>
      useFilteredPeople(all, all, all, new Set(), null, false, true),
    )
    expect(result.current.people.map(p => p.name)).toEqual(['Alice', 'Bob', 'Eve'])
  })

  it('[FILTER-004] injects placeholder for hidden private manager with visible reports', () => {
    // Eve is private and manages Bob
    const eveManager = makePerson({ id: '5', name: 'Eve', private: true })
    const bobUnder = makePerson({ id: '2', name: 'Bob', managerId: '5' })
    const all = [eveManager, bobUnder]
    const { result } = renderHook(() =>
      useFilteredPeople(all, all, all, new Set(), null, false, false),
    )
    const names = result.current.people.map(p => p.name)
    expect(names).toContain('TBD Manager')
    expect(names).toContain('Bob')
    expect(names).not.toContain('Eve')
    const placeholder = result.current.people.find(p => p.name === 'TBD Manager')!
    expect((placeholder as any).isPlaceholder).toBe(true)
    // Bob's managerId should point to the placeholder
    const bob2 = result.current.people.find(p => p.name === 'Bob')!
    expect(bob2.managerId).toBe(placeholder.id)
  })

  it('[FILTER-004] does not inject placeholder when private manager has no visible reports', () => {
    // Eve is private and manages nobody visible
    const eveManager = makePerson({ id: '5', name: 'Eve', private: true })
    const all = [alice, eveManager]
    const { result } = renderHook(() =>
      useFilteredPeople(all, all, all, new Set(), null, false, false),
    )
    expect(result.current.people.map(p => p.name)).toEqual(['Alice'])
  })

  it('[FILTER-004] placeholder has stable deterministic ID', () => {
    const eveManager = makePerson({ id: '5', name: 'Eve', private: true })
    const bobUnder = makePerson({ id: '2', name: 'Bob', managerId: '5' })
    const all = [eveManager, bobUnder]
    const { result: r1 } = renderHook(() =>
      useFilteredPeople(all, all, all, new Set(), null, false, false),
    )
    const { result: r2 } = renderHook(() =>
      useFilteredPeople(all, all, all, new Set(), null, false, false),
    )
    const ph1 = r1.current.people.find(p => p.name === 'TBD Manager')!
    const ph2 = r2.current.people.find(p => p.name === 'TBD Manager')!
    expect(ph1.id).toBe(ph2.id)
  })

  it('[FILTER-004] filters private people from ghost people in diff mode', () => {
    const evePrivate = makePerson({ id: '5', name: 'Eve', private: true })
    const original = [alice, bob, evePrivate]
    const working = [alice] // Bob and Eve removed
    const { result } = renderHook(() =>
      useFilteredPeople(working, original, working, new Set(), null, true, false),
    )
    // Eve should not appear in ghosts because she's private
    expect(result.current.ghostPeople.map(p => p.name)).toEqual(['Bob'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npm test -- --run useFilteredPeople`
Expected: FAIL — the hook doesn't accept the `showPrivate` parameter yet

- [ ] **Step 3: Update existing tests to pass `showPrivate` parameter**

All existing calls to `useFilteredPeople` in the test file have 6 arguments. Add `true` as the 7th argument (showPrivate=true means no filtering, so behavior is unchanged):

For each existing test, change the hook call from:
```typescript
useFilteredPeople(all, all, all, new Set(), null, false)
```
to:
```typescript
useFilteredPeople(all, all, all, new Set(), null, false, true)
```

Do this for all existing tests in the file.

- [ ] **Step 4: Implement private filtering in `useFilteredPeople`**

Replace `web/src/hooks/useFilteredPeople.ts` with:

```typescript
import { useMemo } from 'react'
import type { Person } from '../api/types'

/**
 * Generates a stable, deterministic placeholder ID from a hidden manager's ID.
 */
function placeholderId(realId: string): string {
  return `__placeholder_${realId}`
}

/**
 * Filters people by privacy, hidden employment types, and head subtree.
 * When showPrivate is false, private people are removed and placeholder
 * "TBD Manager" nodes are injected for hidden managers with visible reports.
 */
export function useFilteredPeople(
  rawPeople: Person[],
  original: Person[],
  working: Person[],
  hiddenEmploymentTypes: Set<string>,
  headSubtree: Set<string> | null,
  showChanges: boolean,
  showPrivate: boolean,
) {
  const privateFiltered = useMemo(() => {
    if (showPrivate) return rawPeople

    const visible = rawPeople.filter((p) => !p.private)

    // Find hidden managers that have visible reports
    const hiddenIds = new Set(rawPeople.filter((p) => p.private).map((p) => p.id))
    const managersNeeded = new Set<string>()
    for (const p of visible) {
      if (p.managerId && hiddenIds.has(p.managerId)) {
        managersNeeded.add(p.managerId)
      }
    }

    if (managersNeeded.size === 0) return visible

    // Inject placeholders and reparent
    const placeholders: (Person & { isPlaceholder: true })[] = []
    for (const realId of managersNeeded) {
      const phId = placeholderId(realId)
      placeholders.push({
        id: phId,
        name: 'TBD Manager',
        role: '',
        discipline: '',
        managerId: rawPeople.find((p) => p.id === realId)?.managerId ?? '',
        team: '',
        additionalTeams: [],
        status: '—' as Person['status'],
        isPlaceholder: true,
      })
    }

    // Reparent visible people whose manager was hidden
    const reparented = visible.map((p) => {
      if (p.managerId && hiddenIds.has(p.managerId) && managersNeeded.has(p.managerId)) {
        return { ...p, managerId: placeholderId(p.managerId) }
      }
      return p
    })

    return [...reparented, ...placeholders]
  }, [rawPeople, showPrivate])

  const empFiltered = useMemo(() => {
    if (hiddenEmploymentTypes.size === 0) return privateFiltered
    return privateFiltered.filter((p) => !hiddenEmploymentTypes.has(p.employmentType || ''))
  }, [privateFiltered, hiddenEmploymentTypes])

  const people = useMemo(() => {
    if (!headSubtree) return empFiltered
    return empFiltered.filter((p) => headSubtree.has(p.id))
  }, [empFiltered, headSubtree])

  const ghostPeople = useMemo(() => {
    if (!showChanges) return []
    const workingIds = new Set(working.map((w) => w.id))
    let ghosts = original.filter((o) => !workingIds.has(o.id))
    // Filter out private ghosts when not showing private
    if (!showPrivate) {
      ghosts = ghosts.filter((p) => !p.private)
    }
    if (hiddenEmploymentTypes.size > 0) {
      ghosts = ghosts.filter((p) => !hiddenEmploymentTypes.has(p.employmentType || ''))
    }
    if (headSubtree) {
      ghosts = ghosts.filter((p) => headSubtree.has(p.id))
    }
    return ghosts
  }, [showChanges, original, working, hiddenEmploymentTypes, headSubtree, showPrivate])

  return { people, ghostPeople }
}
```

- [ ] **Step 5: Run tests to verify all pass**

Run: `cd web && npm test -- --run useFilteredPeople`
Expected: All PASS (both old and new tests)

- [ ] **Step 6: Commit**

```
feat: filter private people and inject placeholder managers in useFilteredPeople
```

---

### Task 8: Wire `showPrivate` into App.tsx

**Files:**
- Modify: `web/src/App.tsx:59`

- [ ] **Step 1: Pass `showPrivate` to `useFilteredPeople`**

In `web/src/App.tsx`, the current call on line 59 is:

```typescript
const { people, ghostPeople } = useFilteredPeople(rawPeople, original, working, hiddenEmploymentTypes, headSubtree, showChanges)
```

The `useOrg()` destructure at line 31 needs to also extract `showPrivate`. Add `showPrivate` to the destructure.

Then update the hook call:

```typescript
const { people, ghostPeople } = useFilteredPeople(rawPeople, original, working, hiddenEmploymentTypes, headSubtree, showChanges, showPrivate)
```

- [ ] **Step 2: Handle head person clearing when private and hidden**

After the `useFilteredPeople` call, add logic to clear head if the head person is private and hidden:

```typescript
useEffect(() => {
  if (!showPrivate && headPersonId) {
    const headPerson = working.find((p) => p.id === headPersonId)
    if (headPerson?.private) {
      setHead(null)
    }
  }
}, [showPrivate, headPersonId, working, setHead])
```

- [ ] **Step 3: Run frontend tests**

Run: `cd web && npm test -- --run`
Expected: All PASS

- [ ] **Step 4: Commit**

```
feat: wire showPrivate through App to useFilteredPeople
```

---

### Task 9: Create PrivateToggle toolbar component

**Files:**
- Create: `web/src/components/PrivateToggle.tsx`
- Create: `web/src/components/PrivateToggle.module.css`
- Modify: `web/src/components/Toolbar.tsx:98`

- [ ] **Step 1: Create `PrivateToggle.module.css`**

```css
.btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  background: var(--surface-raised);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: 12px;
  color: var(--text-secondary);
  transition: all var(--transition-normal);
}

.btn:hover {
  border-color: var(--border-strong);
}

.active {
  background: var(--grove-green-soft);
  border-color: var(--grove-green-muted);
  color: var(--grove-green);
}
```

- [ ] **Step 2: Create `PrivateToggle.tsx`**

```typescript
import { useOrgData, useUI } from '../store/OrgContext'
import styles from './PrivateToggle.module.css'

export default function PrivateToggle() {
  const { working } = useOrgData()
  const { showPrivate, setShowPrivate } = useUI()

  const privateCount = working.filter((p) => p.private).length
  if (privateCount === 0) return null

  return (
    <button
      className={`${styles.btn} ${showPrivate ? styles.active : ''}`}
      onClick={() => setShowPrivate(!showPrivate)}
      aria-label={`${privateCount} private people ${showPrivate ? 'shown' : 'hidden'}`}
      aria-pressed={showPrivate}
    >
      {showPrivate ? '\u{1F441}' : '\u{1F441}\u200D\u{1F5E8}'}
      <span>{privateCount} {showPrivate ? 'shown' : 'hidden'}</span>
    </button>
  )
}
```

- [ ] **Step 3: Add PrivateToggle to Toolbar**

In `web/src/components/Toolbar.tsx`, import `PrivateToggle`:

```typescript
import PrivateToggle from './PrivateToggle'
```

Add it in the toolbar after `<EmploymentTypeFilter />` (around line 98):

```tsx
          <EmploymentTypeFilter />

          <PrivateToggle />

          <RecycleBinButton />
```

- [ ] **Step 4: Run frontend tests**

Run: `cd web && npm test -- --run`
Expected: All PASS

- [ ] **Step 5: Build frontend to verify compilation**

Run: `cd web && npm run build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```
feat: add PrivateToggle component to toolbar
```

---

### Task 10: Add lock icon to PersonNode for private people

**Files:**
- Modify: `web/src/components/PersonNode.tsx`
- Modify: `web/src/components/PersonNode.module.css`

- [ ] **Step 1: Add `.privateIcon` style to PersonNode.module.css**

Add at the end of the file:

```css
.privateIcon {
  position: absolute;
  top: -6px;
  right: -2px;
  font-size: 11px;
  line-height: 1;
  z-index: 2;
  opacity: 0.6;
}
```

- [ ] **Step 2: Add `.placeholder` style to PersonNode.module.css**

```css
.placeholder {
  border-style: dashed;
  border-color: var(--border-soft);
  background: var(--surface-sunken);
  cursor: default;
  font-style: italic;
  color: var(--text-tertiary);
}

.placeholder .name,
.placeholder .role {
  color: var(--text-tertiary);
}
```

- [ ] **Step 3: Add private icon and placeholder styling to PersonNode.tsx**

In `web/src/components/PersonNode.tsx`:

1. Add `isPlaceholder` to the Props interface:

```typescript
interface Props {
  person: Person & { isPlaceholder?: boolean }
  // ... rest unchanged
}
```

2. In the component body, derive private and placeholder states:

```typescript
const isPrivate = !!person.private
const isPlaceholder = !!(person as any).isPlaceholder
```

3. Add `isPlaceholder && styles.placeholder` to the `classNames` array.

4. When `isPlaceholder` is true, suppress actions: update `showActions`:

```typescript
const showActions = !ghost && !isPlaceholder && (onAdd || onDelete || onInfo || onFocus)
```

5. After the warning dot, render the lock icon when private:

```tsx
{isPrivate && !isPlaceholder && (
  <div className={styles.privateIcon} title="Private">{'\u{1F512}'}</div>
)}
```

- [ ] **Step 4: Run frontend tests**

Run: `cd web && npm test -- --run`
Expected: All PASS

- [ ] **Step 5: Commit**

```
feat: show lock icon on private people and placeholder styling
```

---

### Task 11: Add Private toggle to DetailSidebar

**Files:**
- Modify: `web/src/components/DetailSidebar.tsx`

- [ ] **Step 1: Add private to form state**

In `web/src/components/DetailSidebar.tsx`:

1. Add `private: boolean` to the `FormFields` interface:

```typescript
interface FormFields {
  name: string
  role: string
  discipline: string
  team: string
  otherTeams: string
  managerId: string
  status: string
  employmentType: string
  level: string
  pod: string
  publicNote: string
  privateNote: string
  private: boolean
}
```

2. Update `blankForm` to include `private: false`.

3. Update `formFromPerson` to include `private: p.private ?? false`.

4. Update `formFromBatch` to include:
```typescript
private: people.every(p => (p.private ?? false) === (first.private ?? false)) ? (first.private ?? false) : false,
```

- [ ] **Step 2: Add private to handleSave**

In the single-person save path, after the existing note fields block, add:

```typescript
if (form.private !== (person.private ?? false)) fields.private = form.private ? 'true' : 'false'
```

In the batch save path, the existing batch logic handles arbitrary fields. Add `private` to the `batchDirty` check — since it's a boolean, add special handling. When `private` is in `batchDirty`:

```typescript
if (batchDirty.has('private')) {
  (fields as Record<string, string>).private = form.private ? 'true' : 'false'
}
```

- [ ] **Step 3: Add toggle UI to the form**

After the "Private Note" textarea and before the `saveError` div, add:

```tsx
<div className={styles.field}>
  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
    <span>Private</span>
    <input
      type="checkbox"
      data-testid="field-private"
      checked={form.private}
      onChange={(e) => {
        setForm((f) => ({ ...f, private: e.target.checked }))
        if (isBatch) setBatchDirty((d) => new Set(d).add('private'))
      }}
    />
  </label>
  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Hidden when private toggle is off</span>
</div>
```

- [ ] **Step 4: Update personDataKey to include private**

In the `personDataKey` computation, append `\0${person.private ?? false}` to trigger re-sync when the private field changes via the API.

- [ ] **Step 5: Run frontend tests**

Run: `cd web && npm test -- --run`
Expected: All PASS

- [ ] **Step 6: Commit**

```
feat: add private toggle to DetailSidebar edit form
```

---

### Task 12: Filter private people from recycle bin

**Files:**
- Modify: `web/src/components/RecycleBinDrawer.tsx`

- [ ] **Step 1: Filter recycled list by showPrivate**

In `web/src/components/RecycleBinDrawer.tsx`:

1. Import `useUI` from `../store/OrgContext`.
2. Get `showPrivate` from `useUI()`.
3. Filter the recycled list:

```typescript
const { recycled, binOpen, setBinOpen, restore, emptyBin } = useOrg()
const { showPrivate } = useUI()
const visibleRecycled = showPrivate ? recycled : recycled.filter((p) => !p.private)
```

4. Replace all references to `recycled` in the render with `visibleRecycled`.
5. Add the lock icon for private people when `showPrivate` is true:

```tsx
{visibleRecycled.map((p) => (
  <div key={p.id} className={styles.card}>
    <div>
      <div className={styles.name}>
        {p.name}
        {showPrivate && p.private && <span title="Private" style={{ marginLeft: 4, fontSize: 11 }}>{'\u{1F512}'}</span>}
      </div>
      <div className={styles.meta}>{p.role} — {p.team}</div>
    </div>
    <button className={styles.restoreBtn} onClick={() => restore(p.id)}>Restore</button>
  </div>
))}
```

- [ ] **Step 2: Update the RecycleBinButton badge count**

In `web/src/components/RecycleBinButton.tsx`:

1. Import `useUI` from `../store/OrgContext`.
2. Get `showPrivate` from `useUI()`.
3. Filter the count:

```typescript
const visibleCount = showPrivate ? recycled.length : recycled.filter((p) => !p.private).length
```

4. Use `visibleCount` for the badge and aria-label.

- [ ] **Step 3: Run frontend tests**

Run: `cd web && npm test -- --run`
Expected: All PASS

- [ ] **Step 4: Commit**

```
feat: filter private people from recycle bin when hidden
```

---

### Task 13: Filter private managers from manager dropdown

**Files:**
- Modify: `web/src/components/DetailSidebar.tsx`

- [ ] **Step 1: Filter the managers list**

In `web/src/components/DetailSidebar.tsx`, the `managers` memo computes the list of managers for the dropdown. Import `useUI` and get `showPrivate`:

```typescript
const { showPrivate } = useUI()
```

Then update the `managers` memo to filter out private managers when `showPrivate` is false:

```typescript
const managers = useMemo(() => {
  const managerIds = new Set(working.filter((p) => p.managerId).map((p) => p.managerId))
  let mgrs = working.filter((p) => managerIds.has(p.id))
  if (!showPrivate) {
    mgrs = mgrs.filter((p) => !p.private)
  }
  return mgrs.sort((a, b) => a.name.localeCompare(b.name))
}, [working, showPrivate])
```

Add `showPrivate` to the `useMemo` dependency array. Note: `useUI` is already imported via `useOrg` — check if `useUI` needs to be imported separately from `../store/OrgContext`.

- [ ] **Step 2: Run frontend tests**

Run: `cd web && npm test -- --run`
Expected: All PASS

- [ ] **Step 3: Commit**

```
feat: filter private managers from manager dropdown when hidden
```

---

### Task 14: Handle drop onto placeholder nodes

**Files:**
- Modify: `web/src/hooks/useDragDrop.ts` (or wherever drop handling resolves manager IDs)

- [ ] **Step 1: Resolve placeholder IDs to real manager IDs on drop**

Find the drop handler that calls `move()` or `reparent()`. When the target `managerId` starts with `__placeholder_`, strip the prefix to get the real manager ID:

```typescript
function resolveManagerId(id: string): string {
  if (id.startsWith('__placeholder_')) {
    return id.slice('__placeholder_'.length)
  }
  return id
}
```

Apply this function wherever a drop target's manager ID is resolved before calling the `move` or `reparent` API.

- [ ] **Step 2: Run frontend tests**

Run: `cd web && npm test -- --run`
Expected: All PASS

- [ ] **Step 3: Build and verify**

Run: `cd web && npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```
feat: resolve placeholder IDs to real manager IDs on drag-drop
```

---

### Task 15: Write scenario file

**Files:**
- Modify: `docs/scenarios/filters.md`

- [ ] **Step 1: Add private people scenario**

Append to `docs/scenarios/filters.md`:

```markdown
---

# Scenario: Private people visibility

**ID**: FILTER-004
**Area**: filters
**Tests**:
- `web/src/hooks/useFilteredPeople.test.ts` → "hides private people when showPrivate is false"
- `web/src/hooks/useFilteredPeople.test.ts` → "shows private people when showPrivate is true"
- `web/src/hooks/useFilteredPeople.test.ts` → "injects placeholder for hidden private manager with visible reports"
- `web/src/hooks/useFilteredPeople.test.ts` → "does not inject placeholder when private manager has no visible reports"
- `web/src/hooks/useFilteredPeople.test.ts` → "filters private people from ghost people in diff mode"

## Behavior
User marks people as private via the edit sidebar. Private people are hidden from all views by default. A toolbar toggle (visible only when private people exist) reveals/hides them. Hidden private managers with visible reports are replaced by "TBD Manager" placeholder nodes.

## Invariants
- Private field defaults to false
- showPrivate defaults to false (hidden by default)
- Toolbar toggle only visible when at least one person is private
- Placeholder managers have stable deterministic IDs based on the real manager ID
- Placeholders are non-interactive (no edit, no delete, no drag-as-source)
- Drops onto placeholders resolve to the real hidden manager ID
- Private people are excluded from ghost people when hidden in diff mode
- Private people are excluded from recycle bin when hidden
- Metrics reflect only visible people when private people are hidden
- Exports always include all people regardless of toggle state

## Edge cases
- Private manager with no visible reports → no placeholder injected
- Head person is private and hidden → head filter clears
- All people private and hidden → empty view
```

- [ ] **Step 2: Commit**

```
docs: add FILTER-004 private people scenario
```

---

### Task 16: Full build and integration test

**Files:** None — verification only

- [ ] **Step 1: Run all Go tests**

Run: `go test ./...`
Expected: All PASS

- [ ] **Step 2: Run all frontend tests**

Run: `cd web && npm test -- --run`
Expected: All PASS

- [ ] **Step 3: Build complete application**

Run: `make build`
Expected: Build succeeds, produces `./grove` binary

- [ ] **Step 4: Run scenario check**

Run: `make check-scenarios`
Expected: FILTER-004 scenarios have corresponding test IDs

- [ ] **Step 5: Commit any final fixes**

If any tests or build steps failed, fix and commit.
