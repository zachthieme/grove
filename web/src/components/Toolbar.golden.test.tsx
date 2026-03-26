import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import Toolbar from './Toolbar'
import { normalizeHTML, makePerson, renderWithOrg } from '../test-helpers'

vi.mock('../api/client', () => ({
  exportDataUrl: (fmt: string) => `/api/export?format=${fmt}`,
}))

describe('Toolbar golden', () => {
  afterEach(() => cleanup())

  it('loaded=true default', () => {
    const { container } = renderWithOrg(<Toolbar />, {
      loaded: true,
      working: [makePerson()],
      viewMode: 'detail',
      dataView: 'working',
      currentSnapshotName: null,
    })
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/toolbar-loaded-default.golden')
  })

  it('loaded=false (no view/data pills)', () => {
    const { container } = renderWithOrg(<Toolbar />, {
      loaded: false,
      working: [makePerson()],
    })
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/toolbar-not-loaded.golden')
  })

  it('exporting=true', () => {
    const { container } = renderWithOrg(<Toolbar exporting />, {
      loaded: true,
      working: [makePerson()],
      viewMode: 'detail',
      dataView: 'working',
      currentSnapshotName: null,
    })
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/toolbar-exporting.golden')
  })

  it('loggingEnabled=true', () => {
    const { container } = renderWithOrg(<Toolbar loggingEnabled />, {
      loaded: true,
      working: [makePerson()],
      viewMode: 'detail',
      dataView: 'working',
      currentSnapshotName: null,
    })
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/toolbar-logging-enabled.golden')
  })
})
