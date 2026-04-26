// Snapshot CRUD + export.

import type { OrgData, SnapshotInfo } from './types'
import { BASE, fetchWithTimeout, generateCorrelationId, json, jsonWithLog } from './core'

export async function listSnapshots(): Promise<SnapshotInfo[]> {
  return json<SnapshotInfo[]>(await fetchWithTimeout(`${BASE}/snapshots`))
}

export async function saveSnapshot(name: string, correlationId?: string): Promise<SnapshotInfo[]> {
  const cid = correlationId ?? generateCorrelationId()
  const startTime = Date.now()
  const resp = await fetchWithTimeout(`${BASE}/snapshots/save`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
    correlationId: cid,
  })
  return jsonWithLog<SnapshotInfo[]>(resp, {
    method: 'POST', path: '/api/snapshots/save', correlationId: cid, requestBody: { name }, startTime,
  })
}

export async function loadSnapshot(name: string, correlationId?: string): Promise<OrgData> {
  const cid = correlationId ?? generateCorrelationId()
  const startTime = Date.now()
  const resp = await fetchWithTimeout(`${BASE}/snapshots/load`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
    correlationId: cid,
  })
  return jsonWithLog<OrgData>(resp, {
    method: 'POST', path: '/api/snapshots/load', correlationId: cid, requestBody: { name }, startTime,
  })
}

export async function deleteSnapshot(name: string, correlationId?: string): Promise<SnapshotInfo[]> {
  const cid = correlationId ?? generateCorrelationId()
  const startTime = Date.now()
  const resp = await fetchWithTimeout(`${BASE}/snapshots/delete`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
    correlationId: cid,
  })
  return jsonWithLog<SnapshotInfo[]>(resp, {
    method: 'POST', path: '/api/snapshots/delete', correlationId: cid, requestBody: { name }, startTime,
  })
}

export async function exportSnapshotBlob(name: string, format: 'csv' | 'xlsx'): Promise<Blob> {
  const resp = await fetchWithTimeout(`${BASE}/export/snapshot?name=${encodeURIComponent(name)}&format=${format}`)
  if (!resp.ok) {
    throw new Error(`Export snapshot failed: ${resp.status}`)
  }
  return resp.blob()
}
