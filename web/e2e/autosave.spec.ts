import { test, expect } from '@playwright/test'
import { uploadCSV, clickPerson, sidebarField, enterSidebarEdit } from './helpers'

test.describe('Autosave recovery', () => {

  test.beforeEach(async ({ page }) => {
    // Clear any existing autosave state before each test
    await page.request.delete('/api/autosave').catch(() => {})
    await page.goto('/')
    await page.evaluate(() => localStorage.removeItem('grove-autosave'))
    // Dismiss recovery banner if visible from stale data
    const banner = page.getByRole('alert').filter({ hasText: 'Restore' })
    if (await banner.isVisible().catch(() => false)) {
      await banner.getByRole('button', { name: 'Dismiss' }).click()
    }
  })

  test('[AUTO-001] autosave is triggered after editing a person', async ({ page }) => {
    await page.goto('/')
    await uploadCSV(page, 'simple.csv')

    // Set up a promise that resolves when POST /api/autosave is called
    const autosaveRequest = page.waitForRequest(
      (req) => req.url().includes('/api/autosave') && req.method() === 'POST',
      { timeout: 10000 }
    )

    // Edit Bob's role via sidebar
    await clickPerson(page, 'Bob')
    await expect(page.locator('[data-testid="sidebar-heading"]')).toBeVisible()
    await enterSidebarEdit(page)
    const roleInput = sidebarField(page, 'role')
    await roleInput.clear()
    await roleInput.fill('Staff Engineer')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('button', { name: 'Saved!' })).toBeVisible()

    // Wait for the debounced autosave to fire (2s debounce + network time)
    const req = await autosaveRequest
    const body = req.postDataJSON()
    expect(body).toHaveProperty('working')
    expect(body).toHaveProperty('original')
    expect(body).toHaveProperty('timestamp')

    // Verify the autosave payload contains the edited role
    const bob = body.working.find((p: { name: string }) => p.name === 'Bob')
    expect(bob).toBeTruthy()
    expect(bob.role).toBe('Staff Engineer')
  })

  test('[AUTO-003] recovery banner appears and restores state on Restore click', async ({ page }) => {
    // Step 1: Upload and edit to create autosave data
    await page.goto('/')
    await uploadCSV(page, 'simple.csv')

    await clickPerson(page, 'Bob')
    await expect(page.locator('[data-testid="sidebar-heading"]')).toBeVisible()
    await enterSidebarEdit(page)
    const roleInput = sidebarField(page, 'role')
    await roleInput.clear()
    await roleInput.fill('Principal Engineer')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('button', { name: 'Saved!' })).toBeVisible()

    // Wait for autosave to persist (debounce is 2s)
    const autosaveRequest = page.waitForRequest(
      (req) => req.url().includes('/api/autosave') && req.method() === 'POST',
      { timeout: 10000 }
    )
    await autosaveRequest

    // Step 2: Reload the page — the banner should appear from localStorage
    await page.goto('/')

    // The autosave banner should appear
    const banner = page.getByRole('alert')
    await expect(banner).toBeVisible({ timeout: 5000 })
    await expect(banner).toContainText('Restore previous session?')

    // Step 3: Click Restore
    await banner.getByRole('button', { name: 'Restore' }).click()

    // The banner should disappear (webkit needs extra time for state settle)
    await expect(banner).not.toBeVisible({ timeout: 10000 })

    // The restored data should be visible with the edited role
    await expect(page.locator('[data-selected]').filter({ hasText: 'Bob' })).toBeVisible()
    await expect(page.locator('[data-selected]').filter({ hasText: 'Principal Engineer' })).toBeVisible()
  })

  test('[AUTO-003] recovery banner appears from server autosave when localStorage is cleared', async ({ page }) => {
    // Step 1: Upload and edit to create autosave data on the server
    await page.goto('/')
    await uploadCSV(page, 'simple.csv')

    await clickPerson(page, 'Bob')
    await expect(page.locator('[data-testid="sidebar-heading"]')).toBeVisible()
    await enterSidebarEdit(page)
    const roleInput = sidebarField(page, 'role')
    await roleInput.clear()
    await roleInput.fill('Distinguished Engineer')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('button', { name: 'Saved!' })).toBeVisible()

    // Wait for autosave to persist to server
    const autosaveRequest = page.waitForRequest(
      (req) => req.url().includes('/api/autosave') && req.method() === 'POST',
      { timeout: 10000 }
    )
    await autosaveRequest

    // Step 2: Clear localStorage but leave server autosave, then reload
    await page.evaluate(() => localStorage.removeItem('grove-autosave'))
    await page.goto('/')

    // The banner should appear (from server autosave)
    const banner = page.getByRole('alert')
    await expect(banner).toBeVisible({ timeout: 5000 })
    await expect(banner).toContainText('Restore previous session?')

    // Click Restore
    await banner.getByRole('button', { name: 'Restore' }).click()
    await expect(banner).not.toBeVisible({ timeout: 10000 })

    // Verify restored data
    await expect(page.locator('[data-selected]').filter({ hasText: 'Distinguished Engineer' })).toBeVisible()
  })

  test('[AUTO-004] dismiss button clears autosave and shows clean upload state', async ({ page }) => {
    // Step 1: Upload and edit to create autosave data
    await page.goto('/')
    await uploadCSV(page, 'simple.csv')

    await clickPerson(page, 'Bob')
    await expect(page.locator('[data-testid="sidebar-heading"]')).toBeVisible()
    await enterSidebarEdit(page)
    const roleInput = sidebarField(page, 'role')
    await roleInput.clear()
    await roleInput.fill('Staff Engineer')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('button', { name: 'Saved!' })).toBeVisible()

    // Wait for autosave to persist
    const autosaveRequest = page.waitForRequest(
      (req) => req.url().includes('/api/autosave') && req.method() === 'POST',
      { timeout: 10000 }
    )
    await autosaveRequest

    // Step 2: Reload the page
    await page.goto('/')

    // The autosave banner should appear
    const banner = page.getByRole('alert')
    await expect(banner).toBeVisible({ timeout: 5000 })
    await expect(banner).toContainText('Restore previous session?')

    // Step 3: Click Dismiss
    await banner.getByRole('button', { name: 'Dismiss' }).click()

    // The banner should disappear
    await expect(banner).not.toBeVisible()

    // The app should show the upload prompt (clean state), not the org chart
    await expect(page.locator('[data-selected]')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Choose File' })).toBeVisible()

    // Step 4: Verify autosave was deleted — reloading should NOT show the banner
    await page.goto('/')
    await expect(page.getByRole('alert')).not.toBeVisible({ timeout: 3000 })
  })

  test('[AUTO-004] dismiss clears server-side autosave via DELETE endpoint', async ({ page }) => {
    // Upload and edit
    await page.goto('/')
    await uploadCSV(page, 'simple.csv')

    await clickPerson(page, 'Bob')
    await expect(page.locator('[data-testid="sidebar-heading"]')).toBeVisible()
    await enterSidebarEdit(page)
    const roleInput = sidebarField(page, 'role')
    await roleInput.clear()
    await roleInput.fill('Tech Lead')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('button', { name: 'Saved!' })).toBeVisible()

    // Wait for autosave
    await page.waitForRequest(
      (req) => req.url().includes('/api/autosave') && req.method() === 'POST',
      { timeout: 10000 }
    )

    // Reload
    await page.goto('/')
    const banner = page.getByRole('alert')
    await expect(banner).toBeVisible({ timeout: 5000 })

    // Set up a promise to catch the DELETE /api/autosave request
    const deleteRequest = page.waitForRequest(
      (req) => req.url().includes('/api/autosave') && req.method() === 'DELETE',
      { timeout: 5000 }
    )

    // Click Dismiss
    await banner.getByRole('button', { name: 'Dismiss' }).click()

    // Verify DELETE was sent to server
    const req = await deleteRequest
    expect(req.method()).toBe('DELETE')

    // Verify the server no longer has autosave data
    const resp = await page.request.get('/api/autosave')
    expect(resp.status()).toBe(204)
  })

})
