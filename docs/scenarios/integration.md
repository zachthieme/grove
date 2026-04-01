# Integration Scenarios

---

# Scenario: Critical path integration flow

**ID**: INTEG-001
**Area**: integration
**Tests**:
- `web/e2e/integration-flow.spec.ts` → "upload → edit → autosave → snapshot → restore"

## Behavior
The complete critical user path works end-to-end: upload a CSV, edit a person, autosave fires to server, save a named snapshot, make another edit, restore the snapshot and verify state reverts.

## Invariants
- Upload renders the org chart
- Sidebar edit persists and triggers autosave
- Autosave payload contains the edit
- Named snapshot captures current state
- Snapshot restore reverts to captured state

## Edge cases
- None
