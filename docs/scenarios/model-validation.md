# Model Validation Scenarios

---

# Scenario: Move person to new manager

**ID**: ORG-001
**Area**: model-validation
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_Move"
- `internal/api/service_test.go` → "TestOrgService_Move_NoTeamChange"
- `internal/api/handlers_test.go` → "TestMoveHandler"
- `web/e2e/features.spec.ts` → "drag-and-drop reparent"

## Behavior
A person is moved to a new manager, optionally with a new team and pod assignment.

## Invariants
- Person's managerId updated to new manager
- Team updated if newTeam is non-empty
- Pod reassigned if newPod is provided
- Empty pods cleaned up after move
- Original slice is unchanged

## Edge cases
- Move to same manager (no-op on managerId)
- Move with empty team (team unchanged)

---

# Scenario: Cycle detection in manager hierarchy

**ID**: ORG-002
**Area**: model-validation
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_Move_CycleDetection"
- `internal/api/service_test.go` → "TestOrgService_Update_CycleDetection"
- `internal/api/service_test.go` → "TestOrgService_Move_SelfAsManager"
- `internal/api/adversarial_test.go` → "TestAdversarial_CircularManagerChain"

## Behavior
The system detects and rejects moves or updates that would create a cycle in the manager hierarchy.

## Invariants
- Self-as-manager is rejected
- A→B→C→A cycle is rejected
- ValidationError returned with descriptive message
- No state mutation on rejection

## Edge cases
- Deep chain cycles (>3 levels)

---

# Scenario: Manager not found on move

**ID**: ORG-003
**Area**: model-validation
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_Move_ManagerNotFound"
- `internal/api/adversarial_test.go` → "TestAdversarial_MoveToNonexistentManager"
- `internal/api/handlers_test.go` → "TestMoveHandler_PersonNotFound"

## Behavior
Moving a person to a non-existent manager returns a NotFoundError.

## Invariants
- HTTP 404 returned
- No state mutation

## Edge cases
- None

---

# Scenario: Pod assignment during move

**ID**: ORG-004
**Area**: model-validation
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_Move_SetsPod"
- `internal/api/service_test.go` → "TestOrgService_Move_EmptyPodIgnored"

## Behavior
A move can optionally include a pod assignment. Empty pod string is ignored.

## Invariants
- Non-empty newPod sets person's Pod field
- Empty string newPod is ignored (existing pod unchanged)

## Edge cases
- None

---

# Scenario: Update person fields

**ID**: ORG-005
**Area**: model-validation
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_Update"
- `internal/api/service_test.go` → "TestOrgService_Update_AllFields"
- `internal/api/service_test.go` → "TestOrgService_Update_Private"
- `internal/api/handlers_test.go` → "TestUpdateHandler"

## Behavior
Person fields are updated via a key-value map. Warning field is cleared on any edit.

## Invariants
- Supported fields: name, role, discipline, team, status, managerId, employmentType, additionalTeams, newRole, newTeam, publicNote, privateNote, level, private, pod
- Warning cleared on edit
- Original slice unchanged

## Edge cases
- Empty string values are valid

---

# Scenario: Invalid status rejected

**ID**: ORG-006
**Area**: model-validation
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_Update_InvalidStatus"
- `internal/api/adversarial_test.go` → "TestAdversarial_InvalidStatus"

## Behavior
Setting a status to a value not in the valid statuses set returns a ValidationError.

## Invariants
- HTTP 422 returned
- Valid statuses: Active, Open, Transfer In, Transfer Out, Backfill, Planned

## Edge cases
- None

---

# Scenario: Unknown field rejected

**ID**: ORG-007
**Area**: model-validation
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_Update_UnknownField"

## Behavior
Updating with an unrecognized field name returns a ValidationError.

## Invariants
- HTTP 422 returned
- Error message includes the unknown field name

## Edge cases
- None

---

# Scenario: Person not found on update

**ID**: ORG-008
**Area**: model-validation
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_Update_PersonNotFound"
- `internal/api/handlers_test.go` → "TestUpdateHandler_PersonNotFound"

