import { memo, useMemo, useCallback, type ReactNode } from 'react'
import type { Pod } from '../api/types'
import { computeEdges } from './columnEdges'
import { computeLayoutTree, type LayoutNode, type ManagerLayout, type ICLayout, type PodGroupLayout, type TeamGroupLayout, type ProductGroupLayout, type ProductLayout } from './layoutTree'
import OrgNodeCard from '../components/OrgNodeCard'
import GroupHeaderNode from '../components/GroupHeaderNode'
import { useChartActions, useChartData } from './ChartContext'
import { useIsSelected, useIsCollapsed } from './chartSelectors'
import { useNodeProps } from '../hooks/useNodeProps'
import { assertNever } from '../utils/assertNever'
import ChartShell from './ChartShell'
import styles from './ColumnView.module.css'

const ICNode = memo(function ICNode({ ic }: { ic: ICLayout }) {
  const props = useNodeProps(ic.person)
  return (
    <div className={styles.nodeSlot}>
      <OrgNodeCard person={ic.person} {...props} />
    </div>
  )
})

const ProductNode = memo(function ProductNode({ product }: { product: ProductLayout }) {
  const props = useNodeProps(product.person)
  return (
    <div className={styles.nodeSlot}>
      <OrgNodeCard person={product.person} {...props} />
    </div>
  )
})

