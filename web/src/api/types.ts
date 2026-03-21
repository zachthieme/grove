export interface Person {
  id: string
  name: string
  role: string
  discipline: string
  managerId: string
  team: string
  additionalTeams: string[]
  status: 'Active' | 'Hiring' | 'Open' | 'Transfer'
  newRole?: string
  newTeam?: string
}

export interface OrgData {
  original: Person[]
  working: Person[]
}

export interface MovePayload {
  personId: string
  newManagerId: string
  newTeam: string
}

export interface UpdatePayload {
  personId: string
  fields: Record<string, string>
}

export interface DeletePayload {
  personId: string
}