## Behavior
Updating a non-existent person ID returns a NotFoundError.

## Invariants
- HTTP 404 returned
- No state mutation

## Edge cases
- None

---

# Scenario: Field length validation

**ID**: ORG-009
**Area**: model-validation
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_FieldLengthValidation"
- `internal/api/adversarial_test.go` → "TestAdversarial_OversizedFields"
- `internal/api/adversarial_test.go` → "TestAdversarial_OversizedNote"
- `internal/api/service_test.go` → "TestValidateNoteLen"

## Behavior
Field values have maximum lengths. Standard fields: 500 chars. Notes: 2000 chars.

## Invariants
- 501-char name rejected, 500-char name accepted
- 2001-char note rejected, 2000-char note accepted
- ValidationError with descriptive message

## Edge cases
- None

---

# Scenario: Additional teams management

**ID**: ORG-010
**Area**: model-validation
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_Update_AdditionalTeamsEmpty"
- `internal/api/service_test.go` → "TestOrgService_Update_AllFields"

## Behavior
The additionalTeams field accepts a comma-separated string. Empty string clears additional teams.

## Invariants
- Comma-separated values parsed and trimmed
- Empty string sets additionalTeams to nil
- Whitespace-only entries filtered out

## Edge cases
- None

---

# Scenario: Add person

**ID**: ORG-011
**Area**: model-validation
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_Add"
- `internal/api/service_test.go` → "TestOrgService_Add_RejectsInvalidStatus"
- `internal/api/service_test.go` → "TestOrgService_Add_RejectsInvalidManager"
- `internal/api/handlers_test.go` → "TestAddHandler"

## Behavior
A new person is added with a generated UUID. Status and manager are validated.

## Invariants
- New UUID assigned
- Invalid status rejected
- Non-existent manager rejected
- Person appended to working slice
- Index rebuilt after add

## Edge cases
- None

---

# Scenario: Delete and restore (soft delete)

**ID**: ORG-012
**Area**: model-validation
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_Delete"
- `internal/api/service_test.go` → "TestOrgService_SoftDelete"
- `internal/api/service_test.go` → "TestOrgService_Restore"
- `internal/api/service_test.go` → "TestOrgService_Restore_ManagerGone"
- `internal/api/service_test.go` → "TestOrgService_Delete_ReturnsBothArrays"
- `internal/api/service_test.go` → "TestOrgService_Restore_ReturnsBothArrays"
- `internal/api/handlers_test.go` → "TestDeleteHandler"
- `internal/api/handlers_test.go` → "TestRestoreHandler"
- `web/e2e/smoke.spec.ts` → "delete and restore"

## Behavior
Delete moves a person to the recycled list. Restore moves them back. Reports of the deleted person have their managerId cleared.

## Invariants
- Deleted person removed from working, added to recycled
- Direct reports re-parented to empty managerId
- Restored person appended to working
- If manager was deleted during absence, managerId cleared on restore
- Index rebuilt after both operations

## Edge cases
- Restore when manager was deleted (managerId cleared)

---

# Scenario: Nonexistent person errors

**ID**: ORG-013
**Area**: model-validation
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_Delete_PersonNotFound"
- `internal/api/service_test.go` → "TestOrgService_Restore_PersonNotFound"
- `internal/api/adversarial_test.go` → "TestAdversarial_DeleteNonexistentPerson"
- `internal/api/adversarial_test.go` → "TestAdversarial_RestoreFromEmptyBin"
- `internal/api/handlers_test.go` → "TestDeleteHandler_PersonNotFound"
- `internal/api/handlers_test.go` → "TestRestoreHandler_PersonNotFound"

## Behavior
Deleting or restoring a non-existent person ID returns a NotFoundError.

## Invariants
- HTTP 404 returned
- No state mutation

## Edge cases
- None

---

# Scenario: Empty recycle bin

**ID**: ORG-014
**Area**: model-validation
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_EmptyBin"
- `internal/api/handlers_test.go` → "TestEmptyBinHandler"

