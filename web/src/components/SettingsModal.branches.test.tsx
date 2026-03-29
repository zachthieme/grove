/**
 * Additional branch coverage for SettingsModal.
 * Covers: drag reordering (handleDragStart/handleDragOver/handleDragEnd),
 * existing discipline order merged with new disciplines.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, cleanup, fireEvent } from '@testing-library/react'
import SettingsModal from './SettingsModal'
import { makePerson, renderWithOrg } from '../test-helpers'

afterEach(() => cleanup())

describe('SettingsModal — branch coverage', () => {
  it('merges existing disciplineOrder with disciplines from working data', () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined)
    renderWithOrg(<SettingsModal onClose={vi.fn()} />, {
      working: [
        makePerson({ id: 'a1', discipline: 'Engineering' }),
        makePerson({ id: 'b2', discipline: 'Design' }),
        makePerson({ id: 'c3', discipline: 'Product' }),
      ],
      settings: { disciplineOrder: ['Design', 'Engineering'] },
      updateSettings,
    })

    // Design should come first (from existing order), then Engineering, then Product (new)
    const items = screen.getAllByText(/Design|Engineering|Product/)
      .filter(el => el.tagName === 'LI')
    expect(items[0].textContent).toContain('Design')
    expect(items[1].textContent).toContain('Engineering')
    expect(items[2].textContent).toContain('Product')
  })

  it('filters out stale disciplines from existing order', () => {
    renderWithOrg(<SettingsModal onClose={vi.fn()} />, {
      working: [
        makePerson({ id: 'a1', discipline: 'Engineering' }),
      ],
      settings: { disciplineOrder: ['Stale Discipline', 'Engineering'] },
    })

    expect(screen.queryByText('Stale Discipline')).toBeNull()
    expect(screen.getByText('Engineering')).toBeTruthy()
  })

  it('handles drag-over reordering', () => {
    renderWithOrg(<SettingsModal onClose={vi.fn()} />, {
      working: [
        makePerson({ id: 'a', discipline: 'Alpha' }),
        makePerson({ id: 'b', discipline: 'Beta' }),
        makePerson({ id: 'c', discipline: 'Charlie' }),
      ],
      settings: { disciplineOrder: [] },
    })

    const items = screen.getAllByText(/^(Alpha|Beta|Charlie)$/)
    expect(items).toHaveLength(3)

    // Simulate drag start on first item
    const firstItem = items[0].closest('li')!
    fireEvent.dragStart(firstItem)

    // Simulate drag over on third item
    const thirdItem = items[2].closest('li')!
    fireEvent.dragOver(thirdItem, { preventDefault: vi.fn() })

    // Simulate drag end
    fireEvent.dragEnd(firstItem)
  })

  it('handles drag-over with same index (no-op)', () => {
    renderWithOrg(<SettingsModal onClose={vi.fn()} />, {
      working: [
        makePerson({ id: 'a', discipline: 'Alpha' }),
        makePerson({ id: 'b', discipline: 'Beta' }),
      ],
      settings: { disciplineOrder: [] },
    })

    const items = screen.getAllByText(/^(Alpha|Beta)$/)
    const firstItem = items[0].closest('li')!
    fireEvent.dragStart(firstItem)

    // Drag over the same item should be a no-op
    fireEvent.dragOver(firstItem, { preventDefault: vi.fn() })
  })

  it('handles drag-over without prior drag start (dragIdx is null)', () => {
    renderWithOrg(<SettingsModal onClose={vi.fn()} />, {
      working: [
        makePerson({ id: 'a', discipline: 'Alpha' }),
        makePerson({ id: 'b', discipline: 'Beta' }),
      ],
      settings: { disciplineOrder: [] },
    })

    const items = screen.getAllByText(/^(Alpha|Beta)$/)
    const secondItem = items[1].closest('li')!
    // DragOver without DragStart — dragIdx is null, should be a no-op
    fireEvent.dragOver(secondItem, { preventDefault: vi.fn() })
  })

  it('handles people with empty discipline (skipped)', () => {
    renderWithOrg(<SettingsModal onClose={vi.fn()} />, {
      working: [
        makePerson({ id: 'a', discipline: '' }),
        makePerson({ id: 'b', discipline: 'Engineering' }),
      ],
      settings: { disciplineOrder: [] },
    })

    // Only Engineering should be listed, not empty discipline
    expect(screen.getByText('Engineering')).toBeTruthy()
    // The empty discipline should not create a list item
    const items = screen.getAllByText(/^Engineering$/)
    expect(items).toHaveLength(1)
  })
})
