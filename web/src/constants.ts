/** Sentinel snapshot name for the original import state */
export const ORIGINAL_SNAPSHOT = '__original__'

/** Drop target prefix for team-based drops */
export const TEAM_DROP_PREFIX = 'team::'

/** Drop target prefix for pod-based drops */
export const POD_DROP_PREFIX = 'pod:'

/** Internal snapshot name used during export */
export const EXPORT_TEMP_SNAPSHOT = '__export_temp__'

/** Sentinel value for mixed batch fields */
export const MIXED_VALUE = '__mixed__'

/** localStorage key for autosave data */
export const AUTOSAVE_STORAGE_KEY = 'grove-autosave'

/** All valid person statuses */
export const STATUSES = [
  'Active', 'Open', 'Transfer In', 'Transfer Out', 'Backfill', 'Planned',
] as const

/** Status type derived from the STATUSES array — single source of truth */
export type Status = (typeof STATUSES)[number]

/** Default status for new people */
export const DEFAULT_STATUS: Status = 'Active'

/** Statuses that represent recruiting/backfill positions */
export const RECRUITING_STATUSES: ReadonlySet<Status> = new Set(['Open', 'Backfill'])

/** Statuses that represent transfer activity */
export const TRANSFER_STATUSES: ReadonlySet<Status> = new Set(['Transfer In', 'Transfer Out'])

/** Statuses that represent planned/future positions */
export const PLANNED_STATUSES: ReadonlySet<Status> = new Set(['Planned'])

/** Check if a status represents a recruiting/backfill position */
export function isRecruitingStatus(status: string): boolean {
  return RECRUITING_STATUSES.has(status as Status)
}

/** Check if a status represents a transfer */
export function isTransferStatus(status: string): boolean {
  return TRANSFER_STATUSES.has(status as Status)
}

/** Check if a status represents a planned/future position */
export function isPlannedStatus(status: string): boolean {
  return PLANNED_STATUSES.has(status as Status)
}

/** Human-readable descriptions for each status */
export const STATUS_DESCRIPTIONS: Record<Status, string> = {
  'Active': 'Currently filled and working',
  'Open': 'Approved headcount, actively recruiting',
  'Transfer In': 'Person coming from another team/org',
  'Transfer Out': 'Person leaving to another team/org',
  'Backfill': 'Replacing someone who left',
  'Planned': 'Future headcount, not yet approved or active',
}

/** Node type */
export type NodeType = 'person' | 'product'
export const NODE_TYPE_PERSON: NodeType = 'person'
export const NODE_TYPE_PRODUCT: NodeType = 'product'

/** Type-narrowing helper. Treats missing/empty type as 'person'. */
export function isProduct(node: { type?: string }): boolean {
  return node.type === NODE_TYPE_PRODUCT
}

/** Effective node type (defaults to 'person' when missing). */
export function nodeTypeOf(node: { type?: string }): NodeType {
  return node.type === NODE_TYPE_PRODUCT ? NODE_TYPE_PRODUCT : NODE_TYPE_PERSON
}

/** All valid product statuses */
export const PRODUCT_STATUSES = [
  'Active', 'Deprecated', 'Planned', 'Sunsetting',
] as const

export type ProductStatus = (typeof PRODUCT_STATUSES)[number]

/** Default status for new products */
export const DEFAULT_PRODUCT_STATUS: ProductStatus = 'Active'

/** Human-readable descriptions for product statuses */
export const PRODUCT_STATUS_DESCRIPTIONS: Record<ProductStatus, string> = {
  'Active': 'Currently maintained and supported',
  'Deprecated': 'No longer actively maintained',
  'Planned': 'Planned for development',
  'Sunsetting': 'Being phased out',
}

/** Check valid status for a given node type */
export function isValidStatusForType(status: string, type: NodeType | undefined): boolean {
  if (type === 'product') {
    return (PRODUCT_STATUSES as readonly string[]).includes(status)
  }
  return (STATUSES as readonly string[]).includes(status)
}

/** Get valid statuses for a node type */
export function statusesForType(type: NodeType | undefined): readonly string[] {
  return type === 'product' ? PRODUCT_STATUSES : STATUSES
}
