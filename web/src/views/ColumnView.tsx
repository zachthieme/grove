import { useMemo, useCallback, type ReactNode } from 'react'
import type { Pod } from '../api/types'
import type { EditBuffer } from '../store/useInteractionState'
import { computeEdges } from './columnEdges'
import { computeLayoutTree, type LayoutNode, type ManagerLayout, type ICLayout, type PodGroupLayout, type TeamGroupLayout } from './layoutTree'
import PersonNode from '../components/PersonNode'
import GroupHeaderNode from '../components/GroupHeaderNode'
import { useChart } from './ChartContext'
import ChartShell from './ChartShell'
import styles from './ColumnView.module.css'

function LayoutSubtree({ node }: { node: ManagerLayout }) {
  const { selectedIds, selectedPodId, onSelect, changes, managerSet, pods, interactionMode, editingPersonId, editBuffer, onAddReport, onAddParent, onAddToTeam, onDeletePerson, onInfo, onFocus, onEditMode, onPodSelect, onEnterEditing, onUpdateBuffer, onCommitEdits, setNodeRef, collapsedIds, onToggleCollapse } = useChart()

  const isCollapsed = collapsedIds?.has(node.collapseKey) ?? false
  const isNodeEditing = interactionMode === 'editing' && editingPersonId === node.person.id

  const findPod = (managerId: string, podName: string): Pod | undefined =>
    pods?.find((p) => p.managerId === managerId && p.name === podName)

  const renderIC = useCallback((ic: ICLayout) => {
    const isEditing = interactionMode === 'editing' && editingPersonId === ic.person.id
    return (
      <div key={ic.person.id} className={styles.nodeSlot}>
        <PersonNode
          person={ic.person}
          selected={selectedIds.has(ic.person.id)}
          changes={changes?.get(ic.person.id)}
          isManager={managerSet?.has(ic.person.id)}
          editing={isEditing}
          editBuffer={isEditing ? editBuffer : null}
          focusField={isEditing ? 'name' : null}
          onAdd={onAddReport ? () => onAddReport(ic.person.id) : undefined}
          onAddParent={onAddParent ? () => onAddParent(ic.person.id) : undefined}
          onDelete={onDeletePerson ? () => onDeletePerson(ic.person.id) : undefined}
          onInfo={onInfo ? () => onInfo(ic.person.id) : undefined}
          onFocus={onFocus && managerSet?.has(ic.person.id) ? () => onFocus(ic.person.id) : undefined}
          onEditMode={onEditMode ? () => onEditMode(ic.person.id) : undefined}
          onClick={(e) => onSelect(ic.person.id, e)}
          onEnterEditing={onEnterEditing ? () => onEnterEditing(ic.person) : undefined}
          onUpdateBuffer={onUpdateBuffer ? (field: string, value: string) => onUpdateBuffer(field as keyof EditBuffer, value) : undefined}
          onCommitEdits={onCommitEdits}
          cardRef={setNodeRef(ic.person.id)}
        />
      </div>
    )
  }, [selectedIds, changes, managerSet, interactionMode, editingPersonId, editBuffer, onAddReport, onAddParent, onDeletePerson, onInfo, onFocus, onEditMode, onSelect, onEnterEditing, onUpdateBuffer, onCommitEdits, setNodeRef])

  const renderPodGroup = useCallback((group: PodGroupLayout) => {
    const pod = findPod(group.managerId, group.podName)
    const podCollapsed = collapsedIds?.has(group.collapseKey) ?? false
    return (
      <div key={group.collapseKey} className={styles.subtree}>
        <div className={styles.nodeSlot}>
          <GroupHeaderNode
            nodeId={group.collapseKey}
            name={group.podName}
            count={group.members.length}
            noteText={pod?.publicNote}
            onAdd={onAddToTeam ? () => onAddToTeam(group.managerId, pod?.team ?? group.podName, group.podName) : undefined}
            onInfo={pod && onPodSelect ? () => onPodSelect(pod.id) : undefined}
            onClick={pod && onPodSelect ? () => onPodSelect(pod.id) : undefined}
            selected={selectedPodId != null && selectedPodId === pod?.id}
            cardRef={setNodeRef(group.collapseKey)}
            droppableId={group.collapseKey}
            collapsed={podCollapsed}
            onToggleCollapse={onToggleCollapse ? () => onToggleCollapse(group.collapseKey) : undefined}
            dragData={{ memberIds: group.members.map(m => m.person.id) }}
          />
        </div>
        {!podCollapsed && (
          <div className={styles.children}>
            <div className={styles.icStack}>
              {group.members.map((ic) => renderIC(ic))}
            </div>
          </div>
        )}
      </div>
    )
  }, [pods, selectedPodId, onAddToTeam, onPodSelect, setNodeRef, collapsedIds, onToggleCollapse, renderIC])

  // Build child elements by iterating node.children and switching on type
  const childElements = useMemo((): ReactNode[] => {
    if (node.children.length === 0) return []

    const elements: ReactNode[] = []
    let icBatch: ICLayout[] = []

    const flushIcBatch = () => {
      if (icBatch.length === 0) return
      elements.push(
        <div key={`ic-stack-${icBatch[0].person.id}`} className={styles.icStack}>
          {icBatch.map((ic) => renderIC(ic))}
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
            elements.push(renderIC(child))
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
        default:
          break
      }
    }
    flushIcBatch()

    return elements
  }, [node.children, renderIC, renderPodGroup])

  const managerNodeEl = (
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
}

function LayoutTeamGroup({ group }: { group: TeamGroupLayout }) {
  const { selectedIds, onSelect, changes, managerSet, onAddReport, onDeletePerson, onInfo, setNodeRef, collapsedIds, onToggleCollapse } = useChart()

  const isCollapsed = collapsedIds?.has(group.collapseKey) ?? false

  return (
    <div className={styles.subtree}>
      <div className={styles.nodeSlot}>
        <GroupHeaderNode
          nodeId={group.collapseKey}
          name={group.teamName}
          count={group.members.length}
          collapsed={isCollapsed}
          onClick={(e) => onSelect(group.collapseKey, e)}
          selected={selectedIds.has(group.collapseKey)}
          onToggleCollapse={onToggleCollapse ? () => onToggleCollapse(group.collapseKey) : undefined}
          dragData={{ memberIds: group.members.map(m => m.person.id) }}
        />
      </div>
      {!isCollapsed && (
        <div className={styles.children}>
          <div className={styles.icStack}>
            {group.members.map((ic) => (
              <div key={ic.person.id} className={styles.nodeSlot}>
                <PersonNode
                  person={ic.person}
                  selected={selectedIds.has(ic.person.id)}
                  changes={changes?.get(ic.person.id)}
                  isManager={managerSet?.has(ic.person.id)}
                  onAdd={onAddReport ? () => onAddReport(ic.person.id) : undefined}
                  onDelete={onDeletePerson ? () => onDeletePerson(ic.person.id) : undefined}
                  onInfo={onInfo ? () => onInfo(ic.person.id) : undefined}
                  onClick={(e) => onSelect(ic.person.id, e)}
                  cardRef={setNodeRef(ic.person.id)}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function ColumnView() {
  const renderLayoutNode = useCallback((node: LayoutNode): ReactNode => {
    switch (node.type) {
      case 'manager':
        return <LayoutSubtree key={node.person.id} node={node} />
      case 'teamGroup':
        return <LayoutTeamGroup key={node.collapseKey} group={node} />
      default:
        return null
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
