// Scenarios: UI-002
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makePerson } from '../test-helpers'
import PersonNode from './PersonNode'

afterEach(() => cleanup())

describe('PersonNode behavior', () => {
  it('click calls onClick', async () => {
    const onClick = vi.fn()
    render(<PersonNode person={makePerson()} onClick={onClick} />)
    await userEvent.click(screen.getByTestId('person-Default Person'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('Enter key calls onClick', async () => {
    const onClick = vi.fn()
    render(<PersonNode person={makePerson()} onClick={onClick} />)
    screen.getByTestId('person-Default Person').focus()
    await userEvent.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('Space key calls onClick', async () => {
    const onClick = vi.fn()
    render(<PersonNode person={makePerson()} onClick={onClick} />)
    screen.getByTestId('person-Default Person').focus()
    await userEvent.keyboard(' ')
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('hover shows action buttons, unhover hides them', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <PersonNode person={makePerson()} onDelete={vi.fn()} onClick={vi.fn()} />,
    )
    const wrapper = container.firstElementChild!
    expect(screen.queryByLabelText('Delete')).toBeNull()

    await user.hover(wrapper)
    expect(screen.getByLabelText('Delete')).toBeTruthy()

    await user.unhover(wrapper)
    expect(screen.queryByLabelText('Delete')).toBeNull()
  })

  it('ghost mode suppresses action buttons even on hover', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <PersonNode person={makePerson()} ghost onDelete={vi.fn()} />,
    )
    await user.hover(container.firstElementChild!)
    expect(screen.queryByLabelText('Delete')).toBeNull()
  })

  it('warning dot renders with correct aria-label', () => {
    render(<PersonNode person={makePerson({ warning: 'Span too wide' })} />)
    expect(screen.getByLabelText('Warning: Span too wide')).toBeTruthy()
  })

  it('no warning means no warning dot', () => {
    render(<PersonNode person={makePerson()} />)
    expect(screen.queryByLabelText(/Warning/)).toBeNull()
  })

  it('private icon renders when private=true', () => {
    render(<PersonNode person={makePerson({ private: true })} />)
    expect(screen.getByLabelText('Private')).toBeTruthy()
  })

  it('private icon hidden for placeholder people', () => {
    const person = { ...makePerson({ private: true }), isPlaceholder: true }
    render(<PersonNode person={person} />)
    expect(screen.queryByLabelText('Private')).toBeNull()
  })

  it('note toggle: click shows note panel, click again hides', async () => {
    render(<PersonNode person={makePerson({ publicNote: 'Hello' })} />)
    const btn = screen.getByLabelText('Toggle notes')

    await userEvent.click(btn)
    expect(screen.getByText('Hello')).toBeTruthy()

    await userEvent.click(btn)
    expect(screen.queryByText('Hello')).toBeNull()
  })

  it('note button aria-expanded reflects state', async () => {
    render(<PersonNode person={makePerson({ publicNote: 'Note' })} />)
    const btn = screen.getByLabelText('Toggle notes')
    expect(btn.getAttribute('aria-expanded')).toBe('false')

    await userEvent.click(btn)
    expect(btn.getAttribute('aria-expanded')).toBe('true')

    await userEvent.click(btn)
    expect(btn.getAttribute('aria-expanded')).toBe('false')
  })

  it('no publicNote means no note button', () => {
    render(<PersonNode person={makePerson()} />)
    expect(screen.queryByLabelText('Toggle notes')).toBeNull()
  })

  it('showTeam shows team name', () => {
    render(<PersonNode person={makePerson({ team: 'Infra' })} showTeam />)
    expect(screen.getByText('Infra')).toBeTruthy()
  })

  it('no role shows TBD', () => {
    render(<PersonNode person={makePerson({ role: '' })} />)
    expect(screen.getByText('TBD')).toBeTruthy()
  })

  describe('employment type abbreviations', () => {
    it('CW shows CW', () => {
      render(<PersonNode person={makePerson({ employmentType: 'CW' })} />)
      expect(screen.getByText(/CW/)).toBeTruthy()
    })

    it('PSP shows PSP', () => {
      render(<PersonNode person={makePerson({ employmentType: 'PSP' })} />)
      expect(screen.getByText(/PSP/)).toBeTruthy()
    })

    it('Evergreen shows EVG', () => {
      render(<PersonNode person={makePerson({ employmentType: 'Evergreen' })} />)
      expect(screen.getByText(/EVG/)).toBeTruthy()
    })

    it('FTE shows nothing', () => {
      const { container } = render(
        <PersonNode person={makePerson({ employmentType: 'FTE' })} />,
      )
      expect(container.textContent).not.toContain('FTE')
    })

    it('Intern shows Intern', () => {
      render(<PersonNode person={makePerson({ employmentType: 'Intern' })} />)
      expect(screen.getByText(/Intern/)).toBeTruthy()
    })

    it('unknown type shows first 3 chars uppercase', () => {
      render(<PersonNode person={makePerson({ employmentType: 'vendor' })} />)
      expect(screen.getByText(/VEN/)).toBeTruthy()
    })
  })

  it('data-selected attribute reflects selected prop', () => {
    const { rerender } = render(
      <PersonNode person={makePerson()} selected={false} />,
    )
    const node = screen.getByTestId('person-Default Person')
    expect(node.dataset.selected).toBe('false')

    rerender(<PersonNode person={makePerson()} selected />)
    expect(node.dataset.selected).toBe('true')
  })

  // Scenarios: UI-002
  describe('error and edge states', () => {
    it('renders with empty role showing TBD and no employment abbreviation', () => {
      const { container } = render(
        <PersonNode person={makePerson({ role: '', employmentType: '' })} />,
      )
      expect(screen.getByText('TBD')).toBeTruthy()
      // No employment abbreviation rendered for empty type
      expect(container.textContent).not.toContain('\u00b7')
    })

    it('renders gracefully with empty name', () => {
      render(<PersonNode person={makePerson({ name: '' })} />)
      expect(screen.getByTestId('person-')).toBeTruthy()
    })
  })
})
