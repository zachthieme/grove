# Test Strategy Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 7 test strategy gaps identified in a FAANG-level SDET audit: deepen shallow component tests, add negative E2E scenarios, add performance benchmarks, raise coverage thresholds, test untested components, add mutation testing, and replace mock-heavy view tests with golden file testing.

**Architecture:** Each task is independent and can be parallelized. Frontend tests follow existing patterns (vi.mock useOrg, makePerson factory, fireEvent + screen assertions). E2E tests use Playwright page.route() for API interception. Go benchmarks use standard testing.B. Golden file tests use vitest toMatchFileSnapshot() with normalized HTML output.

**Tech Stack:** vitest 4.1.0, @testing-library/react 16.3.2, Playwright 1.58.2, Go testing.B, @stryker-mutator/core, fast-check

---

## File Structure

### New files:
- `web/src/components/AutosaveBanner.test.tsx` — rewrite (behavioral)
- `web/src/components/RecycleBinButton.test.tsx` — rewrite (behavioral)
- `web/src/components/RecycleBinDrawer.test.tsx` — rewrite (behavioral)
- `web/src/components/UploadPrompt.test.tsx` — rewrite (behavioral)
- `web/src/components/Toolbar.test.tsx` — rewrite (behavioral)
- `web/src/components/SnapshotsDropdown.test.tsx` — rewrite (behavioral)
- `web/src/components/EmploymentTypeFilter.test.tsx` — rewrite (behavioral)
- `web/src/components/Breadcrumbs.test.tsx` — rewrite (behavioral)
- `web/src/components/ColumnMappingModal.test.tsx` — new
- `web/src/components/PodSidebar.test.tsx` — new
- `web/src/components/SettingsModal.test.tsx` — new
- `web/src/components/ManagerInfoPopover.test.tsx` — new
- `web/src/components/UnparentedBar.test.tsx` — new
- `web/e2e/negative.spec.ts` — new (negative E2E scenarios)
- `internal/api/bench_test.go` — new (Go benchmarks)
- `web/src/views/__golden__/*.golden` — golden file snapshots
- `web/src/views/ColumnView.golden.test.tsx` — golden file test
- `web/src/views/ManagerView.golden.test.tsx` — golden file test
- `web/src/views/TableView.golden.test.tsx` — golden file test
- `web/stryker.config.json` — Stryker mutation testing config

### Modified files:
- `web/vite.config.ts` — raise coverage thresholds
- `web/package.json` — add @stryker-mutator dependencies
- `Makefile` — add `mutate` target
- `.github/workflows/ci.yml` — add benchmark step

---

### Task 1: Deepen AutosaveBanner Tests

**Files:**
- Rewrite: `web/src/components/AutosaveBanner.test.tsx`
- Reference: `web/src/components/AutosaveBanner.tsx`

- [ ] **Step 1: Write the deepened test file**

Replace the existing shallow test with behavioral tests. The component renders a banner with Restore/Dismiss buttons when `autosaveAvailable` is non-null, and returns null otherwise.

```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import AutosaveBanner from './AutosaveBanner'

const mockRestoreAutosave = vi.fn()
const mockDismissAutosave = vi.fn()

const mockOrg = {
  autosaveAvailable: null as { timestamp: string } | null,
  restoreAutosave: mockRestoreAutosave,
  dismissAutosave: mockDismissAutosave,
}

vi.mock('../store/OrgContext', () => ({
  useOrg: () => mockOrg,
}))

describe('AutosaveBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOrg.autosaveAvailable = null
  })
  afterEach(() => cleanup())

  it('renders nothing when autosaveAvailable is null', () => {
    const { container } = render(<AutosaveBanner />)
    expect(container.firstChild).toBeNull()
  })

  it('renders banner with role="alert" when autosave is available', () => {
    mockOrg.autosaveAvailable = { timestamp: '2026-03-25T10:30:00Z' }
    render(<AutosaveBanner />)
    expect(screen.getByRole('alert')).toBeDefined()
  })

  it('displays "Restore previous session?" message', () => {
    mockOrg.autosaveAvailable = { timestamp: '2026-03-25T10:30:00Z' }
    render(<AutosaveBanner />)
    expect(screen.getByText(/Restore previous session\?/)).toBeDefined()
  })

  it('displays formatted time when timestamp is valid', () => {
    mockOrg.autosaveAvailable = { timestamp: '2026-03-25T10:30:00Z' }
    render(<AutosaveBanner />)
    // The banner should include "saved at" with a time
    expect(screen.getByText(/saved at/)).toBeDefined()
  })

  it('handles invalid timestamp gracefully', () => {
    mockOrg.autosaveAvailable = { timestamp: 'not-a-date' }
    render(<AutosaveBanner />)
    // Should still render the banner without crashing
    expect(screen.getByRole('alert')).toBeDefined()
    expect(screen.getByText(/Restore previous session\?/)).toBeDefined()
  })

  it('calls restoreAutosave when Restore button is clicked', () => {
    mockOrg.autosaveAvailable = { timestamp: '2026-03-25T10:30:00Z' }
    render(<AutosaveBanner />)
    fireEvent.click(screen.getByText('Restore'))
    expect(mockRestoreAutosave).toHaveBeenCalledTimes(1)
  })

  it('calls dismissAutosave when Dismiss button is clicked', () => {
    mockOrg.autosaveAvailable = { timestamp: '2026-03-25T10:30:00Z' }
    render(<AutosaveBanner />)
    fireEvent.click(screen.getByText('Dismiss'))
    expect(mockDismissAutosave).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd web && npx vitest run src/components/AutosaveBanner.test.tsx`
Expected: All 7 tests PASS

- [ ] **Step 3: Commit**

```bash
jj new -m "test: deepen AutosaveBanner tests with behavioral assertions"
```

---

### Task 2: Deepen RecycleBinButton Tests

**Files:**
- Rewrite: `web/src/components/RecycleBinButton.test.tsx`
- Reference: `web/src/components/RecycleBinButton.tsx`

- [ ] **Step 1: Write the deepened test file**

The component renders a button with a trash emoji, conditional badge with recycled count, aria-pressed state, and click toggling.

```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import RecycleBinButton from './RecycleBinButton'
import type { Person } from '../api/types'

const mockSetBinOpen = vi.fn()

const mockOrg = {
  recycled: [] as Person[],
  binOpen: false,
  setBinOpen: mockSetBinOpen,
}

vi.mock('../store/OrgContext', () => ({
  useOrg: () => mockOrg,
}))

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: 'p1', name: 'Test', role: 'Eng', discipline: 'Eng',
    managerId: '', team: 'T', additionalTeams: [], status: 'Active',
    ...overrides,
  }
}

describe('RecycleBinButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOrg.recycled = []
    mockOrg.binOpen = false
  })
  afterEach(() => cleanup())

  it('renders button with "Recycle bin" aria-label', () => {
    render(<RecycleBinButton />)
    expect(screen.getByRole('button', { name: /recycle bin/i })).toBeDefined()
  })

  it('does not show badge when recycled is empty', () => {
    render(<RecycleBinButton />)
    const btn = screen.getByRole('button', { name: /recycle bin/i })
    expect(btn.querySelector('span')).toBeNull()
  })

  it('shows badge with count when recycled has items', () => {
    mockOrg.recycled = [makePerson({ id: 'r1' }), makePerson({ id: 'r2' })]
    render(<RecycleBinButton />)
    const btn = screen.getByRole('button', { name: /recycle bin/i })
    const badge = btn.querySelector('span')
    expect(badge).not.toBeNull()
    expect(badge!.textContent).toBe('2')
  })

  it('includes item count in aria-label when items present', () => {
    mockOrg.recycled = [makePerson({ id: 'r1' }), makePerson({ id: 'r2' }), makePerson({ id: 'r3' })]
    render(<RecycleBinButton />)
    expect(screen.getByRole('button', { name: 'Recycle bin (3 items)' })).toBeDefined()
  })

  it('sets aria-pressed=false when bin is closed', () => {
    mockOrg.binOpen = false
    render(<RecycleBinButton />)
    const btn = screen.getByRole('button', { name: /recycle bin/i })
    expect(btn.getAttribute('aria-pressed')).toBe('false')
  })

  it('sets aria-pressed=true when bin is open', () => {
    mockOrg.binOpen = true
    render(<RecycleBinButton />)
    const btn = screen.getByRole('button', { name: /recycle bin/i })
    expect(btn.getAttribute('aria-pressed')).toBe('true')
  })

  it('calls setBinOpen(true) when clicked while closed', () => {
    mockOrg.binOpen = false
    render(<RecycleBinButton />)
    fireEvent.click(screen.getByRole('button', { name: /recycle bin/i }))
    expect(mockSetBinOpen).toHaveBeenCalledWith(true)
  })

  it('calls setBinOpen(false) when clicked while open', () => {
    mockOrg.binOpen = true
    render(<RecycleBinButton />)
    fireEvent.click(screen.getByRole('button', { name: /recycle bin/i }))
    expect(mockSetBinOpen).toHaveBeenCalledWith(false)
  })
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd web && npx vitest run src/components/RecycleBinButton.test.tsx`
Expected: All 8 tests PASS

- [ ] **Step 3: Commit**

```bash
jj new -m "test: deepen RecycleBinButton tests with behavioral assertions"
```

---

### Task 3: Deepen RecycleBinDrawer Tests

**Files:**
- Rewrite: `web/src/components/RecycleBinDrawer.test.tsx`
- Reference: `web/src/components/RecycleBinDrawer.tsx`

- [ ] **Step 1: Write the deepened test file**

