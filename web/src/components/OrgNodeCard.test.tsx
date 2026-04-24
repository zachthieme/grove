// Scenarios: UI-002, CREATE-003, CREATE-005
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeNode } from '../test-helpers'
import OrgNodeCard from './OrgNodeCard'

afterEach(() => cleanup())

describe('OrgNodeCard behavior', () => {
  it('click calls onClick', async () => {
    const onClick = vi.fn()
    render(<OrgNodeCard person={makeNode()} onClick={onClick} />)
    await userEvent.click(screen.getByTestId('person-Default Person'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('Enter key calls onClick', async () => {
    const onClick = vi.fn()
    render(<OrgNodeCard person={makeNode()} onClick={onClick} />)
    screen.getByTestId('person-Default Person').focus()
    await userEvent.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('Space key calls onClick', async () => {
    const onClick = vi.fn()
    render(<OrgNodeCard person={makeNode()} onClick={onClick} />)
    screen.getByTestId('person-Default Person').focus()
    await userEvent.keyboard(' ')
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('hover shows action buttons, unhover hides them', async () => {
    const user = userEvent.setup()
    render(
      <OrgNodeCard person={makeNode()} onDelete={vi.fn()} onClick={vi.fn()} />,
    )
    const card = screen.getByTestId('person-Default Person')
    expect(screen.queryByLabelText('Delete')).toBeNull()

    await user.hover(card)
    expect(screen.getByLabelText('Delete')).toBeTruthy()

    await user.unhover(card)
    expect(screen.queryByLabelText('Delete')).toBeNull()
  })

  it('ghost mode suppresses action buttons even on hover', async () => {
    const user = userEvent.setup()
    render(
      <OrgNodeCard person={makeNode()} ghost onDelete={vi.fn()} />,
    )
    await user.hover(screen.getByTestId('person-Default Person'))
    expect(screen.queryByLabelText('Delete')).toBeNull()
  })

  it('warning dot renders with correct aria-label', () => {
    render(<OrgNodeCard person={makeNode({ warning: 'Span too wide' })} />)
    expect(screen.getByLabelText('Warning: Span too wide')).toBeTruthy()
  })

  it('no warning means no warning dot', () => {
    render(<OrgNodeCard person={makeNode()} />)
    expect(screen.queryByLabelText(/Warning/)).toBeNull()
  })

  it('private icon renders when private=true', () => {
    render(<OrgNodeCard person={makeNode({ private: true })} />)
    expect(screen.getByLabelText('Private')).toBeTruthy()
  })

  it('private icon hidden for placeholder people', () => {
    const person = { ...makeNode({ private: true }), isPlaceholder: true }
    render(<OrgNodeCard person={person} />)
    expect(screen.queryByLabelText('Private')).toBeNull()
  })

  it('note toggle: click shows note panel, click again hides', async () => {
    render(<OrgNodeCard person={makeNode({ publicNote: 'Hello' })} />)
    const btn = screen.getByLabelText('Toggle notes')

    await userEvent.click(btn)
    expect(screen.getByText('Hello')).toBeTruthy()

    await userEvent.click(btn)
    expect(screen.queryByText('Hello')).toBeNull()
  })

  it('note button aria-expanded reflects state', async () => {
    render(<OrgNodeCard person={makeNode({ publicNote: 'Note' })} />)
    const btn = screen.getByLabelText('Toggle notes')
    expect(btn.getAttribute('aria-expanded')).toBe('false')

    await userEvent.click(btn)
    expect(btn.getAttribute('aria-expanded')).toBe('true')

    await userEvent.click(btn)
    expect(btn.getAttribute('aria-expanded')).toBe('false')
  })

  it('no publicNote means no note button', () => {
    render(<OrgNodeCard person={makeNode()} />)
    expect(screen.queryByLabelText('Toggle notes')).toBeNull()
  })

  it('showTeam shows team name', () => {
    render(<OrgNodeCard person={makeNode({ team: 'Infra' })} showTeam />)
    expect(screen.getByText('Infra')).toBeTruthy()
  })

  it('no role shows TBD', () => {
    render(<OrgNodeCard person={makeNode({ role: '' })} />)
    expect(screen.getByText('TBD')).toBeTruthy()
  })

  describe('employment type abbreviations', () => {
    it('CW shows CW', () => {
      render(<OrgNodeCard person={makeNode({ employmentType: 'CW' })} />)
      expect(screen.getByText(/CW/)).toBeTruthy()
    })

    it('PSP shows PSP', () => {
      render(<OrgNodeCard person={makeNode({ employmentType: 'PSP' })} />)
      expect(screen.getByText(/PSP/)).toBeTruthy()
    })

    it('Evergreen shows EVG', () => {
      render(<OrgNodeCard person={makeNode({ employmentType: 'Evergreen' })} />)
      expect(screen.getByText(/EVG/)).toBeTruthy()
    })

    it('FTE shows nothing', () => {
      const { container } = render(
        <OrgNodeCard person={makeNode({ employmentType: 'FTE' })} />,
      )
      expect(container.textContent).not.toContain('FTE')
    })

    it('Intern shows Intern', () => {
      render(<OrgNodeCard person={makeNode({ employmentType: 'Intern' })} />)
      expect(screen.getByText(/Intern/)).toBeTruthy()
    })

    it('unknown type shows first 3 chars uppercase', () => {
      render(<OrgNodeCard person={makeNode({ employmentType: 'vendor' })} />)
      expect(screen.getByText(/VEN/)).toBeTruthy()
    })
  })

  it('data-selected attribute reflects selected prop', () => {
    const { rerender } = render(
      <OrgNodeCard person={makeNode()} selected={false} />,
    )
    const node = screen.getByTestId('person-Default Person')
    expect(node.dataset.selected).toBe('false')

    rerender(<OrgNodeCard person={makeNode()} selected />)
    expect(node.dataset.selected).toBe('true')
  })

  // Scenarios: CREATE-005
  describe('[CREATE-005] "+" button on leaf/IC nodes', () => {
    it('[CREATE-005] shows "Add direct report" button on hover when onAdd is provided', async () => {
      const user = userEvent.setup()
      const onAdd = vi.fn()
      render(
        <OrgNodeCard person={makeNode({ managerId: 'some-manager' })} onAdd={onAdd} onClick={vi.fn()} />,
      )
      await user.hover(screen.getByTestId('person-Default Person'))
      expect(screen.getByLabelText('Add direct report')).toBeTruthy()
    })

    it('[CREATE-005] clicking "+" on a leaf node calls onAdd', async () => {
      const user = userEvent.setup()
      const onAdd = vi.fn()
      render(
        <OrgNodeCard person={makeNode({ managerId: 'some-manager' })} onAdd={onAdd} onClick={vi.fn()} />,
      )
      await user.hover(screen.getByTestId('person-Default Person'))
      // fireEvent avoids pointer-move side effects that would trigger mouseLeave on the wrapper
      fireEvent.click(screen.getByLabelText('Add direct report'))
      expect(onAdd).toHaveBeenCalledTimes(1)
    })

    it('[CREATE-005] does not show "+" button when onAdd is not provided', async () => {
      const user = userEvent.setup()
      render(
        <OrgNodeCard person={makeNode()} onDelete={vi.fn()} onClick={vi.fn()} />,
      )
      await user.hover(screen.getByTestId('person-Default Person'))
      expect(screen.queryByLabelText('Add direct report')).toBeNull()
    })
  })

  // Scenarios: CREATE-003
  describe('[CREATE-003] onAddParent / "Add manager above" button visibility', () => {
    it('[CREATE-003] shows "Add manager above" button on hover when onAddParent is provided', async () => {
      const user = userEvent.setup()
      const onAddParent = vi.fn()
      render(
        <OrgNodeCard person={makeNode()} onAddParent={onAddParent} onClick={vi.fn()} />,
      )
      await user.hover(screen.getByTestId('person-Default Person'))
      expect(screen.getByLabelText('Add manager above')).toBeTruthy()
    })

    it('[CREATE-003] does not show "Add manager above" button when onAddParent is not provided', async () => {
      const user = userEvent.setup()
      render(
        <OrgNodeCard person={makeNode()} onDelete={vi.fn()} onClick={vi.fn()} />,
      )
      await user.hover(screen.getByTestId('person-Default Person'))
      expect(screen.queryByLabelText('Add manager above')).toBeNull()
    })
  })

  // Scenarios: UI-002
  describe('error and edge states', () => {
    it('renders with empty role showing TBD and no employment abbreviation', () => {
      const { container } = render(
        <OrgNodeCard person={makeNode({ role: '', employmentType: '' })} />,
      )
      expect(screen.getByText('TBD')).toBeTruthy()
      // No employment abbreviation rendered for empty type
      expect(container.textContent).not.toContain('\u00b7')
    })

    it('renders gracefully with empty name', () => {
      render(<OrgNodeCard person={makeNode({ name: '' })} />)
      expect(screen.getByTestId('person-')).toBeTruthy()
    })
  })

  // Scenarios: PROD-001
  describe('[PROD-001] product card rendering', () => {
    it('[PROD-001] product card does not show TBD for empty role', () => {
      render(
        <OrgNodeCard person={makeNode({ type: 'product', role: '' })} />,
      )
      // Product cards don't show role section at all, so TBD should not appear
      expect(screen.queryByText('TBD')).toBeNull()
    })

    it('[PROD-001] product card shows non-active status', () => {
      render(
        <OrgNodeCard person={makeNode({ type: 'product', status: 'Deprecated' as any })} />,
      )
      // Product cards show status text when not Active
      expect(screen.getByText('Deprecated')).toBeTruthy()
    })
  })
})
