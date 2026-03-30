type Direction = 'h' | 'j' | 'k' | 'l'

function center(r: DOMRect): { cx: number; cy: number } {
  return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }
}

/**
 * Given a map of node IDs to their bounding rects and a direction,
 * find the nearest neighbor in that direction from the current node.
 * Uses Euclidean distance with directional axis bias (2x weight on primary axis).
 */
export function findSpatialNeighbor(
  currentId: string,
  nodeRects: Map<string, DOMRect>,
  direction: Direction,
): string | null {
  const currentRect = nodeRects.get(currentId)
  if (!currentRect) return null

  const { cx, cy } = center(currentRect)

  let bestId: string | null = null
  let bestDist = Infinity

  for (const [id, rect] of nodeRects) {
    if (id === currentId) continue
    const { cx: nx, cy: ny } = center(rect)

    const dx = nx - cx
    const dy = ny - cy

    let valid = false
    switch (direction) {
      case 'h': valid = dx < 0; break
      case 'l': valid = dx > 0; break
      case 'j': valid = dy > 0; break
      case 'k': valid = dy < 0; break
    }
    if (!valid) continue

    const isHorizontal = direction === 'h' || direction === 'l'
    const wx = isHorizontal ? Math.abs(dx) : Math.abs(dx) * 2
    const wy = isHorizontal ? Math.abs(dy) * 2 : Math.abs(dy)
    const dist = Math.sqrt(wx * wx + wy * wy)

    if (dist < bestDist) {
      bestDist = dist
      bestId = id
    }
  }

  return bestId
}
