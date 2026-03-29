// Scenarios: SELECT-001
import { describe, it, expect } from 'vitest'
import { buildTeamDropId, parseTeamDropId, buildPodDropId, parsePodDropId } from './ids'

describe('team drop IDs', () => {
  it('round-trips a team name', () => {
    const id = buildTeamDropId('Engineering')
    expect(parseTeamDropId(id)).toBe('Engineering')
  })

  it('round-trips an empty team name', () => {
    const id = buildTeamDropId('')
    expect(parseTeamDropId(id)).toBe('')
  })

  it('round-trips a team name with special characters', () => {
    const id = buildTeamDropId('Team::Alpha')
    expect(parseTeamDropId(id)).toBe('Team::Alpha')
  })

  it('returns null for non-team ID', () => {
    expect(parseTeamDropId('pod:abc:def')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseTeamDropId('')).toBeNull()
  })

  it('returns null for random string', () => {
    expect(parseTeamDropId('random-string')).toBeNull()
  })

  it('builds expected format', () => {
    expect(buildTeamDropId('Platform')).toBe('team::Platform')
  })
})

describe('pod drop IDs', () => {
  it('round-trips managerId and podName', () => {
    const id = buildPodDropId('uuid-123', 'Frontend Pod')
    const parsed = parsePodDropId(id)
    expect(parsed).toEqual({ managerId: 'uuid-123', podName: 'Frontend Pod' })
  })

  it('handles podName with colons', () => {
    const id = buildPodDropId('mgr-1', 'Pod:Special')
    const parsed = parsePodDropId(id)
    expect(parsed).toEqual({ managerId: 'mgr-1', podName: 'Pod:Special' })
  })

  it('handles empty podName', () => {
    const id = buildPodDropId('mgr-1', '')
    const parsed = parsePodDropId(id)
    expect(parsed).toEqual({ managerId: 'mgr-1', podName: '' })
  })

  it('returns null for non-pod ID', () => {
    expect(parsePodDropId('team::Engineering')).toBeNull()
  })

  it('returns null for pod prefix without colon separator', () => {
    expect(parsePodDropId('pod:nocolon')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parsePodDropId('')).toBeNull()
  })

  it('builds expected format', () => {
    expect(buildPodDropId('abc', 'MyPod')).toBe('pod:abc:MyPod')
  })
})
