import { useMemo, useState, useCallback, type ReactNode } from 'react'
import { DndContext, useDroppable } from '@dnd-kit/core'
import type { Person, Pod } from '../api/types'
import type { PersonChange } from '../hooks/useOrgDiff'
import { useChartLayout } from '../hooks/useChartLayout'
import { useLassoSelect } from '../hooks/useLassoSelect'
import { DraggableNode, buildOrgTree, type OrgNode } from './shared'
import { OrphanGroup } from './OrphanGroup'
import { computeEdges } from './columnEdges'
import { computeRenderItems } from './columnLayout'
import { buildPodDropId } from '../utils/ids'
import { ChartProvider, useChart } from './ChartContext'
import { DragBadgeOverlay } from './DragBadgeOverlay'
import { LassoSvgOverlay } from './LassoSvgOverlay'
import NodeActions from '../components/NodeActions'
import styles from './ColumnView.module.css'

interface ColumnViewProps {
  people: Person[]
  selectedIds: Set<string>
  onSelect: (id: string, event?: React.MouseEvent) => void
  onBatchSelect?: (ids: Set<string>) => void
  changes?: Map<string, PersonChange>
  ghostPeople?: Person[]
  managerSet?: Set<string>
  pods?: Pod[]
  onAddReport?: (id: string) => void
  onAddToTeam?: (parentId: string, team: string, podName?: string) => void
  onDeletePerson?: (id: string) => void
  onInfo?: (id: string) => void
  onFocus?: (id: string) => void
  onPodSelect?: (podId: string) => void
}

function PodHeaderNode({ podName, memberCount, publicNote, onAdd, onClick, nodeRef, podNodeId }: {
  podName: string
  memberCount: number
  publicNote?: string
  onAdd?: () => void
  onClick?: () => void
  nodeRef?: (el: HTMLDivElement | null) => void
  podNodeId?: string
}) {
  const [hovered, setHovered] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: podNodeId ?? podName,
    disabled: !podNodeId,
  })

  return (
    <div
      ref={(node) => {
        setDropRef(node)
        nodeRef?.(node)
      }}
      className={styles.teamHeaderWrapper}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        outline: isOver ? '2px solid var(--grove-green, #3d6b35)' : undefined,
        outlineOffset: isOver ? 2 : undefined,
        background: isOver ? 'var(--grove-green-soft, #e8f0e6)' : undefined,
        borderRadius: 6,
        transition: 'outline 0.15s, background 0.15s',
      }}
    >
      {hovered && onAdd && (
        <NodeActions
          showAdd={true}
          showInfo={true}
          showEdit={false}
          showDelete={false}
          onAdd={(e) => { e.stopPropagation(); onAdd() }}
          onDelete={(e) => { e.stopPropagation() }}
          onEdit={(e) => { e.stopPropagation() }}
          onInfo={(e) => { e.stopPropagation(); onClick?.() }}
        />
      )}
      <div
        className={`${styles.teamHeader}${onClick ? ` ${styles.teamHeaderClickable}` : ''}`}
        onClick={onClick}
      >
        <div className={styles.teamHeaderName}>{podName}</div>
        <div className={styles.teamHeaderCount}>{memberCount} {memberCount === 1 ? 'person' : 'people'}</div>
      </div>
      {publicNote && (
        <button
          className={`${styles.podNoteIcon} ${noteOpen ? styles.podNoteIconActive : ''}`}
          onClick={(e) => { e.stopPropagation(); setNoteOpen(v => !v) }}
          title="Toggle notes"
        >
          {'\u{1F4CB}'}
        </button>
      )}
      {noteOpen && publicNote && (
        <div className={styles.podNotePanel}>
          <div className={styles.podNoteText}>{publicNote}</div>
        </div>
      )}
    </div>
  )
}

