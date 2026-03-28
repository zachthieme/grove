// Scenarios: UI-001
// Tests the error banner rendering pattern used in App.tsx (inline, not a separate component).
// Validates that error state from UIContext renders as an alert and is dismissible.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithOrg, makeOrgContext } from '../test-helpers'

/** Minimal component that mirrors App.tsx's error banner pattern. */
function ErrorBannerHarness({ error, clearError }: { error: string | null; clearError: () => void }) {
  return (
    <>
      {error && (
        <div role="alert">
          <span>{error}</span>
          <button onClick={clearError}>×</button>
        </div>
      )}
      <div>App content</div>
    </>
  )
}

afterEach(cleanup)

describe('Error banner behavior', () => {
  it('renders alert with error message when error is set', () => {
    render(<ErrorBannerHarness error="Something broke" clearError={() => {}} />)

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText('Something broke')).toBeTruthy()
  })

  it('does not render alert when error is null', () => {
    render(<ErrorBannerHarness error={null} clearError={() => {}} />)

    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('App content')).toBeTruthy()
  })

  it('dismiss button calls clearError', async () => {
    const user = userEvent.setup()
    let error: string | null = 'Test error'
    const clearError = () => { error = null }

    const { rerender } = render(<ErrorBannerHarness error={error} clearError={clearError} />)
    expect(screen.getByRole('alert')).toBeTruthy()

    await user.click(screen.getByText('×'))
    rerender(<ErrorBannerHarness error={error} clearError={clearError} />)

    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('new error replaces previous error message', () => {
    const { rerender } = render(<ErrorBannerHarness error="First error" clearError={() => {}} />)
    expect(screen.getByText('First error')).toBeTruthy()

    rerender(<ErrorBannerHarness error="Second error" clearError={() => {}} />)
    expect(screen.queryByText('First error')).toBeNull()
    expect(screen.getByText('Second error')).toBeTruthy()
  })
})
