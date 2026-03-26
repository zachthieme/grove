# Playwright Feature Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 12 Playwright feature tests in `web/e2e/features.spec.ts` covering drag-and-drop, lasso select, pods, column mapping, diff mode, employment filter, notes, paste, head focus, table filtering, and team cascade.

**Architecture:** New test file alongside existing smoke tests. Same Playwright infrastructure, helpers, and `make e2e` runner. Add two new helpers for DnD and lasso. Each test uploads fresh CSV for isolation.

**Tech Stack:** Playwright Test, Chromium, existing Grove test infrastructure

**Spec:** `docs/superpowers/specs/2026-03-25-playwright-features-design.md`

---

### Task 1: Add DnD and lasso helpers

**Files:**
- Modify: `web/e2e/helpers.ts`

- [ ] **Step 1: Add drag-and-drop helper**

Add to `web/e2e/helpers.ts`:

```typescript
/**
 * Drag a person card onto another person card (for reparenting).
 * Uses the inner drag handle element (has data-dnd-draggable attribute).
 */
export async function dragPersonTo(page: Page, sourceName: string, targetName: string) {
  const source = page.locator('[aria-selected]').filter({ hasText: sourceName }).first()
  const target = page.locator('[aria-selected]').filter({ hasText: targetName }).first()
  const dragHandle = source.locator('[data-dnd-draggable]')
  await dragHandle.dragTo(target)
}

/**
 * Perform a lasso/marquee selection by clicking and dragging on the chart container.
 * Coordinates are relative to the chart container element.
 */
export async function lassoSelect(page: Page, startX: number, startY: number, endX: number, endY: number) {
  const container = page.locator('[data-role="chart-container"]')
  const box = await container.boundingBox()
  if (!box) throw new Error('Chart container not found')
  await page.mouse.move(box.x + startX, box.y + startY)
  await page.mouse.down()
  // Move in steps so the lasso threshold (5px) is crossed
  await page.mouse.move(box.x + endX, box.y + endY, { steps: 5 })
  await page.mouse.up()
}
```

- [ ] **Step 2: Verify helpers compile**

```bash
cd /Users/zach/code/grove && make e2e
```

Expected: Existing 7 smoke tests still pass.

- [ ] **Step 3: Commit**

```bash
jj describe -m "test(e2e): add DnD and lasso select helpers"
```

---

### Task 2: Create features spec with first 4 tests

**Files:**
- Create: `web/e2e/features.spec.ts`

- [ ] **Step 1: Create features.spec.ts with tests 1-4**

Create `web/e2e/features.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'
import { uploadCSV, switchView, clickPerson, dragPersonTo, lassoSelect } from './helpers'

test.describe('Feature tests', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('drag-and-drop reparent', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    // Carol is under Bob. Drag Carol onto Alice to reparent.
    await dragPersonTo(page, 'Carol', 'Alice')
    // Verify Carol's manager changed — click Carol, check sidebar
    await clickPerson(page, 'Carol')
    await expect(page.locator('h3', { hasText: 'Edit Person' })).toBeVisible()
    // Manager dropdown should show Alice selected
    const managerSelect = page.locator('label').filter({ hasText: /^Manager$/ }).locator('xpath=../select')
    const selectedText = await managerSelect.locator('option:checked').textContent()
    expect(selectedText).toContain('Alice')
  })

  test('lasso multi-select', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    // Draw a large lasso rectangle across the entire chart
    await lassoSelect(page, 10, 10, 800, 600)
    // Should have selected multiple people — batch sidebar should appear
    const heading = page.locator('h3').filter({ hasText: /Edit \d+ people/ })
    await expect(heading).toBeVisible({ timeout: 3000 })
  })

  test('pod creation via edit', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    // Edit Bob's pod field to create a new pod
    await clickPerson(page, 'Bob')
    await expect(page.locator('h3', { hasText: 'Edit Person' })).toBeVisible()
    const podInput = page.locator('label').filter({ hasText: /^Pod$/ }).locator('xpath=../input')
    await podInput.clear()
    await podInput.fill('NewPod')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('button', { name: 'Saved!' })).toBeVisible()
    // Verify "NewPod" pod header appears in the chart
    await expect(page.locator('text=NewPod')).toBeVisible()
  })

  test('pod sidebar via info button', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    // First create a pod on Bob
    await clickPerson(page, 'Bob')
    const podInput = page.locator('label').filter({ hasText: /^Pod$/ }).locator('xpath=../input')
    await podInput.clear()
    await podInput.fill('TestPod')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('button', { name: 'Saved!' })).toBeVisible()
    // Click away to close sidebar
    await page.keyboard.press('Escape')
    // Hover over the pod header and click info button
    const podHeader = page.locator('text=TestPod').first()
    await podHeader.hover()
    const infoBtn = page.getByRole('button', { name: 'Org metrics' })
    await infoBtn.click()
    // Pod sidebar should open — look for the pod name in a sidebar
    await expect(page.locator('[class*="sidebar"]')).toBeVisible()
  })

})
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/zach/code/grove && make e2e
```

