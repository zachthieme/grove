# Private People — Design Spec

## Summary

Add a `private` boolean field to Person that allows marking people as hidden from the display. This supports planning scenarios where people are moving teams but haven't been notified yet — they exist in the data for planning purposes but aren't visible by default.

A toolbar toggle appears only when private people exist, showing a count and allowing the user to reveal/hide them.

## Person Model

Add `private: boolean` (default `false`) to:
- Go domain model: `internal/model/model.go` — `Person.Private bool`
- Go API model: `internal/api/model.go` — `Person.Private bool \`json:"private,omitempty"\``
- TypeScript: `web/src/api/types.ts` — `Person.private?: boolean`

The field is persisted in autosave, snapshots, and exports (CSV/XLSX/ZIP) like any other Person field.

## Column Inference

Add `"private"` as a recognized column in the CSV/XLSX import inference system. Exact match only, no synonyms. Values map to boolean (`true`/`1`/`yes` → true, everything else → false).

## Toolbar Toggle

Three states:

1. **No private people exist**: No indicator shown in the toolbar.
2. **Private people exist, hidden (default)**: Eye-slash icon with count (e.g., "3 hidden"), muted styling. Positioned near the existing employment type filter button.
3. **Private people exist, shown**: Eye icon with count (e.g., "3 shown"), green-tinted active styling.

Clicking the indicator toggles between hidden/shown states.

## UI State

Add `showPrivate: boolean` to `UIContext`, defaulting to `false`.

## Filtering (Data Layer)

Filtering is implemented at the data layer via the existing `useFilteredPeople` hook pattern, so all views (Detail, Manager, Table) get correct behavior automatically.

When `showPrivate` is `false`:

1. Remove all people where `private === true` from the visible dataset.
2. For any removed person who is a manager of visible (non-private) people, inject a synthetic **placeholder node**:
   - Generated stable ID (deterministic from the hidden manager's ID, so it's consistent across re-renders)
   - Name: "TBD Manager"
   - No role, discipline, or team
   - Status: "—"
   - Flagged with `isPlaceholder: true` (frontend-only, not persisted — this is a computed property on the filtered output)
3. Reparent the visible reports to point at the placeholder's ID.

When `showPrivate` is `true`: no filtering, all people shown normally.

## Person Card Display

When private people are revealed (`showPrivate` is `true`):
- Private people render with their normal card styling plus a small 🔒 icon in the top-right corner of the card.
- All normal interactions work (edit, delete, drag, etc.).

When private people are hidden (`showPrivate` is `false`):
- Private people are not rendered at all.
- Placeholder "TBD Manager" nodes have:
  - Dashed border, italic text, muted colors
  - Non-interactive: no edit, no delete, no drag-as-source
  - **Do accept drops**: dropping someone onto a placeholder reparents them to the real hidden manager's ID

## Edit Sidebar

Add a "Private" toggle switch to the edit form in `DetailSidebar.tsx`. Styled as an on/off switch with a brief description: "Hidden when private toggle is off".

## Edge Cases

### Diff Mode
When comparing Original vs Working with private people hidden, the diff only shows visible changes. A private person added in Working won't appear as a diff annotation when hidden. When shown, they diff normally.

### Recycle Bin
Private people can be deleted and restored like anyone else. The recycle bin shows the lock icon when `showPrivate` is on. When `showPrivate` is off, deleted private people don't appear in the bin.

### Search / Head Subtree
If the head person filter is set to a private person and they're hidden, the filter clears (falls back to showing the full tree). Search results only include visible people.

### Manager Dropdown
When `showPrivate` is false, hidden managers don't appear in the manager dropdown — except as "TBD Manager" if they have visible reports.

### Metrics
`useOrgMetrics` counts reflect only visible people when private people are hidden.

### Export
Exports always include all people (including private) regardless of the toggle state. The `private` column appears in CSV/XLSX output. The toggle is a view filter, not a data filter — export captures the full dataset.

### Drag-and-Drop onto Placeholders
TBD placeholder nodes accept drops. The drop reparents the dragged person to the real hidden manager's ID, not the placeholder's synthetic ID.