```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import RecycleBinDrawer from './RecycleBinDrawer'
import type { Person } from '../api/types'

const mockSetBinOpen = vi.fn()
const mockRestore = vi.fn()
const mockEmptyBin = vi.fn()

const mockOrg = {
  recycled: [] as Person[],
  binOpen: false,
  setBinOpen: mockSetBinOpen,
  restore: mockRestore,
  emptyBin: mockEmptyBin,
}

vi.mock('../store/OrgContext', () => ({
  useOrg: () => mockOrg,
}))

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: 'p1', name: 'Test Person', role: 'Engineer', discipline: 'Eng',
    managerId: '', team: 'Platform', additionalTeams: [], status: 'Active',
    ...overrides,
  }
}

describe('RecycleBinDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOrg.recycled = []
    mockOrg.binOpen = false
  })
  afterEach(() => cleanup())

  it('renders nothing when binOpen is false', () => {
    const { container } = render(<RecycleBinDrawer />)
    expect(container.firstChild).toBeNull()
  })

  it('renders drawer when binOpen is true', () => {
    mockOrg.binOpen = true
    render(<RecycleBinDrawer />)
    expect(screen.getByTestId('recycle-bin-drawer')).toBeDefined()
  })

  it('shows "Bin is empty" when open with no items', () => {
    mockOrg.binOpen = true
    render(<RecycleBinDrawer />)
    expect(screen.getByText('Bin is empty')).toBeDefined()
  })

  it('displays recycled count in header', () => {
    mockOrg.binOpen = true
    mockOrg.recycled = [makePerson({ id: 'r1' }), makePerson({ id: 'r2' })]
    render(<RecycleBinDrawer />)
    expect(screen.getByText('Recycle Bin (2)')).toBeDefined()
  })

  it('renders a card for each recycled person', () => {
    mockOrg.binOpen = true
    mockOrg.recycled = [
      makePerson({ id: 'r1', name: 'Alice', role: 'VP', team: 'Exec' }),
      makePerson({ id: 'r2', name: 'Bob', role: 'Eng', team: 'Platform' }),
    ]
    render(<RecycleBinDrawer />)
    expect(screen.getByText('Alice')).toBeDefined()
    expect(screen.getByText('Bob')).toBeDefined()
    expect(screen.getByText('VP — Exec')).toBeDefined()
    expect(screen.getByText('Eng — Platform')).toBeDefined()
  })

  it('calls restore with person id when Restore button clicked', () => {
    mockOrg.binOpen = true
    mockOrg.recycled = [makePerson({ id: 'r1', name: 'Alice' })]
    render(<RecycleBinDrawer />)
    fireEvent.click(screen.getByText('Restore'))
    expect(mockRestore).toHaveBeenCalledWith('r1')
  })

  it('calls setBinOpen(false) when close button clicked', () => {
    mockOrg.binOpen = true
    render(<RecycleBinDrawer />)
    fireEvent.click(screen.getByLabelText('Close recycle bin'))
    expect(mockSetBinOpen).toHaveBeenCalledWith(false)
  })

  it('shows Empty Bin button only when items present', () => {
    mockOrg.binOpen = true
    mockOrg.recycled = []
    render(<RecycleBinDrawer />)
    expect(screen.queryByText('Empty Bin')).toBeNull()
  })

  it('shows Empty Bin button when items present', () => {
    mockOrg.binOpen = true
    mockOrg.recycled = [makePerson({ id: 'r1' })]
    render(<RecycleBinDrawer />)
    expect(screen.getByText('Empty Bin')).toBeDefined()
  })

  it('calls emptyBin when Empty Bin button clicked', () => {
    mockOrg.binOpen = true
    mockOrg.recycled = [makePerson({ id: 'r1' })]
    render(<RecycleBinDrawer />)
    fireEvent.click(screen.getByText('Empty Bin'))
    expect(mockEmptyBin).toHaveBeenCalledTimes(1)
  })

  it('has correct accessibility attributes', () => {
    mockOrg.binOpen = true
    render(<RecycleBinDrawer />)
    const drawer = screen.getByTestId('recycle-bin-drawer')
    expect(drawer.getAttribute('role')).toBe('complementary')
    expect(drawer.getAttribute('aria-label')).toBe('Recycle bin')
  })
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd web && npx vitest run src/components/RecycleBinDrawer.test.tsx`
Expected: All 11 tests PASS

- [ ] **Step 3: Commit**

```bash
jj new -m "test: deepen RecycleBinDrawer tests with behavioral assertions"
```

---

### Task 4: Deepen UploadPrompt Tests

**Files:**
- Rewrite: `web/src/components/UploadPrompt.test.tsx`
- Reference: `web/src/components/UploadPrompt.tsx`

- [ ] **Step 1: Write the deepened test file**

```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import UploadPrompt from './UploadPrompt'

const mockUpload = vi.fn().mockResolvedValue(undefined)

vi.mock('../store/OrgContext', () => ({
  useOrg: () => ({ upload: mockUpload }),
}))

describe('UploadPrompt', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => cleanup())

  it('renders the "Choose File" button', () => {
    render(<UploadPrompt />)
    expect(screen.getByRole('button', { name: /choose file/i })).toBeDefined()
  })

  it('renders grove title and definition text', () => {
    render(<UploadPrompt />)
    expect(screen.getByText('grove')).toBeDefined()
    expect(screen.getByText(/small group of trees/)).toBeDefined()
  })

  it('renders tagline', () => {
    render(<UploadPrompt />)
    expect(screen.getByText(/Org planning for people who think in structures/)).toBeDefined()
  })

  it('has hidden file input accepting .csv,.xlsx,.zip', () => {
    const { container } = render(<UploadPrompt />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).not.toBeNull()
    expect(input.accept).toBe('.csv,.xlsx,.zip')
    expect(input.style.display).toBe('none')
  })

  it('calls upload when a file is selected', async () => {
    const { container } = render(<UploadPrompt />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['name\nAlice'], 'test.csv', { type: 'text/csv' })
    Object.defineProperty(input, 'files', { value: [file] })
    fireEvent.change(input)
    // Wait for async upload
    await vi.waitFor(() => expect(mockUpload).toHaveBeenCalledWith(file))
  })

  it('does not call upload when no file is selected', () => {
    const { container } = render(<UploadPrompt />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [] })
    fireEvent.change(input)
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('renders the grove icon', () => {
    render(<UploadPrompt />)
    const img = screen.getByAltText('Grove')
    expect(img).toBeDefined()
    expect(img.getAttribute('src')).toBe('/grove-icon.svg')
  })
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd web && npx vitest run src/components/UploadPrompt.test.tsx`
Expected: All 8 tests PASS

- [ ] **Step 3: Commit**

```bash
jj new -m "test: deepen UploadPrompt tests with behavioral assertions"
```

---

### Task 5: Deepen SnapshotsDropdown Tests

**Files:**
- Rewrite: `web/src/components/SnapshotsDropdown.test.tsx`
- Reference: `web/src/components/SnapshotsDropdown.tsx`

- [ ] **Step 1: Write the deepened test file**

```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import SnapshotsDropdown from './SnapshotsDropdown'

const mockSaveSnapshot = vi.fn().mockResolvedValue(undefined)
const mockLoadSnapshot = vi.fn().mockResolvedValue(undefined)
const mockDeleteSnapshot = vi.fn().mockResolvedValue(undefined)

const mockOrg = {
  snapshots: [] as { name: string; timestamp: string }[],
  currentSnapshotName: null as string | null,
  saveSnapshot: mockSaveSnapshot,
  loadSnapshot: mockLoadSnapshot,
  deleteSnapshot: mockDeleteSnapshot,
}

vi.mock('../store/OrgContext', () => ({
  useOrg: () => mockOrg,
}))

describe('SnapshotsDropdown', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOrg.snapshots = []
    mockOrg.currentSnapshotName = null
  })
  afterEach(() => cleanup())

  it('renders trigger with "Working" when no snapshot loaded', () => {
    render(<SnapshotsDropdown />)
    expect(screen.getByRole('button', { name: /Snapshot: Working/i })).toBeDefined()
  })

  it('renders trigger with "Original" when original snapshot loaded', () => {
    mockOrg.currentSnapshotName = '__original__'
    render(<SnapshotsDropdown />)
    expect(screen.getByRole('button', { name: /Snapshot: Original/i })).toBeDefined()
  })

  it('renders trigger with snapshot name when custom snapshot loaded', () => {
    mockOrg.currentSnapshotName = 'Q1 Plan'
    render(<SnapshotsDropdown />)
    expect(screen.getByRole('button', { name: /Snapshot: Q1 Plan/i })).toBeDefined()
  })

  it('dropdown is closed by default', () => {
    render(<SnapshotsDropdown />)
    expect(screen.queryByText('Save As...')).toBeNull()
  })

  it('opens dropdown menu when trigger clicked', () => {
    render(<SnapshotsDropdown />)
    fireEvent.click(screen.getByRole('button', { name: /Snapshot: Working/i }))
    expect(screen.getByText('Save As...')).toBeDefined()
    expect(screen.getByText('Original')).toBeDefined()
  })

  it('closes dropdown when trigger clicked again', () => {
    render(<SnapshotsDropdown />)
    const trigger = screen.getByRole('button', { name: /Snapshot: Working/i })
    fireEvent.click(trigger)
    expect(screen.getByText('Save As...')).toBeDefined()
    fireEvent.click(trigger)
    expect(screen.queryByText('Save As...')).toBeNull()
  })

  it('sets aria-expanded correctly', () => {
    render(<SnapshotsDropdown />)
    const trigger = screen.getByRole('button', { name: /Snapshot: Working/i })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })

  it('renders snapshot list with names and timestamps', () => {
    mockOrg.snapshots = [
      { name: 'baseline', timestamp: '2026-03-25T10:00:00Z' },
      { name: 'draft', timestamp: '2026-03-25T11:00:00Z' },
    ]
    render(<SnapshotsDropdown />)
    fireEvent.click(screen.getByRole('button', { name: /Snapshot: Working/i }))
    expect(screen.getByText('baseline')).toBeDefined()
    expect(screen.getByText('draft')).toBeDefined()
  })

  it('calls loadSnapshot when a snapshot is clicked', () => {
    mockOrg.snapshots = [{ name: 'baseline', timestamp: '2026-03-25T10:00:00Z' }]
    render(<SnapshotsDropdown />)
    fireEvent.click(screen.getByRole('button', { name: /Snapshot: Working/i }))
    fireEvent.click(screen.getByText('baseline'))
    expect(mockLoadSnapshot).toHaveBeenCalledWith('baseline')
  })

  it('calls loadSnapshot("__original__") when Original clicked', () => {
    render(<SnapshotsDropdown />)
    fireEvent.click(screen.getByRole('button', { name: /Snapshot: Working/i }))
    fireEvent.click(screen.getByText('Original'))
    expect(mockLoadSnapshot).toHaveBeenCalledWith('__original__')
  })

  it('renders delete button for each snapshot', () => {
    mockOrg.snapshots = [{ name: 'baseline', timestamp: '2026-03-25T10:00:00Z' }]
    render(<SnapshotsDropdown />)
    fireEvent.click(screen.getByRole('button', { name: /Snapshot: Working/i }))
    expect(screen.getByLabelText('Delete snapshot baseline')).toBeDefined()
  })

  it('calls deleteSnapshot when delete button clicked', () => {
    mockOrg.snapshots = [{ name: 'baseline', timestamp: '2026-03-25T10:00:00Z' }]
    render(<SnapshotsDropdown />)
    fireEvent.click(screen.getByRole('button', { name: /Snapshot: Working/i }))
    fireEvent.click(screen.getByLabelText('Delete snapshot baseline'))
    expect(mockDeleteSnapshot).toHaveBeenCalledWith('baseline')
  })
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd web && npx vitest run src/components/SnapshotsDropdown.test.tsx`
Expected: All 13 tests PASS

