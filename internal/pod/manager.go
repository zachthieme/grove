// Package pod owns the in-memory pod state and pure helpers for working with
// pods (named subgroups under a manager). It is a leaf package depending only
// on apitypes and stdlib.
//
// Concurrency: Manager is NOT thread-safe. Callers (typically OrgService)
// must hold an external lock around every method call. The previous
// `unsafe*` method-name prefix in internal/api was a within-package mutex
// contract; now that this lives across packages, the prefix is dropped and
// the contract is enforced by callers.
package pod

import (
	"errors"

	"github.com/google/uuid"
	"github.com/zachthieme/grove/internal/apitypes"
)

// Sentinel errors returned by Manager methods. Callers in higher-level
// packages translate these to their preferred typed errors (e.g. the api
// package wraps ErrNotFound as a NotFoundError so HTTP handlers map it to
// 404). Pod is a leaf package and intentionally has no dependency on those
// typed errors.
var (
	// ErrNotFound is returned when a pod lookup by ID misses.
	ErrNotFound = errors.New("pod not found")
	// ErrDuplicate is returned when Create is called with a (manager, team)
	// pair that already has a pod.
	ErrDuplicate = errors.New("pod already exists for this manager and team")
)

// Manager owns the in-memory pod state. It is NOT thread-safe — callers
// must hold an external lock (typically OrgService.mu) around all method
// calls.
type Manager struct {
	pods         []apitypes.Pod
	originalPods []apitypes.Pod
}

// New returns an empty Manager.
func New() *Manager {
	return &Manager{}
}

// SetState replaces both pods and originalPods. Used when restoring full
// state from autosave.
func (pm *Manager) SetState(pods, originalPods []apitypes.Pod) {
	pm.pods = pods
	pm.originalPods = originalPods
}

// Pods returns the live pods slice (not a copy). Callers that hand the
// slice across the lock boundary must Copy it themselves.
func (pm *Manager) Pods() []apitypes.Pod { return pm.pods }

// OriginalPods returns the immutable original-pods slice (not a copy).
func (pm *Manager) OriginalPods() []apitypes.Pod { return pm.originalPods }

// SetPods replaces the live pods slice without touching originalPods.
func (pm *Manager) SetPods(pods []apitypes.Pod) { pm.pods = pods }

// Reset replaces the live pods with a copy of originalPods.
func (pm *Manager) Reset() {
	pm.pods = Copy(pm.originalPods)
}

// Seed builds initial pod state from the given working people, capturing a
// copy as originalPods.
func (pm *Manager) Seed(working []apitypes.OrgNode) {
	pm.pods = SeedPods(working)
	pm.originalPods = Copy(pm.pods)
}

// List returns []PodInfo with member counts derived from working.
func (pm *Manager) List(working []apitypes.OrgNode) []apitypes.PodInfo {
	counts := map[string]int{}
	for _, p := range working {
		if p.Pod != "" && p.ManagerId != "" {
			counts[p.ManagerId+":"+p.Pod]++
		}
	}
	result := make([]apitypes.PodInfo, len(pm.pods))
	for i, pod := range pm.pods {
		result[i] = apitypes.PodInfo{Pod: pod, MemberCount: counts[pod.ManagerId+":"+pod.Name]}
	}
	return result
}

// Update applies non-nil fields of `fields` to the pod with the given ID.
// Returns ErrNotFound (wrapped) if the pod is missing. Field length
// validation (e.g. note length limits) is the caller's responsibility.
func (pm *Manager) Update(podID string, fields apitypes.PodUpdate, working []apitypes.OrgNode) error {
	pod := FindPodByID(pm.pods, podID)
	if pod == nil {
		return ErrNotFound
	}
	if fields.Name != nil {
		if err := Rename(pm.pods, working, podID, *fields.Name); err != nil {
			return err
		}
	}
	if fields.PublicNote != nil {
		pod.PublicNote = *fields.PublicNote
	}
	if fields.PrivateNote != nil {
		pod.PrivateNote = *fields.PrivateNote
	}
	return nil
}

// Create creates a new pod for (managerID, name, team). Returns
// ErrDuplicate if a pod already exists for this manager/team combination.
func (pm *Manager) Create(managerID, name, team string) error {
	for _, p := range pm.pods {
		if p.ManagerId == managerID && p.Team == team {
			return ErrDuplicate
		}
	}
	pod := apitypes.Pod{Id: uuid.NewString(), Name: name, Team: team, ManagerId: managerID}
	pm.pods = append(pm.pods, pod)
	return nil
}

// Cleanup removes pods that no longer have any members in working.
func (pm *Manager) Cleanup(working []apitypes.OrgNode) {
	pm.pods = CleanupEmpty(pm.pods, working)
}

// Reassign clears a person's Pod field if their current pod is no longer
// valid (e.g. after a manager or team change). Never auto-creates pods.
func (pm *Manager) Reassign(person *apitypes.OrgNode) {
	pm.pods = ReassignPerson(pm.pods, person)
}

// ApplyNotes overlays public/private notes from a sidecar onto both pods
// and originalPods, matching by (podName, managerName).
func (pm *Manager) ApplyNotes(sidecar []SidecarEntry, idToName map[string]string) {
	applyPodSidecarNotes(pm.pods, sidecar, idToName)
	applyPodSidecarNotes(pm.originalPods, sidecar, idToName)
}
