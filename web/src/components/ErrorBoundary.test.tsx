import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import ErrorBoundary from './ErrorBoundary'

afterEach(cleanup)

function ThrowingComponent({ error }: { error?: Error }) {
  if (error) {
    throw error
  }
  return <div>All good</div>
}

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <div>Child content</div>
      </ErrorBoundary>
    )

    expect(screen.getByText('Child content')).toBeTruthy()
  })

  it('catches error and shows fallback UI', () => {
    // Suppress console.error from React's error boundary logging
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ErrorBoundary>
        <ThrowingComponent error={new Error('Test explosion')} />
      </ErrorBoundary>
    )

    expect(screen.getByText('Something went wrong')).toBeTruthy()
    expect(screen.getByText('Test explosion')).toBeTruthy()
    expect(screen.getByText('Try Again')).toBeTruthy()

    consoleSpy.mockRestore()
  })

  it('recovery button resets error state and re-renders children', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    let shouldThrow = true
    function ConditionalThrower() {
      if (shouldThrow) {
        throw new Error('Temporary failure')
      }
      return <div>Recovered</div>
    }

    render(
      <ErrorBoundary>
        <ConditionalThrower />
      </ErrorBoundary>
    )

    // Error state should be shown
    expect(screen.getByText('Something went wrong')).toBeTruthy()
    expect(screen.getByText('Temporary failure')).toBeTruthy()

    // Fix the condition so re-render succeeds
    shouldThrow = false

    // Click Try Again
    fireEvent.click(screen.getByText('Try Again'))

    // Children should render again
    expect(screen.getByText('Recovered')).toBeTruthy()
    expect(screen.queryByText('Something went wrong')).toBeNull()

    consoleSpy.mockRestore()
  })
})
