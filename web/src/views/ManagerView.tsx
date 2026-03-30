// Scenarios: VIEW-002
import { useMemo } from 'react'
import type { Person, Pod } from '../api/types'
import type { ChartEdge } from '../hooks/useChartLayout'
import type { EditBuffer } from '../store/useInteractionState'
import { isRecruitingStatus, isPlannedStatus, isTransferStatus } from '../constants'
import { useChart } from './ChartContext'
import { DraggableNode, type OrgNode } from './shared'
import ChartShell from './ChartShell'
import styles from './ManagerView.module.css'


function computeManagerEdges(_people: Person[], roots: OrgNode[]): ChartEdge[] {
  const result: ChartEdge[] = []
  function collectEdges(nodes: OrgNode[]) {
    for (const n of nodes) {
      for (const child of n.children) {
        if (child.children.length > 0) {
          result.push({ fromId: n.person.id, toId: child.person.id })
        }
      }
      collectEdges(n.children)
    }
  }
  collectEdges(roots)
  return result
}

/** Build summary groups from a list of people, bucketing by status. */
function buildStatusGroups(people: Person[]): { label: string; count: number }[] {
  const groups: { label: string; count: number }[] = []

  const active = people.filter((p) => p.status === 'Active')
  if (active.length > 0) {
    const byDiscipline = new Map<string, number>()
    for (const p of active) {
      const d = p.discipline || 'Other'
      byDiscipline.set(d, (byDiscipline.get(d) || 0) + 1)
    }
    for (const [discipline, count] of byDiscipline) {
      groups.push({ label: discipline, count })
    }
  }

  const recruiting = people.filter((p) => isRecruitingStatus(p.status))
  if (recruiting.length > 0) {
    groups.push({ label: 'Recruiting', count: recruiting.length })
  }

  const planned = people.filter((p) => isPlannedStatus(p.status))
  if (planned.length > 0) {
    groups.push({ label: 'Planned', count: planned.length })
  }

  const transfers = people.filter((p) => isTransferStatus(p.status))
  if (transfers.length > 0) {
    groups.push({ label: 'Transfers', count: transfers.length })
  }

  return groups
}

function SummaryCard({ people, podName, publicNote, podId, onPodClick }: {
  people: Person[]
  podName?: string
  publicNote?: string
  podId?: string
  onPodClick?: (podId: string) => void
}) {
  const groups = buildStatusGroups(people)

  if (groups.length === 0 && !podName) return null

  const isClickable = podId && onPodClick

  return (
    <div
      className={`${styles.summaryCard}${isClickable ? ` ${styles.summaryCardClickable}` : ''}`}
      onClick={isClickable ? () => onPodClick(podId) : undefined}
    >
      {podName && <div className={styles.podCardHeader}>{podName}</div>}
      {publicNote && (
        <div className={styles.podCardNote}>
          {publicNote.length > 50 ? publicNote.slice(0, 47) + '...' : publicNote}
        </div>
      )}
      {groups.map((g) => (
        <div key={g.label} className={styles.summaryRow}>
          <span className={styles.summaryLabel}>{g.label}</span>
          <span className={styles.summaryValue}>{g.count}</span>
        </div>
      ))}
    </div>
  )
}

