import { useMemo } from 'react'
import { hierarchy, tree } from 'd3-hierarchy'
import type { Person } from '../api/types'
import PersonNode from '../components/PersonNode'
import useZoomPan from '../hooks/useZoomPan'
import styles from './TreeView.module.css'

const NODE_WIDTH = 160
const NODE_HEIGHT = 70
const NODE_GAP_X = 40
const NODE_GAP_Y = 80

interface TreeViewProps {
  people: Person[]
  selectedId: string | null
  onSelect: (id: string) => void
}

interface TreeNode {
  id: string
  person: Person | null // null for virtual root
  children: TreeNode[]
}

export default function TreeView({ people, selectedId, onSelect }: TreeViewProps) {
  const { style, handlers } = useZoomPan()

  const { nodes, links, width, height } = useMemo(() => {
    if (people.length === 0) {
      return { nodes: [], links: [], width: 0, height: 0 }
    }

    // Build tree structure
    const byId = new Map<string, Person>()
    for (const p of people) {
      byId.set(p.id, p)
    }

    const treeNodes = new Map<string, TreeNode>()

    for (const p of people) {
      const node: TreeNode = { id: p.id, person: p, children: [] }
      treeNodes.set(p.id, node)
    }

    const roots: TreeNode[] = []
    for (const p of people) {
      if (p.managerId && byId.has(p.managerId)) {
        const parent = treeNodes.get(p.managerId)!
        parent.children.push(treeNodes.get(p.id)!)
      } else {
        roots.push(treeNodes.get(p.id)!)
      }
    }

    // If multiple roots, create virtual root
    let rootNode: TreeNode
    const hasVirtualRoot = roots.length !== 1
    if (hasVirtualRoot) {
      rootNode = { id: '__root__', person: null, children: roots }
    } else {
      rootNode = roots[0]
    }

    // Build d3 hierarchy and compute layout
    const root = hierarchy(rootNode, (d) => d.children)
    const treeLayout = tree<TreeNode>().nodeSize([
      NODE_WIDTH + NODE_GAP_X,
      NODE_HEIGHT + NODE_GAP_Y,
    ])
    treeLayout(root)

    // Collect all nodes and links, filtering out virtual root
    const allNodes = root.descendants().filter((d) => d.data.id !== '__root__')
    const allLinks = root.links().filter(
      (l) => l.source.data.id !== '__root__' && l.target.data.id !== '__root__'
    )

    // Compute bounds so nothing is negative
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const n of allNodes) {
      const nx = n.x!
      const ny = n.y!
      if (nx < minX) minX = nx
      if (ny < minY) minY = ny
      if (nx > maxX) maxX = nx
      if (ny > maxY) maxY = ny
    }

    const offsetX = -minX + NODE_WIDTH / 2 + 20
    const offsetY = -minY + 20

    const computedNodes = allNodes.map((n) => ({
      id: n.data.id,
      person: n.data.person!,
      x: n.x! + offsetX,
      y: n.y! + offsetY,
    }))

    const computedLinks = allLinks.map((l) => ({
      sourceX: l.source.x! + offsetX + NODE_WIDTH / 2,
      sourceY: l.source.y! + offsetY + NODE_HEIGHT,
      targetX: l.target.x! + offsetX + NODE_WIDTH / 2,
      targetY: l.target.y! + offsetY,
    }))

    const w = maxX - minX + NODE_WIDTH + 40 + NODE_WIDTH
    const h = maxY - minY + NODE_HEIGHT + 40

    return { nodes: computedNodes, links: computedLinks, width: w, height: h }
  }, [people])

  if (people.length === 0) {
    return <div className={styles.container}>No people to display.</div>
  }

  return (
    <div className={styles.container} {...handlers}>
      <div style={{ ...style, position: 'relative', width, height }}>
        <svg className={styles.svg} width={width} height={height}>
          {links.map((l, i) => (
            <path
              key={i}
              d={`M ${l.sourceX} ${l.sourceY} C ${l.sourceX} ${l.sourceY + NODE_GAP_Y / 2}, ${l.targetX} ${l.targetY - NODE_GAP_Y / 2}, ${l.targetX} ${l.targetY}`}
              fill="none"
              stroke="#94a3b8"
              strokeWidth={1.5}
            />
          ))}
        </svg>
        {nodes.map((n) => (
          <div
            key={n.id}
            className={styles.nodeWrapper}
            style={{
              left: n.x,
              top: n.y,
              width: NODE_WIDTH,
              height: NODE_HEIGHT,
            }}
          >
            <PersonNode
              person={n.person}
              selected={n.id === selectedId}
              onClick={() => onSelect(n.id)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
