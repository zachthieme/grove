import type { OrgNode } from '../api/types'
import type { NodeFormValues } from '../utils/nodeFormUtils'
import { STATUS_DESCRIPTIONS, PRODUCT_STATUS_DESCRIPTIONS, statusesForType, isValidStatusForType, type NodeType } from '../constants'
import styles from './DetailSidebar.module.css'

interface NodeFormProps {
  values: NodeFormValues
  onChange: (field: keyof NodeFormValues, value: string | boolean) => void
  managers: OrgNode[]
  isBatch?: boolean
  mixedFields?: Set<string>
  showStatusInfo: boolean
  onToggleStatusInfo: () => void
  firstInputRef?: React.RefObject<HTMLInputElement | null>
}

type StringField = {
  [K in keyof NodeFormValues]: NodeFormValues[K] extends string ? K : never
}[keyof NodeFormValues]

export default function NodeForm({
  values,
  onChange,
  managers,
  isBatch,
  mixedFields,
  showStatusInfo,
  onToggleStatusInfo,
  firstInputRef,
}: NodeFormProps) {
  const mixed = (field: StringField) => !!mixedFields?.has(field)
  const displayVal = (field: StringField) => mixed(field) ? '' : values[field]
  const placeholder = (field: StringField, fallback = '') =>
    mixed(field) ? 'Mixed' : fallback

  const currentType = values.type as NodeType
  const statusDescriptions = currentType === 'product' ? PRODUCT_STATUS_DESCRIPTIONS : STATUS_DESCRIPTIONS

  const statusInfoPopover = showStatusInfo && (
    <div className={styles.infoOverlay} onMouseDown={() => onToggleStatusInfo()}>
      <div className={styles.infoPop} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.infoHeader}>
          <span>Status Types</span>
          <button
            className={styles.infoClose}
            onClick={() => onToggleStatusInfo()}
            title="Close"
            aria-label="Close"
          >
            x
          </button>
        </div>
        {statusesForType(currentType).map((s) => (
          <div key={s} className={styles.infoRow}>
            <strong>{s}</strong> — {(statusDescriptions as Record<string, string>)[s]}
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className={styles.form}>
      {!isBatch && (
        <div className={styles.field}>
          <label htmlFor="field-type">Type</label>
          <select
            id="field-type"
            data-testid="field-type"
            value={values.type}
            onChange={(e) => {
              onChange('type', e.target.value)
              if (e.target.value === 'product') {
                onChange('role', '')
                onChange('discipline', '')
                onChange('employmentType', '')
                onChange('level', '0')
                onChange('otherTeams', '')
                if (!isValidStatusForType(values.status, 'product')) {
                  onChange('status', 'Active')
                }
              }
            }}
          >
            <option value="person">Person</option>
            <option value="product">Product</option>
          </select>
        </div>
      )}
      {!isBatch && (
        <div className={styles.field}>
          <label htmlFor="field-name">Name</label>
          <input
            id="field-name"
            data-testid="field-name"
            ref={firstInputRef}
            value={values.name}
            onChange={(e) => onChange('name', e.target.value)}
          />
        </div>
      )}
      {values.type !== 'product' && (
        <div className={styles.field}>
          <label htmlFor="field-role">Role</label>
          <input
            id="field-role"
            data-testid="field-role"
            value={isBatch ? displayVal('role') : values.role}
            placeholder={isBatch ? placeholder('role') : undefined}
            onChange={(e) => onChange('role', e.target.value)}
          />
        </div>
      )}
      {values.type !== 'product' && (
        <div className={styles.field}>
          <label htmlFor="field-discipline">Discipline</label>
          <input
            id="field-discipline"
            data-testid="field-discipline"
            value={isBatch ? displayVal('discipline') : values.discipline}
            placeholder={isBatch ? placeholder('discipline') : undefined}
            onChange={(e) => onChange('discipline', e.target.value)}
          />
        </div>
      )}
      <div className={styles.field}>
        <label htmlFor="field-team">Team</label>
        <input
          id="field-team"
          data-testid="field-team"
          value={isBatch ? displayVal('team') : values.team}
          placeholder={isBatch ? placeholder('team') : undefined}
          onChange={(e) => onChange('team', e.target.value)}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="field-manager">Manager</label>
        <select
          id="field-manager"
          data-testid="field-manager"
          value={isBatch ? displayVal('managerId') : values.managerId}
          onChange={(e) => onChange('managerId', e.target.value)}
        >
          {isBatch && mixed('managerId') && <option value="">Mixed</option>}
          <option value="">(No manager)</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} — {m.team}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.field}>
        <label htmlFor="field-pod">Pod</label>
        <span className={styles.fieldHint}>
          Group people within a team — e.g. &quot;Backend&quot;, &quot;Frontend&quot;
        </span>
        <input
          id="field-pod"
          data-testid="field-pod"
          value={isBatch ? displayVal('pod') : values.pod}
          placeholder={isBatch ? placeholder('pod') : undefined}
          onChange={(e) => onChange('pod', e.target.value)}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="field-status">
          Status
          <button
            className={styles.infoIcon}
            aria-label="Show status descriptions"
            onClick={() => onToggleStatusInfo()}
          >
            &#8505;
          </button>
        </label>
        {statusInfoPopover}
        <select
          id="field-status"
          data-testid="field-status"
          value={isBatch ? displayVal('status') : values.status}
          onChange={(e) => onChange('status', e.target.value)}
        >
          {isBatch && mixed('status') && <option value="">Mixed</option>}
          {statusesForType(currentType).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      {values.type !== 'product' && (
        <div className={styles.field}>
          <label htmlFor="field-employmentType">Employment Type</label>
          <input
            id="field-employmentType"
            data-testid="field-employmentType"
            value={isBatch ? displayVal('employmentType') : values.employmentType}
            placeholder={isBatch ? placeholder('employmentType', 'FTE') : undefined}
            onChange={(e) => onChange('employmentType', e.target.value)}
          />
        </div>
      )}
      {values.type !== 'product' && (
        <div className={styles.field}>
          <label htmlFor="field-level">Level</label>
          <input
            id="field-level"
            data-testid="field-level"
            type="number"
            min="0"
            value={isBatch ? displayVal('level') : values.level}
            placeholder={isBatch ? placeholder('level') : undefined}
            onChange={(e) => onChange('level', e.target.value)}
          />
        </div>
      )}
      {values.type !== 'product' && (
        <div className={styles.field}>
          <label htmlFor="field-otherTeams">Other Teams</label>
          <input
            id="field-otherTeams"
            data-testid="field-otherTeams"
            value={isBatch ? displayVal('otherTeams') : values.otherTeams}
            placeholder={
              isBatch ? placeholder('otherTeams', 'Comma-separated') : undefined
            }
            onChange={(e) => onChange('otherTeams', e.target.value)}
          />
        </div>
      )}
      <div className={styles.field}>
        <label htmlFor="field-publicNote">Public Note</label>
        <textarea
          id="field-publicNote"
          data-testid="field-publicNote"
          value={isBatch ? displayVal('publicNote') : values.publicNote}
          placeholder={
            isBatch
              ? placeholder('publicNote', 'Visible on the org chart')
              : 'Visible on the org chart'
          }
          onChange={(e) => onChange('publicNote', e.target.value)}
          rows={3}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="field-privateNote">Private Note</label>
        <textarea
          id="field-privateNote"
          data-testid="field-privateNote"
          value={isBatch ? displayVal('privateNote') : values.privateNote}
          placeholder={
            isBatch
              ? placeholder('privateNote', 'Only visible in this panel')
              : 'Only visible in this panel'
          }
          onChange={(e) => onChange('privateNote', e.target.value)}
          rows={3}
        />
      </div>
      <div className={styles.field}>
        <label className={styles.checkboxLabel}>
          <span>Private</span>
          <input
            type="checkbox"
            data-testid="field-private"
            checked={values.private}
            onChange={(e) => onChange('private', e.target.checked)}
          />
        </label>
        <span className={styles.privateHint}>
          Hidden when private toggle is off
        </span>
      </div>
    </div>
  )
}
