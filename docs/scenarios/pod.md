# Pod Manager Scenarios

The `pod.Manager` type owns the in-memory pod state. It is intentionally
NOT thread-safe — callers (typically OrgService) hold an external lock
around every method call. These scenarios cover the manager surface;
JSON wire-format scenarios for `apitypes.Pod` live in api-contract.md.

---

# Scenario: Manager construction and state replacement

**ID**: POD-001
**Area**: pod
**Tests**:
- `internal/pod/manager_test.go` → "[POD-001]"

## Behavior
`pod.New()` returns an empty manager. `SetState(pods, originalPods)` replaces both slices. `SetPods(pods)` replaces the live slice without touching originalPods. `Reset()` deep-copies originalPods into pods so subsequent mutations don't bleed back.

## Invariants
- New manager has nil pods and nil originalPods
- SetPods leaves originalPods untouched
- Reset produces a deep copy: mutating pods doesn't change originalPods

## Edge cases
- SetState with nil slices is valid (treated as empty)

---

# Scenario: Seed builds initial pods from working

**ID**: POD-002
**Area**: pod
**Tests**:
- `internal/pod/manager_test.go` → "[POD-002]"

## Behavior
`Seed(working)` builds pod state from the given working slice and captures a copy as originalPods. Mutating pods later must not corrupt the captured originalPods.

## Invariants
- Seed produces non-empty pods when working has pod-tagged people
- originalPods is a deep copy after Seed

---

# Scenario: List with member counts

**ID**: POD-003
**Area**: pod
**Tests**:
- `internal/pod/manager_test.go` → "[POD-003]"

## Behavior
`List(working)` returns `[]PodInfo` annotated with `MemberCount` derived from the given working slice. People with no pod are not counted.

## Invariants
- Count keys are `(managerId, podName)` tuples
- People with empty pod don't increment any count

---

# Scenario: Update by ID

**ID**: POD-004
**Area**: pod
**Tests**:
- `internal/pod/manager_test.go` → "[POD-004]"

## Behavior
`Update(podID, fields, working)` applies non-nil fields. A non-nil Name triggers Rename which propagates the new name into matching working entries. Non-nil PublicNote/PrivateNote update the pod fields. Returns ErrNotFound when the pod doesn't exist.

## Invariants
- Name=nil leaves the pod name unchanged
- PublicNote/PrivateNote = nil leaves the existing values unchanged

## Edge cases
- Update on missing pod → ErrNotFound

---

# Scenario: Create with duplicate detection

**ID**: POD-005
**Area**: pod
**Tests**:
- `internal/pod/manager_test.go` → "[POD-005]"

## Behavior
`Create(managerID, name, team)` adds a new pod with a fresh UUID. Returns ErrDuplicate when a pod already exists for that (managerID, team) pair. Different (manager, team) tuples are independent — same pod name under different managers is allowed.

## Invariants
- ID is a non-empty UUID
- Duplicate (managerID, team) → ErrDuplicate, no append
- Different manager (or different team) with same name → allowed

---

# Scenario: Cleanup removes empty pods

**ID**: POD-006
**Area**: pod
**Tests**:
- `internal/pod/manager_test.go` → "[POD-006]"

## Behavior
`Cleanup(working)` removes pods that no longer have any members in the working slice.

## Invariants
- Pods with at least one member retained
- Pods with zero members removed

## Edge cases
- All pods empty → manager pods slice becomes empty (not nil)

---

# Scenario: Reassign clears stale pod refs

**ID**: POD-007
**Area**: pod
**Tests**:
- `internal/pod/manager_test.go` → "[POD-007]"

## Behavior
`Reassign(person)` clears the person's Pod field if their current (managerID, team) combination no longer matches an existing pod. Never auto-creates pods.

## Invariants
- Valid (managerID, team) match → pod retained
- Invalid match → pod cleared to ""

## Edge cases
- Person with empty pod → no-op
