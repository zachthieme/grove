// Scenarios: UI-001
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { axe } from 'vitest-axe'
import Toolbar from './Toolbar'
import { makePerson, renderWithOrg } from '../test-helpers'

afterEach(() => cleanup())

describe('Toolbar a11y', () => {
  it('has no axe violations when data loaded', async () => {
    const alice = makePerson({ id: 'alice-001', name: 'Alice' })
    const { container } = renderWithOrg(
      <Toolbar
        onExportPng={vi.fn()}
        onExportSvg={vi.fn()}
        exporting={false}
        hasSnapshots={false}
        onExportAllSnapshots={vi.fn()}
        loggingEnabled={false}
        onToggleLogs={vi.fn()}
        logPanelOpen={false}
      />,
      { working: [alice], original: [alice], loaded: true },
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no axe violations in empty state', async () => {
    const { container } = renderWithOrg(
      <Toolbar
        onExportPng={vi.fn()}
        onExportSvg={vi.fn()}
        exporting={false}
        hasSnapshots={false}
        onExportAllSnapshots={vi.fn()}
        loggingEnabled={false}
        onToggleLogs={vi.fn()}
        logPanelOpen={false}
      />,
      { loaded: false },
    )
    // Exclude landmark-no-duplicate-banner: test renders <header> in isolation,
    // but the test document may already have a banner landmark from the environment
    const results = await axe(container, { rules: { 'landmark-no-duplicate-banner': { enabled: false } } })
    expect(results).toHaveNoViolations()
  })
})
