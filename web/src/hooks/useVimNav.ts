import { useState, useEffect, useCallback, useRef } from 'react'
import type { OrgNode, Pod } from '../api/types'
import { isProduct } from '../constants'
import { findSpatialNeighbor } from './useSpatialNav'
import { moveToTarget } from '../utils/moveToTarget'

interface VimNavOptions {
  working: OrgNode[]
  pods: Pod[]
  selectedId: string | null
  selectedIds?: Set<string>
  batchSelect?: (ids: Set<string>) => void
  onDelete?: (id: string) => void
  onAddReport?: (id: string) => void
  onAddProduct?: (parentId: string, team?: string, podName?: string) => void
  onAddToTeam?: (parentId: string, team: string, podName?: string) => void
  onAddParent?: (childId: string) => void
  onShowHelp?: () => void
  onUndo?: () => void
  onRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
  onSetHead?: (id: string) => void
  copy?: (rootIds: string[], targetParentId: string) => Promise<Record<string, string> | undefined>
  move: (personId: string, newManagerId: string, newTeam: string, correlationId?: string, newPod?: string) => Promise<void>
  reparent: (personId: string, newManagerId: string, correlationId?: string) => Promise<void>
  enabled: boolean
}

/**
 * Find the root manager — first person with empty managerId.
 * Returns undefined if working is empty or has no roots.
 */
export function findRootPerson(working: OrgNode[]): OrgNode | undefined {
  return working.find(p => !p.managerId)
}

/**
 * Find the deepest leaf in the subtree rooted at `fromId` (or in the whole
 * org if `fromId` is undefined). Tie-break: encounter order (DFS pre-order),
 * which matches visual top-to-bottom in column view.
 */
export function findDeepestLeaf(working: OrgNode[], fromId?: string): OrgNode | undefined {
  if (working.length === 0) return undefined
  const childrenByParent = new Map<string, OrgNode[]>()
  for (const p of working) {
    const list = childrenByParent.get(p.managerId) ?? []
    list.push(p)
    childrenByParent.set(p.managerId, list)
  }
  const root = fromId
    ? working.find(p => p.id === fromId)
    : findRootPerson(working)
  if (!root) return undefined

  let best: { node: OrgNode; depth: number } | null = null
  function dfs(node: OrgNode, depth: number) {
    const kids = childrenByParent.get(node.id) ?? []
    if (kids.length === 0) {
      if (!best || depth > best.depth) best = { node, depth }
      return
    }
    for (const child of kids) dfs(child, depth + 1)
  }
  dfs(root, 0)
  return best ? (best as { node: OrgNode; depth: number }).node : root
}

/**
 * Resolve the parent of the current selection. For a person, returns the
 * working node matching their managerId. For a synthetic pod collapseKey
 * ("pod:managerId:podName"), returns the pod's manager. Returns undefined
 * when the parent doesn't exist (root, or stale selection).
 */
export function findParentForSelection(
  working: OrgNode[],
  selectedId: string,
): OrgNode | undefined {
  if (selectedId.startsWith('pod:')) {
    const parts = selectedId.split(':')
    const managerId = parts[1]
    return working.find(p => p.id === managerId)
  }
  if (selectedId.startsWith('team:') || selectedId.startsWith('products:')) {
    const parts = selectedId.split(':')
    const managerId = parts[1]
    return working.find(p => p.id === managerId)
  }
  const node = working.find(p => p.id === selectedId)
  if (!node?.managerId) return undefined
  return working.find(p => p.id === node.managerId)
}

/**
 * Resolve a paste target id into the parent person id under which copies
 * should be attached. Mirrors moveToTarget's synthetic-id parsing but
 * returns just the parent id (for copy-subtree's targetParentId arg).
 *
 * - person/product id → that id
 * - "pod:managerId:podName" → managerId
 * - "team:managerId:teamName" → managerId
 * - "products:managerId" → managerId
 * - "orphan:teamName" → "" (top-level)
 * - null → ""
 */
