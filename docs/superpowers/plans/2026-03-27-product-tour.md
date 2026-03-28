# Product Tour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Driver.js-powered product tour triggered by a "?" help button in the toolbar, with adaptive steps based on whether data is loaded.

**Architecture:** A `useTour` hook defines the tour steps and returns a `startTour()` function. The Toolbar renders a "?" button that calls it. Key elements get `data-tour` attributes so Driver.js can find them (CSS Modules hash class names). Custom CSS themes the Driver.js popover to match Grove's botanical design.

**Tech Stack:** Driver.js (npm), React hooks, CSS

---

### Task 1: Install Driver.js and create tour CSS theme

**Files:**
- Create: `web/src/tour.css`
- Modify: `web/package.json` (via npm install)

- [ ] **Step 1: Install driver.js**

Run: `cd /home/zach/code/grove/web && npm install driver.js`

- [ ] **Step 2: Create the tour CSS theme**

Create `web/src/tour.css`:

```css
/* Grove-themed Driver.js overrides */

.driver-popover {
  background: var(--surface-raised);
  color: var(--text-primary);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--border-soft);
  font-family: var(--font-body);
}

.driver-popover .driver-popover-title {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--grove-green);
}

.driver-popover .driver-popover-description {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.driver-popover .driver-popover-progress-text {
  font-size: 11px;
  color: var(--text-muted);
}

.driver-popover .driver-popover-prev-btn {
  background: var(--surface-sunken);
  color: var(--text-secondary);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 500;
  padding: 5px 14px;
  text-shadow: none;
}

.driver-popover .driver-popover-prev-btn:hover {
  background: var(--surface-toolbar);
  color: var(--text-primary);
}

.driver-popover .driver-popover-next-btn,
.driver-popover .driver-popover-close-btn-text {
  background: var(--grove-green);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
  padding: 5px 14px;
  text-shadow: none;
}

.driver-popover .driver-popover-next-btn:hover,
.driver-popover .driver-popover-close-btn-text:hover {
  background: var(--grove-green-light);
}
```

- [ ] **Step 3: Commit**

```
jj describe -m "feat: install driver.js and add Grove-themed tour CSS"
jj new
```

---

### Task 2: Add data-tour attributes to target elements

**Files:**
- Modify: `web/src/components/Toolbar.tsx`
- Modify: `web/src/components/UploadPrompt.tsx`
- Modify: `web/src/components/SnapshotsDropdown.tsx`
- Modify: `web/src/components/RecycleBinButton.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Add data-tour to Toolbar elements**

In `web/src/components/Toolbar.tsx`:

Add `data-tour="upload"` to the upload button (line 69):
```tsx
      <button className={styles.uploadBtn} onClick={() => inputRef.current?.click()} aria-label="Upload file" data-tour="upload">
```

Add `data-tour="view-modes"` to the first pill group (line 75):
```tsx
          <div className={styles.pillGroup} data-tour="view-modes">
```

Add `data-tour="data-views"` to the second pill group (line 87):
```tsx
          <div className={styles.pillGroup} data-tour="data-views">
```

Add `data-tour="export"` to the export button (line 110-111):
```tsx
              className={styles.exportBtn}
              data-tour="export"
```

- [ ] **Step 2: Add data-tour to UploadPrompt**

In `web/src/components/UploadPrompt.tsx`, add `data-tour="upload-prompt"` to the upload button (line 53):
```tsx
      <button
        onClick={() => inputRef.current?.click()}
        className={styles.uploadBtn}
        data-tour="upload-prompt"
      >
```

- [ ] **Step 3: Add data-tour to SnapshotsDropdown**

In `web/src/components/SnapshotsDropdown.tsx`, add `data-tour="snapshots"` to the trigger button (line 47-48):
```tsx
      <button
        className={styles.trigger}
        data-tour="snapshots"
```

- [ ] **Step 4: Add data-tour to RecycleBinButton**

In `web/src/components/RecycleBinButton.tsx`, add `data-tour="recycle-bin"` to the button (line 20):
```tsx
    <button
      onClick={() => setBinOpen(!binOpen)}
      className={`${styles.btn} ${binOpen ? styles.open : styles.closed}`}
      data-tour="recycle-bin"
```

- [ ] **Step 5: Add data-tour to App main content**

In `web/src/App.tsx`, add `data-tour="main-content"` to the main element (line 166):
```tsx
        <main className={styles.main} ref={mainRef} data-tour="main-content">
```

- [ ] **Step 6: Run tests to verify nothing broke**

Run: `cd /home/zach/code/grove/web && npm test -- --run`
Expected: Some golden tests may fail due to new attributes. If so, update:
Run: `cd /home/zach/code/grove/web && npm test -- --run -u`
Then verify: `cd /home/zach/code/grove/web && npm test -- --run`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```
jj describe -m "feat: add data-tour attributes to key UI elements"
jj new
```

---

### Task 3: Create useTour hook

**Files:**
- Create: `web/src/hooks/useTour.ts`

- [ ] **Step 1: Create the useTour hook**

Create `web/src/hooks/useTour.ts`:

```ts
import { useCallback } from 'react'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import '../tour.css'