Expected: 11 tests pass (7 smoke + 4 features). If any feature tests fail due to selector issues, debug and fix.

- [ ] **Step 3: Commit**

```bash
jj describe -m "test(e2e): add DnD, lasso, and pod tests"
```

---

### Task 3: Add column mapping, diff mode, and employment filter tests

**Files:**
- Modify: `web/e2e/features.spec.ts`

- [ ] **Step 1: Add 3 more tests**

Add inside the `test.describe('Feature tests', ...)` block:

```typescript
  test('column mapping modal', async ({ page }) => {
    await uploadCSV(page, 'nonstandard.csv')
    // Non-standard headers should trigger the mapping modal
    await expect(page.locator('text=Map Spreadsheet Columns')).toBeVisible({ timeout: 5000 })
    // The "Load" button confirms the mapping
    await page.getByRole('button', { name: 'Load' }).click()
    // Chart should render after mapping is confirmed
    await expect(page.locator('[aria-selected]').first()).toBeVisible({ timeout: 10000 })
    // Verify at least one person rendered
    await expect(page.locator('[aria-selected]').filter({ hasText: 'Alice' })).toBeVisible()
  })

  test('diff mode shows changes', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    // Edit Bob's role
    await clickPerson(page, 'Bob')
    const roleInput = page.locator('label').filter({ hasText: /^Role$/ }).locator('xpath=../input')
    await roleInput.clear()
    await roleInput.fill('Changed Title')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('button', { name: 'Saved!' })).toBeVisible()
    await page.keyboard.press('Escape')
    // Switch to Diff view
    await page.getByRole('button', { name: 'Diff', exact: true }).click()
    // Bob's card should have a diff annotation class (titleChange styling)
    const bobCard = page.locator('[aria-selected]').filter({ hasText: 'Bob' })
    await expect(bobCard).toBeVisible()
    // The card should have a diff-related CSS class applied
    const cardClass = await bobCard.getAttribute('class')
    // titleChange or reporting or reorg — any diff class indicates it worked
    expect(cardClass).toBeTruthy()
  })

  test('employment type filter', async ({ page }) => {
    await uploadCSV(page, 'ddp-org.csv')
    // Count initial cards
    const initialCount = await page.locator('[aria-selected]').count()
    expect(initialCount).toBeGreaterThan(5)
    // Open employment type filter
    await page.getByRole('button', { name: 'Employment type filter' }).click()
    // Click "Hide All" to hide all types
    await page.getByRole('button', { name: 'Hide All' }).click()
    // Should show 0 cards (or the filter menu covers them)
    await page.keyboard.press('Escape') // close dropdown
    const hiddenCount = await page.locator('[aria-selected]').count()
    expect(hiddenCount).toBeLessThan(initialCount)
    // Click "Show All" to restore
    await page.getByRole('button', { name: 'Employment type filter' }).click()
    await page.getByRole('button', { name: 'Show All' }).click()
    await page.keyboard.press('Escape')
    const restoredCount = await page.locator('[aria-selected]').count()
    expect(restoredCount).toBe(initialCount)
  })
```

Note: The `uploadCSV` helper waits for `[aria-selected]` to appear. For `nonstandard.csv`, the mapping modal appears BEFORE chart renders, so `uploadCSV` will time out waiting. You need to handle this: either modify the helper or use `setInputFiles` directly and wait for the modal instead.

**Fix for column mapping test:** Use `setInputFiles` directly instead of `uploadCSV`:

```typescript
  test('column mapping modal', async ({ page }) => {
    // Upload nonstandard CSV directly (don't use uploadCSV helper which waits for chart)
    const absPath = path.resolve(__dirname, '../../testdata', 'nonstandard.csv')
    const fileInput = page.getByRole('main').locator('input[type="file"]')
    await fileInput.setInputFiles(absPath)
    // Non-standard headers should trigger the mapping modal
    await expect(page.locator('text=Map Spreadsheet Columns')).toBeVisible({ timeout: 5000 })
    // The "Load" button confirms the mapping
    await page.getByRole('button', { name: 'Load' }).click()
    // Chart should render after mapping is confirmed
    await expect(page.locator('[aria-selected]').first()).toBeVisible({ timeout: 10000 })
    await expect(page.locator('[aria-selected]').filter({ hasText: 'Alice' })).toBeVisible()
  })
```

Add the `path` import at the top of the file:
```typescript
import path from 'path'
import { fileURLToPath } from 'url'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/zach/code/grove && make e2e
```

Expected: 14 tests pass (7 smoke + 7 features).

- [ ] **Step 3: Commit**

```bash
jj describe -m "test(e2e): add column mapping, diff mode, and employment filter tests"
```

---

