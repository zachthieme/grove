import { type Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export async function uploadCSV(page: Page, csvPath: string) {
  const absPath = path.resolve(__dirname, '../../testdata', csvPath)
  // Use the upload prompt file input (in main) if visible, otherwise fall back to the toolbar's hidden input
  const mainInput = page.getByRole('main').locator('input[type="file"]')
  const toolbarInput = page.locator('header input[type="file"]')
  const fileInput = await mainInput.isVisible().catch(() => false) ? mainInput : toolbarInput
  await fileInput.setInputFiles(absPath)
  await page.locator('[data-selected], tbody tr').first().waitFor({ timeout: 10000 })
}

export async function switchView(page: Page, view: 'Detail' | 'Manager' | 'Table') {
  await page.getByRole('button', { name: view, exact: true }).click()
}

export async function clickPerson(page: Page, name: string) {
  await page.locator('[data-selected]').filter({ hasText: name }).first().click()
}

export async function waitForChart(page: Page) {
  await page.locator('[data-selected]').first().waitFor({ timeout: 10000 })
}

export async function dragPersonTo(page: Page, sourceName: string, targetName: string) {
  // [data-dnd-draggable] is an ancestor of [data-selected], so select drag handles that contain the person name
  const dragHandle = page.locator('[data-dnd-draggable]').filter({ hasText: sourceName }).first()
  const target = page.locator('[data-dnd-draggable]').filter({ hasText: targetName }).first()

  const sourceBox = await dragHandle.boundingBox()
  const targetBox = await target.boundingBox()
  if (!sourceBox || !targetBox) throw new Error('Could not find source or target bounding box')

  const sx = sourceBox.x + sourceBox.width / 2
  const sy = sourceBox.y + sourceBox.height / 2
  const tx = targetBox.x + targetBox.width / 2
  const ty = targetBox.y + targetBox.height / 2

  // Use manual mouse events for @dnd-kit compatibility
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  // Move past the activation threshold (8px) first
  await page.mouse.move(sx + 10, sy, { steps: 2 })
  // Then move to the target
  await page.mouse.move(tx, ty, { steps: 10 })
  await page.mouse.up()
}

/**
 * Get a sidebar form field by its data-testid.
 * Fields: field-name, field-role, field-discipline, field-team, field-manager,
 * field-pod, field-status, field-employmentType, field-level, field-otherTeams,
 * field-publicNote, field-privateNote
 */
export function sidebarField(page: Page, field: string) {
  return page.locator(`[data-testid="field-${field}"]`)
}

export async function lassoSelect(page: Page, startX: number, startY: number, endX: number, endY: number) {
  const container = page.locator('[data-role="chart-container"]')
  const box = await container.boundingBox()
  if (!box) throw new Error('Chart container not found')
  await page.mouse.move(box.x + startX, box.y + startY)
  await page.mouse.down()
  await page.mouse.move(box.x + endX, box.y + endY, { steps: 5 })
  await page.mouse.up()
}
