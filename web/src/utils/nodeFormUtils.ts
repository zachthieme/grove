import type { OrgNode, OrgNodeUpdatePayload } from '../api/types'
import { MIXED_VALUE } from '../constants'

/** Unified form values for both inline and sidebar editing of an OrgNode. */
export interface NodeFormValues {
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
  type: string
}

export function blankForm(): NodeFormValues {
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
    type: 'person',
  }
}

export function nodeToForm(p: OrgNode): NodeFormValues {
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
    type: p.type || 'person',
  }
}

export function batchToForm(people: OrgNode[]): NodeFormValues {
  if (people.length === 0) return blankForm()
  const first = people[0]
  const teamsStr = (p: OrgNode) => (p.additionalTeams || []).join(', ')
  const m = (test: (p: OrgNode) => boolean, val: string) =>
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
    type: m(p => (p.type || 'person') === (first.type || 'person'), first.type || 'person'),
  }
}

/**
 * Compare two form value snapshots and return only the fields that changed.
 * Returns null if nothing changed.
 */
export function computeDirtyFields(
  original: NodeFormValues,
  current: NodeFormValues,
): Record<string, string | boolean | number> | null {
  const dirty: Record<string, string | boolean | number> = {}
  for (const key of Object.keys(original) as (keyof NodeFormValues)[]) {
    if (current[key] !== original[key]) {
      dirty[key] = current[key]
    }
  }
  return Object.keys(dirty).length > 0 ? dirty : null
}

/**
 * Convert dirty form fields into a OrgNodeUpdatePayload suitable for the API.
 * Handles the otherTeams -> additionalTeams rename and level -> number coercion.
 * Skips managerId (reparent is a separate API call).
 */
export function dirtyToApiPayload(
  dirty: Record<string, string | boolean | number>,
): OrgNodeUpdatePayload {
  const fields: OrgNodeUpdatePayload = {}
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
 * Convert a batch edit's touched fields into a OrgNodeUpdatePayload.
 * Similar to dirtyToApiPayload but works with a Set of touched field names
 * and a form that may contain MIXED_VALUE sentinels (which are skipped).
 * Skips managerId and team when managerChanged (reparent handles those).
 * Handles the private boolean field separately.
 */
export function batchDirtyToApiPayload(
  touched: Set<string>,
  form: NodeFormValues,
  managerChanged: boolean,
): OrgNodeUpdatePayload {
  const fields: OrgNodeUpdatePayload = {}
  for (const key of touched) {
    if (managerChanged && (key === 'managerId' || key === 'team')) continue
    if (key === 'private') continue
    const val = form[key as keyof NodeFormValues]
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
