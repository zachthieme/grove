import type { Person, PersonUpdatePayload } from '../api/types'
import { MIXED_VALUE } from '../constants'

/** Unified form values for both inline and sidebar editing of a Person. */
export interface PersonFormValues {
  name: string
  role: string
  discipline: string
  team: string
  otherTeams: string
  managerId: string
  status: string
  employmentType: string
  level: string
  pod: string
  publicNote: string
  privateNote: string
  private: boolean
}

export function blankForm(): PersonFormValues {
  return {
    name: '',
    role: '',
    discipline: '',
    team: '',
    otherTeams: '',
    managerId: '',
    status: 'Active',
    employmentType: 'FTE',
    level: '0',
    pod: '',
    publicNote: '',
    privateNote: '',
    private: false,
  }
}

export function personToForm(p: Person): PersonFormValues {
  return {
    name: p.name,
    role: p.role,
    discipline: p.discipline,
    team: p.team,
    otherTeams: (p.additionalTeams || []).join(', '),
    managerId: p.managerId,
    status: p.status,
    employmentType: p.employmentType || 'FTE',
    level: String(p.level ?? 0),
    pod: p.pod ?? '',
    publicNote: p.publicNote ?? '',
    privateNote: p.privateNote ?? '',
    private: p.private ?? false,
  }
}

export function batchToForm(people: Person[]): PersonFormValues {
  if (people.length === 0) return blankForm()
  const first = people[0]
  const teamsStr = (p: Person) => (p.additionalTeams || []).join(', ')
  const m = (test: (p: Person) => boolean, val: string) =>
    people.every(test) ? val : MIXED_VALUE
  return {
    name: '',
    role: m(p => p.role === first.role, first.role),
    discipline: m(p => p.discipline === first.discipline, first.discipline),
    team: m(p => p.team === first.team, first.team),
    otherTeams: m(p => teamsStr(p) === teamsStr(first), teamsStr(first)),
    managerId: m(p => p.managerId === first.managerId, first.managerId),
    status: m(p => p.status === first.status, first.status),
    employmentType: m(
      p => (p.employmentType || 'FTE') === (first.employmentType || 'FTE'),
      first.employmentType || 'FTE',
    ),
    level: m(
      p => (p.level ?? 0) === (first.level ?? 0),
      String(first.level ?? 0),
    ),
    pod: m(p => (p.pod ?? '') === (first.pod ?? ''), first.pod ?? ''),
    publicNote: m(
      p => (p.publicNote ?? '') === (first.publicNote ?? ''),
      first.publicNote ?? '',
    ),
    privateNote: m(
      p => (p.privateNote ?? '') === (first.privateNote ?? ''),
      first.privateNote ?? '',
    ),
    private: people.every(
      p => (p.private ?? false) === (first.private ?? false),
    )
      ? (first.private ?? false)
      : false,
  }
}

/**
 * Compare two form value snapshots and return only the fields that changed.
 * Returns null if nothing changed.
 */
export function computeDirtyFields(
  original: PersonFormValues,
  current: PersonFormValues,
): Record<string, string | boolean | number> | null {
  const dirty: Record<string, string | boolean | number> = {}
  for (const key of Object.keys(original) as (keyof PersonFormValues)[]) {
    if (current[key] !== original[key]) {
      dirty[key] = current[key]
    }
  }
  return Object.keys(dirty).length > 0 ? dirty : null
}

/**
 * Convert dirty form fields into a PersonUpdatePayload suitable for the API.
 * Handles the otherTeams -> additionalTeams rename and level -> number coercion.
 * Skips managerId (reparent is a separate API call).
 */
export function dirtyToApiPayload(
  dirty: Record<string, string | boolean | number>,
): PersonUpdatePayload {
  const fields: PersonUpdatePayload = {}
  for (const [key, val] of Object.entries(dirty)) {
    if (key === 'managerId') continue
    if (key === 'otherTeams') {
      fields.additionalTeams = val as string
    } else if (key === 'level') {
      fields.level = parseInt(String(val), 10) || 0
    } else {
      ;(fields as Record<string, unknown>)[key] = val
    }
  }
  return fields
}

/**
 * Convert a batch edit's touched fields into a PersonUpdatePayload.
 * Similar to dirtyToApiPayload but works with a Set of touched field names
 * and a form that may contain MIXED_VALUE sentinels (which are skipped).
 * Skips managerId and team when managerChanged (reparent handles those).
 * Handles the private boolean field separately.
 */
export function batchDirtyToApiPayload(
  touched: Set<string>,
  form: PersonFormValues,
  managerChanged: boolean,
): PersonUpdatePayload {
  const fields: PersonUpdatePayload = {}
  for (const key of touched) {
    if (managerChanged && (key === 'managerId' || key === 'team')) continue
    if (key === 'private') continue
    const val = form[key as keyof PersonFormValues]
    if (val === MIXED_VALUE) continue
    const apiKey = key === 'otherTeams' ? 'additionalTeams' : key
    if (apiKey === 'level') {
      ;(fields as Record<string, string | number>)[apiKey] = parseInt(String(val), 10) || 0
    } else {
      ;(fields as Record<string, string>)[apiKey] = String(val)
    }
  }
  if (touched.has('private')) {
    fields.private = form.private
  }
  return fields
}