function ManagerSubtree({ node }: { node: OrgNode }) {
  const { selectedIds, onSelect, changes, managerSet, pods, interactionMode, editingPersonId, editBuffer, onAddReport, onAddParent, onDeletePerson, onInfo, onFocus, onEditMode, onPodSelect, onEnterEditing, onUpdateBuffer, setNodeRef, collapsedIds, onToggleCollapse } = useChart()
  const subManagers = node.children.filter((c) => c.children.length > 0)
  const ics = node.children.filter((c) => c.children.length === 0)

  const { unpoddedICs, icPodGroups } = useMemo(() => {
    if (ics.length === 0) return { unpoddedICs: [] as Person[], icPodGroups: [] as { team: string; people: Person[]; pod: Pod | undefined }[] }
    const unpodded: Person[] = []
    const podOrder: string[] = []
    const podMap = new Map<string, Person[]>()
    for (const ic of ics) {
      const podName = ic.person.pod
      if (!podName) {
        unpodded.push(ic.person)
        continue
      }
      if (!podMap.has(podName)) {
        podOrder.push(podName)
        podMap.set(podName, [])
      }
      podMap.get(podName)!.push(ic.person)
    }
    podOrder.sort((a, b) => a.localeCompare(b))
    return {
      unpoddedICs: unpodded,
      icPodGroups: podOrder.map((podName) => ({
        team: podName,
        people: podMap.get(podName)!,
        pod: pods?.find((p) => p.managerId === node.person.id && p.name === podName),
      })),
    }
  }, [ics, pods, node.person.id])

  const isCollapsed = collapsedIds?.has(node.person.id) ?? false
  const isNodeEditing = interactionMode === 'editing' && editingPersonId === node.person.id

  return (
    <div className={styles.subtree}>
      <div className={styles.nodeSlot}>
        <DraggableNode
          person={node.person}
          selected={selectedIds.has(node.person.id)}
          changes={changes?.get(node.person.id)}
          showTeam={node.children.length > 0 || !!managerSet?.has(node.person.id)}
          isManager={managerSet?.has(node.person.id)}
          collapsed={node.children.length > 0 ? isCollapsed : undefined}
          editing={isNodeEditing}
          editBuffer={isNodeEditing ? editBuffer : null}
          focusField={isNodeEditing ? 'name' : null}
          onAdd={onAddReport ? () => onAddReport(node.person.id) : undefined}
          onAddParent={onAddParent ? () => onAddParent(node.person.id) : undefined}
          onDelete={onDeletePerson ? () => onDeletePerson(node.person.id) : undefined}
          onInfo={onInfo ? () => onInfo(node.person.id) : undefined}
          onFocus={onFocus && managerSet?.has(node.person.id) ? () => onFocus(node.person.id) : undefined}
          onEditMode={onEditMode ? () => onEditMode(node.person.id) : undefined}
          onToggleCollapse={node.children.length > 0 && onToggleCollapse ? () => onToggleCollapse(node.person.id) : undefined}
          onSelect={(e) => onSelect(node.person.id, e)}
          onEnterEditing={onEnterEditing ? () => onEnterEditing(node.person) : undefined}
          onUpdateBuffer={onUpdateBuffer ? (field: string, value: string) => onUpdateBuffer(field as keyof EditBuffer, value) : undefined}
          nodeRef={setNodeRef(node.person.id)}
        />
      </div>

      {node.children.length > 0 && !isCollapsed && (
        <div className={styles.children}>
          {subManagers.map((child) => (
            <ManagerSubtree key={child.person.id} node={child} />
          ))}
          {unpoddedICs.length > 0 && icPodGroups.length === 0 ? (
            <SummaryCard people={unpoddedICs} />
          ) : (
            <>
              {unpoddedICs.length > 0 && (
                <SummaryCard people={unpoddedICs} />
              )}
              {icPodGroups.map((group) => (
                <SummaryCard
                  key={group.team}
                  people={group.people}
                  podName={group.pod?.name}
                  publicNote={group.pod?.publicNote}
                  podId={group.pod?.id}
                  onPodClick={onPodSelect}
                />
              ))}
            </>
          )}
        </div>
      )}
      {node.children.length > 0 && isCollapsed && (
        <div className={styles.collapsedCount}>{node.children.length} report{node.children.length !== 1 ? 's' : ''}</div>
      )}
    </div>
  )
}

export default function ManagerView() {
  return (
    <ChartShell
      computeEdges={computeManagerEdges}
      renderSubtree={(node) => <ManagerSubtree key={node.person.id} node={node} />}
      viewStyles={styles}
      wrapOrphansInIcStack={false}
    />
  )
}
