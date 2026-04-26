// Layout pipeline entry point. computeLayoutTree composes the helpers
// (manager affinity, IC classification, orphan grouping) into the
// LayoutNode tree the views render. Pure helpers live in sibling
// layout*.ts files so each piece is testable in isolation.
//
// This file re-exports the layout types so existing consumers can keep
// importing from `./layoutTree`.

import type { TreeNode } from './shared'
import { isProduct } from '../constants'
import type {
  LayoutNode,
  ManagerLayout,
  ProductLayout,
} from './layoutTypes'
import { reorderManagersByAffinity } from './layoutAffinity'
import { classifyICs, groupUnaffiliated } from './layoutICs'
import { buildOrphanGroups } from './layoutOrphans'

export type {
  Affiliation,
  ManagerLayout,
  ICLayout,
  PodGroupLayout,
  TeamGroupLayout,
  ProductLayout,
  ProductGroupLayout,
  LayoutNode,
} from './layoutTypes'

export type { ClassifiedICs } from './layoutICs'
export { classifyICs, groupUnaffiliated } from './layoutICs'

export function computeLayoutTree(roots: TreeNode[]): LayoutNode[] {
  const withChildren = roots.filter((r) => r.children.length > 0)
  const orphans = roots.filter((r) => r.children.length === 0)

  const result: LayoutNode[] = withChildren.map((root) => buildManagerLayout(root))

  if (orphans.length === 1 && roots.length === 1) {
    return [buildManagerLayout(orphans[0])]
  }

  if (orphans.length > 0) {
    result.push(...buildOrphanGroups(orphans))
  }

  return result
}

function buildManagerLayout(node: TreeNode): ManagerLayout {
  const managers = node.children.filter((c) => c.children.length > 0)
  const allLeaves = node.children.filter((c) => c.children.length === 0)

  const products = allLeaves.filter((c) => isProduct(c.person))
  const ics = allLeaves.filter((c) => !isProduct(c.person))

  // Bucket products by pod — products with a pod nest into the corresponding
  // pod group; products with no pod surface as a manager-level product group.
  const productsByPod = new Map<string, ProductLayout[]>()
  const productsNoPod: ProductLayout[] = []
  for (const c of products) {
    const layout: ProductLayout = { type: 'product', person: c.person }
    if (c.person.pod) {
      const list = productsByPod.get(c.person.pod) ?? []
      list.push(layout)
      productsByPod.set(c.person.pod, list)
    } else {
      productsNoPod.push(layout)
    }
  }

  const reorderedManagers = reorderManagersByAffinity(managers, ics)
  const { withinManager, afterManager, unaffiliated } = classifyICs(ics, reorderedManagers)

  const children: LayoutNode[] = []
  for (let i = 0; i < reorderedManagers.length; i++) {
    const mgrLayout = buildManagerLayout(reorderedManagers[i])
    children.push(mgrLayout)
    const withinIcs = withinManager.get(i)
    if (withinIcs) children.push(...withinIcs)
    const multiIcs = afterManager.get(i)
    if (multiIcs) children.push(...multiIcs)
  }

  children.push(...groupUnaffiliated(unaffiliated, node.person.id))

  // Attach products to any pod group already emitted with a matching name.
  for (const child of children) {
    if (child.type === 'podGroup') {
      const podProducts = productsByPod.get(child.podName)
      if (podProducts) {
        child.products = podProducts
        productsByPod.delete(child.podName)
      }
    }
  }

  // Pods that contain ONLY products (no people) — emit a pod group anyway so
  // products surface under the right pod label.
  for (const [podName, podProducts] of productsByPod) {
    children.push({
      type: 'podGroup',
      podName,
      managerId: node.person.id,
      collapseKey: `pod:${node.person.id}:${podName}`,
      members: [],
      products: podProducts,
    })
  }

  // Products without a pod: standalone product group at the manager level.
  if (productsNoPod.length > 0) {
    children.push({
      type: 'productGroup',
      collapseKey: `products:${node.person.id}`,
      members: productsNoPod,
    })
  }

  return {
    type: 'manager',
    person: node.person,
    collapseKey: node.person.id,
    children,
  }
}
