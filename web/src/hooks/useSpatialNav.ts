type Direction = 'h' | 'j' | 'k' | 'l'

function center(r: DOMRect): { cx: number; cy: number } {
  return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }
}

/**
 * Given a map of node IDs to their bounding rects and a direction,
 * find the nearest neighbor in that direction from the current node.
 *
 * Candidates are sorted by "alignment level" (off-axis distance bucketed
 * by node size), then by primary-axis distance within each level. This
 * ensures nodes at roughly the same visual level are preferred over
 * diagonally closer nodes at a different level.
 */
export function findSpatialNeighbor(
  currentId: string,
  nodeRects: Map<string, DOMRect>,
  direction: Direction,
): string | null {
  const currentRect = nodeRects.get(currentId)
  if (!currentRect) return null

  const { cx, cy } = center(currentRect)
  const isHorizontal = direction === 'h' || direction === 'l'
  // Bucket size: nodes within this off-axis distance are considered "same level"
  const bucketSize = isHorizontal ? currentRect.height : currentRect.width

  type Candidate = { id: string; primary: number; offAxis: number; bucket: number }
  const candidates: Candidate[] = []

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

    const primary = isHorizontal ? Math.abs(dx) : Math.abs(dy)
    const offAxis = isHorizontal ? Math.abs(dy) : Math.abs(dx)
    const bucket = Math.floor(offAxis / bucketSize)

    candidates.push({ id, primary, offAxis, bucket })
  }

  if (candidates.length === 0) return null

  // Sort by bucket (prefer same level), then by primary distance within bucket
  candidates.sort((a, b) => a.bucket - b.bucket || a.primary - b.primary)
  return candidates[0].id
}
