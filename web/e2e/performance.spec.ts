import { test, expect } from '@playwright/test'
import { uploadCSV, switchView, waitForChart } from './helpers'

// Performance budgets. These are regression detectors, not micro-benchmarks
// — they're tuned to fail on order-of-magnitude regressions, not normal
// CI noise. Tighten once we have a stable baseline across CI runs.
//
// Budgets are wall-clock and include test framework overhead. Keep them
// well above measured medians; e2e on shared CI hardware is noisy.
const BUDGETS = {
  // Upload + parse + render 200-person org from a fresh page.
  uploadAndRender: 8_000,
  // Switching among Detail/Manager/Table views with the org already loaded.
  viewSwitch: 3_000,
  // Triggering an export and receiving the download event.
  exportCSV: 5_000,
}

test.describe('Large dataset (200 people)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await uploadCSV(page, 'large-org.csv')
    await waitForChart(page)
  })

  test('[CONC-003] renders detail view with 200 people within budget', async ({ page }) => {
    const start = Date.now()
    const nodes = page.locator('[data-selected]')
    await expect(nodes.first()).toBeVisible({ timeout: BUDGETS.uploadAndRender + 5_000 })
    const count = await nodes.count()
    expect(count).toBeGreaterThan(10)

    // Total: navigation in beforeEach + this assertion. Upper bound that
    // catches order-of-magnitude regressions.
    const elapsed = Date.now() - start
    expect.soft(elapsed, `first-paint elapsed ${elapsed}ms (budget ${BUDGETS.uploadAndRender}ms)`).toBeLessThan(BUDGETS.uploadAndRender)
  })

  test('[CONC-003] switches views within budget', async ({ page }) => {
    // Switch to Manager view
    let start = Date.now()
    await switchView(page, 'Manager')
    await expect(page.locator('[data-selected]').first()).toBeVisible({ timeout: BUDGETS.viewSwitch + 5_000 })
    let elapsed = Date.now() - start
    expect.soft(elapsed, `Detail→Manager ${elapsed}ms (budget ${BUDGETS.viewSwitch}ms)`).toBeLessThan(BUDGETS.viewSwitch)

    // Switch to Table view
    start = Date.now()
    await switchView(page, 'Table')
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: BUDGETS.viewSwitch + 5_000 })
    // Table virtualizes (only renders rows in the scroll viewport), so count via the
    // header label that reflects the underlying filteredPeople array length.
    await expect(page.locator('text=200 people')).toBeVisible()
    elapsed = Date.now() - start
    expect.soft(elapsed, `Manager→Table ${elapsed}ms (budget ${BUDGETS.viewSwitch}ms)`).toBeLessThan(BUDGETS.viewSwitch)

    // Switch back to Detail
    start = Date.now()
    await switchView(page, 'Detail')
    await expect(page.locator('[data-selected]').first()).toBeVisible({ timeout: BUDGETS.viewSwitch + 5_000 })
    elapsed = Date.now() - start
    expect.soft(elapsed, `Table→Detail ${elapsed}ms (budget ${BUDGETS.viewSwitch}ms)`).toBeLessThan(BUDGETS.viewSwitch)
  })

  test('[CONC-003] exports CSV within budget', async ({ page }) => {
    const start = Date.now()
    // Start waiting for download before clicking
    const downloadPromise = page.waitForEvent('download', { timeout: BUDGETS.exportCSV + 10_000 })

    // Open the export dropdown
    await page.getByRole('button', { name: 'Export options' }).click()

    // Click the CSV option
    await page.locator('button').filter({ hasText: 'CSV' }).first().click()

    const download = await downloadPromise
    expect(download.suggestedFilename()).toContain('.csv')

    const elapsed = Date.now() - start
    expect.soft(elapsed, `CSV export ${elapsed}ms (budget ${BUDGETS.exportCSV}ms)`).toBeLessThan(BUDGETS.exportCSV)
  })

})
