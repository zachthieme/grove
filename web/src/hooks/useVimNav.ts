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
 * Esc  — cancel cut / deselect
 */
export function useVimNav({ working, pods, selectedId, selectedIds, batchSelect, onDelete, onAddReport, onAddProduct, onAddToTeam, onAddParent, onShowHelp, move, reparent, enabled }: VimNavOptions) {
  const [cutIds, setCutIds] = useState<string[]>([])
  const cancelCut = useCallback(() => setCutIds([]), [])

  useEffect(() => {
    if (cutIds.length > 0) {
      const remaining = cutIds.filter(id => working.some(p => p.id === id))
      if (remaining.length === 0) setCutIds([])
    }
  }, [cutIds, working])

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
    const currentId = selectedId
      ?? document.querySelector('[data-selected="true"]')
          ?.closest('[data-person-id]')
          ?.getAttribute('data-person-id')
      ?? null

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
    if (targetId) {
      const targetEl = document.querySelector(`[data-person-id="${targetId}"]`)
      targetEl?.querySelector<HTMLElement>('[role="button"]')?.click()
      targetEl?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
    }
  }, [selectedId])

  const navigate = useCallback((key: string) => {
    // Multi-select: only set-based ops apply (d delete, x cut). Single-target ops
    // (o, O, P, p) require a single selection — App.tsx sets selectedId to null
    // when selectedIds.size !== 1.
    if (!selectedId) {
      const multi = selectedIds && selectedIds.size > 1 ? Array.from(selectedIds) : null
      if (!multi) return
      switch (key) {
        case 'd':
          for (const id of multi) onDelete?.(id)
          return
        case 'x':
          setCutIds(multi)
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
        if (personIds.length > 0) setCutIds(personIds)
        break
      }
      case 'p': {
        if (cutIds.length > 0) {
          // Same moveToTarget used by drag-and-drop
          moveToTarget(cutIds, selectedId, { move, reparent }, pods)
          setCutIds([])
        }
        break
      }
    }
  }, [selectedId, selectedIds, working, pods, onDelete, onAddReport, onAddProduct, onAddToTeam, onAddParent, move, reparent, cutIds])

  // Two-key sequence prefix state: set by the first `g`, consumed by the
  // next `g`/`p`, cleared on timeout or any other key.
  const gPendingRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelGPending = useCallback(() => {
    if (gPendingRef.current !== null) {
      clearTimeout(gPendingRef.current)
      gPendingRef.current = null
    }
  }, [])

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

      if (e.metaKey || e.ctrlKey || e.altKey) return

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
    }
  }, [enabled, navigate, navigateSpatial, selectedId, batchSelect, working, onShowHelp, jumpToRoot, jumpToDeepestLeaf, jumpToParent, cancelGPending])

  return { cutIds, cancelCut }
}