export function resolveCopyTarget(selectedId: string | null, _pods: Pod[]): string {
  if (!selectedId) return ''
  if (selectedId.startsWith('pod:')) {
    const rest = selectedId.slice(4)
    const colon = rest.indexOf(':')
    return colon === -1 ? '' : rest.slice(0, colon)
  }
  if (selectedId.startsWith('team:')) {
    const rest = selectedId.slice(5)
    const colon = rest.indexOf(':')
    return colon === -1 ? '' : rest.slice(0, colon)
  }
  if (selectedId.startsWith('products:')) {
    return selectedId.slice('products:'.length)
  }
  if (selectedId.startsWith('orphan:')) return ''
  return selectedId
}

/**
 * Given a data-person-id value, resolve to the person IDs it represents.
 * Works uniformly for person nodes (returns [id]) and group nodes (returns member IDs).
 */
function resolvePersonIds(nodeId: string, working: OrgNode[]): string[] {
  if (working.some(p => p.id === nodeId)) return [nodeId]
  const el = document.querySelector(`[data-person-id="${nodeId}"]`)
  if (!el) return []
  const subtree = el.parentElement?.parentElement
  if (!subtree) return []
  return Array.from(subtree.querySelectorAll('[data-person-id]'))
    .map(e => e.getAttribute('data-person-id')!)
    .filter(id => working.some(p => p.id === id))
}

/**
 * Vim-style keyboard navigation for the org chart.
 *
 * j/k / ArrowDown/Up   — move down/up spatially
 * h/l / ArrowLeft/Right — move left/right spatially
 * o    — add report under selected (or sibling product if selected is a product)
 * O    — add parent above selected
 * a    — append sibling at the current level (same parent / team / pod)
 * +    — add a product under selected (sibling on a product; child on a person; in-pod on a pod)
 * d    — delete selected (sends to recycle bin)
 * x    — cut selected (mark for move)
 * p    — paste (move cut people under selected target)
 * /    — focus search
 * Ctrl+A / Cmd+A — select all people
 * u    — undo last mutation (delegates to onUndo)
 * Ctrl+R — redo last undone mutation (delegates to onRedo)
 * f    — focus chart on selected person's subtree (set head)
 * za   — toggle fold (collapse/expand) on selected manager or pod
 * y    — yank selection (mark for copy; mutex with cut)
 * p    — paste: if yanked, copy under selection; if cut, move under selection
 * v    — enter visual mode (additive selection on motion); Esc exits
 * Esc  — cancel cut / clear selection / clear head
 */
