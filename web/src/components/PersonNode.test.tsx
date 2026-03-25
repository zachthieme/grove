import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import PersonNode from './PersonNode'
import type { Person } from '../api/types'

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: '1',
    name: 'Alice Smith',
    role: 'Software Engineer',
    discipline: 'Engineering',
    managerId: '',
    team: 'Platform',
    additionalTeams: [],
    status: 'Active',
    ...overrides,
  }
}

describe('PersonNode', () => {
  afterEach(() => cleanup())

  it('renders name and role', () => {
    render(<PersonNode person={makePerson()} />)
    expect(screen.getByText('Alice Smith')).toBeDefined()
    expect(screen.getByText('Software Engineer')).toBeDefined()
  })

  it('shows manager accent bar when isManager is true', () => {
    const { container } = render(
      <PersonNode person={makePerson()} isManager={true} />
    )
    const node = container.querySelector('[class*="manager"]')
    expect(node).not.toBeNull()
  })

  it('does not show manager accent bar when isManager is false', () => {
    const { container } = render(
      <PersonNode person={makePerson()} isManager={false} />
    )
    const node = container.querySelector('[class*="manager"]')
    expect(node).toBeNull()
  })

  it('shows employment type abbreviation for non-FTE types', () => {
    render(<PersonNode person={makePerson({ employmentType: 'CW' })} />)
    expect(screen.getByText((_, el) => el?.textContent === 'Software Engineer \u00b7 CW')).toBeDefined()
  })

  it('does not show employment type abbreviation for FTE', () => {
    const { container } = render(
      <PersonNode person={makePerson({ employmentType: 'FTE' })} />
    )
    const abbrev = container.querySelector('[class*="empAbbrev"]')
    expect(abbrev).toBeNull()
  })

  it('shows warning indicator when person has warning', () => {
    render(<PersonNode person={makePerson({ warning: 'Missing manager' })} />)
    const warning = screen.getByTitle('Missing manager')
    expect(warning).toBeDefined()
    expect(warning.textContent).toBe('\u26A0')
  })

  it('does not show warning indicator when no warning', () => {
    const { container } = render(
      <PersonNode person={makePerson({ warning: '' })} />
    )
    const warning = container.querySelector('[class*="warningDot"]')
    expect(warning).toBeNull()
  })

  it('shows blue circle prefix for Open status', () => {
    render(<PersonNode person={makePerson({ status: 'Open' })} />)
    expect(screen.getByText(/\u{1F535}/u)).toBeDefined()
  })

  it('shows blue circle prefix for Backfill status', () => {
    render(<PersonNode person={makePerson({ status: 'Backfill' })} />)
    expect(screen.getByText(/\u{1F535}/u)).toBeDefined()
  })

  it('shows white square prefix for Planned status', () => {
    render(<PersonNode person={makePerson({ status: 'Planned' })} />)
    expect(screen.getByText(/\u{2B1C}/u)).toBeDefined()
  })

  it('shows yellow circle prefix for Transfer In status', () => {
    render(<PersonNode person={makePerson({ status: 'Transfer In' })} />)
    expect(screen.getByText(/\u{1F7E1}/u)).toBeDefined()
  })

  it('shows yellow circle prefix for Transfer Out status', () => {
    render(<PersonNode person={makePerson({ status: 'Transfer Out' })} />)
    expect(screen.getByText(/\u{1F7E1}/u)).toBeDefined()
  })

  it('applies ghost styling when ghost is true', () => {
    const { container } = render(
      <PersonNode person={makePerson()} ghost={true} />
    )
    const node = container.querySelector('[class*="ghost"]')
    expect(node).not.toBeNull()
  })

  it('does not apply ghost styling when ghost is false', () => {
    const { container } = render(
      <PersonNode person={makePerson()} ghost={false} />
    )
    const node = container.querySelector('[class*="ghost"]')
    expect(node).toBeNull()
  })

  it('shows truncated public note when present', () => {
    const longNote = 'This is a very long public note that exceeds sixty characters in total length'
    render(<PersonNode person={makePerson({ publicNote: longNote })} />)
    expect(screen.getByText(longNote.slice(0, 57) + '...')).toBeDefined()
  })

  it('does not show note line when publicNote is empty', () => {
    const { container } = render(
      <PersonNode person={makePerson()} />
    )
    const note = container.querySelector('[class*="notePreview"]')
    expect(note).toBeNull()
  })
})