function SubtreeNode({ node }: { node: OrgNode }) {
  const { selectedIds, onSelect, changes, managerSet, pods, onAddReport, onAddToTeam, onDeletePerson, onInfo, onFocus, onPodSelect, setNodeRef } = useChart()
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
        onDelete={onDeletePerson ? () => onDeletePerson(child.person.id) : undefined}
        onInfo={onInfo ? () => onInfo(child.person.id) : undefined}
        onFocus={onFocus && managerSet?.has(child.person.id) ? () => onFocus(child.person.id) : undefined}
        onSelect={(e) => onSelect(child.person.id, e)}
        nodeRef={setNodeRef(child.person.id)}
      />
    </div>
  ), [selectedIds, changes, managerSet, onAddReport, onDeletePerson, onInfo, onFocus, onSelect, setNodeRef])

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

  return (
    <div className={styles.subtree}>
      <div className={styles.nodeSlot}>
        <DraggableNode
          person={node.person}
          selected={selectedIds.has(node.person.id)}
          changes={changes?.get(node.person.id)}
          showTeam={node.children.length > 0 || !!managerSet?.has(node.person.id)}
          isManager={managerSet?.has(node.person.id)}
          onAdd={onAddReport ? () => onAddReport(node.person.id) : undefined}
          onDelete={onDeletePerson ? () => onDeletePerson(node.person.id) : undefined}
          onInfo={onInfo ? () => onInfo(node.person.id) : undefined}
          onFocus={onFocus && managerSet?.has(node.person.id) ? () => onFocus(node.person.id) : undefined}
          onSelect={(e) => onSelect(node.person.id, e)}
          nodeRef={setNodeRef(node.person.id)}
        />
      </div>

      {node.children.length > 0 && (
        <div className={styles.children}>
          {allICs ? icPodListElements : mixedChildrenElements}
        </div>
      )}
    </div>
  )
}

export default function ColumnView({ people, selectedIds, onSelect, onBatchSelect, changes, ghostPeople = [], managerSet, pods, onAddReport, onAddToTeam, onDeletePerson, onInfo, onFocus, onPodSelect }: ColumnViewProps) {
  const roots = useMemo(() => buildOrgTree(people), [people])
  const edges = useMemo(() => computeEdges(people), [people])

  const { containerRef, nodeRefs, setNodeRef, lines, activeDragId, sensors, handleDragStart, handleDragEnd } = useChartLayout(edges, roots)

  const handleLassoSelect = useCallback((ids: Set<string>) => {
    onBatchSelect?.(ids)
  }, [onBatchSelect])

  const { lassoRect } = useLassoSelect({
    containerRef,
    nodeRefs,
    onSelect: handleLassoSelect,
    enabled: !!onBatchSelect,
  })

  const draggedPerson = activeDragId ? people.find((p) => p.id === activeDragId) : null

  const chartValue = useMemo(() => ({
    selectedIds, changes, managerSet, pods,
    onSelect, onBatchSelect, onAddReport, onAddToTeam, onDeletePerson, onInfo, onFocus, onPodSelect,
    setNodeRef,
  }), [selectedIds, changes, managerSet, pods, onSelect, onBatchSelect, onAddReport, onAddToTeam, onDeletePerson, onInfo, onFocus, onPodSelect, setNodeRef])

  if (people.length === 0 && ghostPeople.length === 0) {
    return <div className={styles.container}>No people to display.</div>
  }

  return (
    <ChartProvider value={chartValue}>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className={styles.container} ref={containerRef} data-role="chart-container">
          <LassoSvgOverlay lassoRect={lassoRect} lines={lines} className={styles.svgOverlay} dashedEdges />
          <div className={styles.forest} data-role="forest">
            {roots.filter((r) => r.children.length > 0).map((root) => (
              <SubtreeNode key={root.person.id} node={root} />
            ))}
            <OrphanGroup
              orphans={roots.filter((r) => r.children.length === 0)}
              roots={roots}
              selectedIds={selectedIds}
              onSelect={onSelect}
              changes={changes}
              setNodeRef={setNodeRef}
              managerSet={managerSet}
              onAddReport={onAddReport}
              onDeletePerson={onDeletePerson}
              onInfo={onInfo}
              styles={styles}
              renderSubtree={(node) => <SubtreeNode key={node.person.id} node={node} />}
              renderTeamHeader={(team, count) => <PodHeaderNode podName={team} memberCount={count} />}
            />
          </div>
        </div>
        <DragBadgeOverlay draggedPerson={draggedPerson} selectedIds={selectedIds} />
      </DndContext>
    </ChartProvider>
  )
}
