import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { UIProvider, useUI } from './UIContext'

let captured: ReturnType<typeof useUI> | null = null

function Harness() {
  captured = useUI()
  return null
}

function renderWithProvider() {
  return render(
    <UIProvider>
      <Harness />
    </UIProvider>
  )
}

afterEach(() => {
  captured = null
  cleanup()
})

describe('UIContext', () => {
  it('has correct default values', () => {
    renderWithProvider()

    expect(captured!.viewMode).toBe('detail')
    expect(captured!.dataView).toBe('working')
    expect(captured!.binOpen).toBe(false)
    expect(captured!.hiddenEmploymentTypes.size).toBe(0)
    expect(captured!.headPersonId).toBeNull()
    expect(captured!.layoutKey).toBe(0)
    expect(captured!.error).toBeNull()
  })

  it('setViewMode changes viewMode', () => {
    renderWithProvider()

    act(() => { captured!.setViewMode('manager') })
    expect(captured!.viewMode).toBe('manager')

    act(() => { captured!.setViewMode('table') })
    expect(captured!.viewMode).toBe('table')

    act(() => { captured!.setViewMode('detail') })
    expect(captured!.viewMode).toBe('detail')
  })

  it('setDataView changes dataView', () => {
    renderWithProvider()

    act(() => { captured!.setDataView('original') })
    expect(captured!.dataView).toBe('original')

    act(() => { captured!.setDataView('diff') })
    expect(captured!.dataView).toBe('diff')

    act(() => { captured!.setDataView('working') })
    expect(captured!.dataView).toBe('working')
  })

  it('toggleEmploymentTypeFilter adds and removes from hidden set', () => {
    renderWithProvider()

    // Add a type
    act(() => { captured!.toggleEmploymentTypeFilter('Contractor') })
    expect(captured!.hiddenEmploymentTypes.has('Contractor')).toBe(true)
    expect(captured!.hiddenEmploymentTypes.size).toBe(1)

    // Add another type
    act(() => { captured!.toggleEmploymentTypeFilter('Intern') })
    expect(captured!.hiddenEmploymentTypes.has('Contractor')).toBe(true)
    expect(captured!.hiddenEmploymentTypes.has('Intern')).toBe(true)
    expect(captured!.hiddenEmploymentTypes.size).toBe(2)

    // Toggle off the first type
    act(() => { captured!.toggleEmploymentTypeFilter('Contractor') })
    expect(captured!.hiddenEmploymentTypes.has('Contractor')).toBe(false)
    expect(captured!.hiddenEmploymentTypes.has('Intern')).toBe(true)
    expect(captured!.hiddenEmploymentTypes.size).toBe(1)
  })

  it('showAllEmploymentTypes clears hidden set', () => {
    renderWithProvider()

    act(() => { captured!.toggleEmploymentTypeFilter('Contractor') })
    act(() => { captured!.toggleEmploymentTypeFilter('Intern') })
    expect(captured!.hiddenEmploymentTypes.size).toBe(2)

    act(() => { captured!.showAllEmploymentTypes() })
    expect(captured!.hiddenEmploymentTypes.size).toBe(0)
  })

  it('hideAllEmploymentTypes adds all provided types to hidden set', () => {
    renderWithProvider()

    const allTypes = ['FTE', 'Contractor', 'Intern', 'Vendor']
    act(() => { captured!.hideAllEmploymentTypes(allTypes) })

    expect(captured!.hiddenEmploymentTypes.size).toBe(4)
    for (const t of allTypes) {
      expect(captured!.hiddenEmploymentTypes.has(t)).toBe(true)
    }
  })

  it('reflow increments layoutKey', () => {
    renderWithProvider()

    expect(captured!.layoutKey).toBe(0)

    act(() => { captured!.reflow() })
    expect(captured!.layoutKey).toBe(1)

    act(() => { captured!.reflow() })
    expect(captured!.layoutKey).toBe(2)
  })

  it('setHead sets headPersonId', () => {
    renderWithProvider()

    expect(captured!.headPersonId).toBeNull()

    act(() => { captured!.setHead('person-123') })
    expect(captured!.headPersonId).toBe('person-123')

    act(() => { captured!.setHead(null) })
    expect(captured!.headPersonId).toBeNull()
  })

  it('setError and clearError manage error state', () => {
    renderWithProvider()

    act(() => { captured!.setError('something broke') })
    expect(captured!.error).toBe('something broke')

    act(() => { captured!.clearError() })
    expect(captured!.error).toBeNull()
  })

  it('setBinOpen toggles bin state', () => {
    renderWithProvider()

    act(() => { captured!.setBinOpen(true) })
    expect(captured!.binOpen).toBe(true)

    act(() => { captured!.setBinOpen(false) })
    expect(captured!.binOpen).toBe(false)
  })

  it('useUI throws when used outside provider', () => {
    function BadComponent() {
      useUI()
      return null
    }

    expect(() => {
      render(<BadComponent />)
    }).toThrow('useUI must be used within a UIProvider')
  })
})
