# Playwright Feature Tests — Design Spec

## Goal

Add 12 Playwright feature tests covering major UI functionality not covered by the existing smoke suite. Tests live in `web/e2e/features.spec.ts` alongside the smoke tests.

## Architecture

- Same Playwright infrastructure (config, helpers, `make e2e`)
- New file: `web/e2e/features.spec.ts`
- May add helpers to `web/e2e/helpers.ts` for DnD and lasso operations
- All tests sequential, each uploads fresh CSV for isolation
- Runs via `make e2e` (both smoke and feature specs execute)

## Test Data

- `testdata/simple.csv` — 3 people (Alice VP, Bob Senior Engineer under Alice, Carol Engineer under Bob). Used for most tests.
- `testdata/ddp-org.csv` — 19 people with mixed employment types (FTE, Intern, PSP, CW, Evergreen). Used for employment type filter test.
- `testdata/nonstandard.csv` — Non-standard headers ("Full Name", "Job Title", "Reports To", etc.). Used for column mapping test.
- `testdata/grove.csv` — 42 people. Used if simple.csv lacks the structure a test needs.

## Helper Additions

Add to `web/e2e/helpers.ts`:

- `dragPersonTo(page, sourceName, targetName)` — locates source and target person cards, uses Playwright's `dragTo()` on the drag handle
- `lassoSelect(page, startX, startY, endX, endY)` — performs mousedown/mousemove/mouseup sequence on the chart container to draw a selection rectangle

## Feature Tests

### 1. Drag-and-drop reparent
- Upload `simple.csv`
- Drag Carol onto Alice (reparenting Carol from Bob to Alice)
- Verify Carol's card is now under Alice (check via sidebar that managerId changed)

### 2. Lasso multi-select
- Upload `simple.csv`
- Mousedown on empty chart space, drag rectangle over two person cards, mouseup
- Verify both cards are selected (batch edit sidebar shows "Edit 2 people")

### 3. Pod creation via edit
- Upload `simple.csv`
- Click Bob, edit pod field to "NewPod", save
- Switch to Detail view and verify a "NewPod" pod header appears

### 4. Pod sidebar
- Upload `simple.csv`, create a pod on Bob (set pod to "TestPod", save)
- Click the pod header's info button
- Verify pod sidebar opens showing pod name

### 5. Column mapping modal
- Upload `testdata/nonstandard.csv`
- Verify column mapping modal appears (non-standard headers trigger inference)
- Confirm the mapping
- Verify chart renders with people

### 6. Diff mode
- Upload `simple.csv`
- Edit Bob's role to something new
- Switch data view to "Diff"
- Verify change annotation is visible on Bob's card (diff styling class)

### 7. Employment type filter
- Upload `testdata/ddp-org.csv`
- Count visible person cards
- Toggle an employment type filter to hide a type
- Verify fewer cards are shown

### 8. Note icon toggle
- Upload `simple.csv`
- Click Bob, add a public note via sidebar, save
- Verify note icon appears on Bob's card
- Click the note icon
- Verify note panel slides out with the note text

### 9. Table paste
- Upload `simple.csv`, switch to Table view
- Mock clipboard with comma-separated data: "Name,Role,Team\nNewPerson,Tester,QA"
- Click the Paste button
- Verify "NewPerson" appears as a new row

### 10. Head focus (subtree zoom)
- Upload `grove.csv` (needs deeper hierarchy)
- Hover over a manager card, click the focus button
- Verify only that manager's subtree is visible (fewer cards than before)
- Press Escape to exit focus
- Verify all cards are visible again

### 11. Table column filter
- Upload `simple.csv`, switch to Table view
- Click the filter dropdown on the Status column
- Deselect "Active"
- Verify 0 rows shown (all 3 people are Active)
- Re-select "Active"
- Verify 3 rows shown again

### 12. Team cascade
- Upload `simple.csv`
- Click Bob (who is Carol's manager — a front-line manager)
- Change Bob's team to "NewTeam" in sidebar, save
- Verify Carol's team also changed to "NewTeam" (check in table view)
