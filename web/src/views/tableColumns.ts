import type { Person } from '../api/types'

export type CellType = 'text' | 'number' | 'dropdown' | 'checkbox'

export interface ColumnDef {
  key: string
  label: string
  cellType: CellType
  width?: string
}

export function getPersonValue(person: Person, key: string): string {
  switch (key) {
    case 'level': return person.level ? String(person.level) : ''
    case 'additionalTeams': return (person.additionalTeams ?? []).join(', ')
    case 'private': return person.private ? 'true' : 'false'
    default: return (person as unknown as Record<string, unknown>)[key] as string ?? ''
  }
}

export const TABLE_COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Name', cellType: 'text', width: '160px' },
  { key: 'role', label: 'Role', cellType: 'text', width: '140px' },
  { key: 'discipline', label: 'Discipline', cellType: 'text', width: '120px' },
  { key: 'team', label: 'Team', cellType: 'text', width: '120px' },
  { key: 'pod', label: 'Pod', cellType: 'text', width: '120px' },
  { key: 'managerId', label: 'Manager', cellType: 'dropdown', width: '150px' },
  { key: 'status', label: 'Status', cellType: 'dropdown', width: '120px' },
  { key: 'employmentType', label: 'Emp Type', cellType: 'text', width: '90px' },
  { key: 'level', label: 'Level', cellType: 'number', width: '70px' },
  { key: 'publicNote', label: 'Public Note', cellType: 'text', width: '180px' },
  { key: 'privateNote', label: 'Private Note', cellType: 'text', width: '180px' },
  { key: 'additionalTeams', label: 'Additional Teams', cellType: 'text', width: '150px' },
  { key: 'private', label: 'Private', cellType: 'checkbox', width: '70px' },
]
