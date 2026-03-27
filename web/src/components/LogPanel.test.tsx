import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LogPanel from './LogPanel'

vi.mock('../api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../api/client')>()
  return {
    ...original,
    getLogs: vi.fn().mockResolvedValue({
      entries: [
        { id: '1', timestamp: '2026-03-23T14:30:00Z', source: 'api', method: 'POST', path: '/api/update', responseStatus: 200, durationMs: 12, correlationId: 'abc' },
        { id: '2', timestamp: '2026-03-23T14:30:01Z', source: 'web', method: 'POST', path: '/api/update', responseStatus: 200, durationMs: 15, correlationId: 'abc' },
      ],
      count: 2,
      bufferSize: 1000,
    }),
    clearLogs: vi.fn().mockResolvedValue(undefined),
  }
})

describe('LogPanel', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('[CONTRACT-005] renders log entries', async () => {
    await act(async () => {
      render(<LogPanel onClose={onClose} />)
    })
    expect(screen.getAllByText('/api/update').length).toBeGreaterThan(0)
    expect(screen.getByText('2 entries (buffer: 1000)')).toBeDefined()
  })

  it('[CONTRACT-005] renders close button', async () => {
    const user = userEvent.setup()
    await act(async () => {
      render(<LogPanel onClose={onClose} />)
    })
    const closeBtn = screen.getAllByLabelText('Close')[0]
    await user.click(closeBtn)
    expect(onClose).toHaveBeenCalled()
  })

  it('[CONTRACT-005] shows "No log entries" when empty', async () => {
    const { getLogs } = await import('../api/client')
    vi.mocked(getLogs).mockResolvedValueOnce({ entries: [], count: 0, bufferSize: 1000 })

    await act(async () => {
      render(<LogPanel onClose={onClose} />)
    })
    expect(screen.getByText('No log entries')).toBeDefined()
  })
})