## Behavior
Emptying the bin permanently removes all recycled people.

## Invariants
- Recycled list set to nil
- Working list unchanged

## Edge cases
- Empty bin when already empty (no-op)

---

# Scenario: Reorder working people

**ID**: ORG-015
**Area**: model-validation
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_Reorder"
- `internal/api/service_test.go` → "TestOrgService_Reorder_PartialIds"
- `internal/api/handlers_test.go` → "TestReorderHandler"

## Behavior
Sets SortIndex for each person in the provided order. Partial ID lists leave unmentioned people's indices unchanged.

## Invariants
- SortIndex matches position in the provided list
- Unmentioned people retain existing SortIndex
- Working slice not reordered (only indices change)

## Edge cases
- Partial ID list (subset of working people)

---

# Scenario: Reset to original

**ID**: ORG-016
**Area**: model-validation
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_ResetToOriginal"
- `internal/api/handlers_test.go` → "TestResetHandler"

## Behavior
Discards all working changes and restores from the original import.

## Invariants
- Working reset to deep copy of original
- Recycled cleared
- Pods reset to original pods
- Settings re-derived from original
- Index rebuilt

## Edge cases
- None

---

# Scenario: Team cascade for front-line managers

**ID**: ORG-017
**Area**: model-validation
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_IsFrontlineManager"
- `internal/api/service_test.go` → "TestOrgService_Update_TeamCascadeFrontlineManager"
- `internal/api/service_test.go` → "TestOrgService_Update_TeamNoCascadeNonFrontlineManager"
- `web/e2e/features.spec.ts` → "team cascade for front-line manager"

## Behavior
When a front-line manager's team changes, the team change cascades to all their direct reports. Non-front-line managers don't cascade.

## Invariants
- Front-line = manager with only IC direct reports (no sub-managers)
- Direct reports' team updated to match
- Pod assignments reassigned after cascade
- Non-front-line managers only update their own team

## Edge cases
- None

---

# Scenario: Pod operations

**ID**: ORG-018
**Area**: model-validation
**Tests**:
- `internal/api/pods_test.go` → "TestSeedPods_*"
- `internal/api/pods_test.go` → "TestCleanupEmptyPods"
- `internal/api/pods_test.go` → "TestFindPod"
- `internal/api/pods_test.go` → "TestFindPodByID"
- `internal/api/pods_test.go` → "TestRenamePod"
- `internal/api/pods_test.go` → "TestReassignPersonPod_*"
- `internal/api/pods_test.go` → "TestCopyPods"
- `internal/api/service_test.go` → "TestOrgService_Update_PodAutoCreate"
- `internal/api/service_test.go` → "TestOrgService_Update_PodReusesExisting"
- `internal/api/service_test.go` → "TestOrgService_Update_PodClearRemovesAssignment"
- `web/e2e/features.spec.ts` → "pod creation via edit"
- `web/e2e/features.spec.ts` → "pod sidebar via info button"

## Behavior
Pods are created from the Pod field during upload (seeding). They can be created, renamed, and cleaned up. Empty pods are removed automatically.

## Invariants
- Pods seeded only from explicit Pod field values
- Root nodes (no manager) don't get pods
- Cleanup removes pods with no members
- Rename updates all member references
- Deep copy produces independent slice

## Edge cases
- Nil input to CopyPods returns nil

---

# Scenario: Pod auto-creation on move

**ID**: ORG-019
**Area**: model-validation
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_Update_PodAutoCreate"
- `internal/api/service_test.go` → "TestOrgService_Update_PodReusesExisting"
- `internal/api/service_test.go` → "TestOrgService_Update_PodClearRemovesAssignment"

## Behavior
Setting a person's pod field to a name that doesn't exist under their manager auto-creates the pod. Setting to empty clears the assignment. Setting to an existing pod name reuses it.

## Invariants
- Non-existent pod name creates new Pod with UUID
- Empty string clears person's pod and triggers cleanup
- Existing pod name matched by (name, managerId) pair

## Edge cases
- None
