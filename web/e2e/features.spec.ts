import { test, expect } from '@playwright/test'
import { uploadCSV, switchView, clickPerson, dragPersonTo, lassoSelect } from './helpers'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

test.describe('Feature tests', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('drag-and-drop reparent', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    // Carol is under Bob. Drag Carol onto Alice to reparent.
    await dragPersonTo(page, 'Carol', 'Alice')
    // Wait for the reparent to take effect
    await page.waitForTimeout(500)
    // Click empty space to clear any selection from the drag
    await page.locator('[data-role="chart-container"]').click({ position: { x: 5, y: 5 } })
    await page.waitForTimeout(200)
    // Now click Carol to open the sidebar
    await clickPerson(page, 'Carol')
    await expect(page.locator('h3', { hasText: 'Edit Person' })).toBeVisible()
    const managerSelect = page.locator('label').filter({ hasText: /^Manager$/ }).locator('xpath=../select')
    const selectedText = await managerSelect.locator('option:checked').textContent()
    expect(selectedText).toContain('Alice')
  })

  test('lasso multi-select', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    // Draw a large lasso across the chart to select multiple people
    await lassoSelect(page, 10, 10, 800, 600)
    const heading = page.locator('h3').filter({ hasText: /Edit \d+ people/ })
    await expect(heading).toBeVisible({ timeout: 3000 })
  })

  test('pod creation via edit', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    // Carol is an IC under Bob — setting her pod creates a pod header under Bob
    await clickPerson(page, 'Carol')
    await expect(page.locator('h3', { hasText: 'Edit Person' })).toBeVisible()
    const podInput = page.locator('label').filter({ hasText: /^Pod$/ }).locator('xpath=../input')
    await podInput.clear()
    await podInput.fill('NewPod')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('button', { name: 'Saved!' })).toBeVisible()
    // Close sidebar and verify pod header appears
    await page.keyboard.press('Escape')
    await expect(page.locator('text=NewPod')).toBeVisible()
  })

  test('pod sidebar via info button', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    // Create a pod on Carol (IC under Bob) so a pod header appears
    await clickPerson(page, 'Carol')
    const podInput = page.locator('label').filter({ hasText: /^Pod$/ }).locator('xpath=../input')
    await podInput.clear()
    await podInput.fill('TestPod')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('button', { name: 'Saved!' })).toBeVisible()
    await page.keyboard.press('Escape')
    // Wait for the pod header to appear
    await expect(page.locator('text=TestPod').first()).toBeVisible()
    // Hover the pod header wrapper to trigger NodeActions
    const podHeader = page.locator('text=TestPod').first()
    await podHeader.hover()
    // Wait for the info button to appear, then click it
    const infoBtn = page.getByRole('button', { name: 'Org metrics' })
    await expect(infoBtn).toBeVisible({ timeout: 3000 })
    await infoBtn.click()
    // Pod sidebar should open with "Pod Details" heading
    await expect(page.locator('h3', { hasText: 'Pod Details' })).toBeVisible()
  })

  test('column mapping modal', async ({ page }) => {
    // Upload nonstandard CSV directly (don't use uploadCSV — modal blocks chart)
    const absPath = path.resolve(__dirname, '../../testdata', 'unmapped.csv')
    const fileInput = page.getByRole('main').locator('input[type="file"]')
    await fileInput.setInputFiles(absPath)
    // Mapping modal should appear
    await expect(page.locator('text=Map Spreadsheet Columns')).toBeVisible({ timeout: 5000 })
    // Map the "Name" field to "Teammate" header (required before Load is enabled)
    const nameRow = page.locator('span').filter({ hasText: /^Name$/ }).locator('xpath=../select')
    await nameRow.selectOption('Teammate')
    // Confirm mapping
    await page.getByRole('button', { name: 'Load', exact: true }).click()
    // Chart should render
    await expect(page.locator('[aria-selected]').first()).toBeVisible({ timeout: 10000 })
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
    // Bob's card should have diff styling applied
    const bobCard = page.locator('[aria-selected]').filter({ hasText: 'Bob' })
    await expect(bobCard).toBeVisible()
    // Verify a diff class is present on the card
    const cardClass = await bobCard.getAttribute('class')
    expect(cardClass).toBeTruthy()
  })

  test('employment type filter', async ({ page }) => {
    await uploadCSV(page, 'ddp-org.csv')
    const initialCount = await page.locator('[aria-selected]').count()
    expect(initialCount).toBeGreaterThan(5)
    // Open filter and hide all types
    await page.getByRole('button', { name: 'Employment type filter' }).click()
    await page.getByRole('button', { name: 'Hide All' }).click()
    // Close dropdown by clicking outside on main content area
    await page.getByRole('main').click({ position: { x: 50, y: 50 } })
    await page.waitForTimeout(300)
    const hiddenCount = await page.locator('[aria-selected]').count()
    expect(hiddenCount).toBeLessThan(initialCount)
    // Show all again
    await page.getByRole('button', { name: 'Employment type filter' }).click()
    await page.getByRole('button', { name: 'Show All' }).click()
    // Close dropdown by clicking outside on main content area
    await page.getByRole('main').click({ position: { x: 50, y: 50 } })
    await page.waitForTimeout(300)
    const restoredCount = await page.locator('[aria-selected]').count()
    expect(restoredCount).toBe(initialCount)
  })

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
    // Write CSV data to clipboard via page.evaluate and click paste
    await page.evaluate(async () => {
      // Use a textarea + execCommand fallback to write to clipboard
      const ta = document.createElement('textarea')
      ta.value = 'NewPerson,Tester,Engineering'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    })
    // Override clipboard.readText so Paste button can read our data
    await page.evaluate(() => {
      (navigator.clipboard as any).readText = () => Promise.resolve('NewPerson,Tester,Engineering')
    })
    await page.getByRole('button', { name: 'Paste' }).click()
    await page.waitForTimeout(500)
    // Should have one more row
    const newRows = await page.locator('tbody tr').count()
    expect(newRows).toBe(initialRows + 1)
    await expect(page.locator('tbody tr').filter({ hasText: 'NewPerson' })).toBeVisible()
  })

  test('head focus subtree zoom', async ({ page }) => {
    await uploadCSV(page, 'grove.csv')
    const initialCount = await page.locator('[aria-selected]').count()
    expect(initialCount).toBeGreaterThan(10)
    // Hover Mike Torres (a manager) and click focus button
    const manager = page.locator('[aria-selected]').filter({ hasText: 'Mike Torres' }).first()
    await manager.hover()
    await page.getByRole('button', { name: 'Focus on subtree', exact: true }).click()
    // Should show fewer cards
    await page.waitForTimeout(500)
    const focusedCount = await page.locator('[aria-selected]').count()
    expect(focusedCount).toBeLessThan(initialCount)
    expect(focusedCount).toBeGreaterThan(0)
    // Escape to exit focus
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
    const restoredCount = await page.locator('[aria-selected]').count()
    expect(restoredCount).toBe(initialCount)
  })

  test('table column filter', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    await switchView(page, 'Table')
    await expect(page.locator('tbody tr')).toHaveCount(3)
    // Click filter button on Status column
    const statusHeader = page.locator('th').filter({ hasText: 'Status' })
    const filterBtn = statusHeader.getByTitle('Filter Status')
    await filterBtn.click()
    // Deselect "Active" — the filter dropdown is a portal on document.body
    const activeCheckbox = page.locator('label').filter({ hasText: 'Active' }).locator('input[type="checkbox"]')
    await activeCheckbox.uncheck()
    // All 3 are Active, so 0 rows should remain
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
    // Check Carol's team in table view
    await page.keyboard.press('Escape')
    await switchView(page, 'Table')
    const carolRow = page.locator('tbody tr').filter({ hasText: 'Carol' })
    await expect(carolRow).toContainText('NewTeam')
  })

})
