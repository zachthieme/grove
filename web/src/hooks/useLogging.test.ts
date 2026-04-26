import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useLogging } from './useLogging'
import * as api from '../api/client'

describe('useLogging', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    warnSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it('warns when getConfig rejects rather than silently swallowing', async () => {
    vi.spyOn(api, 'getConfig').mockRejectedValue(new Error('boom'))
    renderHook(() => useLogging())
    await waitFor(() =>
      expect(warnSpy).toHaveBeenCalledWith('config load failed; logging disabled', expect.any(Error)),
    )
  })
})