function buildSteps(loaded: boolean) {
  if (!loaded) {
    return [
      {
        popover: {
          title: 'Welcome to Grove',
          description: "Let's take a quick tour of your org chart tool.",
        },
      },
      {
        element: '[data-tour="upload-prompt"], [data-tour="upload"]',
        popover: {
          title: 'Upload Your Data',
          description: 'Start by uploading a CSV or XLSX org chart file.',
        },
      },
      {
        popover: {
          title: "That's It for Now",
          description: 'Once you\'ve loaded data, click the ? button again for the full tour.',
        },
      },
    ]
  }

  return [
    {
      popover: {
        title: 'Welcome to Grove',
        description: "Here's a quick tour of your org chart tool.",
      },
    },
    {
      element: '[data-tour="view-modes"]',
      popover: {
        title: 'View Modes',
        description: 'Switch between Detail, Manager, and Table views to see your org chart differently.',
      },
    },
    {
      element: '[data-tour="data-views"]',
      popover: {
        title: 'Data Views',
        description: 'Compare the Original import, your Working changes, or see a Diff of what changed.',
      },
    },
    {
      element: '[data-testid^="person-"]',
      popover: {
        title: 'People',
        description: 'Click anyone to edit their details. Hover for quick actions like add, delete, or focus on their subtree.',
      },
    },
    {
      element: '[data-tour="main-content"]',
      popover: {
        title: 'Drag & Drop',
        description: 'Drag people between managers to reorganize the chart.',
      },
    },
    {
      element: '[data-tour="snapshots"]',
      popover: {
        title: 'Snapshots',
        description: 'Save named snapshots to bookmark your progress. Load any snapshot to jump back.',
      },
    },
    {
      element: '[data-tour="export"]',
      popover: {
        title: 'Export',
        description: 'Export your org chart as CSV, XLSX, PNG, or SVG.',
      },
    },
    {
      element: '[data-tour="recycle-bin"]',
      popover: {
        title: 'Recycle Bin',
        description: 'Deleted people go here. Restore them or empty the bin.',
      },
    },
    {
      popover: {
        title: "You're All Set!",
        description: 'Click the ? button anytime to replay this tour.',
      },
    },
  ]
}

export function useTour(loaded: boolean) {
  const startTour = useCallback(() => {
    const tour = driver({
      showProgress: true,
      animate: true,
      smoothScroll: true,
      stagePadding: 8,
      stageRadius: 8,
      steps: buildSteps(loaded),
    })
    tour.drive()
  }, [loaded])

  return { startTour }
}
```

- [ ] **Step 2: Commit**

```
jj describe -m "feat: create useTour hook with adaptive Driver.js steps"
jj new
```

---

### Task 4: Add help button to Toolbar and wire up the tour

**Files:**
- Modify: `web/src/components/Toolbar.tsx`
- Modify: `web/src/components/Toolbar.module.css`

- [ ] **Step 1: Add helpBtn styles to Toolbar.module.css**

Add to the end of `web/src/components/Toolbar.module.css`:

```css
.helpBtn {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 1px solid var(--border-medium);
  background: var(--surface-raised);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
  flex-shrink: 0;
}

.helpBtn:hover {
  background: var(--grove-green);
  border-color: var(--grove-green);
  color: #fff;
}
```

- [ ] **Step 2: Wire useTour into Toolbar**

In `web/src/components/Toolbar.tsx`:

Add import at the top (after existing imports):
```tsx
import { useTour } from '../hooks/useTour'
```

Inside the `Toolbar` function, after the existing state declarations (after line 42):
```tsx
  const { startTour } = useTour(loaded)
```

Add the help button just before the hamburger wrapper (before the `<div className={styles.hamburgerWrapper}` line). Place it after the Logs button section and before the hamburger:

```tsx
      <button
        className={styles.helpBtn}
        onClick={startTour}
        aria-label="Start product tour"
        data-tour="help"
      >
        ?
      </button>
```

The button should go after the closing of the `{loggingEnabled && ...}` block (after line 190) and before the `<div className={styles.hamburgerWrapper}` (line 192).

- [ ] **Step 3: Run tests**

Run: `cd /home/zach/code/grove/web && npm test -- --run`
If golden tests fail: `npm test -- --run -u`
Then verify: `npm test -- --run`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```
jj describe -m "feat: add ? help button to toolbar wired to product tour (fixes #13)"
jj new
```

---

### Task 5: Final verification and push

- [ ] **Step 1: Run full test suite**

Run: `cd /home/zach/code/grove && go test ./... && cd web && npm test -- --run`
Expected: ALL PASS

- [ ] **Step 2: Move bookmark and push**

```
jj bookmark set main -r @-
jj git push
```
