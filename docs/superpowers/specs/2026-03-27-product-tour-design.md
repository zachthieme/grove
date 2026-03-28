# Product Tour Design

**Date**: 2026-03-27
**Issue**: #13

## Problem

New users have no guided introduction to Grove's features. They land on the upload prompt or an org chart with no context on what's possible.

## Solution

Add a product tour using Driver.js, triggered by a "?" help button in the toolbar. The tour adapts based on whether data is loaded.

## Tour Steps

### No data loaded (3 steps)

1. **Welcome** — Popover (no highlight). "Welcome to Grove! Let's take a quick tour."
2. **Upload** — Highlights upload button/prompt. "Start by uploading a CSV or XLSX org chart file."
3. **Done** — Popover. "Once you've loaded data, click ? again for the full tour."

### Data loaded (9 steps)

1. **Welcome** — Popover (no highlight). "Here's a quick tour of Grove."
2. **View modes** — Highlights view mode pills. "Switch between Detail, Manager, and Table views to see your org chart differently."
3. **Data views** — Highlights data view pills. "Compare the Original import, your Working changes, or see a Diff of what changed."
4. **Person nodes** — Highlights a person node. "Click anyone to edit their details. Hover for quick actions like add, delete, or focus on their subtree."
5. **Drag & drop** — Highlights main content area. "Drag people between managers to reorganize the chart."
6. **Snapshots** — Highlights snapshots dropdown trigger. "Save named snapshots to bookmark your progress. Load any snapshot to jump back."
7. **Export** — Highlights export button. "Export your org chart as CSV, XLSX, PNG, or SVG."
8. **Recycle bin** — Highlights recycle bin button. "Deleted people go here. Restore them or empty the bin."
9. **Done** — Popover. "That's it! Click ? anytime to replay this tour."

## Architecture

### New files
- `web/src/hooks/useTour.ts` — Defines tour steps, exports `useTour()` hook returning `{ startTour }`
- `web/src/tour.css` — Minimal custom Driver.js theme to match Grove design system

### Modified files
- `web/src/components/Toolbar.tsx` — Add "?" help button, call `startTour()`
- `web/src/components/UploadPrompt.tsx` — Add `data-tour="upload"` to upload button
- `web/src/components/SnapshotsDropdown.tsx` — Add `data-tour="snapshots"` to trigger button
- `web/src/components/RecycleBinButton.tsx` — Add `data-tour="recycle-bin"` to button
- `web/src/App.tsx` — Add `data-tour="main-content"` to main area

### Element targeting

CSS Modules hash class names, so Driver.js cannot target by class. We use `data-tour` attributes:

| Attribute | Element | Component |
|-----------|---------|-----------|
| `data-tour="upload"` | Upload button (toolbar) or upload prompt button | Toolbar.tsx / UploadPrompt.tsx |
| `data-tour="view-modes"` | View mode pill group | Toolbar.tsx |
| `data-tour="data-views"` | Data view pill group | Toolbar.tsx |
| `data-tour="main-content"` | Main content area | App.tsx |
| `data-tour="snapshots"` | Snapshots dropdown trigger | SnapshotsDropdown.tsx |
| `data-tour="export"` | Export dropdown button | Toolbar.tsx |
| `data-tour="recycle-bin"` | Recycle bin button | RecycleBinButton.tsx |
| `data-tour="help"` | Help/tour button | Toolbar.tsx |

For person nodes, the tour uses `[data-testid^="person-"]` to find the first person node dynamically.

### Driver.js theming

Custom CSS in `tour.css` overrides Driver.js defaults to match Grove:
- Green accent color (`--grove-green`) for highlight border and buttons
- `--font-display` (Fraunces) for step titles
- `--font-body` (DM Sans) for descriptions
- Warm surface colors for popover background
- Consistent border-radius with `--radius-md`

### Toolbar help button

A "?" button added to the right side of the toolbar, styled as a small circular button matching the existing toolbar aesthetic. Always visible.

## Dependencies

- `driver.js` npm package (MIT license, ~5KB gzipped)

## Testing

- Unit test for `useTour` hook: verify it returns `startTour` function
- Manual testing: verify tour works in both empty and loaded states
- Verify `data-tour` attributes present on all target elements