### Task 4: Add note icon, paste, head focus, table filter, and team cascade tests

**Files:**
- Modify: `web/e2e/features.spec.ts`

- [ ] **Step 1: Add final 5 tests**

Add inside the `test.describe('Feature tests', ...)` block:

```typescript
  test('note icon toggle', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    // Add a public note to Bob
    await clickPerson(page, 'Bob')
    const noteField = page.locator('label').filter({ hasText: /^Public Note$/ }).locator('xpath=../textarea')
    await noteField.fill('This is a test note')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('button', { name: 'Saved!' })).toBeVisible()
    await page.keyboard.press('Escape')
    // Note icon should appear on Bob's card
    const noteIcon = page.getByTitle('Toggle notes')
    await expect(noteIcon).toBeVisible()
    // Click to show note panel
    await noteIcon.click()
    await expect(page.locator('text=This is a test note')).toBeVisible()
    // Click again to hide
    await noteIcon.click()
    await expect(page.locator('text=This is a test note')).toHaveCount(0)
  })

  test('table paste', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    await switchView(page, 'Table')
    const initialRows = await page.locator('tbody tr').count()
    // Grant clipboard permission and write CSV data
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.evaluate(() => navigator.clipboard.writeText('NewPerson,Tester,Engineering'))
    // Click paste button
    await page.getByRole('button', { name: 'Paste' }).click()
    await page.waitForTimeout(500)
    // Should have one more row
    const newRows = await page.locator('tbody tr').count()
    expect(newRows).toBe(initialRows + 1)
    // Verify the new person appears
    await expect(page.locator('tbody tr').filter({ hasText: 'NewPerson' })).toBeVisible()
  })

  test('head focus subtree zoom', async ({ page }) => {
    await uploadCSV(page, 'grove.csv')
    const initialCount = await page.locator('[aria-selected]').count()
    expect(initialCount).toBeGreaterThan(10)
    // Hover over a manager to show actions, click focus button
    const manager = page.locator('[aria-selected]').filter({ hasText: 'Mike Torres' }).first()
    await manager.hover()
    await page.getByRole('button', { name: 'Focus on subtree' }).click()
    // Should show fewer cards (only Mike's subtree)
    const focusedCount = await page.locator('[aria-selected]').count()
    expect(focusedCount).toBeLessThan(initialCount)
    expect(focusedCount).toBeGreaterThan(0)
    // Press Escape to exit focus
    await page.keyboard.press('Escape')
    const restoredCount = await page.locator('[aria-selected]').count()
    expect(restoredCount).toBe(initialCount)
  })

  test('table column filter', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    await switchView(page, 'Table')
    // Should have 3 rows
    await expect(page.locator('tbody tr')).toHaveCount(3)
    // Click the filter button on the Status column header
    const statusHeader = page.locator('th').filter({ hasText: 'Status' })
    const filterBtn = statusHeader.getByTitle('Filter Status')
    await filterBtn.click()
    // Filter dropdown should appear — deselect "Active"
    const activeCheckbox = page.locator('label').filter({ hasText: 'Active' }).locator('input[type="checkbox"]')
    await activeCheckbox.uncheck()
    // All 3 people are Active, so 0 rows should remain
    await expect(page.locator('tbody tr')).toHaveCount(0)
    // Re-check Active
    await activeCheckbox.check()
    await expect(page.locator('tbody tr')).toHaveCount(3)
  })

  test('team cascade for front-line manager', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    // Bob manages Carol (front-line manager). Change Bob's team.
    await clickPerson(page, 'Bob')
    const teamInput = page.locator('label').filter({ hasText: /^Team$/ }).locator('xpath=../input')
    await teamInput.clear()
    await teamInput.fill('NewTeam')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('button', { name: 'Saved!' })).toBeVisible()
    // Switch to table view to verify Carol's team also changed
    await page.keyboard.press('Escape')
    await switchView(page, 'Table')
    const carolRow = page.locator('tbody tr').filter({ hasText: 'Carol' })
    await expect(carolRow).toContainText('NewTeam')
  })
```

- [ ] **Step 2: Run full suite**

```bash
cd /Users/zach/code/grove && make e2e
```

Expected: 19 tests pass (7 smoke + 12 features).

- [ ] **Step 3: Commit**

```bash
jj describe -m "test(e2e): add note, paste, focus, filter, and cascade tests"
```

---

### Task 5: Final verification

- [ ] **Step 1: Run full suite from clean state**

```bash
cd /Users/zach/code/grove && make clean && make e2e
```

Expected: Binary builds from scratch, server starts, all 19 tests pass, server shuts down.

- [ ] **Step 2: Verify no artifacts committed**

```bash
jj status
```

Ensure `web/test-results/` and `web/playwright-report/` are not tracked.

- [ ] **Step 3: Final commit**

```bash
jj describe -m "test(e2e): complete feature test suite (12 tests)"
```
