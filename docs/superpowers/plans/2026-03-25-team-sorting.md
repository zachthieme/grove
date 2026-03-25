# Team Sorting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automatic sorting within pods — FTEs first, then by configurable discipline order, then by seniority level — with a `level` field on Person and a settings modal for discipline ordering.

**Architecture:** Level is a new int field on Person flowing through all layers (model → API → TypeScript → parser → export). Settings (discipline order) is a new type on OrgService, included in OrgData responses, autosave, snapshots, and ZIP sidecar. Sorting is frontend-only via a `useSortedPeople` hook applied at render time — no backend sort mutation.

**Tech Stack:** Go backend, React/TypeScript frontend, vitest, Go testing.

**Spec:** `docs/superpowers/specs/2026-03-25-team-sorting-design.md`

---

## File Map

### New Files
- `web/src/hooks/useSortedPeople.ts` — Frontend sorting hook
- `web/src/hooks/useSortedPeople.test.ts` — Tests for sorting hook
- `web/src/components/SettingsModal.tsx` — Settings modal with draggable discipline order
- `web/src/components/SettingsModal.module.css` — Styles for settings modal

### Modified Files
- `internal/model/model.go` — Add `Level int` to Person
- `internal/api/model.go` — Add `Level` to Person, add `Settings` type, add `Settings` to `OrgData`, `AutosaveData`, `snapshotData`
- `internal/api/convert.go` — Copy `Level` in `ConvertOrgWithIDMap`
- `internal/api/export.go` — Add `Level` to export headers/row; add `ExportSettingsSidecarCSV`
- `internal/api/infer.go` — Add inference for `level`
- `internal/parser/parser.go` — Parse `level` with `strconv.Atoi`
- `internal/api/service.go` — Add `settings` to OrgService; add `case "level"` to Update; add `GetSettings`/`UpdateSettings`; derive default discipline order on upload; include settings in OrgData returns
- `internal/api/handlers.go` — Register settings endpoints
- `internal/api/snapshots.go` — Save/load settings in snapshots
- `internal/api/snapshot_store.go` — Update `persistedSnapshot` with `Settings`
- `internal/api/zipimport.go` — Filter `settings.csv` sidecar; apply on import
- `web/src/api/types.ts` — Add `level` to Person, add `Settings` interface, update `OrgData`/`AutosaveData`
- `web/src/api/client.ts` — Add settings API functions
- `web/src/store/orgTypes.ts` — Add `settings` to state/actions
- `web/src/store/OrgDataContext.tsx` — Wire settings through state
- `web/src/store/OrgContext.tsx` — Expose settings
- `web/src/hooks/useAutosave.ts` — Include settings in payload
- `web/src/components/Toolbar.tsx` — Add gear icon for settings modal
- `web/src/App.tsx` — Pass sorted people to views

---

## Task 1: Level Field — All Layers

Add `Level int` to Person at domain, API, TypeScript, conversion, parser, inference, export, and Update handler.

**Files:**
- Modify: `internal/model/model.go`
- Modify: `internal/api/model.go`
- Modify: `internal/api/convert.go`
- Modify: `internal/parser/parser.go`
- Modify: `internal/api/infer.go`
- Modify: `internal/api/export.go`
- Modify: `internal/api/service.go`
- Test: `internal/api/export_test.go`
- Test: `internal/api/infer_test.go`
- Test: `internal/api/service_test.go`
- Modify: `web/src/api/types.ts`

- [ ] **Step 1: Add Level to domain model**

In `internal/model/model.go`, add to Person struct after `PrivateNote`:
```go
Level       int
```

- [ ] **Step 2: Add Level to API model**

In `internal/api/model.go`, add to Person struct after `PrivateNote`:
```go
Level       int    `json:"level,omitempty"`
```

- [ ] **Step 3: Copy Level in ConvertOrgWithIDMap**

In `internal/api/convert.go`, add to the Person literal after `PrivateNote`:
```go
Level:       p.Level,
```

- [ ] **Step 4: Write failing test for export**

In `internal/api/export_test.go`, add:
```go
func TestExportCSV_IncludesLevel(t *testing.T) {
	people := []Person{
		{Id: "1", Name: "Alice", Role: "VP", Team: "Eng", Status: "Active", Level: 7},
	}
	data, err := ExportCSV(people)
	if err != nil {
		t.Fatal(err)
	}
	csv := string(data)
	if !strings.Contains(csv, "Level") {
		t.Error("expected Level header")
	}
	if !strings.Contains(csv, "7") {
		t.Error("expected level value 7")
	}
}
```

- [ ] **Step 5: Run test to verify it fails**

Run: `go test ./internal/api/ -run TestExportCSV_IncludesLevel -v`
Expected: FAIL

- [ ] **Step 6: Update export.go**

