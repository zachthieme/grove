# Unify Editing Plumbing and Extract PersonForm

**Date**: 2026-03-29
**Issues**: #83, #85
**Status**: Approved

## Problem

Two parallel editing systems (inline card editing via `useInteractionState` and sidebar editing via `DetailSidebar` local state) use identical data shapes and logic but share zero code. The types `EditBuffer` and `FormFields` are the same shape with different names. The conversion functions `bufferFromPerson` and `formFromPerson` are duplicates. The field-to-API mapping logic (`otherTeams -> additionalTeams`, `level -> parseInt`) is copied in three places. `DetailSidebar.tsx` is 632 lines with four near-identical render paths.

Adding a new person field requires changes in 6+ locations across these systems.

## Approach

**Approach B**: Shared utilities + extract PersonForm component. Keep both UX paths (inline and sidebar editing) as-is; unify only the underlying data layer and form rendering.

## Design

### New file: `web/src/utils/personFormUtils.ts`

Unified type replacing both `EditBuffer` and `FormFields`:

```ts
export interface PersonFormValues {
  name: string
  role: string
  discipline: string
  team: string
  otherTeams: string
  managerId: string
  status: string
  employmentType: string
  level: string
  pod: string
  publicNote: string
  privateNote: string
  private: boolean
}
```

Shared functions:

- `personToForm(p: Person): PersonFormValues` — replaces `bufferFromPerson`, `formFromPerson`, `makeEditBuffer`
- `batchToForm(people: Person[]): PersonFormValues` — replaces `formFromBatch`
- `blankForm(): PersonFormValues` — replaces the `blankForm` const
- `computeDirtyFields(original: PersonFormValues, current: PersonFormValues): Record<string, string | boolean | number> | null` — replaces 3 copies of dirty-diff logic
- `dirtyToApiPayload(dirty: Record<string, string | boolean | number>): PersonUpdatePayload` — replaces 3 copies of field mapping

### Changes to `useInteractionState.ts`

- Delete local `EditBuffer` interface and `bufferFromPerson` function
- Import `PersonFormValues` and `personToForm` from `personFormUtils`
- Export type alias `EditBuffer = PersonFormValues` for backward compat during migration
- `commitEdits()` uses `computeDirtyFields()` instead of inline loop
- Hook API shape stays identical

### Type migration

Every file importing `EditBuffer` switches to `PersonFormValues`:
- `store/orgTypes.ts`
- `views/ChartContext.tsx`
- `views/shared.tsx`
- `views/ColumnView.tsx`
- `views/ManagerView.tsx`
- `components/PersonNode.tsx`
- `test-helpers.tsx`

### New file: `web/src/components/PersonForm.tsx`

Props:

```ts
interface PersonFormProps {
  values: PersonFormValues
  onChange: (field: keyof PersonFormValues, value: string | boolean) => void
  managers: Person[]
  isBatch?: boolean
  mixedFields?: Set<string>
  showStatusInfo: boolean
  onToggleStatusInfo: () => void
  firstInputRef?: React.RefObject<HTMLInputElement>
}
```

Renders only the form fields. No header, no save/delete buttons, no sidebar chrome. Pure controlled form. The `isBatch` prop hides the name field and enables Mixed placeholders.

### `DetailSidebar.tsx` refactor

After extraction (~300 lines, down from 632):

1. Single view mode — read-only field display (stays inline)
2. Batch view mode — read-only batch display (stays inline)
3. Single edit mode — header + `<PersonForm>` + save/delete buttons
4. Batch edit mode — header + `<PersonForm isBatch>` + save/clear buttons

Save handlers use `computeDirtyFields()` + `dirtyToApiPayload()`.

### `ViewDataContext.handleCommitEdits` cleanup

Inline field mapping replaced with `dirtyToApiPayload()`.

### Test impact

- `test-helpers.tsx`: `makeEditBuffer` calls `personToForm` instead of duplicating conversion
- `useInteractionState.test.ts`: No API change, tests pass as-is
- `DetailSidebar` tests: DOM structure stays identical, golden snapshots should match
- New: `personFormUtils.test.ts` — unit tests for all shared functions

## Files changed

| File | Change |
|------|--------|
| `web/src/utils/personFormUtils.ts` | NEW — shared type + utilities |
| `web/src/utils/personFormUtils.test.ts` | NEW — unit tests |
| `web/src/components/PersonForm.tsx` | NEW — extracted form component |
| `web/src/store/useInteractionState.ts` | Remove `EditBuffer`, `bufferFromPerson`; import from utils |
| `web/src/components/DetailSidebar.tsx` | Remove `FormFields`, `formFromPerson`, `formFromBatch`, inline form JSX; use `PersonForm` + utils |
| `web/src/store/ViewDataContext.tsx` | `handleCommitEdits` uses `dirtyToApiPayload` |
| `web/src/store/orgTypes.ts` | `EditBuffer` -> `PersonFormValues` |
| `web/src/views/ChartContext.tsx` | `EditBuffer` -> `PersonFormValues` |
| `web/src/views/shared.tsx` | `EditBuffer` -> `PersonFormValues` |
| `web/src/views/ColumnView.tsx` | `EditBuffer` -> `PersonFormValues` |
| `web/src/views/ManagerView.tsx` | `EditBuffer` -> `PersonFormValues` |
| `web/src/components/PersonNode.tsx` | `EditBuffer` -> `PersonFormValues` |
| `web/src/test-helpers.tsx` | `makeEditBuffer` uses `personToForm` |
