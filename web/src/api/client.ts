// Public API barrel. Resource files (org.ts, pods.ts, snapshots.ts, etc.)
// hold the actual fetch wrappers; this file re-exports them so consumers
// keep a single import path: `import { getOrg, ... } from '../api/client'`.

export {
  generateCorrelationId,
  setLoggingEnabled,
  getTelemetryDropCount,
  resetTelemetryDropCount,
  setOnApiError,
  resetClient,
  reportLog,
  installGlobalErrorReporter,
} from './core'

export {
  createOrg,
  getOrg,
  moveNode,
  updateNode,
  addNode,
  addParent,
  copySubtree,
  deleteNode,
  restoreNode,
  emptyBin,
  exportDataUrl,
  reorderPeople,
  resetToOriginal,
  restoreState,
} from './org'

export {
  uploadFile,
  uploadZipFile,
  confirmMapping,
} from './imports'

export {
  listPods,
  updatePod,
  createPod,
  exportPodsSidecarBlob,
} from './pods'

export {
  listSnapshots,
  saveSnapshot,
  loadSnapshot,
  deleteSnapshot,
  exportSnapshotBlob,
} from './snapshots'

export {
  writeAutosave,
  readAutosave,
  deleteAutosave,
} from './autosave'

export {
  getSettings,
  updateSettings,
  exportSettingsSidecarBlob,
} from './settings'

export {
  getConfig,
  getLogs,
  clearLogs,
} from './logs'
export type { AppConfig, LogEntry, LogsResponse } from './logs'
