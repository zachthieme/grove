# Playwright E2E Smoke Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 7 Playwright smoke tests covering core happy paths (upload, view switching, editing, delete/restore, snapshots, batch edit) with shared test helpers and a `make e2e` runner.

**Architecture:** Playwright runs against the built Go binary (`./grove -p 9222`). Each test uploads a fresh CSV for isolation. Shared helpers abstract upload, navigation, and waiting. Chromium only.

**Tech Stack:** Playwright Test, Chromium, Go binary, Makefile

**Spec:** `docs/superpowers/specs/2026-03-25-playwright-e2e-design.md`

---

### Task 1: Install Playwright and create config

**Files:**
- Modify: `web/package.json` (add `@playwright/test` dev dep)
- Create: `web/playwright.config.ts`
- Modify: `Makefile` (add `e2e` target)
- Modify: `.gitignore` (add Playwright artifacts)

- [ ] **Step 1: Install Playwright**

```bash
cd web && npm install --save-dev @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Create Playwright config**

Create `web/playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'http://localhost:9222',
    headless: true,
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'cd .. && make build && ./grove -p 9222',
    url: 'http://localhost:9222/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
})
```

- [ ] **Step 3: Add Makefile target**

Append to `Makefile`:

```makefile
e2e: build
	cd web && npx playwright test
```

Also add to `.PHONY` line.

- [ ] **Step 4: Update .gitignore**

Add these lines:

```
web/test-results/
web/playwright-report/
```

- [ ] **Step 5: Verify Playwright runs (no tests yet)**

```bash
make e2e
```

Expected: Playwright starts, finds no tests, exits cleanly. The Go binary should build and start on port 9222.

- [ ] **Step 6: Commit**

```bash
jj describe -m "chore: add Playwright infrastructure and config"
```

---

### Task 2: Create test helpers

**Files:**
- Create: `web/e2e/helpers.ts`

- [ ] **Step 1: Create helpers file**

Create `web/e2e/helpers.ts`:

```typescript
import { type Page, expect } from '@playwright/test'
import path from 'path'

/**
 * Upload a CSV file and wait for the org chart to render.
 * Works from both the initial upload prompt and the toolbar re-upload button.
 */
export async function uploadCSV(page: Page, csvPath: string) {
  const absPath = path.resolve(__dirname, '../../testdata', csvPath)
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles(absPath)
  // Wait for person nodes or table rows to appear
  await page.locator('[class*="node"], tbody tr').first().waitFor({ timeout: 10000 })
}

/**
 * Switch the view mode (Detail, Manager, Table).
 */
export async function switchView(page: Page, view: 'Detail' | 'Manager' | 'Table') {
  await page.getByRole('button', { name: view, exact: true }).click()
}

/**
 * Click a person card by their visible name text.
 */
export async function clickPerson(page: Page, name: string) {
  await page.locator(`[class*="node"]`).filter({ hasText: name }).first().click()
}

/**
 * Wait for the chart to have rendered content (person nodes visible).
 */
export async function waitForChart(page: Page) {
  await page.locator('[class*="node"]').first().waitFor({ timeout: 10000 })
}
```

- [ ] **Step 2: Commit**

```bash
jj describe -m "feat(e2e): add shared Playwright test helpers"
```

---

### Task 3: Test — Upload CSV and see org chart

**Files:**
- Create: `web/e2e/smoke.spec.ts`

- [ ] **Step 1: Create smoke spec with first test**

Create `web/e2e/smoke.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'
import { uploadCSV, switchView, clickPerson, waitForChart } from './helpers'

