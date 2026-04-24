// Scenarios: UI-014
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Toolbar from './Toolbar'
import { makeNode, renderWithOrg } from '../test-helpers'

vi.mock('../api/client', () => ({
  exportDataUrl: (fmt: string) => `/api/export?format=${fmt}`,
}))

describe('Toolbar', () => {
  afterEach(() => cleanup())

  it('[UI-001] calls setViewMode when a view mode pill is clicked', async () => {
    const user = userEvent.setup()
    const setViewModeFn = vi.fn()
    renderWithOrg(<Toolbar />, {
      working: [makeNode()],
      setViewMode: setViewModeFn,
    })
    await user.click(screen.getByRole('button', { name: 'Manager' }))
    expect(setViewModeFn).toHaveBeenCalledWith('manager')
  })

  it('[UI-001] calls setDataView when a data view pill is clicked', async () => {
    const user = userEvent.setup()
    const setDataViewFn = vi.fn()
    renderWithOrg(<Toolbar />, {
      working: [makeNode()],
      setDataView: setDataViewFn,
    })
    await user.click(screen.getByRole('button', { name: 'Diff' }))
    expect(setDataViewFn).toHaveBeenCalledWith('diff')
  })

  it('[UI-001] calls onExportPng when PNG is clicked', async () => {
    const user = userEvent.setup()
    const onExportPng = vi.fn()
    renderWithOrg(<Toolbar onExportPng={onExportPng} />, {
      working: [makeNode()],
    })
    await user.click(screen.getByRole('button', { name: 'Export options' }))
    await user.click(screen.getByRole('button', { name: 'PNG' }))
    expect(onExportPng).toHaveBeenCalledTimes(1)
  })

  it('[UI-001] calls onExportSvg when SVG is clicked', async () => {
    const user = userEvent.setup()
    const onExportSvg = vi.fn()
    renderWithOrg(<Toolbar onExportSvg={onExportSvg} />, {
      working: [makeNode()],
    })
    await user.click(screen.getByRole('button', { name: 'Export options' }))
    await user.click(screen.getByRole('button', { name: 'SVG' }))
    expect(onExportSvg).toHaveBeenCalledTimes(1)
  })

  it('[UI-001] calls reflow when Refresh Layout is clicked', async () => {
    const user = userEvent.setup()
    const reflowFn = vi.fn()
    renderWithOrg(<Toolbar />, {
      working: [makeNode()],
      reflow: reflowFn,
      viewMode: 'detail',
    })
    await user.click(screen.getByRole('button', { name: 'Menu' }))
    await user.click(screen.getByRole('button', { name: 'Refresh Layout' }))
    expect(reflowFn).toHaveBeenCalledTimes(1)
  })

  it('[UI-001] calls onToggleLogs when Logs button is clicked', async () => {
    const user = userEvent.setup()
    const onToggleLogs = vi.fn()
    renderWithOrg(<Toolbar loggingEnabled onToggleLogs={onToggleLogs} />, {
      working: [makeNode()],
    })
    await user.click(screen.getByRole('button', { name: 'Toggle log viewer' }))
    expect(onToggleLogs).toHaveBeenCalledTimes(1)
  })

  it('[UI-001] sets aria-expanded on hamburger menu button', async () => {
    const user = userEvent.setup()
    renderWithOrg(<Toolbar />, {
      working: [makeNode()],
    })
    const menuBtn = screen.getByRole('button', { name: 'Menu' })
    expect(menuBtn.getAttribute('aria-expanded')).toBe('false')
    await user.click(menuBtn)
    expect(menuBtn.getAttribute('aria-expanded')).toBe('true')
  })

  it('[UI-001] sets aria-expanded on export dropdown button', async () => {
    const user = userEvent.setup()
    renderWithOrg(<Toolbar />, {
      working: [makeNode()],
    })
    const exportBtn = screen.getByRole('button', { name: 'Export options' })
    expect(exportBtn.getAttribute('aria-expanded')).toBe('false')
    await user.click(exportBtn)
    expect(exportBtn.getAttribute('aria-expanded')).toBe('true')
  })

  // Scenarios: UI-014
  describe('error and edge states', () => {
    it('does not render view modes or export actions when loaded is false', () => {
      renderWithOrg(<Toolbar />, {
        working: [makeNode()],
        loaded: false,
      })
      expect(screen.queryByRole('button', { name: 'Manager' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Diff' }))  .toBeNull()
      expect(screen.queryByRole('button', { name: 'Export options' })).toBeNull()
    })

    it('shows "Exporting..." text on export button when exporting is true', () => {
      renderWithOrg(<Toolbar exporting />, {
        working: [makeNode()],
      })
      expect(screen.getByText('Exporting...')).toBeDefined()
    })
  })
})
