/**
 * Additional branch coverage for useOrgDiff.
 * The existing test file uses a local computeDiff that misses the 'pod' change type.
 * This file uses the actual hook via renderHook.
 */
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useOrgDiff } from './useOrgDiff'
import type { OrgNode } from '../api/types'

const base: OrgNode = {
  id: '1', name: 'Alice', role: 'VP', discipline: 'Eng',
  managerId: '', team: 'Eng', additionalTeams: [], status: 'Active',
}

describe('useOrgDiff — pod change detection', () => {
  it('detects pod change', () => {
    const original = [base]
    const working = [{ ...base, pod: 'Alpha' }]
    const { result } = renderHook(() => useOrgDiff(original, working))
    const change = result.current.get('1')
    expect(change?.types.has('pod')).toBe(true)
  })

  it('does not flag pod change when both are empty', () => {
    const original = [{ ...base, pod: '' }]
    const working = [{ ...base, pod: '' }]
    const { result } = renderHook(() => useOrgDiff(original, working))
    expect(result.current.size).toBe(0)
  })

  it('does not flag pod change when both are undefined', () => {
    const original = [{ ...base }]
    const working = [{ ...base }]
    const { result } = renderHook(() => useOrgDiff(original, working))
    expect(result.current.size).toBe(0)
  })

  it('detects pod removal', () => {
    const original = [{ ...base, pod: 'Alpha' }]
    const working = [{ ...base, pod: '' }]
    const { result } = renderHook(() => useOrgDiff(original, working))
    const change = result.current.get('1')
    expect(change?.types.has('pod')).toBe(true)
  })

  it('detects discipline change via title type', () => {
    const original = [base]
    const working = [{ ...base, discipline: 'Design' }]
    const { result } = renderHook(() => useOrgDiff(original, working))
    const change = result.current.get('1')
    expect(change?.types.has('title')).toBe(true)
  })
})