test.describe('Smoke tests', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('upload CSV and see org chart', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')

    // All 3 people should be visible as cards
    await expect(page.locator('[class*="node"]').filter({ hasText: 'Alice' })).toBeVisible()
    await expect(page.locator('[class*="node"]').filter({ hasText: 'Bob' })).toBeVisible()
    await expect(page.locator('[class*="node"]').filter({ hasText: 'Carol' })).toBeVisible()
  })

})
```

- [ ] **Step 2: Run the test**

```bash
make e2e
```

Expected: 1 test passes. The Go binary starts, Playwright uploads `simple.csv`, and verifies 3 person cards render.

- [ ] **Step 3: Commit**

```bash
jj describe -m "test(e2e): upload CSV and see org chart"
```

---

### Task 4: Test — Switch between views

**Files:**
- Modify: `web/e2e/smoke.spec.ts`

- [ ] **Step 1: Add view switching test**

Add inside the `describe` block:

```typescript
  test('switch between views', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')

    // Detail view (default) — person cards visible
    await expect(page.locator('[class*="node"]').first()).toBeVisible()

    // Manager view
    await switchView(page, 'Manager')
    await expect(page.locator('[class*="node"]').first()).toBeVisible()

    // Table view
    await switchView(page, 'Table')
    await expect(page.locator('tbody tr').first()).toBeVisible()

    // Back to Detail
    await switchView(page, 'Detail')
    await expect(page.locator('[class*="node"]').first()).toBeVisible()
  })
```

- [ ] **Step 2: Run and verify**

```bash
make e2e
```

Expected: 2 tests pass.

- [ ] **Step 3: Commit**

```bash
jj describe -m "test(e2e): switch between views"
```

---

### Task 5: Test — Edit a person via sidebar

**Files:**
- Modify: `web/e2e/smoke.spec.ts`

- [ ] **Step 1: Add sidebar edit test**

Add inside the `describe` block:

```typescript
  test('edit a person via sidebar', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')

    // Click Bob to open sidebar
    await clickPerson(page, 'Bob')

    // Sidebar should appear with "Edit Person" header
    await expect(page.locator('text=Edit Person')).toBeVisible()

    // Change role field
    const roleInput = page.locator('label:has-text("Role") + input, label:has-text("Role") ~ input').first()
    await roleInput.clear()
    await roleInput.fill('Staff Engineer')

    // Save
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('button', { name: 'Saved!' })).toBeVisible()

    // Verify updated role appears on the card
    await expect(page.locator('[class*="node"]').filter({ hasText: 'Staff Engineer' })).toBeVisible()
  })
```

- [ ] **Step 2: Run and verify**

```bash
make e2e
```

Expected: 3 tests pass.

- [ ] **Step 3: Commit**

```bash
jj describe -m "test(e2e): edit a person via sidebar"
```

---

### Task 6: Test — Table inline edit

**Files:**
- Modify: `web/e2e/smoke.spec.ts`

- [ ] **Step 1: Add table edit test**

Add inside the `describe` block:

```typescript
  test('table inline edit', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    await switchView(page, 'Table')

    // Find Alice's row and click the Role cell
    const aliceRow = page.locator('tbody tr').filter({ hasText: 'Alice' })
    const roleCell = aliceRow.locator('td').nth(2) // Role is 2nd data column (after checkbox + Name)
    await roleCell.click()

    // Should show an input
    const input = roleCell.locator('input')
    await expect(input).toBeVisible()
    await input.clear()
    await input.fill('CTO')
    await input.blur()

    // Verify the cell shows updated value
    await expect(roleCell).toContainText('CTO')
  })
```

- [ ] **Step 2: Run and verify**

```bash
make e2e
```

Expected: 4 tests pass.

- [ ] **Step 3: Commit**

```bash
jj describe -m "test(e2e): table inline edit"
```

---

### Task 7: Test — Delete and restore

**Files:**
- Modify: `web/e2e/smoke.spec.ts`

- [ ] **Step 1: Add delete and restore test**

Add inside the `describe` block:

```typescript
  test('delete and restore', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')

    // Click Carol to open sidebar
    await clickPerson(page, 'Carol')
    await expect(page.locator('text=Edit Person')).toBeVisible()

    // Delete
    await page.getByRole('button', { name: 'Delete' }).click()

    // Carol should disappear from chart
    await expect(page.locator('[class*="node"]').filter({ hasText: 'Carol' })).toHaveCount(0)

    // Open recycle bin
    await page.getByRole('button', { name: /Recycle bin/ }).click()
    await expect(page.locator('text=Recycle Bin')).toBeVisible()

    // Restore Carol
    await page.locator('[aria-label="Recycle bin"]').getByRole('button', { name: 'Restore' }).click()

    // Close bin
    await page.getByRole('button', { name: 'Close recycle bin' }).click()

    // Carol should be back
    await expect(page.locator('[class*="node"]').filter({ hasText: 'Carol' })).toBeVisible()
  })
