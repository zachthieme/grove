// Scenarios: UI-002
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { axe } from 'vitest-axe'
import PersonNode from './PersonNode'
import { makePerson } from '../test-helpers'

afterEach(() => cleanup())

describe('PersonNode a11y', () => {
  it('has no axe violations for active person', async () => {
    const person = makePerson({ name: 'Alice', role: 'Engineer', status: 'Active' })
    const { container } = render(
      <PersonNode person={person} selected={false} onClick={() => {}} />
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no axe violations when selected', async () => {
    const person = makePerson({ name: 'Alice', role: 'Engineer', status: 'Active' })
    const { container } = render(
      <PersonNode person={person} selected={true} onClick={() => {}} />
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no axe violations for recruiting status', async () => {
    const person = makePerson({ name: 'Open Req', role: 'Engineer', status: 'Open' })
    const { container } = render(
      <PersonNode person={person} selected={false} onClick={() => {}} />
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no axe violations with warning', async () => {
    const person = makePerson({ name: 'Alice', role: 'Engineer', warning: 'Missing manager' })
    const { container } = render(
      <PersonNode person={person} selected={false} onClick={() => {}} />
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no axe violations with notes', async () => {
    const person = makePerson({ name: 'Alice', role: 'Engineer', publicNote: 'Team lead candidate' })
    const { container } = render(
      <PersonNode person={person} selected={false} onClick={() => {}} />
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