const LayoutSubtree = memo(function LayoutSubtree({ node }: { node: ManagerLayout }) {
  const { onAddToTeam, onAddProduct, onSelect, setNodeRef, onToggleCollapse } = useChartActions()
  const { pods, selectedIds, collapsedIds } = useChartData()
  const isCollapsed = useIsCollapsed(node.collapseKey)

  const findPod = (managerId: string, podName: string): Pod | undefined =>
    pods?.find((p) => p.managerId === managerId && p.name === podName)

  const renderPodGroup = useCallback((group: PodGroupLayout) => {
    const pod = findPod(group.managerId, group.podName)
    const podCollapsed = collapsedIds?.has(group.collapseKey) ?? false
    const podProducts = group.products ?? []
    const dragMemberIds = [
      ...group.members.map((m) => m.person.id),
      ...podProducts.map((p) => p.person.id),
    ]
    return (
      <div key={group.collapseKey} className={styles.subtree}>
        <div className={styles.nodeSlot}>
          <GroupHeaderNode
            nodeId={group.collapseKey}
            name={group.podName}
            count={group.members.length || undefined}
            noteText={pod?.publicNote}
            onAdd={onAddToTeam ? () => onAddToTeam(group.managerId, pod?.team ?? group.podName, group.podName) : undefined}
            onAddProduct={onAddProduct ? () => onAddProduct(group.managerId, pod?.team ?? group.podName, group.podName) : undefined}
            onClick={(e) => onSelect(group.collapseKey, e)}
            selected={selectedIds.has(group.collapseKey)}
            cardRef={setNodeRef(group.collapseKey)}
            droppableId={group.collapseKey}
            collapsed={podCollapsed}
            onToggleCollapse={onToggleCollapse ? () => onToggleCollapse(group.collapseKey) : undefined}
            dragData={{ memberIds: dragMemberIds }}
          />
        </div>
        {!podCollapsed && (
          <div className={styles.children}>
            {group.members.length > 0 && (
              <div className={styles.icStack}>
                {group.members.map((ic) => <ICNode key={ic.person.id} ic={ic} />)}
              </div>
            )}
            {podProducts.length > 0 && (
              <div className={styles.icStack}>
                {podProducts.map((p) => <ProductNode key={p.person.id} product={p} />)}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }, [pods, selectedIds, onAddToTeam, onAddProduct, onSelect, setNodeRef, collapsedIds, onToggleCollapse])

  // Build child elements by iterating node.children and switching on type
  const childElements = useMemo((): ReactNode[] => {
    if (node.children.length === 0) return []

    const elements: ReactNode[] = []
    let icBatch: ICLayout[] = []

    const flushIcBatch = () => {
      if (icBatch.length === 0) return
      elements.push(
        <div key={`ic-stack-${icBatch[0].person.id}`} className={styles.icStack}>
          {icBatch.map((ic) => <ICNode key={ic.person.id} ic={ic} />)}
        </div>
      )
      icBatch = []
    }

    for (const child of node.children) {
      switch (child.type) {
        case 'manager':
          flushIcBatch()
          elements.push(
            <LayoutSubtree key={child.person.id} node={child} />
          )
          break
        case 'ic':
          if (child.affiliation !== 'local') {
            flushIcBatch()
            elements.push(<ICNode key={child.person.id} ic={child} />)
          } else {
            icBatch.push(child)
          }
          break
        case 'podGroup':
          flushIcBatch()
          elements.push(renderPodGroup(child))
          break
        case 'teamGroup':
          flushIcBatch()
          elements.push(<LayoutTeamGroup key={child.collapseKey} group={child} />)
          break
        case 'productGroup':
          flushIcBatch()
          elements.push(<LayoutProductGroup key={child.collapseKey} group={child} />)
          break
        case 'product':
          flushIcBatch()
          elements.push(<ProductNode key={child.person.id} product={child} />)
          break
        default:
          assertNever(child, 'ColumnView childElements: unhandled LayoutNode variant')
      }
    }
    flushIcBatch()

    return elements
  }, [node.children, renderPodGroup])

  const managerProps = useNodeProps(node.person)
  const managerNodeEl = (
    <div className={styles.nodeSlot}>
      <OrgNodeCard
        person={node.person}
        showTeam={node.children.length > 0 || !!managerProps.isManager}
        collapsed={node.children.length > 0 ? isCollapsed : undefined}
        onToggleCollapse={node.children.length > 0 && onToggleCollapse ? () => onToggleCollapse(node.collapseKey) : undefined}
        {...managerProps}
      />
    </div>
  )

  return (
    <div className={styles.subtree}>
      {managerNodeEl}
      {node.children.length > 0 && !isCollapsed && (
        <div className={styles.children}>
          {childElements}
        </div>
      )}
      {node.children.length > 0 && isCollapsed && (
        <div className={styles.collapsedCount}>{node.children.length} report{node.children.length !== 1 ? 's' : ''}</div>
      )}
    </div>
  )
})

// Product group has no header card — products cluster as a slate-coloured
// stack below their parent. Edges go directly from the parent (manager or
// chart root) to the first product.
const LayoutProductGroup = memo(function LayoutProductGroup({ group }: { group: ProductGroupLayout }) {
  return (
    <div key={group.collapseKey} className={styles.icStack}>
      {group.members.map((p) => <ProductNode key={p.person.id} product={p} />)}
    </div>
  )
})

const LayoutTeamGroup = memo(function LayoutTeamGroup({ group }: { group: TeamGroupLayout }) {
  const { onToggleCollapse, onSelect } = useChartActions()
  const isCollapsed = useIsCollapsed(group.collapseKey)
  const isSelected = useIsSelected(group.collapseKey)

  return (
    <div className={styles.subtree}>
      <div className={styles.nodeSlot}>
        <GroupHeaderNode
          nodeId={group.collapseKey}
          name={group.teamName}
          count={group.members.length}
          collapsed={isCollapsed}
          onClick={(e) => onSelect(group.collapseKey, e)}
          selected={isSelected}
          onToggleCollapse={onToggleCollapse ? () => onToggleCollapse(group.collapseKey) : undefined}
          dragData={{ memberIds: group.members.map(m => m.person.id) }}
        />
      </div>
      {!isCollapsed && (
        <div className={styles.children}>
          <div className={styles.icStack}>
            {group.members.map((ic) => <ICNode key={ic.person.id} ic={ic} />)}
          </div>
        </div>
      )}
    </div>
  )
})

export default function ColumnView() {
  const renderLayoutNode = useCallback((node: LayoutNode): ReactNode => {
    switch (node.type) {
      case 'manager':
        return <LayoutSubtree key={node.person.id} node={node} />
      case 'teamGroup':
        return <LayoutTeamGroup key={node.collapseKey} group={node} />
      case 'productGroup':
        return <LayoutProductGroup key={node.collapseKey} group={node} />
      case 'ic':
      case 'podGroup':
      case 'product':
        return null
      default:
        return assertNever(node, 'ColumnView renderLayoutNode: unhandled root variant')
    }
  }, [])

  const computeEdgesFn = useCallback(
    (people: Parameters<typeof computeEdges>[1], _roots: unknown, layoutRoots?: Parameters<typeof computeEdges>[0]) =>
      layoutRoots ? computeEdges(layoutRoots, people) : [],
    [],
  )

  return (
    <ChartShell
      computeEdges={computeEdgesFn}
      computeLayout={computeLayoutTree}
      renderLayoutNode={renderLayoutNode}
      dashedEdges
      useGhostPeople
      includeAddToTeam
    />
  )
}
