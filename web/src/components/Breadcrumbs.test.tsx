import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Breadcrumbs from './Breadcrumbs'
import { makePerson, renderWithOrg } from '../test-helpers'

describe('Breadcrumbs', () => {
  afterEach(() => cleanup())

  it('[UI-009] calls setHead(null) when "All" button is clicked', async () => {
    const user = userEvent.setup()
    const setHeadFn = vi.fn()
    renderWithOrg(<Breadcrumbs />, {
      setHead: setHeadFn,
      headPersonId: 'p1',
      working: [makePerson({ id: 'p1', name: 'Alice' })],
    })
    await user.click(screen.getByText('All'))
    expect(setHeadFn).toHaveBeenCalledWith(null)
  })

  it('[UI-009] calls setHead with ancestor id when ancestor button is clicked', async () => {
    const user = userEvent.setup()
    const setHeadFn = vi.fn()
    renderWithOrg(<Breadcrumbs />, {
      setHead: setHeadFn,
      headPersonId: 'p3',
      working: [
        makePerson({ id: 'p1', name: 'CEO', managerId: '' }),
        makePerson({ id: 'p2', name: 'VP', managerId: 'p1' }),
        makePerson({ id: 'p3', name: 'Director', managerId: 'p2' }),
      ],
    })
    await user.click(screen.getByRole('button', { name: 'CEO' }))
    expect(setHeadFn).toHaveBeenCalledWith('p1')
  })
})