```

- [ ] **Step 2: Run and verify**

```bash
make e2e
```

Expected: 5 tests pass.

- [ ] **Step 3: Commit**

```bash
jj describe -m "test(e2e): delete and restore"
```

---

### Task 8: Test — Snapshot save and load

**Files:**
- Modify: `web/e2e/smoke.spec.ts`

- [ ] **Step 1: Add snapshot test**

Add inside the `describe` block. Note: the snapshot dropdown uses `prompt()` for the name, which Playwright can handle via `page.on('dialog')`.

```typescript
  test('snapshot save and load', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')

    // Save snapshot — intercept the prompt dialog
    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'prompt') {
        await dialog.accept('baseline')
      }
    })

    // Open snapshots dropdown and click "Save As..."
    await page.locator('button[aria-label*="Snapshot"]').click()
    await page.getByRole('button', { name: 'Save As...' }).click()

    // Wait for snapshot to save
    await page.waitForTimeout(500)

    // Edit Bob's role
    await clickPerson(page, 'Bob')
    const roleInput = page.locator('label:has-text("Role") + input, label:has-text("Role") ~ input').first()
    await roleInput.clear()
    await roleInput.fill('Changed Role')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('button', { name: 'Saved!' })).toBeVisible()

    // Load the baseline snapshot
    await page.locator('button[aria-label*="Snapshot"]').click()
    await page.getByRole('button', { name: 'baseline' }).click()

    // Bob should have original role back
    await expect(page.locator('[class*="node"]').filter({ hasText: 'Senior Engineer' })).toBeVisible()
    await expect(page.locator('[class*="node"]').filter({ hasText: 'Changed Role' })).toHaveCount(0)
  })
```

- [ ] **Step 2: Run and verify**

```bash
make e2e
```

Expected: 6 tests pass.

- [ ] **Step 3: Commit**

```bash
jj describe -m "test(e2e): snapshot save and load"
```

---

### Task 9: Test — Multi-select batch edit

**Files:**
- Modify: `web/e2e/smoke.spec.ts`

- [ ] **Step 1: Add multi-select batch edit test**

Add inside the `describe` block. Uses `grove.csv` for more people:

```typescript
  test('multi-select batch edit', async ({ page }) => {
    await uploadCSV(page, 'grove.csv')
    await switchView(page, 'Table')

    // Check first two row checkboxes
    const checkboxes = page.locator('tbody input[type="checkbox"]')
    await checkboxes.nth(0).check()
    await checkboxes.nth(1).check()

    // Batch edit sidebar should appear
    await expect(page.locator('text=Edit 2 people')).toBeVisible()

    // Change discipline
    const discInput = page.locator('label:has-text("Discipline") + input, label:has-text("Discipline") ~ input').first()
    await discInput.clear()
    await discInput.fill('Design')

    // Save
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('button', { name: 'Saved!' })).toBeVisible()

    // Clear selection
    await page.getByRole('button', { name: 'Clear selection' }).click()

    // Verify both people now have "Design" discipline in their table cells
    const firstRow = page.locator('tbody tr').nth(0)
    const secondRow = page.locator('tbody tr').nth(1)
    await expect(firstRow).toContainText('Design')
    await expect(secondRow).toContainText('Design')
  })
```

- [ ] **Step 2: Run full suite**

```bash
make e2e
```

Expected: All 7 tests pass.

- [ ] **Step 3: Commit**

```bash
jj describe -m "test(e2e): multi-select batch edit"
```

---

### Task 10: Final verification and cleanup

- [ ] **Step 1: Run full suite from clean state**

```bash
make clean && make e2e
```

Expected: Binary builds, server starts, all 7 tests pass, server shuts down.

- [ ] **Step 2: Verify no test artifacts are committed**

```bash
jj status
```

Ensure `web/test-results/` and `web/playwright-report/` are ignored.

- [ ] **Step 3: Final commit**

```bash
jj describe -m "test(e2e): complete Playwright smoke test suite"
```
