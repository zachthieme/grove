import { useMemo, useCallback, type ReactNode } from 'react'
import type { Pod } from '../api/types'
import { computeEdges } from './columnEdges'
import { computeRenderItems } from './columnLayout'
import { DraggableNode, type OrgNode } from './shared'
import { buildPodDropId } from '../utils/ids'
import { useChart } from './ChartContext'
import { PodHeaderNode } from './PodHeaderNode'
import ChartShell from './ChartShell'
import styles from './ColumnView.module.css'

function SubtreeNode({ node }: { node: OrgNode }) {
  const { selectedIds, onSelect, changes, managerSet, pods, onAddReport, onAddParent, onAddToTeam, onDeletePerson, onInfo, onFocus, onPodSelect, setNodeRef, collapsedIds, onToggleCollapse } = useChart()
  const managers = node.children.filter((c) => c.children.length > 0)
  const ics = node.children.filter((c) => c.children.length === 0)

  const renderItems = useMemo(() => computeRenderItems(managers, ics), [managers, ics])

  const allICs = managers.length === 0

  const findPod = (managerId: string, podName: string): Pod | undefined =>
    pods?.find((p) => p.managerId === managerId && p.name === podName)

  const renderPodHeader = useCallback((managerId: string, podName: string, memberCount: number) => {
    const pod = findPod(managerId, podName)
    const podNodeId = buildPodDropId(managerId, podName)
    return (
      <PodHeaderNode
        podName={podName}
        memberCount={memberCount}
        publicNote={pod?.publicNote}
        onAdd={onAddToTeam ? () => onAddToTeam(managerId, pod?.team ?? podName, podName) : undefined}
        onClick={pod && onPodSelect ? () => onPodSelect(pod.id) : undefined}
        nodeRef={setNodeRef(podNodeId)}
        podNodeId={podNodeId}
      />
    )
  }, [pods, onAddToTeam, onPodSelect, setNodeRef])

  const renderIC = useCallback((child: OrgNode) => (
    <div key={child.person.id} className={styles.nodeSlot}>
      <DraggableNode
        person={child.person}
        selected={selectedIds.has(child.person.id)}
        changes={changes?.get(child.person.id)}
        isManager={managerSet?.has(child.person.id)}
        onAdd={onAddReport ? () => onAddReport(child.person.id) : undefined}
        onAddParent={!child.person.managerId && onAddParent ? () => onAddParent(child.person.id) : undefined}
        onDelete={onDeletePerson ? () => onDeletePerson(child.person.id) : undefined}
        onInfo={onInfo ? () => onInfo(child.person.id) : undefined}
        onFocus={onFocus && managerSet?.has(child.person.id) ? () => onFocus(child.person.id) : undefined}
        onSelect={(e) => onSelect(child.person.id, e)}
        nodeRef={setNodeRef(child.person.id)}
      />
    </div>
  ), [selectedIds, changes, managerSet, onAddReport, onAddParent, onDeletePerson, onInfo, onFocus, onSelect, setNodeRef])

  const icPodListElements = useMemo((): ReactNode => {
    if (!allICs) return null
    const unpodded: OrgNode[] = []
    const podOrder: string[] = []
    const podMap = new Map<string, OrgNode[]>()
    for (const ic of ics) {
      const podName = ic.person.pod
      if (!podName) {
        unpodded.push(ic)
        continue
      }
      if (!podMap.has(podName)) {
        podOrder.push(podName)
        podMap.set(podName, [])
      }
      podMap.get(podName)!.push(ic)
    }
    podOrder.sort((a, b) => a.localeCompare(b))
    const hasPods = podOrder.length > 0
    if (!hasPods) {
      return (
        <div className={styles.icStack}>
          {ics.map((child) => renderIC(child))}
        </div>
      )
    }
    return (
      <>
        {unpodded.length > 0 && (
          <div className={styles.icStack}>
            {unpodded.map((child) => renderIC(child))}
          </div>
        )}
        {podOrder.map((podName) => {
          const members = podMap.get(podName)!
          return (
            <div key={podName} className={styles.subtree}>
              <div className={styles.nodeSlot}>
                {renderPodHeader(node.person.id, podName, members.length)}
              </div>
              <div className={styles.children}>
                <div className={styles.icStack}>
                  {members.map((child) => renderIC(child))}
                </div>
              </div>
            </div>
          )
        })}
      </>
    )
  }, [allICs, ics, node.person.id, renderPodHeader, renderIC])

  const mixedChildrenElements = useMemo((): ReactNode[] => {
    if (allICs) return []
    const elements: ReactNode[] = []
    let icBatch: OrgNode[] = []

    const flushIcBatch = () => {
      if (icBatch.length === 0) return
      elements.push(
        <div key={`ic-stack-${icBatch[0].person.id}`} className={styles.icStack}>
          {icBatch.map((child) => renderIC(child))}
        </div>
      )
      icBatch = []
    }

    const isCrossTeam = (n: OrgNode) =>
      (n.person.additionalTeams?.length ?? 0) > 0

    for (const item of renderItems) {
      if (item.type === 'ic') {
        if (isCrossTeam(item.node)) {
          flushIcBatch()
          elements.push(renderIC(item.node))
        } else {
          icBatch.push(item.node)
        }
      } else {
        flushIcBatch()
        if (item.type === 'manager') {
          elements.push(
            <SubtreeNode key={item.node.person.id} node={item.node} />
          )
        } else if (item.type === 'icGroup') {
          elements.push(
            <div key={`group-${item.podName ? 'pod' : 'team'}-${item.team}`} className={styles.subtree}>
              <div className={styles.nodeSlot}>
                {renderPodHeader(node.person.id, item.podName ?? item.team, item.members.length)}
              </div>
              <div className={styles.children}>
                <div className={styles.icStack}>
                  {item.members.map((child) => renderIC(child))}
                </div>
              </div>
            </div>
          )
        }
      }
    }
    flushIcBatch()
    return elements
  }, [allICs, renderItems, renderIC, renderPodHeader, node.person.id])

  const isCollapsed = collapsedIds?.has(node.person.id) ?? false

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
          onAdd={onAddReport ? () => onAddReport(node.person.id) : undefined}
          onAddParent={!node.person.managerId && onAddParent ? () => onAddParent(node.person.id) : undefined}
          onDelete={onDeletePerson ? () => onDeletePerson(node.person.id) : undefined}
          onInfo={onInfo ? () => onInfo(node.person.id) : undefined}
          onFocus={onFocus && managerSet?.has(node.person.id) ? () => onFocus(node.person.id) : undefined}
          onToggleCollapse={node.children.length > 0 && onToggleCollapse ? () => onToggleCollapse(node.person.id) : undefined}
          onSelect={(e) => onSelect(node.person.id, e)}
          nodeRef={setNodeRef(node.person.id)}
        />
      </div>

      {node.children.length > 0 && !isCollapsed && (
        <div className={styles.children}>
          {allICs ? icPodListElements : mixedChildrenElements}
        </div>
      )}
      {node.children.length > 0 && isCollapsed && (
        <div className={styles.collapsedCount}>{node.children.length} report{node.children.length !== 1 ? 's' : ''}</div>
      )}
    </div>
  )
}

export default function ColumnView() {
  return (
    <ChartShell
      computeEdges={(people) => computeEdges(people)}
      renderSubtree={(node) => <SubtreeNode key={node.person.id} node={node} />}
      renderTeamHeader={(team, count) => <PodHeaderNode podName={team} memberCount={count} />}
      viewStyles={styles}
      dashedEdges
      useGhostPeople
      includeAddToTeam
    />
  )
}
