import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Toolbar from './Toolbar'
import { makePerson, renderWithOrg } from '../test-helpers'

vi.mock('../api/client', () => ({
  exportDataUrl: (fmt: string) => `/api/export?format=${fmt}`,
}))

describe('Toolbar', () => {
  afterEach(() => cleanup())

  it('calls setViewMode when a view mode pill is clicked', async () => {
    const user = userEvent.setup()
    const setViewModeFn = vi.fn()
    renderWithOrg(<Toolbar />, {
      working: [makePerson()],
      setViewMode: setViewModeFn,
    })
    await user.click(screen.getByRole('button', { name: 'Manager' }))
    expect(setViewModeFn).toHaveBeenCalledWith('manager')
  })

  it('calls setDataView when a data view pill is clicked', async () => {
    const user = userEvent.setup()
    const setDataViewFn = vi.fn()
    renderWithOrg(<Toolbar />, {
      working: [makePerson()],
      setDataView: setDataViewFn,
    })
    await user.click(screen.getByRole('button', { name: 'Diff' }))
    expect(setDataViewFn).toHaveBeenCalledWith('diff')
  })

  it('calls onExportPng when PNG is clicked', async () => {
    const user = userEvent.setup()
    const onExportPng = vi.fn()
    renderWithOrg(<Toolbar onExportPng={onExportPng} />, {
      working: [makePerson()],
    })
    await user.click(screen.getByRole('button', { name: 'Export options' }))
    await user.click(screen.getByRole('button', { name: 'PNG' }))
    expect(onExportPng).toHaveBeenCalledTimes(1)
  })

  it('calls onExportSvg when SVG is clicked', async () => {
    const user = userEvent.setup()
    const onExportSvg = vi.fn()
    renderWithOrg(<Toolbar onExportSvg={onExportSvg} />, {
      working: [makePerson()],
    })
    await user.click(screen.getByRole('button', { name: 'Export options' }))
    await user.click(screen.getByRole('button', { name: 'SVG' }))
    expect(onExportSvg).toHaveBeenCalledTimes(1)
  })

  it('calls reflow when Refresh Layout is clicked', async () => {
    const user = userEvent.setup()
    const reflowFn = vi.fn()
    renderWithOrg(<Toolbar />, {
      working: [makePerson()],
      reflow: reflowFn,
      viewMode: 'detail',
    })
    await user.click(screen.getByRole('button', { name: 'Menu' }))
    await user.click(screen.getByRole('button', { name: 'Refresh Layout' }))
    expect(reflowFn).toHaveBeenCalledTimes(1)
  })

  it('calls onToggleLogs when Logs button is clicked', async () => {
    const user = userEvent.setup()
    const onToggleLogs = vi.fn()
    renderWithOrg(<Toolbar loggingEnabled onToggleLogs={onToggleLogs} />, {
      working: [makePerson()],
    })
    await user.click(screen.getByRole('button', { name: 'Toggle log viewer' }))
    expect(onToggleLogs).toHaveBeenCalledTimes(1)
  })

  it('sets aria-expanded on hamburger menu button', async () => {
    const user = userEvent.setup()
    renderWithOrg(<Toolbar />, {
      working: [makePerson()],
    })
    const menuBtn = screen.getByRole('button', { name: 'Menu' })
    expect(menuBtn.getAttribute('aria-expanded')).toBe('false')
    await user.click(menuBtn)
    expect(menuBtn.getAttribute('aria-expanded')).toBe('true')
  })

  it('sets aria-expanded on export dropdown button', async () => {
    const user = userEvent.setup()
    renderWithOrg(<Toolbar />, {
      working: [makePerson()],
    })
    const exportBtn = screen.getByRole('button', { name: 'Export options' })
    expect(exportBtn.getAttribute('aria-expanded')).toBe('false')
    await user.click(exportBtn)
    expect(exportBtn.getAttribute('aria-expanded')).toBe('true')
  })
})
