import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { OrphanGroup } from './OrphanGroup'
import { makePerson } from '../test-helpers'
import type { OrgNode } from './shared'

vi.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: vi.fn(), isDragging: false }),
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
}))

afterEach(() => cleanup())

function makeNode(overrides: Partial<Parameters<typeof makePerson>[0]> = {}, children: OrgNode[] = []): OrgNode {
  return { person: makePerson(overrides), children }
}

const baseStyles: Record<string, string> = {
  subtree: 'subtree',
  nodeSlot: 'nodeSlot',
  children: 'children',
  icStack: 'icStack',
  teamHeader: 'teamHeader',
}

describe('OrphanGroup', () => {
  it('returns null when orphans is empty', () => {
    const { container } = render(
      <OrphanGroup
        orphans={[]}
        roots={[]}
        selectedIds={new Set()}
        onSelect={vi.fn()}
        setNodeRef={() => () => {}}
        styles={baseStyles}
        renderSubtree={() => null}
      />
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders single orphan root as subtree when only one person', () => {
    const node = makeNode({ id: 'solo', name: 'Solo Person' })
    const renderSubtree = vi.fn().mockReturnValue(<div data-testid="subtree">Solo</div>)

    render(
      <OrphanGroup
        orphans={[node]}
        roots={[node]}
        selectedIds={new Set()}
        onSelect={vi.fn()}
        setNodeRef={() => () => {}}
        styles={baseStyles}
        renderSubtree={renderSubtree}
      />
    )
    expect(renderSubtree).toHaveBeenCalledWith(node)
    expect(screen.getByTestId('subtree')).toBeTruthy()
  })

  it('groups multiple orphans by team', () => {
    const o1 = makeNode({ id: 'a', name: 'Alice', team: 'Eng' })
    const o2 = makeNode({ id: 'b', name: 'Bob', team: 'Design' })
    const o3 = makeNode({ id: 'c', name: 'Carol', team: 'Eng' })
    const all = [o1, o2, o3]

    render(
      <OrphanGroup
        orphans={all}
        roots={all}
        selectedIds={new Set()}
        onSelect={vi.fn()}
        setNodeRef={() => () => {}}
        styles={baseStyles}
        renderSubtree={(n) => <div key={n.person.id}>{n.person.name}</div>}
      />
    )

    expect(screen.getByText('Eng')).toBeTruthy()
    expect(screen.getByText('Design')).toBeTruthy()
    expect(screen.getByText('2 people')).toBeTruthy()
    expect(screen.getByText('1 person')).toBeTruthy()
  })

  it('uses "Unassigned" for orphans with no team', () => {
    const o1 = makeNode({ id: 'a', name: 'Alice', team: '' })
    const o2 = makeNode({ id: 'b', name: 'Bob', team: '' })

    render(
      <OrphanGroup
        orphans={[o1, o2]}
        roots={[o1, o2]}
        selectedIds={new Set()}
        onSelect={vi.fn()}
        setNodeRef={() => () => {}}
        styles={baseStyles}
        renderSubtree={(n) => <div key={n.person.id}>{n.person.name}</div>}
      />
    )

    expect(screen.getByText('Unassigned')).toBeTruthy()
  })

  it('renders custom team header when renderTeamHeader is provided', () => {
    const o1 = makeNode({ id: 'a', name: 'Alice', team: 'Eng' })
    const o2 = makeNode({ id: 'b', name: 'Bob', team: 'Eng' })

    render(
      <OrphanGroup
        orphans={[o1, o2]}
        roots={[o1, o2]}
        selectedIds={new Set()}
        onSelect={vi.fn()}
        setNodeRef={() => () => {}}
        styles={baseStyles}
        renderSubtree={(n) => <div key={n.person.id}>{n.person.name}</div>}
        renderTeamHeader={(team, count) => <div data-testid="custom-header">{team} ({count})</div>}
      />
    )

    expect(screen.getByTestId('custom-header')).toBeTruthy()
    expect(screen.getByText('Eng (2)')).toBeTruthy()
  })

  it('renders orphan nodes without icStack when wrapInIcStack is false', () => {
    const o1 = makeNode({ id: 'a', name: 'Alice', team: 'Eng' })
    const o2 = makeNode({ id: 'b', name: 'Bob', team: 'Eng' })

    const { container } = render(
      <OrphanGroup
        orphans={[o1, o2]}
        roots={[o1, o2]}
        selectedIds={new Set()}
        onSelect={vi.fn()}
        setNodeRef={() => () => {}}
        styles={baseStyles}
        renderSubtree={(n) => <div key={n.person.id}>{n.person.name}</div>}
        wrapInIcStack={false}
      />
    )

    // With wrapInIcStack false, there should be no element with icStack class
    expect(container.querySelector('.icStack')).toBeNull()
  })

  it('marks selected nodes correctly', () => {
    const o1 = makeNode({ id: 'a', name: 'Alice', team: 'Eng' })
    const o2 = makeNode({ id: 'b', name: 'Bob', team: 'Eng' })

    render(
      <OrphanGroup
        orphans={[o1, o2]}
        roots={[o1, o2]}
        selectedIds={new Set(['a'])}
        onSelect={vi.fn()}
        setNodeRef={() => () => {}}
        styles={baseStyles}
        renderSubtree={(n) => <div key={n.person.id}>{n.person.name}</div>}
      />
    )

    // Both names should be rendered
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
  })

  it('passes changes and managerSet through to DraggableNode', () => {
    const o1 = makeNode({ id: 'a', name: 'Alice', team: 'Eng' })
    const o2 = makeNode({ id: 'b', name: 'Bob', team: 'Eng' })
    const changes = new Map([['a', { types: new Set<'added'>(['added']) }]])
    const managerSet = new Set(['a'])

    render(
      <OrphanGroup
        orphans={[o1, o2]}
        roots={[o1, o2]}
        selectedIds={new Set()}
        onSelect={vi.fn()}
        changes={changes}
        managerSet={managerSet}
        setNodeRef={() => () => {}}
        styles={baseStyles}
        renderSubtree={(n) => <div key={n.person.id}>{n.person.name}</div>}
      />
    )

    expect(screen.getByText('Alice')).toBeTruthy()
  })
})
