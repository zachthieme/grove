import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { normalizeHTML, makePerson } from '../test-helpers'
import PersonNode from './PersonNode'

describe('PersonNode golden', () => {
  afterEach(() => cleanup())

  it('default active person', () => {
    const { container } = render(
      <PersonNode person={makePerson({ name: 'Alice Smith', role: 'Software Engineer', team: 'Platform' })} />
    )
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/person-node-default.golden')
  })

  it('isManager=true', () => {
    const { container } = render(
      <PersonNode person={makePerson()} isManager={true} />
    )
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/person-node-manager.golden')
  })

  it('isManager=false', () => {
    const { container } = render(
      <PersonNode person={makePerson()} isManager={false} />
    )
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/person-node-not-manager.golden')
  })

  it('employmentType CW shows abbreviation', () => {
    const { container } = render(
      <PersonNode person={makePerson({ employmentType: 'CW' })} />
    )
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/person-node-cw.golden')
  })

  it('employmentType FTE shows no abbreviation', () => {
    const { container } = render(
      <PersonNode person={makePerson({ employmentType: 'FTE' })} />
    )
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/person-node-fte.golden')
  })

  it('warning present', () => {
    const { container } = render(
      <PersonNode person={makePerson({ warning: 'Missing manager' })} />
    )
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/person-node-warning.golden')
  })

  it('status Open', () => {
    const { container } = render(
      <PersonNode person={makePerson({ status: 'Open', name: 'Open Req' })} />
    )
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/person-node-open.golden')
  })

  it('status Backfill', () => {
    const { container } = render(
      <PersonNode person={makePerson({ status: 'Backfill', name: 'Backfill Req' })} />
    )
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/person-node-backfill.golden')
  })

  it('status Planned', () => {
    const { container } = render(
      <PersonNode person={makePerson({ status: 'Planned', name: 'Planned Req' })} />
    )
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/person-node-planned.golden')
  })

  it('status Transfer In', () => {
    const { container } = render(
      <PersonNode person={makePerson({ status: 'Transfer In', name: 'Transfer Incoming' })} />
    )
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/person-node-transfer-in.golden')
  })

  it('status Transfer Out', () => {
    const { container } = render(
      <PersonNode person={makePerson({ status: 'Transfer Out', name: 'Transfer Outgoing' })} />
    )
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/person-node-transfer-out.golden')
  })

  it('ghost=true', () => {
    const { container } = render(
      <PersonNode person={makePerson()} ghost={true} />
    )
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/person-node-ghost.golden')
  })

  it('ghost=false', () => {
    const { container } = render(
      <PersonNode person={makePerson()} ghost={false} />
    )
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/person-node-no-ghost.golden')
  })

  it('publicNote present', () => {
    const { container } = render(
      <PersonNode person={makePerson({ publicNote: 'Some important note' })} />
    )
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/person-node-public-note.golden')
  })

  it('no notes', () => {
    const { container } = render(
      <PersonNode person={makePerson()} />
    )
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/person-node-no-notes.golden')
  })
})
