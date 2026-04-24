import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { normalizeHTML, makeNode } from '../test-helpers'
import OrgNodeCard from './OrgNodeCard'

describe('OrgNodeCard golden', () => {
  afterEach(() => cleanup())

  it('default active person', () => {
    const { container } = render(
      <OrgNodeCard person={makeNode({ name: 'Alice Smith', role: 'Software Engineer', team: 'Platform' })} />
    )
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/person-node-default.golden')
  })

  it('isManager=true', () => {
    const { container } = render(
      <OrgNodeCard person={makeNode()} isManager={true} />
    )
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/person-node-manager.golden')
  })

  it('isManager=false', () => {
    const { container } = render(
      <OrgNodeCard person={makeNode()} isManager={false} />
    )
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/person-node-not-manager.golden')
  })

  it('employmentType CW shows abbreviation', () => {
    const { container } = render(
      <OrgNodeCard person={makeNode({ employmentType: 'CW' })} />
    )
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/person-node-cw.golden')
  })

  it('employmentType FTE shows no abbreviation', () => {
    const { container } = render(
      <OrgNodeCard person={makeNode({ employmentType: 'FTE' })} />
    )
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/person-node-fte.golden')
  })

  it('warning present', () => {
    const { container } = render(
      <OrgNodeCard person={makeNode({ warning: 'Missing manager' })} />
    )
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/person-node-warning.golden')
  })

  it('status Open', () => {
    const { container } = render(
      <OrgNodeCard person={makeNode({ status: 'Open', name: 'Open Req' })} />
    )
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/person-node-open.golden')
  })

  it('status Backfill', () => {
    const { container } = render(
      <OrgNodeCard person={makeNode({ status: 'Backfill', name: 'Backfill Req' })} />
    )
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/person-node-backfill.golden')
  })

  it('status Planned', () => {
    const { container } = render(
      <OrgNodeCard person={makeNode({ status: 'Planned', name: 'Planned Req' })} />
    )
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/person-node-planned.golden')
  })

  it('status Transfer In', () => {
    const { container } = render(
      <OrgNodeCard person={makeNode({ status: 'Transfer In', name: 'Transfer Incoming' })} />
    )
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/person-node-transfer-in.golden')
  })

  it('status Transfer Out', () => {
    const { container } = render(
      <OrgNodeCard person={makeNode({ status: 'Transfer Out', name: 'Transfer Outgoing' })} />
    )
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/person-node-transfer-out.golden')
  })

  it('ghost=true', () => {
    const { container } = render(
      <OrgNodeCard person={makeNode()} ghost={true} />
    )
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/person-node-ghost.golden')
  })

  it('ghost=false', () => {
    const { container } = render(
      <OrgNodeCard person={makeNode()} ghost={false} />
    )
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/person-node-no-ghost.golden')
  })

  it('publicNote present', () => {
    const { container } = render(
      <OrgNodeCard person={makeNode({ publicNote: 'Some important note' })} />
    )
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/person-node-public-note.golden')
  })

  it('no notes', () => {
    const { container } = render(
      <OrgNodeCard person={makeNode()} />
    )
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/person-node-no-notes.golden')
  })
})