- [ ] **Step 3: Commit**

```bash
jj new -m "test: deepen SnapshotsDropdown tests with behavioral assertions"
```

---

### Task 6: Deepen EmploymentTypeFilter Tests

**Files:**
- Rewrite: `web/src/components/EmploymentTypeFilter.test.tsx`
- Reference: `web/src/components/EmploymentTypeFilter.tsx`

- [ ] **Step 1: Write the deepened test file**

```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import EmploymentTypeFilter from './EmploymentTypeFilter'
import type { Person } from '../api/types'

const mockToggle = vi.fn()
const mockShowAll = vi.fn()
const mockHideAll = vi.fn()

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: 'p1', name: 'Test', role: 'Eng', discipline: 'Eng',
    managerId: '', team: 'T', additionalTeams: [], status: 'Active',
    ...overrides,
  }
}

const mockOrg = {
  working: [] as Person[],
  hiddenEmploymentTypes: new Set<string>(),
  toggleEmploymentTypeFilter: mockToggle,
  showAllEmploymentTypes: mockShowAll,
  hideAllEmploymentTypes: mockHideAll,
}

vi.mock('../store/OrgContext', () => ({
  useOrg: () => mockOrg,
}))

describe('EmploymentTypeFilter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOrg.working = [
      makePerson({ id: '1', employmentType: 'FTE' }),
      makePerson({ id: '2', employmentType: 'CW' }),
      makePerson({ id: '3', employmentType: '' }),
    ]
    mockOrg.hiddenEmploymentTypes = new Set()
  })
  afterEach(() => cleanup())

  it('renders Filter button with aria-label', () => {
    render(<EmploymentTypeFilter />)
    expect(screen.getByRole('button', { name: /employment type filter/i })).toBeDefined()
  })

  it('does not show badge when no types hidden', () => {
    render(<EmploymentTypeFilter />)
    const btn = screen.getByRole('button', { name: /employment type filter/i })
    expect(btn.querySelector('span')).toBeNull()
  })

  it('shows badge with hidden count', () => {
    mockOrg.hiddenEmploymentTypes = new Set(['CW'])
    render(<EmploymentTypeFilter />)
    const btn = screen.getByRole('button', { name: /employment type filter/i })
    const badge = btn.querySelector('span')
    expect(badge).not.toBeNull()
    expect(badge!.textContent).toBe('1')
  })

  it('opens dropdown on click', () => {
    render(<EmploymentTypeFilter />)
    fireEvent.click(screen.getByRole('button', { name: /employment type filter/i }))
    expect(screen.getByText('Show All')).toBeDefined()
    expect(screen.getByText('Hide All')).toBeDefined()
  })

  it('sets aria-expanded correctly', () => {
    render(<EmploymentTypeFilter />)
    const btn = screen.getByRole('button', { name: /employment type filter/i })
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(btn)
    expect(btn.getAttribute('aria-expanded')).toBe('true')
  })

  it('renders checkbox for each employment type', () => {
    render(<EmploymentTypeFilter />)
    fireEvent.click(screen.getByRole('button', { name: /employment type filter/i }))
    // CW, FTE, and "No type" for empty string
    expect(screen.getByText('CW')).toBeDefined()
    expect(screen.getByText('FTE')).toBeDefined()
    expect(screen.getByText('No type')).toBeDefined()
  })

  it('sorts types alphabetically with empty last', () => {
    render(<EmploymentTypeFilter />)
    fireEvent.click(screen.getByRole('button', { name: /employment type filter/i }))
    const items = screen.getAllByRole('menuitemcheckbox')
    expect(items[0].textContent).toContain('CW')
    expect(items[1].textContent).toContain('FTE')
    expect(items[2].textContent).toContain('No type')
  })

  it('shows checkmark for visible types', () => {
    render(<EmploymentTypeFilter />)
    fireEvent.click(screen.getByRole('button', { name: /employment type filter/i }))
    const items = screen.getAllByRole('menuitemcheckbox')
    expect(items[0].getAttribute('aria-checked')).toBe('true')
  })

  it('hides checkmark for hidden types', () => {
    mockOrg.hiddenEmploymentTypes = new Set(['CW'])
    render(<EmploymentTypeFilter />)
    fireEvent.click(screen.getByRole('button', { name: /employment type filter/i }))
    const items = screen.getAllByRole('menuitemcheckbox')
    expect(items[0].getAttribute('aria-checked')).toBe('false')
  })

  it('calls toggleEmploymentTypeFilter when checkbox clicked', () => {
    render(<EmploymentTypeFilter />)
    fireEvent.click(screen.getByRole('button', { name: /employment type filter/i }))
    fireEvent.click(screen.getAllByRole('menuitemcheckbox')[0])
    expect(mockToggle).toHaveBeenCalledWith('CW')
  })

  it('calls showAllEmploymentTypes when Show All clicked', () => {
    render(<EmploymentTypeFilter />)
    fireEvent.click(screen.getByRole('button', { name: /employment type filter/i }))
    fireEvent.click(screen.getByText('Show All'))
    expect(mockShowAll).toHaveBeenCalledTimes(1)
  })

  it('calls hideAllEmploymentTypes when Hide All clicked', () => {
    render(<EmploymentTypeFilter />)
    fireEvent.click(screen.getByRole('button', { name: /employment type filter/i }))
    fireEvent.click(screen.getByText('Hide All'))
    expect(mockHideAll).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd web && npx vitest run src/components/EmploymentTypeFilter.test.tsx`
Expected: All 13 tests PASS

- [ ] **Step 3: Commit**

```bash
jj new -m "test: deepen EmploymentTypeFilter tests with behavioral assertions"
```

---

### Task 7: Deepen Breadcrumbs Tests

**Files:**
- Rewrite: `web/src/components/Breadcrumbs.test.tsx`
- Reference: `web/src/components/Breadcrumbs.tsx`

- [ ] **Step 1: Write the deepened test file**

```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import Breadcrumbs from './Breadcrumbs'
import type { Person } from '../api/types'

const mockSetHead = vi.fn()

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: 'p1', name: 'Test', role: 'Eng', discipline: 'Eng',
    managerId: '', team: 'T', additionalTeams: [], status: 'Active',
    ...overrides,
  }
}

const mockOrg = {
  headPersonId: null as string | null,
  working: [] as Person[],
  setHead: mockSetHead,
}

vi.mock('../store/OrgContext', () => ({
  useOrg: () => mockOrg,
}))

describe('Breadcrumbs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOrg.headPersonId = null
    mockOrg.working = []
  })
  afterEach(() => cleanup())

  it('renders nothing when headPersonId is null', () => {
    const { container } = render(<Breadcrumbs />)
    expect(container.firstChild).toBeNull()
  })

  it('renders "All" button and current person name', () => {
    mockOrg.headPersonId = 'p1'
    mockOrg.working = [makePerson({ id: 'p1', name: 'Alice' })]
    render(<Breadcrumbs />)
    expect(screen.getByText('All')).toBeDefined()
    expect(screen.getByText('Alice')).toBeDefined()
  })

  it('calls setHead(null) when "All" button clicked', () => {
    mockOrg.headPersonId = 'p1'
    mockOrg.working = [makePerson({ id: 'p1', name: 'Alice' })]
    render(<Breadcrumbs />)
    fireEvent.click(screen.getByText('All'))
    expect(mockSetHead).toHaveBeenCalledWith(null)
  })

  it('renders full breadcrumb chain for deep hierarchy', () => {
    mockOrg.headPersonId = 'p3'
    mockOrg.working = [
      makePerson({ id: 'p1', name: 'CEO', managerId: '' }),
      makePerson({ id: 'p2', name: 'VP', managerId: 'p1' }),
      makePerson({ id: 'p3', name: 'Director', managerId: 'p2' }),
    ]
    render(<Breadcrumbs />)
    expect(screen.getByText('All')).toBeDefined()
    expect(screen.getByText('CEO')).toBeDefined()
    expect(screen.getByText('VP')).toBeDefined()
    expect(screen.getByText('Director')).toBeDefined()
  })

  it('renders ancestors as clickable buttons, current as text', () => {
    mockOrg.headPersonId = 'p2'
    mockOrg.working = [
      makePerson({ id: 'p1', name: 'CEO', managerId: '' }),
      makePerson({ id: 'p2', name: 'VP', managerId: 'p1' }),
    ]
    render(<Breadcrumbs />)
    // CEO should be a button (clickable ancestor)
    const ceoBtn = screen.getByRole('button', { name: 'CEO' })
    expect(ceoBtn).toBeDefined()
    // VP should be text (current, not a button)
    expect(screen.queryByRole('button', { name: 'VP' })).toBeNull()
    expect(screen.getByText('VP')).toBeDefined()
  })

  it('calls setHead with ancestor id when ancestor clicked', () => {
    mockOrg.headPersonId = 'p3'
    mockOrg.working = [
      makePerson({ id: 'p1', name: 'CEO', managerId: '' }),
      makePerson({ id: 'p2', name: 'VP', managerId: 'p1' }),
      makePerson({ id: 'p3', name: 'Director', managerId: 'p2' }),
    ]
    render(<Breadcrumbs />)
    fireEvent.click(screen.getByRole('button', { name: 'VP' }))
    expect(mockSetHead).toHaveBeenCalledWith('p2')
  })

  it('renders separators between breadcrumbs', () => {
    mockOrg.headPersonId = 'p2'
    mockOrg.working = [
      makePerson({ id: 'p1', name: 'CEO', managerId: '' }),
      makePerson({ id: 'p2', name: 'VP', managerId: 'p1' }),
    ]
    const { container } = render(<Breadcrumbs />)
    // The separator character is ›
    const separators = container.querySelectorAll('span')
    const sepTexts = Array.from(separators).filter(s => s.textContent === '\u203A')
    expect(sepTexts.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd web && npx vitest run src/components/Breadcrumbs.test.tsx`
Expected: All 8 tests PASS

- [ ] **Step 3: Commit**

```bash
jj new -m "test: deepen Breadcrumbs tests with behavioral assertions"
```

---

### Task 8: Deepen Toolbar Tests

**Files:**
- Rewrite: `web/src/components/Toolbar.test.tsx`
- Reference: `web/src/components/Toolbar.tsx`

- [ ] **Step 1: Write the deepened test file**

