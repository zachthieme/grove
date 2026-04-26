import { useCallback, useEffect, useRef } from 'react'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import '../tour.css'

const TOUR_SEEN_KEY = 'grove-tour-seen'

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
      // Highlights the first product node if any are visible. Tour
      // gracefully degrades to a centered popover when none exist.
      element: '[data-tour="product"]',
      popover: {
        title: 'Products',
        description: 'Products are non-person nodes — features, services, or initiatives owned by a manager or pod. Add one with the + menu on a manager, or press P with vim mode on.',
      },
    },
    {
      element: '[data-tour="main-content"]',
      popover: {
        title: 'Drag & Drop',
        description: 'Drag people or products between managers to reorganize the chart.',
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
    localStorage.setItem(TOUR_SEEN_KEY, '1')
  }, [loaded])

  // Auto-start on first visit
  const autoStarted = useRef(false)
  useEffect(() => {
    if (autoStarted.current) return
    if (localStorage.getItem(TOUR_SEEN_KEY)) return
    autoStarted.current = true
    // Small delay so the UI is fully rendered before tour highlights elements
    const timer = setTimeout(startTour, 500)
    return () => clearTimeout(timer)
  }, [startTour])

  return { startTour }
}
