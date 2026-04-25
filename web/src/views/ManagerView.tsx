// Scenarios: VIEW-002
import { memo, useCallback, type ReactNode } from 'react'
import type { OrgNode } from '../api/types'
import type { ChartEdge } from '../hooks/useChartLayout'
import { isRecruitingStatus, isPlannedStatus, isTransferStatus, isProduct } from '../constants'
import { useChart } from './ChartContext'
import { useNodeProps } from '../hooks/useNodeProps'
import { assertNever } from '../utils/assertNever'
import { type TreeNode } from './shared'
import { computeLayoutTree, type LayoutNode, type ManagerLayout, type PodGroupLayout, type TeamGroupLayout, type ProductGroupLayout } from './layoutTree'
import OrgNodeCard from '../components/OrgNodeCard'
import ChartShell from './ChartShell'
import styles from './ManagerView.module.css'


function computeManagerEdges(_people: OrgNode[], _roots: TreeNode[], layoutRoots?: LayoutNode[]): ChartEdge[] {
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
function buildStatusGroups(people: OrgNode[]): { label: string; count: number }[] {
  const nonProducts = people.filter((p) => !isProduct(p))
  const productCount = people.length - nonProducts.length
  const groups: { label: string; count: number }[] = []

  const active = nonProducts.filter((p) => p.status === 'Active')
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

  const recruiting = nonProducts.filter((p) => isRecruitingStatus(p.status))
  if (recruiting.length > 0) {
    groups.push({ label: 'Recruiting', count: recruiting.length })
  }

  const planned = nonProducts.filter((p) => isPlannedStatus(p.status))
  if (planned.length > 0) {
    groups.push({ label: 'Planned', count: planned.length })
  }

  const transfers = nonProducts.filter((p) => isTransferStatus(p.status))
  if (transfers.length > 0) {
    groups.push({ label: 'Transfers', count: transfers.length })
  }

  if (productCount > 0) {
    groups.push({ label: 'Products', count: productCount })
  }

  return groups
}

function SummaryCard({ people, podName, publicNote, onClick }: {
  people: OrgNode[]
  podName?: string
  publicNote?: string
  onClick?: () => void
}) {
  const groups = buildStatusGroups(people)

  if (groups.length === 0 && !podName) return null

  return (
    <div
      className={`${styles.summaryCard}${onClick ? ` ${styles.summaryCardClickable}` : ''}`}
      onClick={onClick}
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
  const { pods, onSelect } = useChart()
  const pod = pods?.find((p) => p.managerId === group.managerId && p.name === group.podName)
  // Include any products nested in the pod so buildStatusGroups picks them up
  // and surfaces the productCount alongside discipline counts.
  const people = [
    ...group.members.map((m) => m.person),
    ...(group.products ?? []).map((p) => p.person),
  ]

  return (
    <SummaryCard
      people={people}
      podName={group.podName}
      publicNote={pod?.publicNote}
      onClick={() => onSelect(group.collapseKey)}
    />
  )
}

const ManagerLayoutSubtree = memo(function ManagerLayoutSubtree({ node }: { node: ManagerLayout }) {
  const { collapsedIds, onToggleCollapse } = useChart()
  const managerProps = useNodeProps(node.person)

  const isCollapsed = collapsedIds?.has(node.collapseKey) ?? false

  // Collect children by type
  const managers: ManagerLayout[] = []
  const unpoddedPeople: OrgNode[] = []
  const podGroups: PodGroupLayout[] = []
  const teamGroups: TeamGroupLayout[] = []
  const productGroupLayouts: ProductGroupLayout[] = []
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
      case 'productGroup':
        productGroupLayouts.push(child)
        break
      case 'product':
        unpoddedPeople.push(child.person)
        break
      default:
        assertNever(child, 'ManagerView bucket: unhandled LayoutNode variant')
    }
  }

  return (
    <div className={styles.subtree}>
      <div className={styles.nodeSlot}>
        <OrgNodeCard
          person={node.person}
          showTeam={node.children.length > 0 || !!managerProps.isManager}
          collapsed={node.children.length > 0 ? isCollapsed : undefined}
          onToggleCollapse={node.children.length > 0 && onToggleCollapse ? () => onToggleCollapse(node.collapseKey) : undefined}
          {...managerProps}
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
          {productGroupLayouts.map((group) => (
            <SummaryCard key={group.collapseKey} people={group.members.map(m => m.person)} podName="Products" />
          ))}
        </div>
      )}
      {node.children.length > 0 && isCollapsed && (
        <div className={styles.collapsedCount}>{node.children.length} report{node.children.length !== 1 ? 's' : ''}</div>
      )}
    </div>
  )
})

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
      case 'productGroup':
        return (
          <div key={node.collapseKey} className={styles.subtree}>
            <SummaryCard people={node.members.map(m => m.person)} podName="Products" />
          </div>
        )
      case 'ic':
      case 'podGroup':
      case 'product':
        return null
      default:
        return assertNever(node, 'ManagerView renderLayoutNode: unhandled root variant')
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
