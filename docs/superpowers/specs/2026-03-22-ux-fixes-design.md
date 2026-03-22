# UX Fixes Batch

## 1. Graceful Import Errors

Parse all rows, skip broken ones instead of aborting. Broken rows become "error" people with a red warning badge on their node. Error banner at top: "N rows had issues."

Backend: `NewOrg` returns `(*Org, []Warning)` instead of `(*Org, error)` for row-level issues. Only file-level errors (wrong format, no header) fail entirely.

## 2. Hide Sidebar When Empty

Don't render DetailSidebar when nothing is selected. Main view gets full width. Sidebar appears when a person is selected.

## 3. Multi-Select for Batch Changes

Shift+click or Ctrl/Cmd+click adds people to a selection set. Sidebar shows batch edit form when multiple selected: Role, Discipline, Team, Status, Employment Type, Manager (not Name). Fields show "Mixed" when values differ. Save applies to all selected.

`selectedIds: Set<string>` replaces `selectedId: string | null` in OrgContext.

## 4. Additional Teams — Dashed Lines

For people with `additionalTeams`, draw dashed SVG lines from the person to the managers of those teams (or team header nodes). Person stays in primary team position. Dashed lines use lighter stroke + strokeDasharray.

## 5. Compact Employment Type with Right Accent Bar

Move employment type inline with role: `Engineer · CTR`. FTE shows nothing.

Add a right-side colored accent bar (mirrors the green left bar for managers):

| Type | Right Bar Color |
|------|----------------|
| FTE | none |
| PSP | blue (`#3b82f6`) |
| CW | purple (`#8b5cf6`) |
| Evergreen | amber (`#f59e0b`) |
| Intern | teal (`#14b8a6`) |
| Custom | gray (`#9ca3af`) |

Abbreviations for inline display: PSP → PSP, CW → CW, Evergreen → EVG, Intern → INT. Anything else: first 3 chars uppercased.
