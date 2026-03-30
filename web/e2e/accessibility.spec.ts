import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { uploadCSV, switchView } from './helpers'

test.describe('Accessibility', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.removeItem('grove-autosave')
      localStorage.setItem('grove-tour-seen', '1')
    })
    await page.request.delete('/api/autosave').catch(() => {})
    await page.goto('/')
  })

  test('[CONTRACT-011] upload prompt has no critical a11y violations', async ({ page }) => {
    await page.waitForTimeout(500) // Wait for entry animations
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    const critical = results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious')
    expect(critical).toEqual([])
  })

  test('[CONTRACT-011] detail view has no critical a11y violations', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    await page.waitForTimeout(500) // Wait for node enter animations
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    const critical = results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious')
    expect(critical).toEqual([])
  })

  test('[CONTRACT-011] table view has no critical a11y violations', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    await switchView(page, 'Table')
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    const critical = results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious')
    expect(critical).toEqual([])
  })

  test('[CONTRACT-011] manager view has no critical a11y violations', async ({ page }) => {
    await uploadCSV(page, 'simple.csv')
    await switchView(page, 'Manager')
    await page.waitForTimeout(500) // Wait for node enter animations
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    const critical = results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious')
    expect(critical).toEqual([])
  })

})