Add `"Level"` to `exportHeaders` (before `"Pod"`):
```go
var exportHeaders = []string{"Name", "Role", "Discipline", "Manager", "Team", "Additional Teams", "Status", "Employment Type", "New Role", "New Team", "Level", "Pod", "Public Note", "Private Note"}
```

Update `personToRow` to include level:
```go
func personToRow(p Person, idToName map[string]string) []string {
	managerName := idToName[p.ManagerId]
	levelStr := ""
	if p.Level != 0 {
		levelStr = strconv.Itoa(p.Level)
	}
	return []string{
		p.Name, p.Role, p.Discipline, managerName, p.Team,
		strings.Join(p.AdditionalTeams, ","), p.Status, p.EmploymentType,
		p.NewRole, p.NewTeam, levelStr, p.Pod, p.PublicNote, p.PrivateNote,
	}
}
```

Add `"strconv"` to imports.

- [ ] **Step 7: Run export test**

Run: `go test ./internal/api/ -run TestExportCSV_IncludesLevel -v`
Expected: PASS

- [ ] **Step 8: Write failing test for inference**

In `internal/api/infer_test.go`:
```go
func TestInferMapping_Level(t *testing.T) {
	headers := []string{"Name", "Team", "Level"}
	m := InferMapping(headers)
	if mc, ok := m["level"]; !ok || mc.Column != "Level" {
		t.Errorf("expected level mapped, got %+v", m["level"])
	}
}
```

- [ ] **Step 9: Run to verify it fails, then update infer.go**

Add to `exactMatches`:
```go
"level": "level",
```

Add to `synonyms`:
```go
"seniority": "level",
"grade":     "level",
"job level": "level",
```

- [ ] **Step 10: Run inference test**

Run: `go test ./internal/api/ -run TestInferMapping_Level -v`
Expected: PASS

- [ ] **Step 11: Update parser.go**

In `internal/parser/parser.go`, add `"strconv"` to imports. After the `PrivateNote` assignment in the Person literal, add level parsing:
```go
if raw := get("level"); raw != "" {
	if n, err := strconv.Atoi(raw); err == nil {
		p.Level = n
	}
}
```

Note: Level is set after the struct literal since it needs conditional parsing.

- [ ] **Step 12: Add `case "level"` to Update in service.go**

