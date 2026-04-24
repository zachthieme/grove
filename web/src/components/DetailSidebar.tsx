import { useOrgData, useSelection } from '../store/OrgContext'
import PodSidebar from './PodSidebar'
import NodeEditSidebar from './NodeEditSidebar'
import BatchEditSidebar from './BatchEditSidebar'

/** Parse a pod collapseKey ("pod:managerId:podName") and find the matching pod. */
function usePodForKey(selectedId: string | null) {
  const { pods } = useOrgData()
  if (!selectedId?.startsWith('pod:')) return null
  const parts = selectedId.split(':')
  const managerId = parts[1]
  const podName = parts.slice(2).join(':')
  return pods.find(p => p.managerId === managerId && p.name === podName) ?? null
}

export default function DetailSidebar() {
  const { working } = useOrgData()
  const { selectedId, selectedIds } = useSelection()
  const isBatch = selectedIds.size > 1
  const pod = usePodForKey(selectedId)

  // Pod sidebar — via collapseKey selection
  if (pod) return <PodSidebar podId={pod.id} />

  if (isBatch) {
    const people = working.filter(p => selectedIds.has(p.id))
    if (people.length === 0) return null
    return <BatchEditSidebar />
  }

  if (selectedId) {
    if (!working.some(p => p.id === selectedId)) return null
    return <NodeEditSidebar personId={selectedId} />
  }

  return null
}
