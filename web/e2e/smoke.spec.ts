import { test, expect } from '@playwright/test'
import { uploadCSV, switchView, clickPerson, waitForChart } from './helpers'

test.describe('Smoke tests', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('upload CSV and see org chart', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    await expect(page.locator('[aria-selected]').filter({ hasText: 'Alice' })).toBeVisible()
    await expect(page.locator('[aria-selected]').filter({ hasText: 'Bob' })).toBeVisible()
    await expect(page.locator('[aria-selected]').filter({ hasText: 'Carol' })).toBeVisible()
  })

  test('switch between views', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    // Detail view (default)
    await expect(page.locator('[aria-selected]').first()).toBeVisible()
    // Manager view
    await switchView(page, 'Manager')
    await expect(page.locator('[aria-selected]').first()).toBeVisible()
    // Table view
    await switchView(page, 'Table')
    await expect(page.locator('tbody tr').first()).toBeVisible()
    // Back to Detail
    await switchView(page, 'Detail')
    await expect(page.locator('[aria-selected]').first()).toBeVisible()
  })

  test('edit a person via sidebar', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    await clickPerson(page, 'Bob')
    await expect(page.locator('h3', { hasText: 'Edit Person' })).toBeVisible()
    // Find the Role input — go from label up to parent div, then find the input
    const roleInput = page.locator('label').filter({ hasText: /^Role$/ }).locator('xpath=../input')
    await roleInput.clear()
    await roleInput.fill('Staff Engineer')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('button', { name: 'Saved!' })).toBeVisible()
    await expect(page.locator('[aria-selected]').filter({ hasText: 'Staff Engineer' })).toBeVisible()
  })

  test('table inline edit', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    await switchView(page, 'Table')
    const aliceRow = page.locator('tbody tr').filter({ hasText: 'Alice' })
    // Click the Role cell (checkbox td, then Name td, then Role td = nth(2))
    const roleCell = aliceRow.locator('td').nth(2)
    await roleCell.click()
    const input = roleCell.locator('input')
    await expect(input).toBeVisible()
    await input.clear()
    await input.fill('CTO')
    await input.blur()
    await expect(roleCell).toContainText('CTO')
  })

  test('delete and restore', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    await clickPerson(page, 'Carol')
    await expect(page.locator('h3', { hasText: 'Edit Person' })).toBeVisible()
    await page.getByRole('button', { name: 'Delete' }).click()
    await expect(page.locator('[aria-selected]').filter({ hasText: 'Carol' })).toHaveCount(0)
    // Open recycle bin
    await page.getByRole('button', { name: /Recycle bin/ }).click()
    await expect(page.locator('text=Recycle Bin')).toBeVisible()
    // Restore
    await page.locator('[aria-label="Recycle bin"]').getByRole('button', { name: 'Restore' }).click()
    // Close bin
    await page.getByRole('button', { name: 'Close recycle bin' }).click()
    await expect(page.locator('[aria-selected]').filter({ hasText: 'Carol' })).toBeVisible()
  })

  test('snapshot save and load', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    // Handle prompt dialog for snapshot name
    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'prompt') {
        await dialog.accept('baseline')
      }
    })
    // Save snapshot
    await page.locator('button[aria-label*="Snapshot"]').click()
    await page.getByRole('button', { name: 'Save As...' }).click()
    await page.waitForTimeout(500)
    // Edit Bob's role
    await clickPerson(page, 'Bob')
    const roleInput = page.locator('label').filter({ hasText: /^Role$/ }).locator('xpath=../input')
    await roleInput.clear()
    await roleInput.fill('Changed Role')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('button', { name: 'Saved!' })).toBeVisible()
    // Load baseline
    await page.locator('button[aria-label*="Snapshot"]').click()
    await page.getByRole('button', { name: 'baseline' }).first().click()
    // Original role should be back
    await expect(page.locator('[aria-selected]').filter({ hasText: 'Senior Engineer' })).toBeVisible()
    await expect(page.locator('[aria-selected]').filter({ hasText: 'Changed Role' })).toHaveCount(0)
  })

  test('multi-select batch edit', async ({ page }) => {
    await uploadCSV(page, 'grove.csv')
    await switchView(page, 'Table')
    // Check first two checkboxes
    const checkboxes = page.locator('tbody input[type="checkbox"]')
    await checkboxes.nth(0).check()
    await checkboxes.nth(1).check()
    // Batch sidebar should appear
    await expect(page.locator('h3', { hasText: 'Edit 2 people' })).toBeVisible()
    // Change discipline
    const discInput = page.locator('label').filter({ hasText: /^Discipline$/ }).locator('xpath=../input')
    await discInput.clear()
    await discInput.fill('Design')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('button', { name: 'Saved!' })).toBeVisible()
    // Clear selection
    await page.getByRole('button', { name: 'Clear selection' }).click()
    // Verify
    await expect(page.locator('tbody tr').nth(0)).toContainText('Design')
    await expect(page.locator('tbody tr').nth(1)).toContainText('Design')
  })

})
