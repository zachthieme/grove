// Scenarios: VIEW-002
import { useCallback, type ReactNode } from 'react'
import type { Person } from '../api/types'
import type { ChartEdge } from '../hooks/useChartLayout'
import type { EditBuffer } from '../store/useInteractionState'
import { isRecruitingStatus, isPlannedStatus, isTransferStatus } from '../constants'
import { useChart } from './ChartContext'
import { type OrgNode } from './shared'
import { computeLayoutTree, type LayoutNode, type ManagerLayout, type PodGroupLayout, type TeamGroupLayout } from './layoutTree'
import PersonNode from '../components/PersonNode'
import ChartShell from './ChartShell'
import styles from './ManagerView.module.css'


function computeManagerEdges(_people: Person[], _roots: OrgNode[], layoutRoots?: LayoutNode[]): ChartEdge[] {
  if (!layoutRoots) return []
  const result: ChartEdge[] = []
  function walk(node: LayoutNode) {
    if (node.type !== 'manager') return
    for (const child of node.children) {
      if (child.type === 'manager') {
        result.push({ fromId: node.person.id, toId: child.person.id })
        walk(child)
      }
    }
  }
  for (const root of layoutRoots) walk(root)
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

function PodSummaryCard({ group }: { group: PodGroupLayout }) {
  const { pods, onPodSelect } = useChart()
  const pod = pods?.find((p) => p.managerId === group.managerId && p.name === group.podName)
  const people = group.members.map((m) => m.person)

  return (
    <SummaryCard
      people={people}
      podName={group.podName}
      publicNote={pod?.publicNote}
      podId={pod?.id}
      onPodClick={onPodSelect}
    />
  )
}

function ManagerLayoutSubtree({ node }: { node: ManagerLayout }) {
  const { selectedIds, onSelect, changes, managerSet, interactionMode, editingPersonId, editBuffer, onAddReport, onAddParent, onDeletePerson, onInfo, onFocus, onEditMode, onEnterEditing, onUpdateBuffer, onCommitEdits, setNodeRef, collapsedIds, onToggleCollapse } = useChart()

  const isCollapsed = collapsedIds?.has(node.collapseKey) ?? false
  const isNodeEditing = interactionMode === 'editing' && editingPersonId === node.person.id

  // Collect children by type
  const managers: ManagerLayout[] = []
  const unpoddedPeople: Person[] = []
  const podGroups: PodGroupLayout[] = []
  const teamGroups: TeamGroupLayout[] = []
  for (const child of node.children) {
    switch (child.type) {
      case 'manager':
        managers.push(child)
        break
      case 'ic':
        unpoddedPeople.push(child.person)
        break
      case 'podGroup':
        podGroups.push(child)
        break
      case 'teamGroup':
        teamGroups.push(child)
        break
      default:
        break
    }
  }

  return (
    <div className={styles.subtree}>
      <div className={styles.nodeSlot}>
        <PersonNode
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
          onToggleCollapse={node.children.length > 0 && onToggleCollapse ? () => onToggleCollapse(node.collapseKey) : undefined}
          onClick={(e) => onSelect(node.person.id, e)}
          onEnterEditing={onEnterEditing ? () => onEnterEditing(node.person) : undefined}
          onUpdateBuffer={onUpdateBuffer ? (field: string, value: string) => onUpdateBuffer(field as keyof EditBuffer, value) : undefined}
          onCommitEdits={onCommitEdits}
          cardRef={setNodeRef(node.person.id)}
        />
      </div>

      {node.children.length > 0 && !isCollapsed && (
        <div className={styles.children}>
          {managers.map((child) => (
            <ManagerLayoutSubtree key={child.person.id} node={child} />
          ))}
          {unpoddedPeople.length > 0 && (
            <SummaryCard people={unpoddedPeople} />
          )}
          {podGroups.map((group) => (
            <PodSummaryCard key={group.collapseKey} group={group} />
          ))}
          {teamGroups.map((group) => (
            <SummaryCard key={group.collapseKey} people={group.members.map(m => m.person)} podName={group.teamName} />
          ))}
        </div>
      )}
      {node.children.length > 0 && isCollapsed && (
        <div className={styles.collapsedCount}>{node.children.length} report{node.children.length !== 1 ? 's' : ''}</div>
      )}
    </div>
  )
}

export default function ManagerView() {
  const renderLayoutNode = useCallback((node: LayoutNode): ReactNode => {
    switch (node.type) {
      case 'manager':
        return <ManagerLayoutSubtree key={node.person.id} node={node} />
      case 'teamGroup':
        return (
          <div key={node.collapseKey} className={styles.subtree}>
            <SummaryCard people={node.members.map(m => m.person)} podName={node.teamName} />
          </div>
        )
      default:
        return null
    }
  }, [])

  return (
    <ChartShell
      computeEdges={computeManagerEdges}
      computeLayout={computeLayoutTree}
      renderLayoutNode={renderLayoutNode}
    />
  )
}