```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import Toolbar from './Toolbar'

const mockSetViewMode = vi.fn()
const mockSetDataView = vi.fn()
const mockUpload = vi.fn().mockResolvedValue(undefined)
const mockReflow = vi.fn()

const mockOrg = {
  loaded: true,
  viewMode: 'detail' as const,
  dataView: 'working' as const,
  setViewMode: mockSetViewMode,
  setDataView: mockSetDataView,
  upload: mockUpload,
  reflow: mockReflow,
  working: [],
  original: [],
  recycled: [],
  selectedIds: new Set<string>(),
  selectedId: null,
  binOpen: false,
  hiddenEmploymentTypes: new Set<string>(),
  headPersonId: null,
  layoutKey: 0,
  error: null,
  pendingMapping: null,
  snapshots: [],
  currentSnapshotName: null,
  autosaveAvailable: null,
  pods: [],
  settings: { disciplineOrder: [] },
  selectedPodId: null,
  setSelectedId: vi.fn(),
  clearSelection: vi.fn(),
  move: vi.fn(),
  reparent: vi.fn(),
  reorder: vi.fn(),
  update: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  restore: vi.fn(),
  emptyBin: vi.fn(),
  setBinOpen: vi.fn(),
  confirmMapping: vi.fn(),
  cancelMapping: vi.fn(),
  saveSnapshot: vi.fn(),
  loadSnapshot: vi.fn(),
  deleteSnapshot: vi.fn(),
  restoreAutosave: vi.fn(),
  dismissAutosave: vi.fn(),
  toggleSelect: vi.fn(),
  toggleEmploymentTypeFilter: vi.fn(),
  showAllEmploymentTypes: vi.fn(),
  hideAllEmploymentTypes: vi.fn(),
  setHead: vi.fn(),
  clearError: vi.fn(),
  setError: vi.fn(),
  selectPod: vi.fn(),
  updatePod: vi.fn(),
  createPod: vi.fn(),
  updateSettings: vi.fn(),
  originalPods: [],
}

vi.mock('../store/OrgContext', () => ({
  useOrg: () => mockOrg,
}))

describe('Toolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOrg.loaded = true
    mockOrg.viewMode = 'detail'
    mockOrg.dataView = 'working'
  })
  afterEach(() => cleanup())

  it('renders Upload button', () => {
    render(<Toolbar />)
    expect(screen.getByRole('button', { name: /upload file/i })).toBeDefined()
  })

  it('renders view mode pills when loaded', () => {
    render(<Toolbar />)
    expect(screen.getByText('Detail')).toBeDefined()
    expect(screen.getByText('Manager')).toBeDefined()
    expect(screen.getByText('Table')).toBeDefined()
  })

  it('renders data view pills when loaded', () => {
    render(<Toolbar />)
    expect(screen.getByText('Original')).toBeDefined()
    expect(screen.getByText('Working')).toBeDefined()
    expect(screen.getByText('Diff')).toBeDefined()
  })

  it('calls setViewMode when view pill clicked', () => {
    render(<Toolbar />)
    fireEvent.click(screen.getByText('Manager'))
    expect(mockSetViewMode).toHaveBeenCalledWith('manager')
  })

  it('calls setDataView when data view pill clicked', () => {
    render(<Toolbar />)
    fireEvent.click(screen.getByText('Diff'))
    expect(mockSetDataView).toHaveBeenCalledWith('diff')
  })

  it('shows export dropdown when Export clicked', () => {
    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: /export options/i }))
    expect(screen.getByText('PNG')).toBeDefined()
    expect(screen.getByText('SVG')).toBeDefined()
    expect(screen.getByText('CSV')).toBeDefined()
    expect(screen.getByText('XLSX')).toBeDefined()
  })

  it('sets aria-expanded on export dropdown', () => {
    render(<Toolbar />)
    const btn = screen.getByRole('button', { name: /export options/i })
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(btn)
    expect(btn.getAttribute('aria-expanded')).toBe('true')
  })

  it('calls onExportPng when PNG clicked', () => {
    const onExportPng = vi.fn()
    render(<Toolbar onExportPng={onExportPng} />)
    fireEvent.click(screen.getByRole('button', { name: /export options/i }))
    fireEvent.click(screen.getByText('PNG'))
    expect(onExportPng).toHaveBeenCalledTimes(1)
  })

  it('shows "All Snapshots" options when hasSnapshots is true', () => {
    const onExportAllSnapshots = vi.fn()
    render(<Toolbar hasSnapshots onExportAllSnapshots={onExportAllSnapshots} />)
    fireEvent.click(screen.getByRole('button', { name: /export options/i }))
    expect(screen.getByText('All Snapshots (CSV)')).toBeDefined()
    expect(screen.getByText('All Snapshots (XLSX)')).toBeDefined()
  })

  it('does not show "All Snapshots" options when hasSnapshots is false', () => {
    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: /export options/i }))
    expect(screen.queryByText('All Snapshots (CSV)')).toBeNull()
  })

  it('shows hamburger menu with Settings', () => {
    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    expect(screen.getByText('Settings')).toBeDefined()
  })

  it('shows Refresh Layout in hamburger when not table view', () => {
    mockOrg.viewMode = 'detail'
    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    expect(screen.getByText('Refresh Layout')).toBeDefined()
  })

  it('hides Refresh Layout in hamburger when table view', () => {
    mockOrg.viewMode = 'table'
    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    expect(screen.queryByText('Refresh Layout')).toBeNull()
  })

  it('shows Logs button when loggingEnabled', () => {
    render(<Toolbar loggingEnabled onToggleLogs={vi.fn()} />)
    expect(screen.getByRole('button', { name: /toggle log viewer/i })).toBeDefined()
  })

  it('hides Logs button when logging not enabled', () => {
    render(<Toolbar />)
    expect(screen.queryByRole('button', { name: /toggle log viewer/i })).toBeNull()
  })

  it('shows "Exporting..." text when exporting', () => {
    render(<Toolbar exporting />)
    expect(screen.getByText('Exporting...')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd web && npx vitest run src/components/Toolbar.test.tsx`
Expected: All 17 tests PASS

- [ ] **Step 3: Commit**

```bash
jj new -m "test: deepen Toolbar tests with behavioral assertions"
```

---

### Task 9: Add Negative E2E Tests

**Files:**
- Create: `web/e2e/negative.spec.ts`
- Reference: `web/e2e/helpers.ts`, `web/e2e/smoke.spec.ts`

- [ ] **Step 1: Write the negative E2E test file**

Uses Playwright `page.route()` to intercept API calls and simulate errors.

```ts
import { test, expect } from '@playwright/test'
import { uploadCSV, clickPerson, sidebarField, switchView, dragPersonTo } from './helpers'

test.describe('Negative scenarios', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('uploading an invalid file shows error', async ({ page }) => {
    const fileInput = page.getByRole('main').locator('input[type="file"]')
    // Create a file with invalid content
    await fileInput.setInputFiles({
      name: 'invalid.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('this is not,valid csv\nwith no,name column'),
    })
    // Should show an error or stay on upload screen (not crash)
    // Wait briefly for any error to appear
    await page.waitForTimeout(1000)
    // The app should either show an error or the mapping modal (since "name" isn't detected)
    const hasError = await page.locator('[role="alert"]').count() > 0
    const hasMapping = await page.locator('text=Map Spreadsheet Columns').count() > 0
    const stayedOnUpload = await page.locator('text=Choose File').count() > 0
    expect(hasError || hasMapping || stayedOnUpload).toBe(true)
  })

  test('server error during update shows error state', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    await clickPerson(page, 'Bob')
    // Intercept the update API to return 500
    await page.route('**/api/update', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      })
    })
    const roleInput = sidebarField(page, 'role')
    await roleInput.clear()
    await roleInput.fill('Failing Role')
    await page.getByRole('button', { name: 'Save' }).click()
    // Should show error state (not "Saved!")
    await page.waitForTimeout(500)
    const hasSaved = await page.locator('button:has-text("Saved!")').count()
    expect(hasSaved).toBe(0)
  })

  test('server error during delete shows error state', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    await clickPerson(page, 'Carol')
    // Intercept delete API to return 500
    await page.route('**/api/delete', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      })
    })
    await page.getByRole('button', { name: 'Delete' }).click()
    // Carol should still be visible (delete failed)
    await page.waitForTimeout(500)
    await expect(page.locator('[data-selected]').filter({ hasText: 'Carol' })).toBeVisible()
  })

  test('server error during move keeps org intact', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    // Intercept move API to return 500
    await page.route('**/api/move', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Move failed' }),
      })
    })
    // Attempt drag-and-drop
    await dragPersonTo(page, 'Carol', 'Alice')
    await page.waitForTimeout(500)
    // All people should still be visible
    await expect(page.locator('[data-selected]').filter({ hasText: 'Carol' })).toBeVisible()
    await expect(page.locator('[data-selected]').filter({ hasText: 'Alice' })).toBeVisible()
    await expect(page.locator('[data-selected]').filter({ hasText: 'Bob' })).toBeVisible()
  })

  test('uploading empty file does not crash', async ({ page }) => {
    const fileInput = page.getByRole('main').locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: 'empty.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(''),
    })
    await page.waitForTimeout(1000)
    // App should handle gracefully - either error message or stay on upload
    const hasError = await page.locator('[role="alert"]').count() > 0
    const stayedOnUpload = await page.locator('text=Choose File').count() > 0
    expect(hasError || stayedOnUpload).toBe(true)
  })

  test('network timeout on upload shows error', async ({ page }) => {
    // Intercept upload to simulate timeout (abort after 3s)
    await page.route('**/api/upload', async (route) => {
      await route.abort('timedout')
    })
    const fileInput = page.getByRole('main').locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: 'test.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('name,role,manager\nAlice,VP,\n'),
    })
    await page.waitForTimeout(2000)
    // Should show error or stay on upload screen
    const hasError = await page.locator('[role="alert"]').count() > 0
    const stayedOnUpload = await page.locator('text=Choose File').count() > 0
    expect(hasError || stayedOnUpload).toBe(true)
  })

  test('snapshot save with server error does not lose data', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    // Intercept snapshot save to fail
    await page.route('**/api/snapshots', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Disk full' }),
        })
      } else {
        await route.continue()
      }
    })
    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'prompt') await dialog.accept('test-snap')
    })
    await page.locator('button[aria-label*="Snapshot"]').click()
    await page.getByRole('button', { name: 'Save As...' }).click()
    await page.waitForTimeout(1000)
    // All people should still be visible (no data loss)
    await expect(page.locator('[data-selected]').filter({ hasText: 'Alice' })).toBeVisible()
    await expect(page.locator('[data-selected]').filter({ hasText: 'Bob' })).toBeVisible()
  })
})
```

- [ ] **Step 2: Run the E2E tests**

Run: `cd web && npx playwright test e2e/negative.spec.ts`
Expected: All 7 tests PASS. Some tests may need adjustment based on actual error handling behavior — the tests verify the app doesn't crash and handles errors gracefully, whatever form that takes.