export function useVimNav({ working, pods, selectedId, selectedIds, batchSelect, onDelete, onAddReport, onAddProduct, onAddToTeam, onAddParent, onShowHelp, onUndo, onRedo, canUndo, canRedo, onSetHead, copy, move, reparent, enabled }: VimNavOptions) {
  const [cutIds, setCutIds] = useState<string[]>([])
  const [yankedIds, setYankedIds] = useState<string[]>([])
  const [visualMode, setVisualMode] = useState(false)
  // Cursor position in visual mode — anchored at the entry point and
  // advanced by motion keys. Selection grows additively as the cursor moves.
  const visualCursorRef = useRef<string | null>(null)
  const cancelCut = useCallback(() => setCutIds([]), [])
  const cancelYank = useCallback(() => setYankedIds([]), [])
  const exitVisual = useCallback(() => {
    setVisualMode(false)
    visualCursorRef.current = null
  }, [])

  useEffect(() => {
    if (cutIds.length > 0) {
      const remaining = cutIds.filter(id => working.some(p => p.id === id))
      if (remaining.length === 0) setCutIds([])
    }
  }, [cutIds, working])

  useEffect(() => {
    if (yankedIds.length > 0) {
      const remaining = yankedIds.filter(id => working.some(p => p.id === id))
      if (remaining.length === 0) setYankedIds([])
    }
  }, [yankedIds, working])

  // Click the role=button inside the data-person-id wrapper for `id`. Same
  // pattern as navigateSpatial — keep DOM coupling here and let consumers
  // observe via React state updates from the resulting selection event.
  const selectById = useCallback((id: string) => {
    const targetEl = document.querySelector(`[data-person-id="${id}"]`)
    targetEl?.querySelector<HTMLElement>('[role="button"]')?.click()
    targetEl?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [])

  const jumpToRoot = useCallback(() => {
    const root = findRootPerson(working)
    if (root) selectById(root.id)
  }, [working, selectById])

  const jumpToDeepestLeaf = useCallback(() => {
    // Subtree root: selected manager if it's a person; otherwise org root.
    const subtreeRoot = selectedId && !selectedId.includes(':')
      ? selectedId
      : undefined
    const leaf = findDeepestLeaf(working, subtreeRoot)
    if (leaf) selectById(leaf.id)
  }, [working, selectedId, selectById])

  const jumpToParent = useCallback(() => {
    if (!selectedId) return
    const parent = findParentForSelection(working, selectedId)
    if (parent) selectById(parent.id)
  }, [working, selectedId, selectById])

  const navigateSpatial = useCallback((direction: 'h' | 'j' | 'k' | 'l') => {
    const currentId = visualMode
      ? visualCursorRef.current
      : (selectedId
          ?? document.querySelector('[data-selected="true"]')
              ?.closest('[data-person-id]')
              ?.getAttribute('data-person-id')
          ?? null)

    if (!currentId) {
      const first = document.querySelector<HTMLElement>('[data-person-id] [role="button"]')
      first?.click()
      return
    }

    const nodeEls = document.querySelectorAll<HTMLElement>('[data-person-id]')
    const rects = new Map<string, DOMRect>()
    nodeEls.forEach(el => {
      const id = el.getAttribute('data-person-id')
      if (id) rects.set(id, el.getBoundingClientRect())
    })

    const targetId = findSpatialNeighbor(currentId, rects, direction)
    if (!targetId) return

    const targetEl = document.querySelector(`[data-person-id="${targetId}"]`)

    if (visualMode && batchSelect) {
      // Additive selection: advance the cursor and union the new neighbor
      // into selectedIds. Synthetic group keys are skipped (selection is
      // person-set semantics).
      if (!targetId.includes(':')) {
        visualCursorRef.current = targetId
        const next = new Set(selectedIds ?? new Set<string>())
        next.add(targetId)
        batchSelect(next)
      }
      targetEl?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
      return
    }

    targetEl?.querySelector<HTMLElement>('[role="button"]')?.click()
    targetEl?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [selectedId, selectedIds, visualMode, batchSelect])

  const navigate = useCallback((key: string) => {
    // Multi-select: only set-based ops apply (d delete, x cut, y yank).
    // Single-target ops (o, O, +, p) require a single selection — App.tsx
    // sets selectedId to null when selectedIds.size !== 1.
    if (!selectedId) {
      const multi = selectedIds && selectedIds.size > 1 ? Array.from(selectedIds) : null
      if (!multi) return
      switch (key) {
        case 'd':
          for (const id of multi) onDelete?.(id)
          return
        case 'x':
          setCutIds(multi)
          setYankedIds([])
          return
        case 'y':
          setYankedIds(multi)
          setCutIds([])
          return
      }
      return
    }
    const personIds = resolvePersonIds(selectedId, working)

    switch (key) {
      case 'o': {
        // Pod selection: collapseKey is "pod:managerId:podName" — add a person into the pod.
        // (Mirrors the +◆ → P binding for products.)
        if (selectedId.startsWith('pod:')) {
          if (!onAddToTeam) break
          const parts = selectedId.split(':')
          const managerId = parts[1]
          const podName = parts.slice(2).join(':')
          const pod = pods.find(p => p.managerId === managerId && p.name === podName)
          onAddToTeam(managerId, pod?.team ?? podName, podName)
          break
        }
        if (personIds.length !== 1) break
        const node = working.find(p => p.id === personIds[0])
        // On a product, create a sibling product (same parent + team + pod)
        // rather than a child person — products can't have reports.
        if (node && isProduct(node)) {
          onAddProduct?.(node.managerId, node.team, node.pod)
        } else {
          onAddReport?.(personIds[0])
        }
        break
      }
      case 'O': {
        if (onAddParent && personIds.length === 1) onAddParent(personIds[0])
        break
      }
      case 'a': {
        // Append sibling at current level: same parent/team/pod as selection.
        // Pods don't have siblings in the chart — fall back to "add into pod"
        // (mirrors o on a pod).
        if (selectedId.startsWith('pod:')) {
          if (!onAddToTeam) break
          const parts = selectedId.split(':')
          const managerId = parts[1]
          const podName = parts.slice(2).join(':')
          const pod = pods.find(p => p.managerId === managerId && p.name === podName)
          onAddToTeam(managerId, pod?.team ?? podName, podName)
          break
        }
        if (personIds.length !== 1) break
        const node = working.find(p => p.id === personIds[0])
        if (!node) break
        if (isProduct(node)) {
          // Sibling product: same parent + team + pod.
          onAddProduct?.(node.managerId, node.team, node.pod)
        } else {
          // Sibling person: same parent + team + pod (managerId may be '' for
          // peer-of-root; ViewDataContext handles that path).
          onAddToTeam?.(node.managerId, node.team, node.pod)
        }
        break
      }
      case '+': {
        if (!onAddProduct) break
        // Pod selection: collapseKey is "pod:managerId:podName" — add product into the pod.
        if (selectedId.startsWith('pod:')) {
          const parts = selectedId.split(':')
          const managerId = parts[1]
          const podName = parts.slice(2).join(':')
          const pod = pods.find(p => p.managerId === managerId && p.name === podName)
          onAddProduct(managerId, pod?.team, podName)
          break
        }
        // Person selection: child product (or sibling product if the selection is itself a product).
        if (personIds.length !== 1) break
        const node = working.find(p => p.id === personIds[0])
        if (!node) break
        if (isProduct(node)) {
          // Products don't nest — sibling under the same parent/team/pod.
          onAddProduct(node.managerId, node.team, node.pod)
        } else {
          onAddProduct(node.id, node.team, node.pod)
        }
        break
      }
      case 'd': {
        for (const id of personIds) onDelete?.(id)
        break
      }
      case 'x': {
        if (personIds.length > 0) {
          setCutIds(personIds)
          setYankedIds([]) // mutex: cutting clears yank
        }
        break
      }
      case 'y': {
        if (personIds.length > 0) {
          setYankedIds(personIds)
          setCutIds([]) // mutex: yanking clears cut
        }
        break
      }
      case 'p': {
        // Yanked > cut: paste-copy takes priority when both somehow set.
        if (yankedIds.length > 0 && copy) {
          const targetParentId = resolveCopyTarget(selectedId, pods)
          void copy(yankedIds, targetParentId)
          setYankedIds([])
          break
        }
        if (cutIds.length > 0) {
          // Same moveToTarget used by drag-and-drop
          moveToTarget(cutIds, selectedId, { move, reparent }, pods)
          setCutIds([])
        }
        break
      }
    }
  }, [selectedId, selectedIds, working, pods, onDelete, onAddReport, onAddProduct, onAddToTeam, onAddParent, move, reparent, copy, cutIds, yankedIds])

  // Two-key sequence prefix state: set by the first `g`, consumed by the
  // next `g`/`p`, cleared on timeout or any other key.
  const gPendingRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelGPending = useCallback(() => {
    if (gPendingRef.current !== null) {
      clearTimeout(gPendingRef.current)
      gPendingRef.current = null
    }
  }, [])

  // Same shape for `z` prefix → `za` (toggle fold). zc/zo aren't supported
  // because the hook doesn't know whether a node is currently collapsed.
  const zPendingRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelZPending = useCallback(() => {
    if (zPendingRef.current !== null) {
      clearTimeout(zPendingRef.current)
      zPendingRef.current = null
    }
  }, [])

  const toggleFoldOnSelection = useCallback(() => {
    if (!selectedId) return
    const target = document.querySelector(`[data-person-id="${selectedId}"]`)
    const toggle = target?.querySelector<HTMLElement>('[data-collapse-toggle]')
    toggle?.click()
  }, [selectedId])

  useEffect(() => {
    if (!enabled) return
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (el?.isContentEditable) return

      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault()
        if (batchSelect) batchSelect(new Set(working.map(p => p.id)))
        return
      }

      // Ctrl+R = vim redo. Browser bare F5/Ctrl+R reload still works because
      // we only intercept when vim mode is enabled (this whole effect is
      // gated on `enabled`).
      if (e.ctrlKey && !e.metaKey && !e.altKey && e.key === 'r') {
        e.preventDefault()
        if (canRedo && onRedo) onRedo()
        return
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return

      // Two-key sequence: `z` followed by `a` toggles fold on selection.
      // Other keys cancel the prefix and fall through.
      if (zPendingRef.current !== null) {
        if (e.key === 'a') {
          cancelZPending()
          e.preventDefault()
          toggleFoldOnSelection()
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
          return
        }
        cancelZPending()
      }

      // Two-key sequences anchored on `g`. Resolve before falling into the
      // single-key switch so a second `g` doesn't restart the prefix.
      if (gPendingRef.current !== null) {
        if (e.key === 'g') {
          cancelGPending()
          e.preventDefault()
          jumpToRoot()
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
          return
        }
        if (e.key === 'p') {
          cancelGPending()
          e.preventDefault()
          jumpToParent()
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
          return
        }
        // Any other key cancels the prefix and falls through to normal handling.
        cancelGPending()
      }

      // Bare 'u' = undo (vim convention). Ctrl+R for redo handled above
      // because it carries a modifier.
      if (e.key === 'u') {
        e.preventDefault()
        if (canUndo && onUndo) onUndo()
        return
      }

      // 'f' = focus chart on the selected person's subtree (set head).
      // Synthetic group keys (pod:/team:/products:) and empty selection
      // are no-ops — head requires a real person id.
      if (e.key === 'f') {
        e.preventDefault()
        if (onSetHead && selectedId && !selectedId.includes(':')) {
          onSetHead(selectedId)
        }
        return
      }

      // 'v' enters visual mode anchored at the current selection. Motion
      // keys (h/j/k/l/arrows) then add neighbors to selectedIds instead
      // of replacing the selection. Esc exits via useUnifiedEscape.
      // Pressing v while already in visual mode toggles back to normal.
      if (e.key === 'v') {
        e.preventDefault()
        if (visualMode) {
          exitVisual()
        } else if (selectedId && !selectedId.includes(':')) {
          visualCursorRef.current = selectedId
          setVisualMode(true)
        }
        return
      }

      if (e.key === 'i' && selectedId) {
        const sidebarInput = document.querySelector<HTMLElement>('aside input, aside select, aside textarea')
        if (sidebarInput) {
          e.preventDefault()
          sidebarInput.focus()
        }
        return
      }

      if (e.key === '/') {
        e.preventDefault()
        const searchInput = document.querySelector<HTMLInputElement>('[data-tour="search"] input, [placeholder*="Search"]')
        searchInput?.focus()
        return
      }

      // ? (Shift+/) opens the keyboard cheat sheet. Vim-convention,
      // mirrors GitHub/Notion/Slack.
      if (e.key === '?' && onShowHelp) {
        e.preventDefault()
        onShowHelp()
        return
      }

      // First `g`: start the two-key prefix. 500ms timeout matches vim
      // default; second key resets it via cancelGPending above.
      if (e.key === 'g') {
        e.preventDefault()
        gPendingRef.current = setTimeout(() => { gPendingRef.current = null }, 500)
        return
      }

      // First `z`: start the z-prefix for fold operations.
      if (e.key === 'z') {
        e.preventDefault()
        zPendingRef.current = setTimeout(() => { zPendingRef.current = null }, 500)
        return
      }

      // `G` (Shift+g): single-key, jump to deepest leaf in current subtree.
      if (e.key === 'G') {
        e.preventDefault()
        jumpToDeepestLeaf()
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
        return
      }

      switch (e.key) {
        case 'ArrowDown':
        case 'j':
        case 'ArrowUp':
        case 'k':
        case 'ArrowRight':
        case 'l':
        case 'ArrowLeft':
        case 'h': {
          e.preventDefault()
          const dir = ({ ArrowDown: 'j', j: 'j', ArrowUp: 'k', k: 'k', ArrowRight: 'l', l: 'l', ArrowLeft: 'h', h: 'h' } as const)[e.key]!
          navigateSpatial(dir)
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
          break
        }
        case 'o':
        case 'O':
        case 'a':
        case '+':
        case 'd':
        case 'x':
        case 'y':
        case 'p':
          e.preventDefault()
          navigate(e.key)
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
          break
      }
    }
    document.addEventListener('keydown', handler)
    return () => {
      document.removeEventListener('keydown', handler)
      cancelGPending()
      cancelZPending()
    }
  }, [enabled, navigate, navigateSpatial, selectedId, batchSelect, working, onShowHelp, jumpToRoot, jumpToDeepestLeaf, jumpToParent, cancelGPending, cancelZPending, toggleFoldOnSelection, onUndo, onRedo, canUndo, canRedo, onSetHead])

  return { cutIds, cancelCut, yankedIds, cancelYank, visualMode, exitVisual }
}
