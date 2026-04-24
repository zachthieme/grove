// Scenarios: FILTER-004
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PrivateToggle from './PrivateToggle'
import { makeNode, renderWithOrg } from '../test-helpers'

afterEach(() => cleanup())

describe('PrivateToggle', () => {
  it('returns null when no private people', () => {
    const { container } = renderWithOrg(<PrivateToggle />, {
      working: [makeNode(), makeNode({ id: '2' })],
    })
    expect(container.innerHTML).toBe('')
  })

  it('shows toggle button when private people exist', () => {
    renderWithOrg(<PrivateToggle />, {
      working: [makeNode({ private: true })],
    })
    expect(screen.getByRole('button')).toBeTruthy()
  })

  it('shows correct count in button text', () => {
    renderWithOrg(<PrivateToggle />, {
      working: [
        makeNode({ id: '1', private: true }),
        makeNode({ id: '2', private: true }),
        makeNode({ id: '3', private: false }),
      ],
    })
    expect(screen.getByText('2 hidden')).toBeTruthy()
  })

  it('calls setShowPrivate with toggled value on click', async () => {
    const user = userEvent.setup()
    const setShowPrivate = vi.fn()
    renderWithOrg(<PrivateToggle />, {
      working: [makeNode({ private: true }), makeNode({ id: '2', private: true })],
      showPrivate: false,
      setShowPrivate,
    })

    await user.click(screen.getByRole('button'))
    expect(setShowPrivate).toHaveBeenCalledWith(true)
  })

  it('aria-label includes count and hidden state when showPrivate is false', () => {
    renderWithOrg(<PrivateToggle />, {
      working: [makeNode({ private: true }), makeNode({ id: '2', private: true })],
      showPrivate: false,
    })
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe(
      '2 private people hidden',
    )
  })

  it('aria-label includes count and shown state when showPrivate is true', () => {
    renderWithOrg(<PrivateToggle />, {
      working: [makeNode({ id: '1', private: true })],
      showPrivate: true,
    })
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe(
      '1 private people shown',
    )
  })

  it('aria-pressed is false when showPrivate is false', () => {
    renderWithOrg(<PrivateToggle />, {
      working: [makeNode({ private: true })],
      showPrivate: false,
    })
    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('false')
  })

  it('aria-pressed is true when showPrivate is true', () => {
    renderWithOrg(<PrivateToggle />, {
      working: [makeNode({ private: true })],
      showPrivate: true,
    })
    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('true')
  })

  it('shows "hidden" text when showPrivate is false', () => {
    renderWithOrg(<PrivateToggle />, {
      working: [makeNode({ private: true })],
      showPrivate: false,
    })
    expect(screen.getByText('1 hidden')).toBeTruthy()
  })

  it('shows "shown" text when showPrivate is true', () => {
    renderWithOrg(<PrivateToggle />, {
      working: [makeNode({ private: true })],
      showPrivate: true,
    })
    expect(screen.getByText('1 shown')).toBeTruthy()
  })
})
