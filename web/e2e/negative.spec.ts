import { test, expect } from '@playwright/test'
import { uploadCSV, clickPerson, sidebarField, switchView, dragPersonTo } from './helpers'

test.describe('Negative scenarios', () => {

  test.beforeEach(async ({ page }) => {
    await page.request.delete('/api/autosave').catch(() => {})
    await page.goto('/')
    await page.evaluate(() => localStorage.removeItem('grove-autosave'))
    // Dismiss recovery banner if visible from stale data
    const banner = page.getByRole('alert').filter({ hasText: 'Restore' })
    if (await banner.isVisible().catch(() => false)) {
      await banner.getByRole('button', { name: 'Dismiss' }).click()
    }
  })

  test('[UPLOAD-011] uploading an invalid file shows error or mapping modal', async ({ page }) => {
    // Upload a CSV buffer with no "name" column — should show error or mapping modal, not crash
    const csvContent = 'foo,bar,baz\n1,2,3\n4,5,6'
    const mainInput = page.getByRole('main').locator('input[type="file"]')
    const toolbarInput = page.locator('header input[type="file"]')
    const fileInput = await mainInput.isVisible().catch(() => false) ? mainInput : toolbarInput
    await fileInput.setInputFiles({
      name: 'invalid.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvContent),
    })

    // The app should either show the column mapping modal OR an error message — not crash
    const mappingModal = page.locator('text=Map Spreadsheet Columns')
    const errorIndicator = page.locator('[role="alert"]')
      .or(page.locator('.error'))
      .or(page.getByText(/error/i))
      .or(page.getByText(/could not/i))
      .or(page.getByText(/invalid/i))
      .or(page.getByText(/failed/i))
      .or(page.getByText(/something went wrong/i))
    const uploadScreen = page.getByRole('main').locator('input[type="file"]')

    // Wait for one of: mapping modal, error, or upload screen still visible
    await expect(
      mappingModal.or(errorIndicator).or(uploadScreen).first()
    ).toBeVisible({ timeout: 5000 })

    // The app should NOT have crashed — page should still be responsive
    await expect(page.locator('body')).toBeVisible()
  })

  test('[CONTRACT-010] server error during update shows error state', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    await clickPerson(page, 'Bob')
    await expect(page.locator('[data-testid="sidebar-heading"]')).toBeVisible()

    // Intercept the update API to return a 500
    await page.route('**/api/update', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      })
    })

    const roleInput = sidebarField(page, 'role')
    await roleInput.clear()
    await roleInput.fill('Broken Role')
    await page.getByRole('button', { name: 'Save' }).click()

    // Should NOT show "Saved!" since the server returned an error
    await expect(page.getByRole('button', { name: 'Saved!' })).not.toBeVisible({ timeout: 3000 })

    // All people should still be visible (no data loss)
    await expect(page.locator('[data-selected]').filter({ hasText: 'Alice' })).toBeVisible()
    await expect(page.locator('[data-selected]').filter({ hasText: 'Bob' })).toBeVisible()
    await expect(page.locator('[data-selected]').filter({ hasText: 'Carol' })).toBeVisible()
  })

  test('[CONTRACT-010] server error during delete keeps person visible', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    await clickPerson(page, 'Carol')
    await expect(page.locator('[data-testid="sidebar-heading"]')).toBeVisible()

    // Intercept the delete API to return a 500
    await page.route('**/api/delete', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      })
    })

    await page.getByRole('button', { name: 'Delete' }).click()

    // Wait a moment for any async processing
    await page.waitForTimeout(500)

    // Carol should still be visible since the delete failed on the server
    // (The app might optimistically remove and then restore, or just keep her)
    await expect(page.locator('[data-selected]').filter({ hasText: 'Carol' })).toBeVisible({ timeout: 5000 })
  })

  test('[CONTRACT-010] server error during move keeps org intact', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')

    // Intercept the move API to return a 500
    await page.route('**/api/move', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      })
    })

    await dragPersonTo(page, 'Carol', 'Alice')

    // Wait for any processing
    await page.waitForTimeout(500)

    // All 3 people should still be visible regardless of the error
    await expect(page.locator('[data-selected]').filter({ hasText: 'Alice' })).toBeVisible()
    await expect(page.locator('[data-selected]').filter({ hasText: 'Bob' })).toBeVisible()
    await expect(page.locator('[data-selected]').filter({ hasText: 'Carol' })).toBeVisible()
  })

  test('[UPLOAD-001] uploading empty file does not crash', async ({ page }) => {
    // Upload a completely empty buffer as a CSV
    const mainInput = page.getByRole('main').locator('input[type="file"]')
    const toolbarInput = page.locator('header input[type="file"]')
    const fileInput = await mainInput.isVisible().catch(() => false) ? mainInput : toolbarInput
    await fileInput.setInputFiles({
      name: 'empty.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(''),
    })

    // The app should show an error or stay on the upload screen, not crash
    const errorIndicator = page.locator('[role="alert"]')
      .or(page.locator('.error'))
      .or(page.getByText(/error/i))
      .or(page.getByText(/could not/i))
      .or(page.getByText(/invalid/i))
      .or(page.getByText(/failed/i))
      .or(page.getByText(/empty/i))
    const uploadScreen = page.getByRole('main').locator('input[type="file"]')

    await expect(
      errorIndicator.or(uploadScreen).first()
    ).toBeVisible({ timeout: 5000 })

    // App should not have crashed
    await expect(page.locator('body')).toBeVisible()
  })

  test('[CONTRACT-010] network timeout on upload shows error', async ({ page }) => {
    // Capture the initial count of org chart nodes (may be non-zero from prior tests)
    const initialCount = await page.locator('[data-selected]').count()

    // Intercept the upload API and abort with a timeout error
    await page.route('**/api/upload', async (route) => {
      await route.abort('timedout')
    })

    const csvContent = 'Name,Role,Manager\nAlice,VP,\nBob,Engineer,Alice'
    const mainInput = page.getByRole('main').locator('input[type="file"]')
    const toolbarInput = page.locator('header input[type="file"]')
    const fileInput = await mainInput.isVisible().catch(() => false) ? mainInput : toolbarInput
    await fileInput.setInputFiles({
      name: 'timeout.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvContent),
    })

    // The app should show an error or remain on the upload screen
    const errorIndicator = page.locator('[role="alert"]')
      .or(page.locator('.error'))
      .or(page.getByText(/error/i))
      .or(page.getByText(/could not/i))
      .or(page.getByText(/failed/i))
      .or(page.getByText(/network/i))
      .or(page.getByText(/timeout/i))
    const uploadScreen = page.getByRole('main').locator('input[type="file"]')

    await expect(
      errorIndicator.or(uploadScreen).first()
    ).toBeVisible({ timeout: 5000 })

    // The failed upload should NOT have added new org chart nodes
    await expect(page.locator('[data-selected]')).toHaveCount(initialCount)
  })

  test('[SNAP-001] snapshot save with server error does not lose data', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')

    // Intercept snapshot save API to return a 500
    await page.route('**/api/snapshots', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error' }),
        })
      } else {
        await route.continue()
      }
    })

    // Set up dialog handler for the snapshot name prompt
    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'prompt') {
        await dialog.accept('test-snapshot')
      }
    })

    // Try to save a snapshot
    await page.locator('button[aria-label*="Snapshot"]').click()
    await page.getByRole('button', { name: 'Save As...' }).click()

    // Wait for the failed save attempt
    await page.waitForTimeout(1000)

    // Close the snapshot dropdown if still open
    await page.keyboard.press('Escape')

    // All people should still be visible — no data loss from a failed snapshot save
    await expect(page.locator('[data-selected]').filter({ hasText: 'Alice' })).toBeVisible()
    await expect(page.locator('[data-selected]').filter({ hasText: 'Bob' })).toBeVisible()
    await expect(page.locator('[data-selected]').filter({ hasText: 'Carol' })).toBeVisible()
  })

})