Add `"strconv"` to imports. Add the case in the switch (do NOT add "level" to the note-extraction loop — level values are short ints that won't hit the 500-char limit):
```go
case "level":
	n, err := strconv.Atoi(v)
	if err != nil {
		return nil, fmt.Errorf("invalid level: %s", v)
	}
	p.Level = n
```

- [ ] **Step 13: Add Level to DetailSidebar**

In `web/src/components/DetailSidebar.tsx`, add `level: string` to `FormFields` and `blankForm`. In the form population `useEffect`, add `level: String(person.level ?? 0)`. Add a numeric input field after the employment type field:
```tsx
<label className={styles.label}>
  Level
  <input
    className={styles.input}
    type="number"
    min="0"
    value={form.level}
    onChange={(e) => setForm(f => ({ ...f, level: e.target.value }))}
  />
</label>
```
In `handleSave`, include: `if (form.level !== String(person.level ?? 0)) fields.level = form.level`

- [ ] **Step 14: Add Level to TypeScript Person**

In `web/src/api/types.ts`, add after `privateNote`:
```typescript
level?: number
```

- [ ] **Step 15: Run all tests**

Run: `go test ./...` and `cd web && npx tsc --noEmit`
Expected: All pass. Fix any existing test that checks exact CSV output (the new Level column shifts positions for Pod/Notes).

- [ ] **Step 16: Commit**

```
feat: add level field to Person at all layers
```

---

## Task 2: Settings Type & OrgService Integration

Add `Settings` type, wire into OrgService, derive defaults, include in OrgData.

**Files:**
- Modify: `internal/api/model.go`
- Modify: `internal/api/service.go`
- Modify: `internal/api/snapshots.go`
- Modify: `internal/api/snapshot_store.go`
- Test: `internal/api/service_test.go`

- [ ] **Step 1: Add Settings type and update model types**

In `internal/api/model.go`, add after `PodInfo`:
```go
type Settings struct {
	DisciplineOrder []string `json:"disciplineOrder"`
}
```

Add `Settings` to `OrgData`:
```go
type OrgData struct {
	Original           []Person  `json:"original"`
	Working            []Person  `json:"working"`
	Pods               []Pod     `json:"pods,omitempty"`
	Settings           *Settings `json:"settings,omitempty"`
	PersistenceWarning string    `json:"persistenceWarning,omitempty"`
}
```

Add `Settings` to `AutosaveData`:
```go
Settings     *Settings `json:"settings,omitempty"`
```

- [ ] **Step 2: Update snapshotData and persistedSnapshot**

In `internal/api/snapshots.go`, add to `snapshotData`:
```go
Settings  Settings
```

In `internal/api/snapshot_store.go`, add to `persistedSnapshot`:
```go
Settings  Settings `json:"settings,omitempty"`
```

Update the field-by-field copy in `WriteSnapshots` and `ReadSnapshots` to include `Settings`.

- [ ] **Step 3: Add settings field and derivation to OrgService**

In `internal/api/service.go`, add to `OrgService` struct:
```go
settings Settings
```

Add a helper function (in `service.go` or a new small function):
```go
func deriveDisciplineOrder(people []Person) []string {
	seen := map[string]bool{}
	var disciplines []string
	for _, p := range people {
		d := p.Discipline
		if d != "" && !seen[d] {
			seen[d] = true
			disciplines = append(disciplines, d)
		}
	}
	sort.Strings(disciplines)
	return disciplines
}
```

Add `"sort"` to imports if not already present.

- [ ] **Step 4: Write failing test**

In `internal/api/service_test.go`:
```go
func TestUpload_DerivesSettings(t *testing.T) {
	svc := NewOrgService()
	csv := "Name,Role,Discipline,Manager,Team,Status\nAlice,VP,Product,,Eng,Active\nBob,Engineer,Engineering,Alice,Platform,Active\n"
	resp, err := svc.Upload("test.csv", []byte(csv))
	if err != nil {
		t.Fatal(err)
	}
	if resp.OrgData.Settings == nil {
		t.Fatal("expected settings in response")
	}
	order := resp.OrgData.Settings.DisciplineOrder
	if len(order) != 2 {
		t.Fatalf("expected 2 disciplines, got %d", len(order))
	}
	// Alphabetical: Engineering before Product
	if order[0] != "Engineering" || order[1] != "Product" {
		t.Errorf("expected [Engineering Product], got %v", order)
	}
}
```

- [ ] **Step 5: Run test to verify it fails**

Run: `go test ./internal/api/ -run TestUpload_DerivesSettings -v`
Expected: FAIL

- [ ] **Step 6: Update Upload to derive settings and include in OrgData**

In `Upload`, after pod seeding, add:
```go
s.settings = Settings{DisciplineOrder: deriveDisciplineOrder(s.working)}
```

Update every `OrgData` construction in `Upload` to include `Settings: &s.settings`.

Do the same in `GetOrg`, `LoadSnapshot`, and `ConfirmMapping` — every place `OrgData` is returned must include `Settings: &s.settings`.

For `ResetToOriginal`: re-derive settings from the original data before including them:
```go
s.settings = Settings{DisciplineOrder: deriveDisciplineOrder(s.original)}
```
Then include `Settings: &s.settings` in the returned `OrgData`.

- [ ] **Step 7: Update UploadZip to derive settings**

Same as Upload — after pod seeding, derive settings.

- [ ] **Step 8: Update SaveSnapshot to include settings**

In `SaveSnapshot`:
```go
s.snapshots[name] = snapshotData{
	People:    deepCopyPeople(s.working),
	Pods:      CopyPods(s.pods),
	Settings:  s.settings,
	Timestamp: time.Now(),
}
```

- [ ] **Step 9: Update LoadSnapshot to restore settings**

```go
if len(snap.Settings.DisciplineOrder) > 0 {
	s.settings = snap.Settings
} else {
	s.settings = Settings{DisciplineOrder: deriveDisciplineOrder(s.working)}
}
```

- [ ] **Step 10: Add GetSettings and UpdateSettings methods**

```go
func (s *OrgService) GetSettings() Settings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.settings
}

func (s *OrgService) UpdateSettings(settings Settings) Settings {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.settings = settings
	return s.settings
}
```

- [ ] **Step 11: Run test**

Run: `go test ./internal/api/ -run TestUpload_DerivesSettings -v`
Expected: PASS

- [ ] **Step 12: Run all tests**

Run: `go test ./...`
Expected: All pass (fix any snapshot_store conversion issues with the new Settings field).

- [ ] **Step 13: Commit**

```
feat: add Settings type with discipline order, wire into OrgService
```

---

## Task 3: Settings HTTP Endpoints & ZIP Sidecar

Register settings API endpoints and handle settings.csv in ZIP import/export.

**Files:**
- Modify: `internal/api/handlers.go`
- Modify: `internal/api/export.go`
- Modify: `internal/api/zipimport.go`
- Test: `internal/api/handlers_test.go`
- Test: `internal/api/zipimport_test.go`

- [ ] **Step 1: Write failing handler test**

In `internal/api/handlers_test.go`:
```go
func TestSettingsHandler_GetAndPost(t *testing.T) {
	svc := NewOrgService()
	svc.Upload("test.csv", []byte("Name,Role,Discipline,Manager,Team,Status\nAlice,VP,Eng,,Eng,Active\n"))

	// GET settings
	req := httptest.NewRequest("GET", "/api/settings", nil)
	w := httptest.NewRecorder()
	NewRouter(svc, nil).ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("GET settings: expected 200, got %d", w.Code)
	}
	var settings Settings
	json.Unmarshal(w.Body.Bytes(), &settings)
	if len(settings.DisciplineOrder) == 0 {
		t.Error("expected non-empty discipline order")
	}

	// POST settings
	body := `{"disciplineOrder":["Product","Eng"]}`
	req = httptest.NewRequest("POST", "/api/settings", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	NewRouter(svc, nil).ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("POST settings: expected 200, got %d", w.Code)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/api/ -run TestSettingsHandler -v`
Expected: FAIL (404)

- [ ] **Step 3: Register settings routes and implement handlers**

In `handlers.go`, register in `NewRouter`:
```go
mux.HandleFunc("GET /api/settings", handleGetSettings(svc))
mux.HandleFunc("POST /api/settings", handleUpdateSettings(svc))
```

Implement:
```go
func handleGetSettings(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, svc.GetSettings())
	}
}

func handleUpdateSettings(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limitBody(w, r)
		var settings Settings
		if err := json.NewDecoder(r.Body).Decode(&settings); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		result := svc.UpdateSettings(settings)
		writeJSON(w, http.StatusOK, result)
	}
}
```

- [ ] **Step 4: Run handler test**

Run: `go test ./internal/api/ -run TestSettingsHandler -v`
Expected: PASS

- [ ] **Step 5: Add ExportSettingsSidecarCSV to export.go**

```go
func ExportSettingsSidecarCSV(settings Settings) ([]byte, error) {
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	if err := w.Write([]string{"Discipline Order"}); err != nil {
		return nil, fmt.Errorf("writing settings header: %w", err)
	}
	for _, d := range settings.DisciplineOrder {
		if err := w.Write([]string{d}); err != nil {
			return nil, fmt.Errorf("writing settings row: %w", err)
		}
	}
	w.Flush()
	return buf.Bytes(), w.Error()
}
```

- [ ] **Step 6: Add settings sidecar export endpoint**

In `handlers.go`, register:
```go
mux.HandleFunc("GET /api/export/settings-sidecar", handleExportSettingsSidecar(svc))
```

```go
func handleExportSettingsSidecar(svc *OrgService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		settings := svc.GetSettings()
		if len(settings.DisciplineOrder) == 0 {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		data, err := ExportSettingsSidecarCSV(settings)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", "attachment; filename=settings.csv")
		w.Write(data)
	}
}
```

- [ ] **Step 7: Update zipimport.go to filter settings.csv**

In `parseZipFileList`, add after the pods.csv check:
```go
if strings.ToLower(nameNoExt) == "settings" && ext == ".csv" {
	settingsSidecarData = content
	continue
}
```

Add `var settingsSidecarData []byte` alongside `podsSidecarData`. Change return signature to return 4 values: `([]zipEntry, []byte, []byte, error)` — entries, podsSidecar, settingsSidecar.

Update all callers (`UploadZip`, `ConfirmMapping`) to accept the 4th return value.

- [ ] **Step 8: Add parseSettingsSidecar function**

```go
func parseSettingsSidecar(data []byte) []string {
	reader := csv.NewReader(bytes.NewReader(data))
	records, err := reader.ReadAll()
	if err != nil || len(records) < 2 {
		return nil
	}
	var order []string
	for _, row := range records[1:] {
		if len(row) > 0 && strings.TrimSpace(row[0]) != "" {
			order = append(order, strings.TrimSpace(row[0]))
		}
	}
	return order
}
```

- [ ] **Step 9: Apply settings sidecar in UploadZip**

After pod sidecar handling:
```go
if settingsSidecar != nil {
	if order := parseSettingsSidecar(settingsSidecar); len(order) > 0 {
		s.settings = Settings{DisciplineOrder: order}
	}
}
```

Do the same in `ConfirmMapping`'s ZIP path (`service.go`). In the `pendingIsZip` branch, after the existing `parseZipFileList` call, accept the 4th return value (`settingsSidecar`). After pod sidecar handling, add:
```go
if settingsSidecar != nil {
	if order := parseSettingsSidecar(settingsSidecar); len(order) > 0 {
		s.settings = Settings{DisciplineOrder: order}
	}
}
```

Also update `ConfirmMapping`'s non-ZIP path: after deriving default settings from `deriveDisciplineOrder`, include `Settings: &s.settings` in the returned `OrgData`.

- [ ] **Step 10: Write ZIP sidecar test**

In `internal/api/zipimport_test.go`:
```go
func TestUploadZip_RestoresSettingsFromSidecar(t *testing.T) {
	svc := NewOrgService()
	settingsCsv := "Discipline Order\nProduct\nEng\n"
	data := buildTestZip(t, []zipFile{
		{"0-original.csv", testCSVContent},
		{"1-working.csv", testCSVContent2},
		{"settings.csv", settingsCsv},
	})
	resp, err := svc.UploadZip(data)
	if err != nil {
		t.Fatalf("UploadZip failed: %v", err)
	}
	if resp.OrgData.Settings == nil {
		t.Fatal("expected settings")
	}
	order := resp.OrgData.Settings.DisciplineOrder
	if len(order) != 2 || order[0] != "Product" || order[1] != "Eng" {
		t.Errorf("expected [Product Eng], got %v", order)
	}
}
```

- [ ] **Step 11: Run all tests**

Run: `go test ./...`
Expected: All pass.

- [ ] **Step 12: Commit**

```
feat: add settings endpoints and settings.csv ZIP sidecar
```

---

## Task 4: Frontend Types, API Client & State

Update TypeScript types, add API functions, wire settings into state.

**Files:**
- Modify: `web/src/api/types.ts`
- Modify: `web/src/api/client.ts`
- Modify: `web/src/store/orgTypes.ts`
- Modify: `web/src/store/OrgDataContext.tsx`
- Modify: `web/src/store/OrgContext.tsx`
- Modify: `web/src/hooks/useAutosave.ts`
- Modify: `web/src/hooks/useSnapshotExport.ts`

- [ ] **Step 1: Add Settings type to types.ts**

```typescript
export interface Settings {
  disciplineOrder: string[]
}
```

Update `OrgData`:
```typescript
export interface OrgData {
  original: Person[]
  working: Person[]
  pods?: Pod[]
  settings?: Settings
  persistenceWarning?: string
}
```

Update `AutosaveData` to include:
```typescript
settings?: Settings
```

- [ ] **Step 2: Add settings API functions to client.ts**

```typescript
export async function getSettings(): Promise<Settings> {
  return json<Settings>(await fetchWithTimeout(`${BASE}/settings`))
}

export async function updateSettings(settings: Settings): Promise<Settings> {
  const resp = await fetchWithTimeout(`${BASE}/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  return json<Settings>(resp)
}

