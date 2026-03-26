import type { Person } from './api/types'

export function normalizeHTML(html: string): string {
  return html
    .replace(/\s*style="[^"]*"/g, '')
    .replace(/\s+/g, ' ')
    .replace(/> </g, '>\n<')
    .trim()
}

export function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: 'default-id',
    name: 'Default Person',
    role: 'Engineer',
    discipline: 'Engineering',
    managerId: '',
    team: 'Platform',
    additionalTeams: [],
    status: 'Active',
    ...overrides,
  }
}