- [ ] **Step 3: Commit**

```bash
jj new -m "test(e2e): add negative scenario tests for error handling"
```

---

### Task 10: Add Go Performance Benchmarks

**Files:**
- Create: `internal/api/bench_test.go`
- Reference: `internal/api/service_test.go`, `internal/api/stress_test.go`

- [ ] **Step 1: Write the benchmark file**

```go
package api

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func generateBenchCSV(n int) []byte {
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	w.Write([]string{"Name", "Role", "Discipline", "Manager", "Team", "Status"})
	w.Write([]string{"CEO", "Chief Executive Officer", "Leadership", "", "Executive", "Active"})
	for i := 1; i < n; i++ {
		manager := "CEO"
		if i > 10 {
			manager = fmt.Sprintf("Person_%d", i%10+1)
		}
		w.Write([]string{
			fmt.Sprintf("Person_%d", i),
			"Engineer",
			"Engineering",
			manager,
			fmt.Sprintf("Team_%d", i%5),
			"Active",
		})
	}
	w.Flush()
	return buf.Bytes()
}

func benchService(b *testing.B, n int) *OrgService {
	b.Helper()
	csvData := generateBenchCSV(n)
	svc := NewOrgService(NewMemorySnapshotStore())
	if _, err := svc.Upload(csvData, "bench.csv"); err != nil {
		b.Fatal(err)
	}
	return svc
}

func BenchmarkUpload_50(b *testing.B) {
	csvData := generateBenchCSV(50)
	for b.Loop() {
		svc := NewOrgService(NewMemorySnapshotStore())
		if _, err := svc.Upload(csvData, "bench.csv"); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkUpload_200(b *testing.B) {
	csvData := generateBenchCSV(200)
	for b.Loop() {
		svc := NewOrgService(NewMemorySnapshotStore())
		if _, err := svc.Upload(csvData, "bench.csv"); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkUpload_500(b *testing.B) {
	csvData := generateBenchCSV(500)
	for b.Loop() {
		svc := NewOrgService(NewMemorySnapshotStore())
		if _, err := svc.Upload(csvData, "bench.csv"); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkMove(b *testing.B) {
	svc := benchService(b, 200)
	people := svc.working
	for b.Loop() {
		// Move person 50 under person 20
		svc.Move(people[50].Id, people[20].Id, people[20].Team)
	}
}

func BenchmarkUpdate(b *testing.B) {
	svc := benchService(b, 200)
	people := svc.working
	for b.Loop() {
		svc.Update(people[50].Id, map[string]string{"role": "Updated"})
	}
}

func BenchmarkExportCSV(b *testing.B) {
	svc := benchService(b, 200)
	for b.Loop() {
		if _, err := ExportCSV(svc.working); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkSnapshotSaveLoad(b *testing.B) {
	svc := benchService(b, 200)
	for b.Loop() {
		if err := svc.SaveSnapshot("bench"); err != nil {
			b.Fatal(err)
		}
		if err := svc.LoadSnapshot("bench"); err != nil {
			b.Fatal(err)
		}
		svc.DeleteSnapshot("bench")
	}
}

func BenchmarkGetOrgHandler(b *testing.B) {
	svc := benchService(b, 200)
	router := NewRouter(svc, nil, NewMemoryAutosaveStore())
	for b.Loop() {
		req := httptest.NewRequest(http.MethodGet, "/api/org", nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			b.Fatalf("got status %d", rec.Code)
		}
	}
}

func BenchmarkInferMapping(b *testing.B) {
	headers := []string{"Full Name", "Job Title", "Department", "Reports To", "Group", "Employment Status"}
	for b.Loop() {
		InferMapping(headers)
	}
}

func BenchmarkReorder(b *testing.B) {
	svc := benchService(b, 200)
	ids := make([]string, len(svc.working))
	for i, p := range svc.working {
		ids[i] = p.Id
	}
	// Reverse the order
	for i, j := 0, len(ids)-1; i < j; i, j = i+1, j-1 {
		ids[i], ids[j] = ids[j], ids[i]
	}
	for b.Loop() {
		svc.Reorder(ids)
	}
}
```

- [ ] **Step 2: Run benchmarks**

Run: `go test -bench=. -benchmem ./internal/api/ -count=3`
Expected: Benchmarks run and report ns/op and B/op. Record baseline numbers for future comparison.

- [ ] **Step 3: Add benchmark step to CI**

Add to `.github/workflows/ci.yml` under the `test` job, after Go tests:

```yaml
      - name: Go benchmarks
        run: go test -bench=. -benchmem ./internal/api/ -count=1 -benchtime=100ms
```

- [ ] **Step 4: Add Makefile target**

Add to Makefile:

```makefile
bench:
	go test -bench=. -benchmem ./internal/api/ -count=3
```

- [ ] **Step 5: Commit**

```bash
jj new -m "test: add Go benchmarks for upload, move, export, snapshot, handler, and reorder"
```

---

### Task 11: Raise Coverage Thresholds

> **Dependency:** Run this task AFTER Tasks 1-8 and 12-16 are complete. The new thresholds require the additional test coverage from those tasks.

**Files:**
- Modify: `web/vite.config.ts:22-26`

- [ ] **Step 1: Update coverage thresholds**

In `web/vite.config.ts`, change the thresholds from:

```ts
thresholds: {
  statements: 60,
  branches: 55,
  functions: 50,
  lines: 62,
},
```

to:

```ts
thresholds: {
  statements: 80,
  branches: 75,
  functions: 70,
  lines: 80,
},
```

- [ ] **Step 2: Run tests with coverage to verify thresholds are met**

Run: `cd web && npx vitest run --coverage`
Expected: Coverage meets the new thresholds. If not, the tests added in tasks 1-8 and 12-16 should bring coverage above threshold. If coverage is still below, identify the gap and add targeted tests.

- [ ] **Step 3: Commit**

```bash
jj new -m "test: raise frontend coverage thresholds to 80/75/70/80"
```

---

### Task 12: Add ColumnMappingModal Tests

**Files:**
- Create: `web/src/components/ColumnMappingModal.test.tsx`
- Reference: `web/src/components/ColumnMappingModal.tsx`

- [ ] **Step 1: Write the test file**

This component takes props directly (no useOrg), making it straightforward to test.

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import ColumnMappingModal from './ColumnMappingModal'
import type { MappedColumn } from '../api/types'

const defaultHeaders = ['Full Name', 'Job Title', 'Department', 'Reports To', 'Group']

const defaultMapping: Record<string, MappedColumn> = {
  name: { column: 'Full Name', confidence: 'high' },
  role: { column: 'Job Title', confidence: 'medium' },
}

const defaultPreview = [
  ['Full Name', 'Job Title', 'Department', 'Reports To', 'Group'],
  ['Alice', 'VP Engineering', 'Engineering', '', 'Platform'],
  ['Bob', 'Engineer', 'Engineering', 'Alice', 'Platform'],
]

