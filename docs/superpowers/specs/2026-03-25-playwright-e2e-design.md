# Playwright E2E Smoke Tests — Design Spec

## Goal

Add a small, fast Playwright smoke test suite (7 tests) covering core happy paths. Establish the e2e infrastructure so it's easy to add more tests later.

## Architecture

- **Config:** `web/playwright.config.ts`
- **Tests:** `web/e2e/*.spec.ts`
- **Helpers:** `web/e2e/helpers.ts` (shared upload, navigation, wait utilities)
- **Runner:** `make e2e` (builds Go binary, runs `npx playwright test`)
- **Browser:** Chromium only (fast, sufficient for smoke tests)
- **No npm scripts** — Makefile is the task runner, Playwright CLI runs directly

## Server Management

The Playwright config uses `webServer` to:
1. Build the Go binary (`make build`)
2. Start `./grove -p 9222` (dedicated test port)
3. Wait for `http://localhost:9222/api/health` to return 200
4. Shut down after all tests complete

Each test uploads a fresh CSV so tests are independent — no shared state.

## Test Helpers (`web/e2e/helpers.ts`)

- `uploadCSV(page, filepath)` — click upload area, select file via `setInputFiles`, wait for chart to render
- `switchView(page, view)` — click the view mode button (Detail/Manager/Table)
- `clickPerson(page, name)` — find and click a person card by visible name text
- `waitForChart(page)` — wait for person nodes to appear in the DOM

## Smoke Test Suite

### 1. Upload CSV and see org chart
- Upload `testdata/simple.csv`
- Verify all 3 people render as cards in the detail view

### 2. Switch between views
- Upload `testdata/simple.csv`
- Click Detail → verify cards visible
- Click Manager → verify manager nodes visible
- Click Table → verify table rows visible

### 3. Edit a person via sidebar
- Upload `testdata/simple.csv`
- Click a person card → sidebar opens
- Change their role, click Save
- Verify the updated role appears on the card

### 4. Table inline edit
- Upload `testdata/simple.csv`
- Switch to Table view
- Click a cell, type a new value, blur
- Verify the cell shows the updated value

### 5. Delete and restore
- Upload `testdata/simple.csv`
- Click a person card, click Delete in sidebar
- Verify person disappears from chart
- Open recycle bin, click Restore
- Verify person reappears

### 6. Snapshot save and load
- Upload `testdata/simple.csv`
- Save snapshot named "baseline"
- Edit a person's role
- Load "baseline" snapshot
- Verify original role is restored

### 7. Multi-select batch edit
- Upload `testdata/grove.csv` (needs multiple people)
- Switch to Table view
- Check two row checkboxes
- Verify batch edit sidebar appears with "Edit 2 people"
- Change a field, save
- Verify both people updated

## Test Data

- `testdata/simple.csv` — 3 people, used for tests 1-6
- `testdata/grove.csv` — 42 people, used for test 7

## Makefile Target

```makefile
e2e: build
	cd web && npx playwright test
```

## Dependencies to Install

- `@playwright/test` (dev dependency in `web/package.json`)
- Playwright browsers: `npx playwright install chromium`

## File Structure

```
web/
  playwright.config.ts
  e2e/
    helpers.ts
    smoke.spec.ts
```

All 7 tests live in a single `smoke.spec.ts` file. Each test is self-contained (uploads its own data). Tests run sequentially within the file to avoid port conflicts on the single server instance.
