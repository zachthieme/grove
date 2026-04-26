import { test, expect } from '@playwright/test'
import { uploadCSV, switchView, clickPerson, sidebarField, enterSidebarEdit } from './helpers'

test.describe('Smoke tests', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('[UPLOAD-001] upload CSV and see org chart', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    await expect(page.locator('[data-selected]').filter({ hasText: 'Alice' })).toBeVisible()
    await expect(page.locator('[data-selected]').filter({ hasText: 'Bob' })).toBeVisible()
    await expect(page.locator('[data-selected]').filter({ hasText: 'Carol' })).toBeVisible()
  })

  test('[VIEW-001] [VIEW-002] switch between views', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    await expect(page.locator('[data-selected]').first()).toBeVisible()
    await switchView(page, 'Manager')
    await expect(page.locator('[data-selected]').first()).toBeVisible()
    await switchView(page, 'Table')
    await expect(page.locator('tbody tr').first()).toBeVisible()
    await switchView(page, 'Detail')
    await expect(page.locator('[data-selected]').first()).toBeVisible()
  })

  test('[UI-002] edit a person via sidebar', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    await clickPerson(page, 'Bob')
    await expect(page.locator('[data-testid="sidebar-heading"]')).toBeVisible()
    await enterSidebarEdit(page)
    const roleInput = sidebarField(page, 'role')
    await roleInput.clear()
    await roleInput.fill('Staff Engineer')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Saved!', exact: true })).toBeVisible()
    await expect(page.locator('[data-testid="person-Bob"]')).toContainText('Staff Engineer')
  })

  test('[VIEW-003] table inline edit', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    await switchView(page, 'Table')
    const aliceRow = page.locator('tbody tr').filter({ hasText: 'Alice' })
    const roleCell = aliceRow.locator('td').nth(2)
    await roleCell.click()
    const input = roleCell.locator('input')
    await expect(input).toBeVisible()
    await input.clear()
    await input.fill('CTO')
    await input.blur()
    await expect(roleCell).toContainText('CTO')
  })

  test('[ORG-012] delete and restore', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    await clickPerson(page, 'Carol')
    await expect(page.locator('[data-testid="sidebar-heading"]')).toBeVisible()
    await enterSidebarEdit(page)
    await page.getByRole('button', { name: 'Delete' }).click()
    await expect(page.locator('[data-testid="person-Carol"]')).toHaveCount(0)
    await page.getByRole('button', { name: /Recycle bin/ }).click()
    await expect(page.locator('[data-testid="recycle-bin-drawer"]')).toBeVisible()
    await page.locator('[aria-label="Recycle bin"]').getByRole('button', { name: 'Restore' }).click()
    await page.getByRole('button', { name: 'Close recycle bin' }).click()
    await expect(page.locator('[data-selected]').filter({ hasText: 'Carol' })).toBeVisible()
  })

  test('[SNAP-001] snapshot save and load', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'prompt') {
        await dialog.accept('baseline')
      }
    })
    await page.locator('button[aria-label*="Snapshot"]').click()
    await page.getByRole('button', { name: 'Save As...' }).click()
    // Wait for snapshot save to complete
    await expect(page.locator('button[aria-label*="baseline"]')).toBeVisible({ timeout: 3000 }).catch(() => {})
    // Edit Bob's role
    await clickPerson(page, 'Bob')
    await enterSidebarEdit(page)
    const roleInput = sidebarField(page, 'role')
    await roleInput.clear()
    await roleInput.fill('Changed Role')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Saved!', exact: true })).toBeVisible()
    // Load baseline
    await page.locator('button[aria-label*="Snapshot"]').click()
    await page.getByRole('button', { name: 'baseline' }).first().click()
    await expect(page.locator('[data-selected]').filter({ hasText: 'Senior Engineer' })).toBeVisible()
    await expect(page.locator('[data-selected]').filter({ hasText: 'Changed Role' })).toHaveCount(0)
  })

  test('[VIEW-007] multi-select batch edit', async ({ page }) => {
    await uploadCSV(page, 'grove.csv')
    await switchView(page, 'Table')
    // Use aria-label prefix to select only row-select checkboxes, not inline "Private" field checkboxes.
    // Each row has two checkboxes: "Select [Name]" (row select) and "Private for [Name]" (field),
    // so a bare `tbody input[type="checkbox"]` would count both and produce wrong nth() indices.
    const checkboxes = page.locator('tbody input[type="checkbox"][aria-label^="Select "]')
    // Click first checkbox and wait for sidebar to fully open before selecting second.
    // This avoids the layout-shift race where the sidebar appearing shifts the DOM
    // and causes the second check() to miss or not propagate state.
    await checkboxes.nth(1).click()
    await expect(page.locator('[data-testid="sidebar-heading"]')).toBeVisible()
    await checkboxes.nth(2).click()
    await expect(page.locator('[data-testid="sidebar-heading"]')).toContainText('2')
    await enterSidebarEdit(page)
    const discInput = sidebarField(page, 'discipline')
    await discInput.clear()
    await discInput.fill('Design')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Saved!', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Clear selection' }).click()
    await expect(page.locator('tbody tr').nth(1)).toContainText('Design')
    await expect(page.locator('tbody tr').nth(2)).toContainText('Design')
  })

})
