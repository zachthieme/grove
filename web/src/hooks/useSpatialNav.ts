type Direction = 'h' | 'j' | 'k' | 'l'

function center(r: DOMRect): { cx: number; cy: number } {
  return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }
}

/**
 * Given a map of node IDs to their bounding rects and a direction,
 * find the nearest neighbor in that direction from the current node.
 *
 * For h/l (horizontal): prefer nodes in the same vertical band (within
 * 1.5x node height), pick closest by horizontal distance. Falls back to
 * any candidate with off-axis penalty if no same-band nodes exist.
 *
 * For j/k (vertical): same logic but rotated — prefer same horizontal
 * band (within 1.5x node width), pick closest by vertical distance.
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
  // Band tolerance: nodes within this off-axis distance are "same level"
  const bandTolerance = isHorizontal
    ? currentRect.height * 1.5
    : currentRect.width * 1.5

  type Candidate = { id: string; primary: number; offAxis: number; inBand: boolean }
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
    const inBand = offAxis <= bandTolerance

    candidates.push({ id, primary, offAxis, inBand })
  }

  if (candidates.length === 0) return null

  // Prefer in-band candidates (same visual level), sorted by primary axis distance
  const inBand = candidates.filter(c => c.inBand)
  if (inBand.length > 0) {
    inBand.sort((a, b) => a.primary - b.primary)
    return inBand[0].id
  }

  // Fallback: closest by primary axis distance
  candidates.sort((a, b) => a.primary - b.primary)
  return candidates[0].id
}
