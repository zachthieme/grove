import type { PersonChange } from '../hooks/useOrgDiff'
import type { OrgNode } from './shared'
import PersonNode from '../components/PersonNode'

interface OrphanGroupProps {
  orphans: OrgNode[]
  roots: OrgNode[]
  selectedIds: Set<string>
  onSelect: (id: string, event?: React.MouseEvent) => void
  changes?: Map<string, PersonChange>
  setNodeRef: (id: string) => (el: HTMLDivElement | null) => void
  managerSet?: Set<string>
  onAddReport?: (id: string) => void
  onDeletePerson?: (id: string) => void
  onInfo?: (id: string) => void
  styles: Record<string, string>
  renderSubtree: (node: OrgNode) => React.ReactNode
  renderTeamHeader?: (team: string, memberCount: number, options?: { collapsed?: boolean; onToggleCollapse?: () => void }) => React.ReactNode
  wrapInIcStack?: boolean
  collapsedIds?: Set<string>
  onToggleCollapse?: (id: string) => void
}

export function OrphanGroup({
  orphans, roots, selectedIds, onSelect, changes, setNodeRef,
  managerSet, onAddReport, onDeletePerson, onInfo,
  styles, renderSubtree, renderTeamHeader, wrapInIcStack = true,
  collapsedIds, onToggleCollapse,
}: OrphanGroupProps) {
  if (orphans.length === 0) return null

  const renderOrphanNode = (child: OrgNode) => (
    <div key={child.person.id} className={styles.nodeSlot}>
      <PersonNode
        person={child.person}
        selected={selectedIds.has(child.person.id)}
        changes={changes?.get(child.person.id)}
        isManager={managerSet?.has(child.person.id)}
        onAdd={onAddReport ? () => onAddReport(child.person.id) : undefined}
        onDelete={onDeletePerson ? () => onDeletePerson(child.person.id) : undefined}
        onInfo={onInfo ? () => onInfo(child.person.id) : undefined}
        onClick={(e) => onSelect(child.person.id, e)}
        cardRef={setNodeRef(child.person.id)}
      />
    </div>
  )

  // Single orphan root (likely the only person) — render as normal subtree
  if (orphans.length === 1 && roots.length === 1) {
    return <>{renderSubtree(orphans[0])}</>
  }

  // Group orphans by team
  const teamOrder: string[] = []
  const teamMap = new Map<string, OrgNode[]>()
  for (const o of orphans) {
    const team = o.person.team || 'Unassigned'
    if (!teamMap.has(team)) {
      teamOrder.push(team)
      teamMap.set(team, [])
    }
    teamMap.get(team)!.push(o)
  }

  return (
    <>
      {teamOrder.map((team) => {
        const members = teamMap.get(team)!
        const collapseKey = `orphan:${team}`
        const isCollapsed = collapsedIds?.has(collapseKey) ?? false
        return (
          <div key={`orphan-${team}`} className={styles.subtree}>
            <div className={styles.nodeSlot}>
              {renderTeamHeader ? renderTeamHeader(team, members.length, {
                collapsed: isCollapsed,
                onToggleCollapse: onToggleCollapse ? () => onToggleCollapse(collapseKey) : undefined,
              }) : (
                <div className={styles.teamHeader}>
                  <strong>{team}</strong>
                  <div style={{ opacity: 0.6, fontSize: 11 }}>
                    {members.length} {members.length === 1 ? 'person' : 'people'}
                  </div>
                </div>
              )}
            </div>
            {!isCollapsed && (
              <div className={styles.children}>
                {wrapInIcStack ? (
                  <div className={styles.icStack}>
                    {members.map((child) => renderOrphanNode(child))}
                  </div>
                ) : (
                  members.map((child) => renderOrphanNode(child))
                )}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}
