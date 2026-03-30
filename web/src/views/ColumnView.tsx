import { useMemo, useCallback, type ReactNode } from 'react'
import type { Pod } from '../api/types'
import type { EditBuffer } from '../store/useInteractionState'
import { computeEdges } from './columnEdges'
import { computeRenderItems } from './columnLayout'
import { DraggableNode, type OrgNode } from './shared'
import { buildPodDropId } from '../utils/ids'
import { useChart } from './ChartContext'
import { PodHeaderNode } from './PodHeaderNode'
import ChartShell from './ChartShell'
import styles from './ColumnView.module.css'

function SubtreeNode({ node, crossTeamICs }: { node: OrgNode; crossTeamICs?: OrgNode[] }) {
  const { selectedIds, onSelect, changes, managerSet, pods, interactionMode, editingPersonId, editBuffer, onAddReport, onAddParent, onAddToTeam, onDeletePerson, onInfo, onFocus, onEditMode, onPodSelect, onEnterEditing, onUpdateBuffer, onCommitEdits, setNodeRef, collapsedIds, onToggleCollapse } = useChart()
  const managers = node.children.filter((c) => c.children.length > 0)
  const ics = node.children.filter((c) => c.children.length === 0)

  const renderItems = useMemo(() => computeRenderItems(managers, ics), [managers, ics])

  const allICs = managers.length === 0

  const findPod = (managerId: string, podName: string): Pod | undefined =>
    pods?.find((p) => p.managerId === managerId && p.name === podName)

  const isPodCollapsed = useCallback((managerId: string, podName: string) => {
    const podNodeId = buildPodDropId(managerId, podName)
    return collapsedIds?.has(podNodeId) ?? false
  }, [collapsedIds])

  const renderPodHeader = useCallback((managerId: string, podName: string, memberCount: number) => {
    const pod = findPod(managerId, podName)
    const podNodeId = buildPodDropId(managerId, podName)
    const podCollapsed = collapsedIds?.has(podNodeId) ?? false
    return (
      <PodHeaderNode
        podName={podName}
        memberCount={memberCount}
        publicNote={pod?.publicNote}
        onAdd={onAddToTeam ? () => onAddToTeam(managerId, pod?.team ?? podName, podName) : undefined}
        onClick={pod && onPodSelect ? () => onPodSelect(pod.id) : undefined}
        nodeRef={setNodeRef(podNodeId)}
        podNodeId={podNodeId}
        collapsed={podCollapsed}
        onToggleCollapse={onToggleCollapse ? () => onToggleCollapse(podNodeId) : undefined}
      />
    )
  }, [pods, onAddToTeam, onPodSelect, setNodeRef, collapsedIds, onToggleCollapse])

  const renderIC = useCallback((child: OrgNode) => {
    const isEditing = interactionMode === 'editing' && editingPersonId === child.person.id
    return (
      <div key={child.person.id} className={styles.nodeSlot}>
        <DraggableNode
          person={child.person}
          selected={selectedIds.has(child.person.id)}
          changes={changes?.get(child.person.id)}
          isManager={managerSet?.has(child.person.id)}
          editing={isEditing}
          editBuffer={isEditing ? editBuffer : null}
          focusField={isEditing ? 'name' : null}
          onAdd={onAddReport ? () => onAddReport(child.person.id) : undefined}
          onAddParent={onAddParent ? () => onAddParent(child.person.id) : undefined}
          onDelete={onDeletePerson ? () => onDeletePerson(child.person.id) : undefined}
          onInfo={onInfo ? () => onInfo(child.person.id) : undefined}
          onFocus={onFocus && managerSet?.has(child.person.id) ? () => onFocus(child.person.id) : undefined}
          onEditMode={onEditMode ? () => onEditMode(child.person.id) : undefined}
          onSelect={(e) => onSelect(child.person.id, e)}
          onEnterEditing={onEnterEditing ? () => onEnterEditing(child.person) : undefined}
          onUpdateBuffer={onUpdateBuffer ? (field: string, value: string) => onUpdateBuffer(field as keyof EditBuffer, value) : undefined}
          onCommitEdits={onCommitEdits}
          nodeRef={setNodeRef(child.person.id)}
        />
      </div>
    )
  }, [selectedIds, changes, managerSet, interactionMode, editingPersonId, editBuffer, onAddReport, onAddParent, onDeletePerson, onInfo, onFocus, onEditMode, onSelect, onEnterEditing, onUpdateBuffer, onCommitEdits, setNodeRef])

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
          const podCollapsed = isPodCollapsed(node.person.id, podName)
          return (
            <div key={podName} className={styles.subtree}>
              <div className={styles.nodeSlot}>
                {renderPodHeader(node.person.id, podName, members.length)}
              </div>
              {!podCollapsed && (
                <div className={styles.children}>
                  <div className={styles.icStack}>
                    {members.map((child) => renderIC(child))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </>
    )
  }, [allICs, ics, node.person.id, renderPodHeader, renderIC, isPodCollapsed])

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
            <SubtreeNode key={item.node.person.id} node={item.node} crossTeamICs={item.crossTeamICs} />
          )
        } else if (item.type === 'icGroup') {
          const groupKey = item.podName ?? item.team
          const groupCollapsed = isPodCollapsed(node.person.id, groupKey)
          elements.push(
            <div key={`group-${item.podName ? 'pod' : 'team'}-${item.team}`} className={styles.subtree}>
              <div className={styles.nodeSlot}>
                {renderPodHeader(node.person.id, groupKey, item.members.length)}
              </div>
              {!groupCollapsed && (
                <div className={styles.children}>
                  <div className={styles.icStack}>
                    {item.members.map((child) => renderIC(child))}
                  </div>
                </div>
              )}
            </div>
          )
        }
      }
    }
    flushIcBatch()
    return elements
  }, [allICs, renderItems, renderIC, renderPodHeader, isPodCollapsed, node.person.id])

  const isCollapsed = collapsedIds?.has(node.person.id) ?? false
  const isNodeEditing = interactionMode === 'editing' && editingPersonId === node.person.id

  const hasCrossTeam = !!(crossTeamICs && crossTeamICs.length > 0 && !isCollapsed)

  const managerNodeEl = (
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
        onCommitEdits={onCommitEdits}
        nodeRef={setNodeRef(node.person.id)}
      />
    </div>
  )

  return (
    <div className={styles.subtree}>
      {hasCrossTeam ? (
        <div className={styles.managerWithCrossTeam}>
          {managerNodeEl}
          {crossTeamICs.map(ic => renderIC(ic))}
        </div>
      ) : managerNodeEl}
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
