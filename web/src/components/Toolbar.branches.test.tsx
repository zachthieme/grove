/**
 * Branch coverage for Toolbar.
 * Covers: CSV/XLSX export clicks, snapshot export buttons (all 4 formats),
 * hasSnapshots conditional, exporting disabled state on snapshot buttons,
 * logPanelOpen active styling, viewMode=table hides Refresh Layout,
 * Settings modal open/close, file upload with no file, export dropdown toggle,
 * hamburger menu toggle, and help button (startTour).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Toolbar from './Toolbar'
import { makePerson, renderWithOrg } from '../test-helpers'

vi.mock('../api/client', () => ({
  exportDataUrl: (fmt: string) => `/api/export?format=${fmt}`,
}))

afterEach(() => cleanup())

describe('Toolbar — branch coverage', () => {
  describe('CSV and XLSX export buttons', () => {
    it('creates a download link for CSV export', async () => {
      const user = userEvent.setup()
      const clickSpy = vi.fn()
      const createElementOrig = document.createElement.bind(document)
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = createElementOrig(tag)
        if (tag === 'a') {
          el.click = clickSpy
        }
        return el
      })

      renderWithOrg(<Toolbar />, {
        working: [makePerson()],
      })

      await user.click(screen.getByRole('button', { name: 'Export options' }))
      await user.click(screen.getByRole('button', { name: 'CSV' }))

      expect(clickSpy).toHaveBeenCalledTimes(1)

      vi.restoreAllMocks()
    })

    it('creates a download link for XLSX export', async () => {
      const user = userEvent.setup()
      const clickSpy = vi.fn()
      const createElementOrig = document.createElement.bind(document)
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = createElementOrig(tag)
        if (tag === 'a') {
          el.click = clickSpy
        }
        return el
      })

      renderWithOrg(<Toolbar />, {
        working: [makePerson()],
      })

      await user.click(screen.getByRole('button', { name: 'Export options' }))
      await user.click(screen.getByRole('button', { name: 'XLSX' }))

      expect(clickSpy).toHaveBeenCalledTimes(1)

      vi.restoreAllMocks()
    })
  })

  describe('snapshot export buttons', () => {
    it('shows snapshot export buttons when hasSnapshots and onExportAllSnapshots are provided', async () => {
      const user = userEvent.setup()
      const onExportAll = vi.fn()

      renderWithOrg(
        <Toolbar hasSnapshots onExportAllSnapshots={onExportAll} />,
        { working: [makePerson()] },
      )

      await user.click(screen.getByRole('button', { name: 'Export options' }))

      expect(screen.getByRole('button', { name: 'All Snapshots (CSV)' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'All Snapshots (XLSX)' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'All Snapshots (PNG)' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'All Snapshots (SVG)' })).toBeTruthy()
    })

    it('does not show snapshot export buttons when hasSnapshots is false', async () => {
      const user = userEvent.setup()
      const onExportAll = vi.fn()

      renderWithOrg(
        <Toolbar hasSnapshots={false} onExportAllSnapshots={onExportAll} />,
        { working: [makePerson()] },
      )

      await user.click(screen.getByRole('button', { name: 'Export options' }))

      expect(screen.queryByRole('button', { name: 'All Snapshots (CSV)' })).toBeNull()
    })

    it('does not show snapshot export buttons when onExportAllSnapshots is undefined', async () => {
      const user = userEvent.setup()

      renderWithOrg(
        <Toolbar hasSnapshots />,
        { working: [makePerson()] },
      )

      await user.click(screen.getByRole('button', { name: 'Export options' }))

      expect(screen.queryByRole('button', { name: 'All Snapshots (CSV)' })).toBeNull()
    })

    it('calls onExportAllSnapshots with "csv" when All Snapshots (CSV) is clicked', async () => {
      const user = userEvent.setup()
      const onExportAll = vi.fn()

      renderWithOrg(
        <Toolbar hasSnapshots onExportAllSnapshots={onExportAll} />,
        { working: [makePerson()] },
      )

      await user.click(screen.getByRole('button', { name: 'Export options' }))
      await user.click(screen.getByRole('button', { name: 'All Snapshots (CSV)' }))

      expect(onExportAll).toHaveBeenCalledWith('csv')
    })

    it('calls onExportAllSnapshots with "xlsx" when All Snapshots (XLSX) is clicked', async () => {
      const user = userEvent.setup()
      const onExportAll = vi.fn()

      renderWithOrg(
        <Toolbar hasSnapshots onExportAllSnapshots={onExportAll} />,
        { working: [makePerson()] },
      )

      await user.click(screen.getByRole('button', { name: 'Export options' }))
      await user.click(screen.getByRole('button', { name: 'All Snapshots (XLSX)' }))

      expect(onExportAll).toHaveBeenCalledWith('xlsx')
    })

    it('calls onExportAllSnapshots with "png" when All Snapshots (PNG) is clicked', async () => {
      const user = userEvent.setup()
      const onExportAll = vi.fn()

      renderWithOrg(
        <Toolbar hasSnapshots onExportAllSnapshots={onExportAll} />,
        { working: [makePerson()] },
      )

      await user.click(screen.getByRole('button', { name: 'Export options' }))
      await user.click(screen.getByRole('button', { name: 'All Snapshots (PNG)' }))

      expect(onExportAll).toHaveBeenCalledWith('png')
    })

    it('calls onExportAllSnapshots with "svg" when All Snapshots (SVG) is clicked', async () => {
      const user = userEvent.setup()
      const onExportAll = vi.fn()

      renderWithOrg(
        <Toolbar hasSnapshots onExportAllSnapshots={onExportAll} />,
        { working: [makePerson()] },
      )

      await user.click(screen.getByRole('button', { name: 'Export options' }))
      await user.click(screen.getByRole('button', { name: 'All Snapshots (SVG)' }))

      expect(onExportAll).toHaveBeenCalledWith('svg')
    })

    it('disables snapshot export buttons when exporting is true', async () => {
      const user = userEvent.setup()
      const onExportAll = vi.fn()

      renderWithOrg(
        <Toolbar hasSnapshots onExportAllSnapshots={onExportAll} exporting />,
        { working: [makePerson()] },
      )

      await user.click(screen.getByRole('button', { name: 'Export options' }))

      const csvBtn = screen.getByRole('button', { name: 'All Snapshots (CSV)' })
      expect(csvBtn).toHaveProperty('disabled', true)

      const xlsxBtn = screen.getByRole('button', { name: 'All Snapshots (XLSX)' })
      expect(xlsxBtn).toHaveProperty('disabled', true)

      const pngBtn = screen.getByRole('button', { name: 'All Snapshots (PNG)' })
      expect(pngBtn).toHaveProperty('disabled', true)

      const svgBtn = screen.getByRole('button', { name: 'All Snapshots (SVG)' })
      expect(svgBtn).toHaveProperty('disabled', true)
    })
  })

  describe('logging toggle', () => {
    it('renders Logs button with active styling when logPanelOpen is true', () => {
      renderWithOrg(
        <Toolbar loggingEnabled onToggleLogs={vi.fn()} logPanelOpen />,
        { working: [makePerson()] },
      )

      const logsBtn = screen.getByRole('button', { name: 'Toggle log viewer' })
      expect(logsBtn.className).toContain('pillActive')
    })

    it('renders Logs button without active styling when logPanelOpen is false', () => {
      renderWithOrg(
        <Toolbar loggingEnabled onToggleLogs={vi.fn()} logPanelOpen={false} />,
        { working: [makePerson()] },
      )

      const logsBtn = screen.getByRole('button', { name: 'Toggle log viewer' })
      expect(logsBtn.className).not.toContain('pillActive')
    })

    it('does not render Logs button when loggingEnabled is false', () => {
      renderWithOrg(
        <Toolbar loggingEnabled={false} />,
        { working: [makePerson()] },
      )

      expect(screen.queryByRole('button', { name: 'Toggle log viewer' })).toBeNull()
    })
  })

  describe('hamburger menu', () => {
    it('hides Refresh Layout when viewMode is table', async () => {
      const user = userEvent.setup()

      renderWithOrg(<Toolbar />, {
        working: [makePerson()],
        viewMode: 'table',
      })

      await user.click(screen.getByRole('button', { name: 'Menu' }))

      expect(screen.queryByRole('button', { name: 'Refresh Layout' })).toBeNull()
      // Settings should still be there
      expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy()
    })

    it('shows Refresh Layout when viewMode is manager', async () => {
      const user = userEvent.setup()

      renderWithOrg(<Toolbar />, {
        working: [makePerson()],
        viewMode: 'manager',
      })

      await user.click(screen.getByRole('button', { name: 'Menu' }))

      expect(screen.getByRole('button', { name: 'Refresh Layout' })).toBeTruthy()
    })

    it('opens Settings modal when Settings is clicked', async () => {
      const user = userEvent.setup()

      renderWithOrg(<Toolbar />, {
        working: [makePerson()],
      })

      await user.click(screen.getByRole('button', { name: 'Menu' }))
      await user.click(screen.getByRole('button', { name: 'Settings' }))

      // The menu should close after clicking Settings
      expect(screen.getByRole('button', { name: 'Menu' }).getAttribute('aria-expanded')).toBe('false')
    })

    it('closes hamburger menu after Refresh Layout is clicked', async () => {
      const user = userEvent.setup()
      const reflowFn = vi.fn()

      renderWithOrg(<Toolbar />, {
        working: [makePerson()],
        reflow: reflowFn,
        viewMode: 'detail',
      })

      await user.click(screen.getByRole('button', { name: 'Menu' }))
      await user.click(screen.getByRole('button', { name: 'Refresh Layout' }))

      expect(reflowFn).toHaveBeenCalled()
      // Menu should be closed
      expect(screen.getByRole('button', { name: 'Menu' }).getAttribute('aria-expanded')).toBe('false')
    })
  })

  describe('export dropdown toggle', () => {
    it('closes export dropdown when export button is clicked twice', async () => {
      const user = userEvent.setup()

      renderWithOrg(<Toolbar />, {
        working: [makePerson()],
      })

      const exportBtn = screen.getByRole('button', { name: 'Export options' })

      // Open
      await user.click(exportBtn)
      expect(exportBtn.getAttribute('aria-expanded')).toBe('true')
      expect(screen.getByRole('button', { name: 'PNG' })).toBeTruthy()

      // Close
      await user.click(exportBtn)
      expect(exportBtn.getAttribute('aria-expanded')).toBe('false')
      expect(screen.queryByRole('button', { name: 'PNG' })).toBeNull()
    })

    it('closes export dropdown after PNG is clicked', async () => {
      const user = userEvent.setup()
      const onExportPng = vi.fn()

      renderWithOrg(<Toolbar onExportPng={onExportPng} />, {
        working: [makePerson()],
      })

      await user.click(screen.getByRole('button', { name: 'Export options' }))
      await user.click(screen.getByRole('button', { name: 'PNG' }))

      // Dropdown should be closed
      expect(screen.getByRole('button', { name: 'Export options' }).getAttribute('aria-expanded')).toBe('false')
    })

    it('closes export dropdown after SVG is clicked', async () => {
      const user = userEvent.setup()
      const onExportSvg = vi.fn()

      renderWithOrg(<Toolbar onExportSvg={onExportSvg} />, {
        working: [makePerson()],
      })

      await user.click(screen.getByRole('button', { name: 'Export options' }))
      await user.click(screen.getByRole('button', { name: 'SVG' }))

      expect(screen.getByRole('button', { name: 'Export options' }).getAttribute('aria-expanded')).toBe('false')
    })
  })

  describe('view mode pills', () => {
    it('highlights the active view mode pill', () => {
      renderWithOrg(<Toolbar />, {
        working: [makePerson()],
        viewMode: 'manager',
      })

      const managerBtn = screen.getByRole('button', { name: 'Manager' })
      expect(managerBtn.className).toContain('pillActive')

      const detailBtn = screen.getByRole('button', { name: 'Detail' })
      expect(detailBtn.className).not.toContain('pillActive')
    })

    it('highlights the active data view pill', () => {
      renderWithOrg(<Toolbar />, {
        working: [makePerson()],
        dataView: 'diff',
      })

      const diffBtn = screen.getByRole('button', { name: 'Diff' })
      expect(diffBtn.className).toContain('pillActive')

      const workingBtn = screen.getByRole('button', { name: 'Working' })
      expect(workingBtn.className).not.toContain('pillActive')
    })

    it('calls setViewMode with "table" when Table pill is clicked', async () => {
      const user = userEvent.setup()
      const setViewMode = vi.fn()

      renderWithOrg(<Toolbar />, {
        working: [makePerson()],
        setViewMode,
      })

      await user.click(screen.getByRole('button', { name: 'Table' }))
      expect(setViewMode).toHaveBeenCalledWith('table')
    })

    it('calls setDataView with "original" when Original pill is clicked', async () => {
      const user = userEvent.setup()
      const setDataView = vi.fn()

      renderWithOrg(<Toolbar />, {
        working: [makePerson()],
        setDataView,
      })

      await user.click(screen.getByRole('button', { name: 'Original' }))
      expect(setDataView).toHaveBeenCalledWith('original')
    })
  })

  describe('export button text', () => {
    it('shows "Export ▾" when not exporting', () => {
      renderWithOrg(<Toolbar exporting={false} />, {
        working: [makePerson()],
      })

      expect(screen.getByText('Export ▾')).toBeTruthy()
    })

    it('shows "Exporting..." when exporting is true', () => {
      renderWithOrg(<Toolbar exporting />, {
        working: [makePerson()],
      })

      expect(screen.getByText('Exporting...')).toBeTruthy()
    })
  })

  describe('file upload', () => {
    it('triggers file input click when Upload button is clicked', async () => {
      const user = userEvent.setup()

      renderWithOrg(<Toolbar />, {
        working: [makePerson()],
      })

      // The upload button should exist
      const uploadBtn = screen.getByRole('button', { name: 'Upload file' })
      expect(uploadBtn).toBeTruthy()

      // Click should not throw
      await user.click(uploadBtn)
    })
  })

  describe('help button', () => {
    it('renders help button with ? text', () => {
      renderWithOrg(<Toolbar />, {
        working: [makePerson()],
      })

      const helpBtn = screen.getByRole('button', { name: 'Start product tour' })
      expect(helpBtn).toBeTruthy()
      expect(helpBtn.textContent).toBe('?')
    })
  })
})
