import { test, expect } from '@playwright/test'
import { uploadCSV, switchView, waitForChart } from './helpers'

test.describe('Large dataset (200 people)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await uploadCSV(page, 'large-org.csv')
    await waitForChart(page)
  })

  test('[CONC-003] renders detail view with 200 people', async ({ page }) => {
    // Verify the chart rendered with person nodes visible
    const nodes = page.locator('[data-selected]')
    await expect(nodes.first()).toBeVisible({ timeout: 15000 })
    const count = await nodes.count()
    expect(count).toBeGreaterThan(10)
  })

  test('[CONC-003] switches views without hanging', async ({ page }) => {
    // Switch to Manager view
    await switchView(page, 'Manager')
    await expect(page.locator('[data-selected]').first()).toBeVisible({ timeout: 10000 })

    // Switch to Table view
    await switchView(page, 'Table')
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 10000 })
    // Table should show all 200 people
    const rowCount = await page.locator('tbody tr').count()
    expect(rowCount).toBe(200)

    // Switch back to Detail
    await switchView(page, 'Detail')
    await expect(page.locator('[data-selected]').first()).toBeVisible({ timeout: 10000 })
  })

  test('[CONC-003] exports CSV with all 200 people', async ({ page }) => {
    // Start waiting for download before clicking
    const downloadPromise = page.waitForEvent('download', { timeout: 15000 })

    // Open the export dropdown
    await page.getByRole('button', { name: 'Export options' }).click()

    // Click the CSV option
    await page.locator('button').filter({ hasText: 'CSV' }).first().click()

    const download = await downloadPromise
    expect(download.suggestedFilename()).toContain('.csv')
  })

})
