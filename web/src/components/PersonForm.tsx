import type { Person } from '../api/types'
import type { PersonFormValues } from '../utils/personFormUtils'
import { STATUSES, STATUS_DESCRIPTIONS } from '../constants'
import styles from './DetailSidebar.module.css'

interface PersonFormProps {
  values: PersonFormValues
  onChange: (field: keyof PersonFormValues, value: string | boolean) => void
  managers: Person[]
  isBatch?: boolean
  mixedFields?: Set<string>
  showStatusInfo: boolean
  onToggleStatusInfo: () => void
  firstInputRef?: React.RefObject<HTMLInputElement | null>
}

type StringField = {
  [K in keyof PersonFormValues]: PersonFormValues[K] extends string ? K : never
}[keyof PersonFormValues]

export default function PersonForm({
  values,
  onChange,
  managers,
  isBatch,
  mixedFields,
  showStatusInfo,
  onToggleStatusInfo,
  firstInputRef,
}: PersonFormProps) {
  const mixed = (field: StringField) => !!mixedFields?.has(field)
  const displayVal = (field: StringField) => mixed(field) ? '' : values[field]
  const placeholder = (field: StringField, fallback = '') =>
    mixed(field) ? 'Mixed' : fallback

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
        {STATUSES.map((s) => (
          <div key={s} className={styles.infoRow}>
            <strong>{s}</strong> — {STATUS_DESCRIPTIONS[s]}
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className={styles.form}>
      {!isBatch && (
        <div className={styles.field}>
          <label>Name</label>
          <input
            data-testid="field-name"
            ref={firstInputRef}
            value={values.name}
            onChange={(e) => onChange('name', e.target.value)}
          />
        </div>
      )}
      <div className={styles.field}>
        <label>Role</label>
        <input
          data-testid="field-role"
          value={isBatch ? displayVal('role') : values.role}
          placeholder={isBatch ? placeholder('role') : undefined}
          onChange={(e) => onChange('role', e.target.value)}
        />
      </div>
      <div className={styles.field}>
        <label>Discipline</label>
        <input
          data-testid="field-discipline"
          value={isBatch ? displayVal('discipline') : values.discipline}
          placeholder={isBatch ? placeholder('discipline') : undefined}
          onChange={(e) => onChange('discipline', e.target.value)}
        />
      </div>
      <div className={styles.field}>
        <label>Team</label>
        <input
          data-testid="field-team"
          value={isBatch ? displayVal('team') : values.team}
          placeholder={isBatch ? placeholder('team') : undefined}
          onChange={(e) => onChange('team', e.target.value)}
        />
      </div>
      <div className={styles.field}>
        <label>Manager</label>
        <select
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
        <label>Pod</label>
        <span className={styles.fieldHint}>
          Group people within a team — e.g. &quot;Backend&quot;, &quot;Frontend&quot;
        </span>
        <input
          data-testid="field-pod"
          value={isBatch ? displayVal('pod') : values.pod}
          placeholder={isBatch ? placeholder('pod') : undefined}
          onChange={(e) => onChange('pod', e.target.value)}
        />
      </div>
      <div className={styles.field}>
        <label>
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
          data-testid="field-status"
          value={isBatch ? displayVal('status') : values.status}
          onChange={(e) => onChange('status', e.target.value)}
        >
          {isBatch && mixed('status') && <option value="">Mixed</option>}
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.field}>
        <label>Employment Type</label>
        <input
          data-testid="field-employmentType"
          value={isBatch ? displayVal('employmentType') : values.employmentType}
          placeholder={isBatch ? placeholder('employmentType', 'FTE') : undefined}
          onChange={(e) => onChange('employmentType', e.target.value)}
        />
      </div>
      <div className={styles.field}>
        <label>Level</label>
        <input
          data-testid="field-level"
          type="number"
          min="0"
          value={isBatch ? displayVal('level') : values.level}
          placeholder={isBatch ? placeholder('level') : undefined}
          onChange={(e) => onChange('level', e.target.value)}
        />
      </div>
      <div className={styles.field}>
        <label>Other Teams</label>
        <input
          data-testid="field-otherTeams"
          value={isBatch ? displayVal('otherTeams') : values.otherTeams}
          placeholder={
            isBatch ? placeholder('otherTeams', 'Comma-separated') : undefined
          }
          onChange={(e) => onChange('otherTeams', e.target.value)}
        />
      </div>
      <div className={styles.field}>
        <label>Public Note</label>
        <textarea
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
        <label>Private Note</label>
        <textarea
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
