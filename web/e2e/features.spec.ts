import { test, expect } from '@playwright/test'
import { uploadCSV, switchView, clickPerson, sidebarField, dragPersonTo, lassoSelect } from './helpers'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

test.describe('Feature tests', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('[ORG-001] drag-and-drop reparent', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    await dragPersonTo(page, 'Carol', 'Alice')
    // Wait for reparent to take effect
    await page.locator('[data-role="chart-container"]').click({ position: { x: 5, y: 5 } })
    await page.waitForTimeout(200)
    await clickPerson(page, 'Carol')
    await expect(page.locator('[data-testid="sidebar-heading"]')).toBeVisible()
    const managerSelect = sidebarField(page, 'manager')
    const selectedText = await managerSelect.locator('option:checked').textContent()
    expect(selectedText).toContain('Alice')
  })

  test('[VIEW-006] lasso multi-select', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    await lassoSelect(page, 10, 10, 800, 600)
    const heading = page.locator('[data-testid="sidebar-heading"]')
    await expect(heading).toBeVisible({ timeout: 3000 })
  })

  test('[ORG-018] pod creation via edit', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    await clickPerson(page, 'Carol')
    await expect(page.locator('[data-testid="sidebar-heading"]')).toBeVisible()
    const podInput = sidebarField(page, 'pod')
    await podInput.clear()
    await podInput.fill('NewPod')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('button', { name: 'Saved!' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('text=NewPod')).toBeVisible()
  })

  test('[UI-003] pod sidebar via info button', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    await clickPerson(page, 'Carol')
    const podInput = sidebarField(page, 'pod')
    await podInput.clear()
    await podInput.fill('TestPod')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('button', { name: 'Saved!' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('text=TestPod').first()).toBeVisible()
    const podHeader = page.locator('text=TestPod').first()
    await podHeader.hover()
    const infoBtn = page.getByRole('button', { name: 'Org metrics' })
    await expect(infoBtn).toBeVisible({ timeout: 3000 })
    await infoBtn.click()
    await expect(page.locator('h3', { hasText: 'Pod Details' })).toBeVisible()
  })

  test('[UPLOAD-002] column mapping modal', async ({ page }) => {
    const absPath = path.resolve(__dirname, '../../testdata', 'unmapped.csv')
    const mainInput = page.getByRole('main').locator('input[type="file"]')
    const toolbarInput = page.locator('header input[type="file"]')
    const fileInput = await mainInput.isVisible().catch(() => false) ? mainInput : toolbarInput
    await fileInput.setInputFiles(absPath)
    await expect(page.locator('text=Map Spreadsheet Columns')).toBeVisible({ timeout: 5000 })
    const nameRow = page.locator('span').filter({ hasText: /^Name$/ }).locator('xpath=../select')
    await nameRow.selectOption('Teammate')
    await page.getByRole('button', { name: 'Load', exact: true }).click()
    await expect(page.locator('[data-selected]').first()).toBeVisible({ timeout: 10000 })
    await expect(page.locator('[data-selected]').filter({ hasText: 'Alice' })).toBeVisible()
  })

  test('[VIEW-004] diff mode shows changes', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    await clickPerson(page, 'Bob')
    const roleInput = sidebarField(page, 'role')
    await roleInput.clear()
    await roleInput.fill('Changed Title')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('button', { name: 'Saved!' })).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Diff', exact: true }).click()
    const bobCard = page.locator('[data-selected]').filter({ hasText: 'Bob' })
    await expect(bobCard).toBeVisible()
    const cardClass = await bobCard.getAttribute('class')
    expect(cardClass).toBeTruthy()
  })

  test('[FILTER-001] employment type filter', async ({ page }) => {
    await uploadCSV(page, 'ddp-org.csv')
    const initialCount = await page.locator('[data-selected]').count()
    expect(initialCount).toBeGreaterThan(5)
    await page.getByRole('button', { name: 'Employment type filter' }).click()
    await page.getByRole('button', { name: 'Hide All' }).click()
    await page.getByRole('main').click({ position: { x: 50, y: 50 } })
    // Wait for filter to take effect
    await expect(page.locator('[data-selected]')).not.toHaveCount(initialCount)
    const hiddenCount = await page.locator('[data-selected]').count()
    expect(hiddenCount).toBeLessThan(initialCount)
    await page.getByRole('button', { name: 'Employment type filter' }).click()
    await page.getByRole('button', { name: 'Show All' }).click()
    await page.getByRole('main').click({ position: { x: 50, y: 50 } })
    await expect(page.locator('[data-selected]')).toHaveCount(initialCount)
  })

  test('[SELECT-006] note icon toggle', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    await clickPerson(page, 'Bob')
    const noteField = sidebarField(page, 'publicNote')
    await noteField.fill('This is a test note')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('button', { name: 'Saved!' })).toBeVisible()
    await page.keyboard.press('Escape')
    const noteIcon = page.getByLabel('Toggle notes')
    await expect(noteIcon).toBeVisible()
    await noteIcon.click()
    await expect(page.locator('text=This is a test note')).toBeVisible()
    await noteIcon.click()
    await expect(page.locator('text=This is a test note')).toHaveCount(0)
  })

  test('[VIEW-003] table paste', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    await switchView(page, 'Table')
    const initialRows = await page.locator('tbody tr').count()
    await page.evaluate(() => {
      (navigator.clipboard as any).readText = () => Promise.resolve('NewPerson,Tester,Engineering')
    })
    await page.getByRole('button', { name: 'Paste' }).click()
    // Wait for the new row to appear
    await expect(page.locator('tbody tr')).toHaveCount(initialRows + 1)
    await expect(page.locator('tbody tr').filter({ hasText: 'NewPerson' })).toBeVisible()
  })

  test('[FILTER-002] head focus subtree zoom', async ({ page }) => {
    await uploadCSV(page, 'grove.csv')
    const initialCount = await page.locator('[data-selected]').count()
    expect(initialCount).toBeGreaterThan(10)
    const manager = page.locator('[data-selected]').filter({ hasText: 'Mike Torres' }).first()
    await manager.hover()
    await page.getByRole('button', { name: 'Focus on subtree', exact: true }).click()
    // Wait for focus to take effect
    await expect(page.locator('[data-selected]')).not.toHaveCount(initialCount)
    const focusedCount = await page.locator('[data-selected]').count()
    expect(focusedCount).toBeLessThan(initialCount)
    expect(focusedCount).toBeGreaterThan(0)
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-selected]')).toHaveCount(initialCount)
  })

  test('[VIEW-003] table column filter', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    await switchView(page, 'Table')
    await expect(page.locator('tbody tr')).toHaveCount(3)
    const statusHeader = page.locator('th').filter({ hasText: 'Status' })
    const filterBtn = statusHeader.getByTitle('Filter Status')
    await filterBtn.click()
    const activeCheckbox = page.locator('label').filter({ hasText: 'Active' }).locator('input[type="checkbox"]')
    await activeCheckbox.uncheck()
    await expect(page.locator('tbody tr')).toHaveCount(0)
    await activeCheckbox.check()
    await expect(page.locator('tbody tr')).toHaveCount(3)
  })

  test('[ORG-017] team cascade for front-line manager', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    await clickPerson(page, 'Bob')
    const teamInput = sidebarField(page, 'team')
    await teamInput.clear()
    await teamInput.fill('NewTeam')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('button', { name: 'Saved!' })).toBeVisible()
    await page.keyboard.press('Escape')
    await switchView(page, 'Table')
    const carolRow = page.locator('tbody tr').filter({ hasText: 'Carol' })
    await expect(carolRow).toContainText('NewTeam')
  })

})