export async function exportSettingsSidecarBlob(): Promise<Blob | null> {
  const resp = await fetchWithTimeout(`${BASE}/export/settings-sidecar`)
  if (resp.status === 204) return null
  if (!resp.ok) throw new Error(`Export settings sidecar failed: ${resp.status}`)
  return resp.blob()
}
```

- [ ] **Step 3: Update orgTypes.ts**

Add `Settings` to imports. Add to `OrgDataContextValue`:
```typescript
settings: Settings
updateSettings: (settings: Settings) => Promise<void>
```

Add to `OrgState`:
```typescript
settings: Settings
```

Add to `OrgActions`:
```typescript
updateSettings: (settings: Settings) => Promise<void>
```

- [ ] **Step 4: Update OrgDataContext.tsx**

Add `settings: { disciplineOrder: [] }` to initial state and state interface.

Extract `data.settings` in all mutation handlers that return OrgData: `upload`, `confirmMapping`, `loadSnapshot`.

Add `updateSettings` callback:
```typescript
const updateSettings = useCallback(async (newSettings: Settings) => {
  try {
    const result = await api.updateSettings(newSettings)
    setState(s => ({ ...s, settings: result }))
  } catch (err) { handleError(err) }
}, [handleError])
```

In `restoreAutosave`, extract `ad.settings`:
```typescript
settings: ad.settings ?? { disciplineOrder: [] },
```

In `dismissAutosave`, reset settings:
```typescript
settings: { disciplineOrder: [] },
```

In the `init` function where `getOrg` is called, extract settings:
```typescript
settings: data.settings ?? { disciplineOrder: [] },
```

Include `settings` and `updateSettings` in the memoized value.

- [ ] **Step 5: Update OrgContext.tsx**

Wire `settings` and `updateSettings` through to the merged context value.

- [ ] **Step 6: Update useAutosave.ts**

Add `Settings` to imports. Add `settings: Settings` to state parameter. Include in autosave data:
```typescript
settings: state.settings,
```

Add `state.settings` to dependency array.

- [ ] **Step 7: Update useSnapshotExport.ts**

Add settings.csv sidecar to ZIP export (same pattern as pods.csv):
```typescript
try {
  const settingsSidecar = await exportSettingsSidecarBlob()
  if (settingsSidecar) {
    zip.file('settings.csv', settingsSidecar)
  }
} catch {
  console.warn('Failed to export settings sidecar')
}
```

- [ ] **Step 8: Verify**

Run: `cd web && npx tsc --noEmit && npm test -- --run`
Expected: Clean compilation, all tests pass.

- [ ] **Step 9: Commit**

```
feat(web): add settings state, API client, and autosave support
```

---

## Task 5: useSortedPeople Hook

The core sorting logic — frontend-only.

**Files:**
- Create: `web/src/hooks/useSortedPeople.ts`
- Create: `web/src/hooks/useSortedPeople.test.ts`

- [ ] **Step 1: Write failing tests**

Create `web/src/hooks/useSortedPeople.test.ts`:

```typescript
import { useSortedPeople } from './useSortedPeople'

