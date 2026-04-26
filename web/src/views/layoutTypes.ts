// Layout types shared across the layout pipeline. computeLayoutTree
// transforms TreeNode trees into LayoutNode trees that ColumnView and
// ManagerView render directly.

import type { OrgNode } from '../api/types'

export type Affiliation = 'local' | 'singleCrossTeam' | 'multiCrossTeam'

export interface ManagerLayout {
  type: 'manager'
  person: OrgNode
  collapseKey: string
  children: LayoutNode[]
}

export interface ICLayout {
  type: 'ic'
  person: OrgNode
  affiliation: Affiliation
}

export interface PodGroupLayout {
  type: 'podGroup'
  podName: string
  managerId: string
  collapseKey: string
  members: ICLayout[]
  /** Products carried inside this pod (rendered as a sub-stack, no header). */
  products?: ProductLayout[]
}

export interface TeamGroupLayout {
  type: 'teamGroup'
  teamName: string
  collapseKey: string
  members: ICLayout[]
}

export interface ProductLayout {
  type: 'product'
  person: OrgNode
}

export interface ProductGroupLayout {
  type: 'productGroup'
  collapseKey: string
  members: ProductLayout[]
}

export type LayoutNode = ManagerLayout | ICLayout | PodGroupLayout | TeamGroupLayout | ProductGroupLayout | ProductLayout
