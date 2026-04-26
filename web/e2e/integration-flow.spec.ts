import { test, expect } from '@playwright/test'
import { uploadCSV, clickPerson, enterSidebarEdit, sidebarField } from './helpers'

test.describe('integration flow', () => {
  test('[INTEG-001] upload → edit → autosave → snapshot → restore', async ({ page }) => {
    // Clean up any previous autosave
    await page.goto('/')
    await page.request.delete('/api/autosave').catch(() => {})
    await page.evaluate(() => localStorage.removeItem('grove-autosave'))

    // Step 1: Upload CSV and verify org renders
    await uploadCSV(page, 'simple.csv')
    await expect(page.locator('[data-selected]').filter({ hasText: 'Alice' })).toBeVisible()
    await expect(page.locator('[data-selected]').filter({ hasText: 'Bob' })).toBeVisible()

    // Step 2: Edit Bob's role via sidebar.
    // Set up autosave request listener BEFORE triggering the mutation so we don't miss it.
    const autosavePromise = page.waitForRequest(
      (req) => req.url().includes('/api/autosave') && req.method() === 'POST',
      { timeout: 10000 },
    )
    await clickPerson(page, 'Bob')
    await enterSidebarEdit(page)
    const roleInput = sidebarField(page, 'role')
    await roleInput.clear()
    await roleInput.fill('Staff Engineer')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Saved!', exact: true })).toBeVisible()

    // Step 3: Verify autosave fires (server-side) — await the promise we set up before the edit
    const autosaveReq = await autosavePromise
    const body = autosaveReq.postDataJSON()
    expect(body).toHaveProperty('working')
    const bob = body.working.find((p: { name: string }) => p.name === 'Bob')
    expect(bob.role).toBe('Staff Engineer')

    // Step 4: Create a named snapshot
    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'prompt') {
        await dialog.accept('after-edit')
      }
    })
    await page.locator('button[aria-label*="Snapshot"]').click()
    await page.getByRole('button', { name: 'Save As...' }).click()
    // Wait for snapshot to be saved then close the snapshot panel with Escape
    await expect(page.locator('button[aria-label*="after-edit"]')).toBeVisible({ timeout: 3000 }).catch(() => {})
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)

    // Step 5: Edit Bob again (to have something to revert)
    await clickPerson(page, 'Bob')
    await expect(page.locator('[data-testid="sidebar-heading"]')).toBeVisible()
    await enterSidebarEdit(page)
    const roleInput2 = sidebarField(page, 'role')
    await roleInput2.clear()
    await roleInput2.fill('Principal Engineer')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Saved!', exact: true })).toBeVisible()
    // Confirm the edit is visible on the chart
    await expect(page.locator('[data-selected]').filter({ hasText: 'Principal Engineer' })).toBeVisible()

    // Step 6: Restore the snapshot — verify state reverts to "Staff Engineer"
    await page.locator('button[aria-label*="Snapshot"]').click()
    await page.getByRole('button', { name: 'after-edit' }).first().click()
    // Verify Bob's role reverted to the snapshot state (visible on chart card)
    await expect(page.locator('[data-selected]').filter({ hasText: 'Staff Engineer' })).toBeVisible()
    await expect(page.locator('[data-selected]').filter({ hasText: 'Principal Engineer' })).toHaveCount(0)
  })
})
