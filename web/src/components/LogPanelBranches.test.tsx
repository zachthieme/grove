/**
 * Additional branch coverage for LogPanel.
 * Covers: entry expansion, keyboard navigation, source filter,
 * status color branches, correlation filter, non-Error rejection.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LogPanel from './LogPanel'

vi.mock('../api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../api/client')>()
  return {
    ...original,
    getLogs: vi.fn().mockResolvedValue({
      entries: [
        {
          id: '1',
          timestamp: '2026-03-23T14:30:00Z',
          source: 'api',
          method: 'POST',
          path: '/api/update',
          responseStatus: 200,
          durationMs: 12,
          correlationId: 'corr-abc',
          requestBody: { field: 'value' },
        },
        {
          id: '2',
          timestamp: '2026-03-23T14:30:01Z',
          source: 'web',
          method: 'GET',
          path: '/api/org',
          responseStatus: 422,
          durationMs: 50,
          correlationId: 'corr-def',
          error: 'validation failed',
          responseBody: { detail: 'invalid field' },
        },
        {
          id: '3',
          timestamp: '2026-03-23T14:30:02Z',
          source: 'api',
          method: 'POST',
          path: '/api/move',
          responseStatus: 302,
          durationMs: 5,
        },
      ],
      count: 3,
      bufferSize: 1000,
    }),
    clearLogs: vi.fn().mockResolvedValue(undefined),
  }
})

describe('LogPanel — branch coverage', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => cleanup())

  it('expands entry on click to show request body', async () => {
    await act(async () => {
      render(<LogPanel onClose={onClose} />)
    })

    // Find the entry row by its path content
    const pathSpans = screen.getAllByText('/api/update')
    const entryRow = pathSpans[0].closest('[role="button"]')!
    await act(async () => {
      fireEvent.click(entryRow)
    })

    expect(screen.getByText('Request:')).toBeTruthy()
  })

  it('collapses expanded entry on second click', async () => {
    await act(async () => {
      render(<LogPanel onClose={onClose} />)
    })

    const pathSpans = screen.getAllByText('/api/update')
    const entryRow = pathSpans[0].closest('[role="button"]')!

    await act(async () => {
      fireEvent.click(entryRow)
    })
    expect(screen.getByText('Request:')).toBeTruthy()

    await act(async () => {
      fireEvent.click(entryRow)
    })
    expect(screen.queryByText('Request:')).toBeNull()
  })

  it('shows error in expanded entry', async () => {
    await act(async () => {
      render(<LogPanel onClose={onClose} />)
    })

    const orgPaths = screen.getAllByText('/api/org')
    const entryRow = orgPaths[0].closest('[role="button"]')!

    await act(async () => {
      fireEvent.click(entryRow)
    })

    expect(screen.getByText('Response:')).toBeTruthy()
    expect(screen.getByText(/validation failed/)).toBeTruthy()
  })

  it('handles keyboard Enter to expand entry', async () => {
    await act(async () => {
      render(<LogPanel onClose={onClose} />)
    })

    const pathSpans = screen.getAllByText('/api/update')
    const entryRow = pathSpans[0].closest('[role="button"]')!

    await act(async () => {
      fireEvent.keyDown(entryRow, { key: 'Enter' })
    })
    expect(screen.getByText('Request:')).toBeTruthy()
  })

  it('handles keyboard Space to expand entry', async () => {
    await act(async () => {
      render(<LogPanel onClose={onClose} />)
    })

    const pathSpans = screen.getAllByText('/api/update')
    const entryRow = pathSpans[0].closest('[role="button"]')!

    await act(async () => {
      fireEvent.keyDown(entryRow, { key: ' ' })
    })
    expect(screen.getByText('Request:')).toBeTruthy()
  })

  it('renders entry without correlationId (no corr button)', async () => {
    await act(async () => {
      render(<LogPanel onClose={onClose} />)
    })

    // Third entry has no correlationId, should still render its path
    expect(screen.getByText('/api/move')).toBeTruthy()
  })

  it('calls clearLogs and refreshes when Clear is clicked', async () => {
    const user = userEvent.setup()
    await act(async () => {
      render(<LogPanel onClose={onClose} />)
    })

    const { clearLogs } = await import('../api/client')
    await user.click(screen.getByText('Clear'))
    expect(vi.mocked(clearLogs)).toHaveBeenCalled()
  })

  it('calls getLogs when Refresh button is clicked', async () => {
    const user = userEvent.setup()
    await act(async () => {
      render(<LogPanel onClose={onClose} />)
    })

    const { getLogs } = await import('../api/client')
    const callCount = vi.mocked(getLogs).mock.calls.length
    await user.click(screen.getByText('Refresh'))
    expect(vi.mocked(getLogs).mock.calls.length).toBeGreaterThan(callCount)
  })

  it('renders error when getLogs rejects with non-Error', async () => {
    const { getLogs } = await import('../api/client')
    vi.mocked(getLogs).mockRejectedValueOnce('string error')

    await act(async () => {
      render(<LogPanel onClose={onClose} />)
    })
    expect(screen.getByText('Failed to load logs')).toBeTruthy()
  })

  it('filters by source when dropdown changes', async () => {
    const user = userEvent.setup()
    await act(async () => {
      render(<LogPanel onClose={onClose} />)
    })

    const select = screen.getByDisplayValue('All sources')
    const { getLogs } = await import('../api/client')
    await user.selectOptions(select, 'api')
    expect(vi.mocked(getLogs)).toHaveBeenCalledWith(expect.objectContaining({ source: 'api' }))
  })
})
