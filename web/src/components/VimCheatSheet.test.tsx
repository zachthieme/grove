import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import VimCheatSheet from './VimCheatSheet'

// jest-dom isn't installed; getBy* already throws when missing, so the
// presence assertions read as `screen.getBy* (must exist or throws)`.

afterEach(() => {
  cleanup()
})

// Scenarios: VIM-004
describe('VimCheatSheet', () => {
  it('renders all binding sections', () => {
    render(<VimCheatSheet onClose={() => {}} />)
    expect(screen.getByRole('dialog')).toBeTruthy()
    // Section headers — getByText throws if missing.
    expect(screen.getByText('Navigate')).toBeTruthy()
    expect(screen.getByText('Add')).toBeTruthy()
    expect(screen.getByText('Mutate')).toBeTruthy()
    expect(screen.getByText('Selection')).toBeTruthy()
    expect(screen.getByText('Help')).toBeTruthy()
  })

  it('shows the canonical bindings', () => {
    render(<VimCheatSheet onClose={() => {}} />)
    // Spot-check one binding from each section.
    expect(screen.getByText('h / ←')).toBeTruthy()
    expect(screen.getByText('o')).toBeTruthy()
    expect(screen.getByText('d')).toBeTruthy()
    expect(screen.getByText('/')).toBeTruthy()
    expect(screen.getByText('?')).toBeTruthy()
  })

  it('[VIM-007] lists "a" as the append-sibling binding', () => {
    render(<VimCheatSheet onClose={() => {}} />)
    expect(screen.getByText('a')).toBeTruthy()
    expect(screen.getByText(/Append sibling/i)).toBeTruthy()
  })

  it('[VIM-008] lists gg / G / gp tree-nav bindings', () => {
    render(<VimCheatSheet onClose={() => {}} />)
    expect(screen.getByText('gg')).toBeTruthy()
    expect(screen.getByText(/root manager/i)).toBeTruthy()
    expect(screen.getByText('G')).toBeTruthy()
    expect(screen.getByText(/deepest leaf/i)).toBeTruthy()
    expect(screen.getByText('gp')).toBeTruthy()
    expect(screen.getByText(/parent of selection/i)).toBeTruthy()
  })

  it('[VIM-009] lists u / Ctrl+R undo / redo bindings', () => {
    render(<VimCheatSheet onClose={() => {}} />)
    expect(screen.getByText('u')).toBeTruthy()
    expect(screen.getByText(/Undo last mutation/i)).toBeTruthy()
    expect(screen.getByText('Ctrl+R')).toBeTruthy()
    expect(screen.getByText(/Redo last undone mutation/i)).toBeTruthy()
  })

  it('[VIM-010] lists f focus-subtree binding', () => {
    render(<VimCheatSheet onClose={() => {}} />)
    expect(screen.getByText('f')).toBeTruthy()
    expect(screen.getByText(/Focus chart on selected subtree/i)).toBeTruthy()
  })

  it('[VIM-011] lists za toggle-fold binding', () => {
    render(<VimCheatSheet onClose={() => {}} />)
    expect(screen.getByText('za')).toBeTruthy()
    expect(screen.getByText(/Toggle fold/i)).toBeTruthy()
  })

  it('Close button calls onClose', () => {
    const onClose = vi.fn()
    render(<VimCheatSheet onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('clicking the overlay calls onClose', () => {
    const onClose = vi.fn()
    render(<VimCheatSheet onClose={onClose} />)
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('clicking inside the modal does NOT close', () => {
    const onClose = vi.fn()
    render(<VimCheatSheet onClose={onClose} />)
    fireEvent.click(screen.getByText('Navigate'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Escape key closes', () => {
    const onClose = vi.fn()
    render(<VimCheatSheet onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