// Test helper — call the sort function directly (it's a pure function internally)
// We'll test the underlying sortPeople function, not the hook wrapper

import { sortPeople } from './useSortedPeople'
import type { Person } from '../api/types'

const makePerson = (overrides: Partial<Person>): Person => ({
  id: '1', name: 'Test', role: '', discipline: '', managerId: '', team: '',
  additionalTeams: [], status: 'Active', ...overrides,
})

describe('sortPeople', () => {
  it('sorts FTEs before non-FTEs', () => {
    const people = [
      makePerson({ id: 'a', name: 'CW-Person', employmentType: 'CW', managerId: 'm1', team: 'T' }),
      makePerson({ id: 'b', name: 'FTE-Person', employmentType: 'FTE', managerId: 'm1', team: 'T' }),
    ]
    const sorted = sortPeople(people, [])
    expect(sorted[0].name).toBe('FTE-Person')
    expect(sorted[1].name).toBe('CW-Person')
  })

  it('sorts Interns with FTEs (tier 0)', () => {
    const people = [
      makePerson({ id: 'a', name: 'PSP', employmentType: 'PSP', managerId: 'm1', team: 'T' }),
      makePerson({ id: 'b', name: 'Intern', employmentType: 'Intern', managerId: 'm1', team: 'T' }),
    ]
    const sorted = sortPeople(people, [])
    expect(sorted[0].name).toBe('Intern')
  })

  it('sorts by discipline order within same tier', () => {
    const people = [
      makePerson({ id: 'a', name: 'Product-Person', discipline: 'Product', managerId: 'm1', team: 'T' }),
      makePerson({ id: 'b', name: 'Eng-Person', discipline: 'Eng', managerId: 'm1', team: 'T' }),
    ]
    const sorted = sortPeople(people, ['Eng', 'Product'])
    expect(sorted[0].name).toBe('Eng-Person')
    expect(sorted[1].name).toBe('Product-Person')
  })

  it('sorts unknown disciplines to end alphabetically', () => {
    const people = [
      makePerson({ id: 'a', name: 'Zzz', discipline: 'Zzz', managerId: 'm1', team: 'T' }),
      makePerson({ id: 'b', name: 'Eng', discipline: 'Eng', managerId: 'm1', team: 'T' }),
      makePerson({ id: 'c', name: 'Aaa', discipline: 'Aaa', managerId: 'm1', team: 'T' }),
    ]
    const sorted = sortPeople(people, ['Eng'])
    expect(sorted[0].name).toBe('Eng')
    expect(sorted[1].name).toBe('Aaa')
    expect(sorted[2].name).toBe('Zzz')
  })

  it('sorts by level descending within same discipline', () => {
    const people = [
      makePerson({ id: 'a', name: 'Junior', discipline: 'Eng', level: 2, managerId: 'm1', team: 'T' }),
      makePerson({ id: 'b', name: 'Senior', discipline: 'Eng', level: 6, managerId: 'm1', team: 'T' }),
    ]
    const sorted = sortPeople(people, ['Eng'])
    expect(sorted[0].name).toBe('Senior')
    expect(sorted[1].name).toBe('Junior')
  })

  it('sorts level 0 (unset) below set levels', () => {
    const people = [
      makePerson({ id: 'a', name: 'Unset', discipline: 'Eng', level: 0, managerId: 'm1', team: 'T' }),
      makePerson({ id: 'b', name: 'IC1', discipline: 'Eng', level: 1, managerId: 'm1', team: 'T' }),
    ]
    const sorted = sortPeople(people, ['Eng'])
    expect(sorted[0].name).toBe('IC1')
    expect(sorted[1].name).toBe('Unset')
  })

  it('preserves sortIndex order on ties', () => {
    const people = [
      makePerson({ id: 'a', name: 'Second', discipline: 'Eng', level: 3, sortIndex: 2, managerId: 'm1', team: 'T' }),
      makePerson({ id: 'b', name: 'First', discipline: 'Eng', level: 3, sortIndex: 1, managerId: 'm1', team: 'T' }),
    ]
    const sorted = sortPeople(people, ['Eng'])
    expect(sorted[0].name).toBe('First')
    expect(sorted[1].name).toBe('Second')
  })

  it('does not sort root nodes (no managerId)', () => {
    const people = [
      makePerson({ id: 'a', name: 'Root', managerId: '', team: 'T' }),
    ]
    const sorted = sortPeople(people, [])
    expect(sorted).toEqual(people)
  })

  it('sorts independently per (managerId, team) group', () => {
    const people = [
      makePerson({ id: 'a', name: 'CW-T1', employmentType: 'CW', managerId: 'm1', team: 'T1' }),
      makePerson({ id: 'b', name: 'FTE-T1', employmentType: 'FTE', managerId: 'm1', team: 'T1' }),
      makePerson({ id: 'c', name: 'CW-T2', employmentType: 'CW', managerId: 'm1', team: 'T2' }),
      makePerson({ id: 'd', name: 'FTE-T2', employmentType: 'FTE', managerId: 'm1', team: 'T2' }),
    ]
    const sorted = sortPeople(people, [])
    // Within T1: FTE first
    const t1 = sorted.filter(p => p.team === 'T1')
    expect(t1[0].name).toBe('FTE-T1')
    // Within T2: FTE first
    const t2 = sorted.filter(p => p.team === 'T2')
    expect(t2[0].name).toBe('FTE-T2')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run --reporter=verbose -- useSortedPeople`
Expected: FAIL — module not found

- [ ] **Step 3: Implement useSortedPeople**

Create `web/src/hooks/useSortedPeople.ts`:

```typescript
import { useMemo } from 'react'
import type { Person } from '../api/types'

function employmentTier(empType: string | undefined): number {
  if (!empType || empType === 'FTE' || empType === 'Intern') return 0
  return 1
}

function disciplineRank(discipline: string, order: string[]): number {
  const idx = order.indexOf(discipline)
  if (idx >= 0) return idx
  // Unknown disciplines: sort after all known, use a high base + alpha
  return order.length
}

export function sortPeople(people: Person[], disciplineOrder: string[]): Person[] {
  // Group by (managerId, team)
  type GroupKey = string
  const groups = new Map<GroupKey, Person[]>()
  const ungrouped: Person[] = []

  for (const p of people) {
    if (!p.managerId) {
      ungrouped.push(p)
      continue
    }
    const key = `${p.managerId}:${p.team}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(p)
  }

  // Sort each group independently
  for (const group of groups.values()) {
    group.sort((a, b) => {
      // 1. Employment tier
      const tierA = employmentTier(a.employmentType)
      const tierB = employmentTier(b.employmentType)
      if (tierA !== tierB) return tierA - tierB

      // 2. Discipline rank
      const discA = disciplineRank(a.discipline, disciplineOrder)
      const discB = disciplineRank(b.discipline, disciplineOrder)
      if (discA !== discB) {
        if (discA >= disciplineOrder.length && discB >= disciplineOrder.length) {
          // Both unknown: sort alphabetically
          return a.discipline.localeCompare(b.discipline)
        }
        return discA - discB
      }

      // 3. Level descending (0 = unset, sorts last)
      const levelA = a.level ?? 0
      const levelB = b.level ?? 0
      if (levelA !== levelB) {
        if (levelA === 0) return 1
        if (levelB === 0) return -1
        return levelB - levelA // descending
      }

      // 4. Tiebreaker: sortIndex
      return (a.sortIndex ?? 0) - (b.sortIndex ?? 0)
    })
  }

  // Reassemble in original group order (preserves root/group ordering)
  const result: Person[] = []
  const seen = new Set<string>()

  for (const p of people) {
    if (!p.managerId) {
      result.push(p)
      continue
    }
    const key = `${p.managerId}:${p.team}`
    if (!seen.has(key)) {
      seen.add(key)
      result.push(...groups.get(key)!)
    }
  }

  return result
}

export function useSortedPeople(people: Person[], disciplineOrder: string[]): Person[] {
  return useMemo(
    () => sortPeople(people, disciplineOrder),
    [people, disciplineOrder]
  )
}
```

- [ ] **Step 4: Run tests**

Run: `cd web && npx vitest run --reporter=verbose -- useSortedPeople`
Expected: All PASS

- [ ] **Step 5: Commit**

```
feat(web): add useSortedPeople hook for pod-level sorting
```

---

## Task 6: Settings Modal UI

Draggable discipline order list in a modal.

**Files:**
- Create: `web/src/components/SettingsModal.tsx`
- Create: `web/src/components/SettingsModal.module.css`
- Modify: `web/src/components/Toolbar.tsx`

- [ ] **Step 1: Create SettingsModal component**

Create `web/src/components/SettingsModal.tsx`:

```typescript
import { useState, useEffect, useCallback } from 'react'
import { useOrg } from '../store/OrgContext'
import styles from './SettingsModal.module.css'

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const { working, settings, updateSettings } = useOrg()

  // Derive unique disciplines from current data
  const allDisciplines = Array.from(new Set(
    working.filter(p => p.discipline).map(p => p.discipline)
  )).sort()

  // Start with current order, appending any new disciplines not yet in the order
  const [order, setOrder] = useState<string[]>(() => {
    const existing = settings.disciplineOrder
    const extra = allDisciplines.filter(d => !existing.includes(d))
    return [...existing.filter(d => allDisciplines.includes(d)), ...extra]
  })

  const [dragIdx, setDragIdx] = useState<number | null>(null)

  const handleDragStart = (idx: number) => setDragIdx(idx)

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    if (dragIdx === null || dragIdx === idx) return
    const newOrder = [...order]
    const [moved] = newOrder.splice(dragIdx, 1)
    newOrder.splice(idx, 0, moved)
    setOrder(newOrder)
    setDragIdx(idx)
  }

  const handleDragEnd = () => setDragIdx(null)

  const handleSave = useCallback(async () => {
    await updateSettings({ disciplineOrder: order })
    onClose()
  }, [order, updateSettings, onClose])

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <h3 className={styles.title}>Settings</h3>
        <h4 className={styles.sectionTitle}>Discipline Order</h4>
        <p className={styles.hint}>Drag to reorder. People are sorted by this order within each pod.</p>
        <ul className={styles.list}>
          {order.map((d, i) => (
            <li
              key={d}
              className={`${styles.item} ${dragIdx === i ? styles.dragging : ''}`}
              draggable
              onDragStart={() => handleDragStart(i)}
              onDragOver={(e) => handleDragOver(e, i)}
              onDragEnd={handleDragEnd}
            >
              <span className={styles.grip}>⠿</span>
              {d}
            </li>
          ))}
        </ul>
        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button className={styles.saveBtn} onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create SettingsModal.module.css**

```css
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  background: var(--bg-primary, #fff);
  border-radius: 8px;
  padding: 24px;
  min-width: 320px;
  max-width: 400px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.title {
  margin: 0 0 16px;
  font-size: 1.1rem;
}

.sectionTitle {
  margin: 0 0 4px;
  font-size: 0.9rem;
}

.hint {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
  margin: 0 0 12px;
}

.list {
  list-style: none;
  padding: 0;
  margin: 0 0 16px;
}

.item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 4px;
  margin-bottom: 4px;
  cursor: grab;
  background: var(--bg-primary, #fff);
  font-size: 0.85rem;
}

.item:active { cursor: grabbing; }

.dragging {
  opacity: 0.5;
  border-color: var(--accent, #3b82f6);
}

.grip {
  color: var(--text-secondary, #9ca3af);
  user-select: none;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.cancelBtn, .saveBtn {
  padding: 6px 16px;
  border-radius: 4px;
  font-size: 0.85rem;
  cursor: pointer;
  border: 1px solid var(--border, #e5e7eb);
  background: var(--bg-primary, #fff);
}

.saveBtn {
  background: var(--accent, #3b82f6);
  color: white;
  border-color: var(--accent, #3b82f6);
}
```

- [ ] **Step 3: Add gear icon to Toolbar**

In `web/src/components/Toolbar.tsx`, import `SettingsModal` and add state:

```typescript
import SettingsModal from './SettingsModal'

// Inside component:
const [settingsOpen, setSettingsOpen] = useState(false)
```

Add a gear button after the existing toolbar buttons (before the export area):
```tsx
{loaded && (
  <button
    className={styles.iconBtn}
    onClick={() => setSettingsOpen(true)}
    title="Settings"
  >
    ⚙
  </button>
)}
{settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
```

- [ ] **Step 4: Verify**

Run: `cd web && npx tsc --noEmit && npm test -- --run`
Expected: Clean compilation, all tests pass.

- [ ] **Step 5: Commit**

```
feat(web): add settings modal with draggable discipline ordering
```

---

## Task 7: View Integration — Apply Sorting

Wire `useSortedPeople` into the views.

**Files:**
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Apply sorting in App.tsx**

Read `web/src/App.tsx` first. Import and apply `useSortedPeople`:

```typescript
import { useSortedPeople } from './hooks/useSortedPeople'
```

Read `App.tsx` carefully — the views receive a `people` prop that comes from `useFilteredPeople` (which applies head-subtree and employment-type filtering). The sort must be applied AFTER filtering, on the already-filtered `people` array:

```typescript
const { settings } = useOrg()
const sortedPeople = useSortedPeople(people, settings.disciplineOrder)
```

Pass `sortedPeople` instead of `people` to `ColumnView` and `ManagerView`. Keep unsorted `people`/`working` for everything else (DetailSidebar, autosave, etc.) — sorting is view-only.

**Important**: Do NOT sort raw `working` before filtering — apply sorting as the last step before rendering.

- [ ] **Step 2: Verify**

Run: `cd web && npx tsc --noEmit && npm test -- --run`
Expected: All pass.

- [ ] **Step 3: Full build**

Run: `make clean && make build`
Expected: Clean build.

- [ ] **Step 4: Commit**

```
feat(web): apply automatic pod sorting in ColumnView and ManagerView
```