describe('ColumnMappingModal', () => {
  afterEach(() => cleanup())

  it('renders title "Map Spreadsheet Columns"', () => {
    render(
      <ColumnMappingModal
        headers={defaultHeaders}
        mapping={defaultMapping}
        preview={defaultPreview}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.getByText('Map Spreadsheet Columns')).toBeDefined()
  })

  it('renders a select dropdown for each app field', () => {
    render(
      <ColumnMappingModal
        headers={defaultHeaders}
        mapping={defaultMapping}
        preview={defaultPreview}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.getByText('Name')).toBeDefined()
    expect(screen.getByText('Role')).toBeDefined()
    expect(screen.getByText('Discipline')).toBeDefined()
    expect(screen.getByText('Manager')).toBeDefined()
    expect(screen.getByText('Team')).toBeDefined()
    expect(screen.getByText('Status')).toBeDefined()
  })

  it('pre-selects mapped columns from initial mapping', () => {
    const { container } = render(
      <ColumnMappingModal
        headers={defaultHeaders}
        mapping={defaultMapping}
        preview={defaultPreview}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    const selects = container.querySelectorAll('select')
    // First select (Name) should have "Full Name" selected
    expect((selects[0] as HTMLSelectElement).value).toBe('Full Name')
    // Second select (Role) should have "Job Title" selected
    expect((selects[1] as HTMLSelectElement).value).toBe('Job Title')
  })

  it('enables Load button when required field (Name) is mapped', () => {
    render(
      <ColumnMappingModal
        headers={defaultHeaders}
        mapping={defaultMapping}
        preview={defaultPreview}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    const loadBtn = screen.getByText('Load')
    expect((loadBtn as HTMLButtonElement).disabled).toBe(false)
  })

  it('disables Load button when required field (Name) is unmapped', () => {
    render(
      <ColumnMappingModal
        headers={defaultHeaders}
        mapping={{}}
        preview={defaultPreview}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    const loadBtn = screen.getByText('Load')
    expect((loadBtn as HTMLButtonElement).disabled).toBe(true)
  })

  it('calls onConfirm with mapping when Load clicked', () => {
    const onConfirm = vi.fn()
    render(
      <ColumnMappingModal
        headers={defaultHeaders}
        mapping={defaultMapping}
        preview={defaultPreview}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('Load'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    const arg = onConfirm.mock.calls[0][0]
    expect(arg.name).toBe('Full Name')
    expect(arg.role).toBe('Job Title')
  })

  it('calls onCancel when Cancel clicked', () => {
    const onCancel = vi.fn()
    render(
      <ColumnMappingModal
        headers={defaultHeaders}
        mapping={defaultMapping}
        preview={defaultPreview}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    )
    fireEvent.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('updates mapping when select dropdown changed', () => {
    const onConfirm = vi.fn()
    const { container } = render(
      <ColumnMappingModal
        headers={defaultHeaders}
        mapping={defaultMapping}
        preview={defaultPreview}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    )
    // Change Discipline dropdown to "Department"
    const selects = container.querySelectorAll('select')
    fireEvent.change(selects[2], { target: { value: 'Department' } })
    fireEvent.click(screen.getByText('Load'))
    expect(onConfirm.mock.calls[0][0].discipline).toBe('Department')
  })

  it('renders preview table when fields are mapped', () => {
    render(
      <ColumnMappingModal
        headers={defaultHeaders}
        mapping={defaultMapping}
        preview={defaultPreview}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.getByText('Preview')).toBeDefined()
    expect(screen.getByText('Alice')).toBeDefined()
    expect(screen.getByText('Bob')).toBeDefined()
  })

  it('does not render preview when no fields mapped', () => {
    render(
      <ColumnMappingModal
        headers={defaultHeaders}
        mapping={{}}
        preview={defaultPreview}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.queryByText('Preview')).toBeNull()
  })

  it('each select includes "— unmapped —" option', () => {
    render(
      <ColumnMappingModal
        headers={defaultHeaders}
        mapping={{}}
        preview={defaultPreview}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    const unmappedOptions = screen.getAllByText('— unmapped —')
    expect(unmappedOptions.length).toBe(9) // 9 APP_FIELDS
  })
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd web && npx vitest run src/components/ColumnMappingModal.test.tsx`
Expected: All 11 tests PASS

- [ ] **Step 3: Commit**

```bash
jj new -m "test: add ColumnMappingModal tests"
```

---

### Task 13: Add PodSidebar Tests

**Files:**
- Create: `web/src/components/PodSidebar.test.tsx`
- Reference: `web/src/components/PodSidebar.tsx`

- [ ] **Step 1: Write the test file**

```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import PodSidebar from './PodSidebar'
import type { Person, Pod } from '../api/types'

const mockUpdatePod = vi.fn().mockResolvedValue(undefined)

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: 'p1', name: 'Test', role: 'Eng', discipline: 'Eng',
    managerId: 'm1', team: 'Platform', additionalTeams: [], status: 'Active',
    pod: 'TestPod', ...overrides,
  }
}

const testPod: Pod = {
  id: 'pod1', name: 'TestPod', team: 'Platform', managerId: 'm1',
  publicNote: 'public note', privateNote: 'private note',
}

const mockOrg = {
  pods: [testPod] as Pod[],
  working: [
    makePerson({ id: 'p1', managerId: 'm1', pod: 'TestPod' }),
    makePerson({ id: 'p2', managerId: 'm1', pod: 'TestPod' }),
  ] as Person[],
  selectedPodId: 'pod1' as string | null,
  updatePod: mockUpdatePod,
}

vi.mock('../store/OrgContext', () => ({
  useOrg: () => mockOrg,
}))

describe('PodSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOrg.selectedPodId = 'pod1'
    mockOrg.pods = [testPod]
  })
  afterEach(() => cleanup())

  it('renders nothing when no pod is selected', () => {
    mockOrg.selectedPodId = null
    const { container } = render(<PodSidebar />)
    expect(container.firstChild).toBeNull()
  })

  it('renders "Pod Details" heading', () => {
    render(<PodSidebar />)
    expect(screen.getByText('Pod Details')).toBeDefined()
  })

  it('displays pod name in input', () => {
    render(<PodSidebar />)
    const nameInput = screen.getByDisplayValue('TestPod')
    expect(nameInput).toBeDefined()
  })

  it('displays team as disabled input', () => {
    render(<PodSidebar />)
    const teamInput = screen.getByDisplayValue('Platform')
    expect((teamInput as HTMLInputElement).disabled).toBe(true)
  })

  it('displays member count', () => {
    render(<PodSidebar />)
    expect(screen.getByText('2')).toBeDefined()
  })

  it('displays public note', () => {
    render(<PodSidebar />)
    expect(screen.getByDisplayValue('public note')).toBeDefined()
  })

  it('displays private note', () => {
    render(<PodSidebar />)
    expect(screen.getByDisplayValue('private note')).toBeDefined()
  })

  it('calls updatePod on name blur when changed', async () => {
    render(<PodSidebar />)
    const nameInput = screen.getByDisplayValue('TestPod')
    fireEvent.change(nameInput, { target: { value: 'NewPodName' } })
    fireEvent.blur(nameInput)
    expect(mockUpdatePod).toHaveBeenCalledWith('pod1', { name: 'NewPodName' })
  })

  it('does not call updatePod on blur when no changes', () => {
    render(<PodSidebar />)
    const nameInput = screen.getByDisplayValue('TestPod')
    fireEvent.blur(nameInput)
    expect(mockUpdatePod).not.toHaveBeenCalled()
  })

  it('calls updatePod on public note blur when changed', () => {
    render(<PodSidebar />)
    const noteInput = screen.getByDisplayValue('public note')
    fireEvent.change(noteInput, { target: { value: 'updated public' } })
    fireEvent.blur(noteInput)
    expect(mockUpdatePod).toHaveBeenCalledWith('pod1', { publicNote: 'updated public' })
  })
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd web && npx vitest run src/components/PodSidebar.test.tsx`
Expected: All 10 tests PASS

- [ ] **Step 3: Commit**

```bash
jj new -m "test: add PodSidebar tests"
```

---

### Task 14: Add SettingsModal Tests

**Files:**
- Create: `web/src/components/SettingsModal.test.tsx`
- Reference: `web/src/components/SettingsModal.tsx`

- [ ] **Step 1: Write the test file**

```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import SettingsModal from './SettingsModal'
import type { Person } from '../api/types'

const mockUpdateSettings = vi.fn().mockResolvedValue(undefined)

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: 'p1', name: 'Test', role: 'Eng', discipline: 'Engineering',
    managerId: '', team: 'T', additionalTeams: [], status: 'Active',
    ...overrides,
  }
}

const mockOrg = {
  working: [
    makePerson({ id: '1', discipline: 'Engineering' }),
    makePerson({ id: '2', discipline: 'Design' }),
    makePerson({ id: '3', discipline: 'Product' }),
  ] as Person[],
  settings: { disciplineOrder: ['Design', 'Engineering', 'Product'] },
  updateSettings: mockUpdateSettings,
}

vi.mock('../store/OrgContext', () => ({
  useOrg: () => mockOrg,
}))

describe('SettingsModal', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => cleanup())

  it('renders "Settings" title', () => {
    render(<SettingsModal onClose={vi.fn()} />)
    expect(screen.getByText('Settings')).toBeDefined()
  })

  it('renders "Discipline Order" section', () => {
    render(<SettingsModal onClose={vi.fn()} />)
    expect(screen.getByText('Discipline Order')).toBeDefined()
  })

  it('lists all disciplines from working data', () => {
    render(<SettingsModal onClose={vi.fn()} />)
    expect(screen.getByText('Design')).toBeDefined()
    expect(screen.getByText('Engineering')).toBeDefined()
    expect(screen.getByText('Product')).toBeDefined()
  })

  it('calls onClose when Cancel clicked', () => {
    const onClose = vi.fn()
    render(<SettingsModal onClose={onClose} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls updateSettings and onClose when Save clicked', async () => {
    const onClose = vi.fn()
    render(<SettingsModal onClose={onClose} />)
    fireEvent.click(screen.getByText('Save'))
    await vi.waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledTimes(1)
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it('passes discipline order to updateSettings', async () => {
    render(<SettingsModal onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('Save'))
    await vi.waitFor(() => {
      const call = mockUpdateSettings.mock.calls[0][0]
      expect(call.disciplineOrder).toBeDefined()
      expect(call.disciplineOrder).toHaveLength(3)
    })
  })

  it('calls onClose when overlay clicked', () => {
    const onClose = vi.fn()
    const { container } = render(<SettingsModal onClose={onClose} />)
    // Click the overlay (first child div)
    fireEvent.click(container.firstChild!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when modal content clicked', () => {
    const onClose = vi.fn()
    render(<SettingsModal onClose={onClose} />)
    // Click the Settings title inside the modal
    fireEvent.click(screen.getByText('Settings'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows "No disciplines found" when working has no disciplines', () => {
    mockOrg.working = [makePerson({ discipline: '' })]
    mockOrg.settings = { disciplineOrder: [] }
    render(<SettingsModal onClose={vi.fn()} />)
    expect(screen.getByText(/No disciplines found/)).toBeDefined()
  })

  it('renders drag hint text', () => {
    render(<SettingsModal onClose={vi.fn()} />)
    expect(screen.getByText(/Drag to reorder/)).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd web && npx vitest run src/components/SettingsModal.test.tsx`
Expected: All 10 tests PASS

- [ ] **Step 3: Commit**

```bash
jj new -m "test: add SettingsModal tests"
```

---

### Task 15: Add ManagerInfoPopover Tests

**Files:**
- Create: `web/src/components/ManagerInfoPopover.test.tsx`
- Reference: `web/src/components/ManagerInfoPopover.tsx`, `web/src/hooks/useOrgMetrics.ts`

- [ ] **Step 1: Write the test file**

This component takes props directly and uses `computeOrgMetrics` (real function, not mocked).

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import ManagerInfoPopover from './ManagerInfoPopover'
import type { Person } from '../api/types'

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: 'p1', name: 'Test', role: 'Engineer', discipline: 'Engineering',
    managerId: '', team: 'Platform', additionalTeams: [], status: 'Active',
    ...overrides,
  }
}

const manager = makePerson({ id: 'm1', name: 'Alice', role: 'VP', managerId: '' })
const activeReport = makePerson({ id: 'r1', name: 'Bob', managerId: 'm1', discipline: 'Engineering' })
const openReport = makePerson({ id: 'r2', name: 'Open Req', managerId: 'm1', status: 'Open' })
const plannedReport = makePerson({ id: 'r3', name: 'Planned Req', managerId: 'm1', status: 'Planned' })
const transferReport = makePerson({ id: 'r4', name: 'Transfer', managerId: 'm1', status: 'Transfer In' })

describe('ManagerInfoPopover', () => {
  afterEach(() => cleanup())

  it('renders person name in header', () => {
    render(
      <ManagerInfoPopover
        personId="m1"
        working={[manager, activeReport]}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('Alice')).toBeDefined()
  })

  it('shows "Unknown" when person not found', () => {
    render(
      <ManagerInfoPopover
        personId="nonexistent"
        working={[manager]}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('Unknown')).toBeDefined()
  })

  it('displays Direct Reports count', () => {
    render(
      <ManagerInfoPopover
        personId="m1"
        working={[manager, activeReport, openReport]}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('Direct Reports')).toBeDefined()
    expect(screen.getByText('2')).toBeDefined()
  })

  it('displays Total Headcount', () => {
    render(
      <ManagerInfoPopover
        personId="m1"
        working={[manager, activeReport]}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('Total Headcount')).toBeDefined()
  })

  it('shows Recruiting row when open reqs exist', () => {
    render(
      <ManagerInfoPopover
        personId="m1"
        working={[manager, openReport]}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('Recruiting')).toBeDefined()
  })

  it('hides Recruiting row when no open reqs', () => {
    render(
      <ManagerInfoPopover
        personId="m1"
        working={[manager, activeReport]}
        onClose={vi.fn()}
      />
    )
    expect(screen.queryByText('Recruiting')).toBeNull()
  })

  it('shows Planned row when planned reqs exist', () => {
    render(
      <ManagerInfoPopover
        personId="m1"
        working={[manager, plannedReport]}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('Planned')).toBeDefined()
  })

  it('shows Transfers row when transfers exist', () => {
    render(
      <ManagerInfoPopover
        personId="m1"
        working={[manager, transferReport]}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('Transfers')).toBeDefined()
  })

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn()
    render(
      <ManagerInfoPopover
        personId="m1"
        working={[manager, activeReport]}
        onClose={onClose}
      />
    )
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when overlay mouseDown', () => {
    const onClose = vi.fn()
    const { container } = render(
      <ManagerInfoPopover
        personId="m1"
        working={[manager, activeReport]}
        onClose={onClose}
      />
    )
    // mouseDown on the overlay (first child)
    fireEvent.mouseDown(container.firstChild!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows discipline breakdown when active reports exist', () => {
    render(
      <ManagerInfoPopover
        personId="m1"
        working={[manager, activeReport]}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('By discipline')).toBeDefined()
    expect(screen.getByText('Engineering')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd web && npx vitest run src/components/ManagerInfoPopover.test.tsx`
Expected: All 11 tests PASS

- [ ] **Step 3: Commit**

```bash
jj new -m "test: add ManagerInfoPopover tests"
```

---

### Task 16: Add UnparentedBar Tests

**Files:**
- Create: `web/src/components/UnparentedBar.test.tsx`
- Reference: `web/src/components/UnparentedBar.tsx`

- [ ] **Step 1: Write the test file**

```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import UnparentedBar from './UnparentedBar'
import type { Person } from '../api/types'

const mockToggleSelect = vi.fn()

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: 'p1', name: 'Test', role: 'Eng', discipline: 'Eng',
    managerId: '', team: 'T', additionalTeams: [], status: 'Active',
    ...overrides,
  }
}

const mockOrg = {
  working: [] as Person[],
  toggleSelect: mockToggleSelect,
}

vi.mock('../store/OrgContext', () => ({
  useOrg: () => mockOrg,
}))

describe('UnparentedBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOrg.working = []
  })
  afterEach(() => cleanup())

  it('renders nothing when no orphans exist', () => {
    // Manager with a report — neither is orphaned
    mockOrg.working = [
      makePerson({ id: 'm1', name: 'Alice', managerId: '' }),
      makePerson({ id: 'r1', name: 'Bob', managerId: 'm1' }),
    ]
    const { container } = render(<UnparentedBar />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when all root people have reports', () => {
    mockOrg.working = [
      makePerson({ id: 'm1', name: 'Alice', managerId: '' }),
      makePerson({ id: 'r1', name: 'Bob', managerId: 'm1' }),
    ]
    const { container } = render(<UnparentedBar />)
    expect(container.firstChild).toBeNull()
  })

  it('renders when orphans exist', () => {
    // Two root people with no reports — both are orphans
    mockOrg.working = [
      makePerson({ id: 'o1', name: 'Orphan1', managerId: '' }),
      makePerson({ id: 'o2', name: 'Orphan2', managerId: '' }),
    ]
    render(<UnparentedBar />)
    expect(screen.getByText(/2 unparented people/)).toBeDefined()
  })

  it('uses singular "person" for single orphan', () => {
    mockOrg.working = [makePerson({ id: 'o1', name: 'Alone', managerId: '' })]
    render(<UnparentedBar />)
    expect(screen.getByText(/1 unparented person/)).toBeDefined()
  })

  it('starts collapsed (orphan list not visible)', () => {
    mockOrg.working = [makePerson({ id: 'o1', name: 'Orphan', managerId: '' })]
    render(<UnparentedBar />)
    expect(screen.queryByText('Orphan')).toBeNull()
  })

  it('expands when toggle clicked, showing orphan names', () => {
    mockOrg.working = [
      makePerson({ id: 'o1', name: 'Alice Orphan', managerId: '' }),
      makePerson({ id: 'o2', name: 'Bob Orphan', managerId: '' }),
    ]
    render(<UnparentedBar />)
    fireEvent.click(screen.getByText(/2 unparented people/))
    expect(screen.getByText('Alice Orphan')).toBeDefined()
    expect(screen.getByText('Bob Orphan')).toBeDefined()
  })

  it('collapses when toggle clicked again', () => {
    mockOrg.working = [makePerson({ id: 'o1', name: 'Alice', managerId: '' })]
    render(<UnparentedBar />)
    const toggle = screen.getByText(/1 unparented person/)
    fireEvent.click(toggle)
    expect(screen.getByText('Alice')).toBeDefined()
    fireEvent.click(toggle)
    expect(screen.queryByText('Alice')).toBeNull()
  })

  it('calls toggleSelect when orphan name clicked', () => {
    mockOrg.working = [makePerson({ id: 'o1', name: 'Alice', managerId: '' })]
    render(<UnparentedBar />)
    fireEvent.click(screen.getByText(/1 unparented person/))
    fireEvent.click(screen.getByText('Alice'))
    expect(mockToggleSelect).toHaveBeenCalledWith('o1', false)
  })

  it('does not count tree roots as orphans', () => {
    // A person with no manager who has reports is a tree root, not an orphan
    mockOrg.working = [
      makePerson({ id: 'm1', name: 'Manager', managerId: '' }),
      makePerson({ id: 'r1', name: 'Report', managerId: 'm1' }),
      makePerson({ id: 'o1', name: 'Orphan', managerId: '' }),
    ]
    render(<UnparentedBar />)
    expect(screen.getByText(/1 unparented person/)).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd web && npx vitest run src/components/UnparentedBar.test.tsx`
Expected: All 9 tests PASS

- [ ] **Step 3: Commit**

```bash
jj new -m "test: add UnparentedBar tests"
```

---

### Task 17: Add Mutation Testing Infrastructure

**Files:**
- Create: `web/stryker.config.json`
- Modify: `web/package.json` (add devDependencies and script)
- Modify: `Makefile` (add `mutate` target)

- [ ] **Step 1: Install Stryker dependencies**

Run: `cd web && npm install --save-dev @stryker-mutator/core @stryker-mutator/vitest-runner @stryker-mutator/typescript-checker`

- [ ] **Step 2: Create Stryker configuration**

Create `web/stryker.config.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/stryker-mutator/stryker/master/packages/core/schema/stryker-core.schema.json",
  "mutate": [
    "src/**/*.ts",
    "src/**/*.tsx",
    "!src/**/*.test.*",
    "!src/**/*.spec.*",
    "!src/main.tsx",
    "!src/vite-env.d.ts"
  ],
  "testRunner": "vitest",
  "checkers": ["typescript"],
  "tsconfigFile": "tsconfig.json",
  "reporters": ["clear-text", "html"],
  "thresholds": {
    "high": 80,
    "low": 60,
    "break": 50
  },
  "concurrency": 4,
  "timeoutMS": 30000
}
```

- [ ] **Step 3: Add npm script**

Add to `web/package.json` scripts:

```json
"mutate": "stryker run"
```

- [ ] **Step 4: Add Makefile target**

Add to Makefile:

```makefile
mutate:
	cd web && npx stryker run
```

- [ ] **Step 5: Run mutation testing to verify it works**

Run: `cd web && npx stryker run --mutate 'src/utils/snapshotExportUtils.ts'`
Expected: Stryker runs mutations on the utility file and reports mutation score. This is a quick smoke test — full mutation testing takes longer.

- [ ] **Step 6: Commit**

```bash
jj new -m "test: add Stryker mutation testing infrastructure"
```

---

### Task 18: Golden File Tests for ColumnView

**Files:**
- Create: `web/src/views/ColumnView.golden.test.tsx`
- Create: `web/src/views/__golden__/column-view-tree.golden` (auto-generated)
- Create: `web/src/views/__golden__/column-view-empty.golden` (auto-generated)
- Create: `web/src/views/__golden__/column-view-selected.golden` (auto-generated)
- Reference: `web/src/views/ColumnView.tsx`, `web/src/views/ColumnView.test.tsx`

- [ ] **Step 1: Write the golden file test**

Golden file tests render with real data (still mocking dnd-kit for stability) and snapshot the meaningful DOM structure. The key difference from the existing mock-heavy tests: we capture and assert on the full rendered HTML, not individual text queries.

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import ColumnView from './ColumnView'
import type { Person } from '../api/types'

// Mock dnd-kit (rendering artifact, not business logic)
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div data-testid="dnd-context">{children}</div>,
  DragOverlay: ({ children }: { children: React.ReactNode }) => <div data-testid="drag-overlay">{children}</div>,
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: vi.fn(), isDragging: false }),
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
  MouseSensor: class {},
  KeyboardSensor: class {},
  useSensor: () => ({}),
  useSensors: () => [],
}))

vi.mock('../hooks/useChartLayout', () => ({
  useChartLayout: () => ({
    containerRef: { current: null },
    setNodeRef: () => () => {},
    lines: [],
    activeDragId: null,
    sensors: [],
    handleDragStart: vi.fn(),
    handleDragEnd: vi.fn(),
  }),
}))

vi.mock('../hooks/useDragDrop', () => ({
  useDragDrop: () => ({ onDragEnd: vi.fn() }),
}))

vi.mock('../store/OrgContext', () => ({
  useOrg: () => ({ move: vi.fn(), reparent: vi.fn(), selectedIds: new Set() }),
}))

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: 'default', name: 'Default', role: 'Engineer', discipline: 'Engineering',
    managerId: '', team: 'Platform', additionalTeams: [], status: 'Active',
    ...overrides,
  }
}

/** Strip dynamic attributes (style, inline handlers) and normalize whitespace for stable golden files */
function normalizeHTML(html: string): string {
  return html
    .replace(/\s*style="[^"]*"/g, '')
    .replace(/\s+/g, ' ')
    .replace(/> </g, '>\n<')
    .trim()
}

describe('ColumnView golden file tests', () => {
  afterEach(() => cleanup())

  it('renders org tree structure', () => {
    const ceo = makePerson({ id: 'ceo', name: 'CEO', role: 'Chief Executive', managerId: '' })
    const vp = makePerson({ id: 'vp', name: 'VP Eng', role: 'VP Engineering', managerId: 'ceo' })
    const eng1 = makePerson({ id: 'e1', name: 'Alice', role: 'Staff Engineer', managerId: 'vp', team: 'Platform' })
    const eng2 = makePerson({ id: 'e2', name: 'Bob', role: 'Senior Engineer', managerId: 'vp', team: 'Platform' })

    const { container } = render(
      <ColumnView people={[ceo, vp, eng1, eng2]} selectedIds={new Set()} onSelect={vi.fn()} />
    )

    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/column-view-tree.golden')
  })

  it('renders empty state', () => {
    const { container } = render(
      <ColumnView people={[]} selectedIds={new Set()} onSelect={vi.fn()} />
    )

    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/column-view-empty.golden')
  })

  it('renders selected state', () => {
    const ceo = makePerson({ id: 'ceo', name: 'CEO', managerId: '' })
    const eng = makePerson({ id: 'e1', name: 'Alice', managerId: 'ceo' })

    const { container } = render(
      <ColumnView people={[ceo, eng]} selectedIds={new Set(['e1'])} onSelect={vi.fn()} />
    )

    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/column-view-selected.golden')
  })

  it('renders mixed statuses', () => {
    const mgr = makePerson({ id: 'm1', name: 'Manager', managerId: '' })
    const active = makePerson({ id: 'a1', name: 'Active Person', managerId: 'm1', status: 'Active' })
    const open = makePerson({ id: 'o1', name: 'Open Req', managerId: 'm1', status: 'Open' })
    const transfer = makePerson({ id: 't1', name: 'Transfer', managerId: 'm1', status: 'Transfer In' })

    const { container } = render(
      <ColumnView people={[mgr, active, open, transfer]} selectedIds={new Set()} onSelect={vi.fn()} />
    )

    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/column-view-statuses.golden')
  })
})
```

- [ ] **Step 2: Create __golden__ directory**

Run: `mkdir -p web/src/views/__golden__`

- [ ] **Step 3: Run tests to generate golden files**

Run: `cd web && npx vitest run src/views/ColumnView.golden.test.tsx --update`
Expected: Golden files are auto-generated in `__golden__/` directory. Review them to ensure they capture meaningful structure.

- [ ] **Step 4: Run tests again without --update to verify they pass**

Run: `cd web && npx vitest run src/views/ColumnView.golden.test.tsx`
Expected: All tests PASS (matching the golden files)

- [ ] **Step 5: Commit**

```bash
jj new -m "test: add golden file tests for ColumnView"
```

---

### Task 19: Golden File Tests for ManagerView

**Files:**
- Create: `web/src/views/ManagerView.golden.test.tsx`
- Create: `web/src/views/__golden__/manager-view-*.golden` (auto-generated)

- [ ] **Step 1: Write the golden file test**

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import ManagerView from './ManagerView'
import type { Person } from '../api/types'

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div data-testid="dnd-context">{children}</div>,
  DragOverlay: ({ children }: { children: React.ReactNode }) => <div data-testid="drag-overlay">{children}</div>,
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: vi.fn(), isDragging: false }),
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
  MouseSensor: class {},
  KeyboardSensor: class {},
  useSensor: () => ({}),
  useSensors: () => [],
}))

vi.mock('../hooks/useChartLayout', () => ({
  useChartLayout: () => ({
    containerRef: { current: null },
    setNodeRef: () => () => {},
    lines: [],
    activeDragId: null,
    sensors: [],
    handleDragStart: vi.fn(),
    handleDragEnd: vi.fn(),
  }),
}))

vi.mock('../hooks/useDragDrop', () => ({
  useDragDrop: () => ({ onDragEnd: vi.fn() }),
}))

vi.mock('../store/OrgContext', () => ({
  useOrg: () => ({ move: vi.fn(), reparent: vi.fn(), selectedIds: new Set() }),
}))

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: 'default', name: 'Default', role: 'Engineer', discipline: 'Engineering',
    managerId: '', team: 'Platform', additionalTeams: [], status: 'Active',
    ...overrides,
  }
}

function normalizeHTML(html: string): string {
  return html
    .replace(/\s*style="[^"]*"/g, '')
    .replace(/\s+/g, ' ')
    .replace(/> </g, '>\n<')
    .trim()
}

describe('ManagerView golden file tests', () => {
  afterEach(() => cleanup())

  it('renders manager with summary cards', () => {
    const mgr = makePerson({ id: 'm1', name: 'Alice', role: 'VP', managerId: '' })
    const eng1 = makePerson({ id: 'e1', name: 'Bob', discipline: 'Engineering', managerId: 'm1' })
    const eng2 = makePerson({ id: 'e2', name: 'Carol', discipline: 'Design', managerId: 'm1' })
    const open = makePerson({ id: 'o1', name: 'Open Req', managerId: 'm1', status: 'Open' })

    const { container } = render(
      <ManagerView people={[mgr, eng1, eng2, open]} selectedIds={new Set()} onSelect={vi.fn()} />
    )

    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/manager-view-summary.golden')
  })

  it('renders empty state', () => {
    const { container } = render(
      <ManagerView people={[]} selectedIds={new Set()} onSelect={vi.fn()} />
    )

    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/manager-view-empty.golden')
  })

  it('renders multi-level management hierarchy', () => {
    const ceo = makePerson({ id: 'ceo', name: 'CEO', managerId: '' })
    const vp = makePerson({ id: 'vp', name: 'VP', managerId: 'ceo' })
    const dir = makePerson({ id: 'dir', name: 'Director', managerId: 'vp' })
    const ic = makePerson({ id: 'ic', name: 'IC', managerId: 'dir' })

    const { container } = render(
      <ManagerView people={[ceo, vp, dir, ic]} selectedIds={new Set()} onSelect={vi.fn()} />
    )

    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/manager-view-hierarchy.golden')
  })
})
```

- [ ] **Step 2: Run tests to generate golden files**

Run: `cd web && npx vitest run src/views/ManagerView.golden.test.tsx --update`

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd web && npx vitest run src/views/ManagerView.golden.test.tsx`
Expected: All 3 tests PASS

- [ ] **Step 4: Commit**

```bash
jj new -m "test: add golden file tests for ManagerView"
```

---

### Task 20: Golden File Tests for TableView

**Files:**
- Create: `web/src/views/TableView.golden.test.tsx`
- Create: `web/src/views/__golden__/table-view-*.golden` (auto-generated)

- [ ] **Step 1: Write the golden file test**

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import TableView from './TableView'
import type { Person } from '../api/types'
import type { PersonChange } from '../hooks/useOrgDiff'

vi.mock('../store/OrgContext', () => ({
  useOrg: () => ({
    update: vi.fn(), remove: vi.fn(), toggleSelect: vi.fn(), add: vi.fn(),
    working: [], pods: [], settings: { disciplineOrder: [] },
    original: [], recycled: [], originalPods: [],
    loaded: true, selectedIds: new Set(), selectedId: null, selectedPodId: null,
    viewMode: 'table' as const, dataView: 'working' as const, headPersonId: null,
    hiddenEmploymentTypes: new Set(), binOpen: false, layoutKey: 0,
    pendingMapping: null, snapshots: [], currentSnapshotName: null,
    autosaveAvailable: null, error: null,
    setViewMode: vi.fn(), setDataView: vi.fn(), setSelectedId: vi.fn(),
    clearSelection: vi.fn(), upload: vi.fn(), move: vi.fn(), reparent: vi.fn(),
    reorder: vi.fn(), restore: vi.fn(), emptyBin: vi.fn(), setBinOpen: vi.fn(),
    confirmMapping: vi.fn(), cancelMapping: vi.fn(), reflow: vi.fn(),
    saveSnapshot: vi.fn(), loadSnapshot: vi.fn(), deleteSnapshot: vi.fn(),
    restoreAutosave: vi.fn(), dismissAutosave: vi.fn(),
    toggleEmploymentTypeFilter: vi.fn(), showAllEmploymentTypes: vi.fn(),
    hideAllEmploymentTypes: vi.fn(), setHead: vi.fn(), clearError: vi.fn(),
    selectPod: vi.fn(), updatePod: vi.fn(), createPod: vi.fn(), updateSettings: vi.fn(),
  }),
  OrgProvider: ({ children }: { children: React.ReactNode }) => children,
}))

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: 'default', name: 'Default', role: 'Engineer', discipline: 'Engineering',
    managerId: '', team: 'Platform', additionalTeams: [], status: 'Active',
    employmentType: 'FTE', ...overrides,
  }
}

function normalizeHTML(html: string): string {
  return html
    .replace(/\s*style="[^"]*"/g, '')
    .replace(/\s+/g, ' ')
    .replace(/> </g, '>\n<')
    .trim()
}

describe('TableView golden file tests', () => {
  afterEach(() => cleanup())

  it('renders table with people', () => {
    const people = [
      makePerson({ id: '1', name: 'Alice', role: 'VP', team: 'Engineering', managerId: '' }),
      makePerson({ id: '2', name: 'Bob', role: 'Engineer', team: 'Platform', managerId: '1' }),
    ]

    const { container } = render(<TableView people={people} />)
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/table-view-basic.golden')
  })

  it('renders read-only table', () => {
    const people = [
      makePerson({ id: '1', name: 'Alice', role: 'VP', managerId: '' }),
    ]

    const { container } = render(<TableView people={people} readOnly />)
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/table-view-readonly.golden')
  })

  it('renders diff classes', () => {
    const people = [
      makePerson({ id: '1', name: 'Alice', managerId: '' }),
      makePerson({ id: '2', name: 'Bob', managerId: '1' }),
    ]
    const changes = new Map<string, PersonChange>([
      ['1', { types: new Set(['added']) }],
      ['2', { types: new Set(['reporting']) }],
    ])

    const { container } = render(<TableView people={people} changes={changes} />)
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/table-view-diff.golden')
  })

  it('renders empty table', () => {
    const { container } = render(<TableView people={[]} />)
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/table-view-empty.golden')
  })
})
```

- [ ] **Step 2: Run tests to generate golden files**

Run: `cd web && npx vitest run src/views/TableView.golden.test.tsx --update`

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd web && npx vitest run src/views/TableView.golden.test.tsx`
Expected: All 4 tests PASS

- [ ] **Step 4: Commit**

```bash
jj new -m "test: add golden file tests for TableView"
```

---

### Task 21: Final Verification

- [ ] **Step 1: Run all frontend tests**

Run: `cd web && npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Run frontend tests with coverage**

Run: `cd web && npx vitest run --coverage`
Expected: Coverage meets new thresholds (80/75/70/80). If not, note which areas are below threshold and add targeted tests.

- [ ] **Step 3: Run Go tests**

Run: `go test -race -cover ./...`
Expected: All tests pass

- [ ] **Step 4: Run Go benchmarks**

Run: `go test -bench=. -benchmem ./internal/api/ -count=1 -benchtime=100ms`
Expected: Benchmarks run and report results

- [ ] **Step 5: Run E2E tests**

Run: `make e2e`
Expected: All E2E tests pass (including new negative tests)

- [ ] **Step 6: Run mutation testing smoke test**

Run: `cd web && npx stryker run --mutate 'src/utils/snapshotExportUtils.ts'`
Expected: Stryker reports mutation score for the utility file

- [ ] **Step 7: Final commit if any fixes needed**

```bash
jj new -m "test: fix any remaining test issues from hardening"
```
