# Create UX Fixes

## Problem

After creating an org from scratch, the user is stuck: the single person node has no "+" button to add direct reports (because `+` only shows for managers, and a person with no reports isn't a manager). The user also lands on a bare node with no guidance to fill in details.

## Fix 1: Show "+" on all people

Change `PersonNode.tsx` so the "+" (add direct report) button shows on hover for ALL people, not just managers. Currently `showAdd={!!isManager}` — change to always show when `onAdd` is available.

**Files:**
- `web/src/views/ColumnView.tsx` — where `isManager` is passed to DraggableNode
- `web/src/views/ManagerView.tsx` — same
- `web/src/views/OrphanGroup.tsx` — same
- `web/src/components/PersonNode.tsx` — where `showAdd` is evaluated

The simplest approach: wherever `isManager={managerSet?.has(person.id)}` is passed, also ensure `onAdd` is always provided (not gated on `isManager`). Then in PersonNode, change `showAdd={!!isManager}` to `showAdd={!!onAdd}`.

**No backend changes.**

## Fix 2: Auto-open sidebar after creating first person

After `createOrg` succeeds in `UploadPrompt.tsx`, select the newly created person so the DetailSidebar opens immediately.

**Flow:**
1. `UploadPrompt` calls `createOrg(name)` (from `useOrgData()`)
2. On success, the working array now has one person
3. `UploadPrompt` grabs `setSelectedId` from `useSelection()`
4. After `createOrg` resolves, reads the new `working[0].id` and calls `setSelectedId(id)`
5. DetailSidebar opens automatically (it already opens when a person is selected)

**Implementation detail:** `createOrg` is async. After it resolves, `UploadPrompt` needs the new person's ID. Options:
- Have `createOrg` return the created person's ID (change return type from `Promise<void>` to `Promise<string | undefined>`)
- Or read it from the updated `working` array via `useOrgData().working`

Returning the ID is cleaner — avoids timing issues with state updates.

**Files:**
- `web/src/store/orgTypes.ts` — change `createOrg` return type to `Promise<string | undefined>`
- `web/src/store/OrgDataContext.tsx` — return the first person's ID from `createOrg`
- `web/src/components/UploadPrompt.tsx` — after `createOrg` resolves, call `setSelectedId` with the returned ID
- `web/src/test-helpers.tsx` — update mock if needed

## Testing

- Update existing UploadPrompt tests to verify `setSelectedId` is called after create
- Verify `+` button appears on non-manager nodes (update PersonNode tests)
- Update CREATE-001 scenario to note sidebar auto-opens
