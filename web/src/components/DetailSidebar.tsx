import { useOrgData, useSelection } from '../store/OrgContext'
import PodSidebar from './PodSidebar'
import PersonViewSidebar from './PersonViewSidebar'
import PersonEditSidebar from './PersonEditSidebar'
import BatchViewSidebar from './BatchViewSidebar'
import BatchEditSidebar from './BatchEditSidebar'

interface DetailSidebarProps {
  mode?: 'view' | 'edit'
  onSetMode?: (mode: 'view' | 'edit') => void
}

export default function DetailSidebar({ mode = 'view', onSetMode }: DetailSidebarProps) {
  const { working } = useOrgData()
  const { selectedId, selectedIds, selectedPodId } = useSelection()
  const isBatch = selectedIds.size > 1

  if (selectedPodId && !selectedId && !isBatch) return <PodSidebar />

  if (isBatch) {
    const people = working.filter(p => selectedIds.has(p.id))
    if (people.length === 0) return null
    return mode === 'edit'
      ? <BatchEditSidebar onSetMode={onSetMode} />
      : <BatchViewSidebar onSetMode={onSetMode} />
  }

  if (selectedId) {
    if (!working.some(p => p.id === selectedId)) return null
    return mode === 'edit'
      ? <PersonEditSidebar personId={selectedId} onSetMode={onSetMode} />
      : <PersonViewSidebar personId={selectedId} onSetMode={onSetMode} />
  }

  return null
}
