import { describe, it, expect } from 'vitest'
import type { Person } from '../api/types'
import {
  personToForm,
  batchToForm,
  blankForm,
  computeDirtyFields,
  dirtyToApiPayload,
  batchDirtyToApiPayload,
} from './personFormUtils'

const alice: Person = {
  id: '1',
  name: 'Alice',
  role: 'Engineer',
  discipline: 'Engineering',
  managerId: 'm1',
  team: 'Platform',
  additionalTeams: ['Infra', 'SRE'],
  status: 'Active',
  employmentType: 'FTE',
  level: 5,
  pod: 'Backend',
  publicNote: 'Leads backend',
  privateNote: 'Promo candidate',
  private: true,
}

const bob: Person = {
  id: '2',
  name: 'Bob',
  role: 'Engineer',
  discipline: 'Engineering',
  managerId: 'm1',
  team: 'Platform',
  additionalTeams: [],
  status: 'Active',
  employmentType: 'CW',
  level: 3,
  pod: 'Frontend',
  publicNote: '',
  privateNote: '',
  private: false,
}

describe('personToForm', () => {
  it('converts a full person to form values', () => {
    const form = personToForm(alice)
    expect(form).toEqual({
      name: 'Alice',
      role: 'Engineer',
      discipline: 'Engineering',
      team: 'Platform',
      otherTeams: 'Infra, SRE',
      managerId: 'm1',
      status: 'Active',
      employmentType: 'FTE',
      level: '5',
      pod: 'Backend',
      publicNote: 'Leads backend',
      privateNote: 'Promo candidate',
      private: true,
    })
  })

  it('handles missing optional fields', () => {
    const minimal: Person = {
      id: '3',
      name: 'Charlie',
      role: '',
      discipline: '',
      managerId: '',
      team: '',
      additionalTeams: [],
      status: 'Open',
    }
    const form = personToForm(minimal)
    expect(form.employmentType).toBe('FTE')
    expect(form.level).toBe('0')
    expect(form.pod).toBe('')
    expect(form.publicNote).toBe('')
    expect(form.privateNote).toBe('')
    expect(form.private).toBe(false)
    expect(form.otherTeams).toBe('')
  })
})

describe('batchToForm', () => {
  it('returns blankForm for empty array', () => {
    expect(batchToForm([])).toEqual(blankForm())
  })

  it('shows common values when all match', () => {
    const clone = { ...bob, id: '2b', name: 'Bob2' }
    const form = batchToForm([bob, clone])
    expect(form.role).toBe('Engineer')
    expect(form.discipline).toBe('Engineering')
    expect(form.team).toBe('Platform')
    expect(form.name).toBe('') // never set in batch
  })

  it('uses MIXED_VALUE when values differ', () => {
    const form = batchToForm([alice, bob])
    expect(form.employmentType).toBe('__mixed__')
    expect(form.pod).toBe('__mixed__')
    expect(form.level).toBe('__mixed__')
    // Same values should not be mixed
    expect(form.role).toBe('Engineer')
    expect(form.discipline).toBe('Engineering')
  })

  it('uses MIXED_VALUE for differing private', () => {
    const form = batchToForm([alice, bob])
    expect(form.private).toBe(false) // mixed → defaults to false
  })
})

describe('blankForm', () => {
  it('returns a fresh blank form with defaults', () => {
    const form = blankForm()
    expect(form.name).toBe('')
    expect(form.status).toBe('Active')
    expect(form.employmentType).toBe('FTE')
    expect(form.level).toBe('0')
    expect(form.private).toBe(false)
  })

  it('returns a new object each call', () => {
    expect(blankForm()).not.toBe(blankForm())
  })
})

describe('computeDirtyFields', () => {
  it('returns null when nothing changed', () => {
    const form = personToForm(alice)
    expect(computeDirtyFields(form, { ...form })).toBeNull()
  })

  it('returns only changed fields', () => {
    const original = personToForm(alice)
    const edited = { ...original, name: 'Alice 2', level: '6' }
    const dirty = computeDirtyFields(original, edited)
    expect(dirty).toEqual({ name: 'Alice 2', level: '6' })
  })

  it('detects boolean changes', () => {
    const original = personToForm(alice)
    const edited = { ...original, private: false }
    const dirty = computeDirtyFields(original, edited)
    expect(dirty).toEqual({ private: false })
  })
})

describe('dirtyToApiPayload', () => {
  it('skips managerId', () => {
    const payload = dirtyToApiPayload({ managerId: 'new-mgr', name: 'New Name' })
    expect(payload).toEqual({ name: 'New Name' })
    expect('managerId' in payload).toBe(false)
  })

  it('renames otherTeams to additionalTeams', () => {
    const payload = dirtyToApiPayload({ otherTeams: 'A, B' })
    expect(payload).toEqual({ additionalTeams: 'A, B' })
    expect('otherTeams' in payload).toBe(false)
  })

  it('coerces level to number', () => {
    const payload = dirtyToApiPayload({ level: '7' })
    expect(payload).toEqual({ level: 7 })
  })

  it('coerces invalid level to 0', () => {
    const payload = dirtyToApiPayload({ level: 'abc' })
    expect(payload).toEqual({ level: 0 })
  })

  it('passes through other fields as-is', () => {
    const payload = dirtyToApiPayload({
      name: 'X',
      role: 'Y',
      private: true,
      status: 'Open',
    })
    expect(payload).toEqual({
      name: 'X',
      role: 'Y',
      private: true,
      status: 'Open',
    })
  })
})

describe('batchDirtyToApiPayload', () => {
  const form = personToForm(alice)

  it('converts touched fields to API payload', () => {
    const touched = new Set(['role', 'discipline'])
    const payload = batchDirtyToApiPayload(touched, form, false)
    expect(payload).toEqual({ role: 'Engineer', discipline: 'Engineering' })
  })

  it('skips managerId and team when managerChanged', () => {
    const touched = new Set(['managerId', 'team', 'role'])
    const payload = batchDirtyToApiPayload(touched, form, true)
    expect(payload).toEqual({ role: 'Engineer' })
  })

  it('includes managerId and team when manager not changed', () => {
    const touched = new Set(['managerId', 'team'])
    const payload = batchDirtyToApiPayload(touched, form, false)
    expect(payload.team).toBe('Platform')
  })

  it('skips MIXED_VALUE fields', () => {
    const mixedForm = { ...form, role: '__mixed__' }
    const touched = new Set(['role', 'discipline'])
    const payload = batchDirtyToApiPayload(touched, mixedForm, false)
    expect(payload).toEqual({ discipline: 'Engineering' })
  })

  it('handles private field separately', () => {
    const touched = new Set(['private', 'role'])
    const payload = batchDirtyToApiPayload(touched, { ...form, private: true }, false)
    expect(payload).toEqual({ role: 'Engineer', private: true })
  })

  it('renames otherTeams to additionalTeams', () => {
    const touched = new Set(['otherTeams'])
    const payload = batchDirtyToApiPayload(touched, form, false)
    expect(payload).toEqual({ additionalTeams: 'Infra, SRE' })
  })

  it('coerces level to number', () => {
    const touched = new Set(['level'])
    const payload = batchDirtyToApiPayload(touched, form, false)
    expect(payload).toEqual({ level: 5 })
  })
})
