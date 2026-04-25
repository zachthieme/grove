package api

import "github.com/google/uuid"

// PodManager owns the in-memory pod state. It is NOT thread-safe — callers
// must hold an external lock (typically OrgService.mu) around all method calls.
type PodManager struct {
	pods         []Pod
	originalPods []Pod
}

func NewPodManager() *PodManager {
	return &PodManager{}
}

func (pm *PodManager) unsafeSetState(pods, originalPods []Pod) {
	pm.pods = pods
	pm.originalPods = originalPods
}

func (pm *PodManager) unsafeGetPods() []Pod         { return pm.pods }
func (pm *PodManager) unsafeGetOriginalPods() []Pod { return pm.originalPods }
func (pm *PodManager) unsafeSetPods(pods []Pod)     { pm.pods = pods }

func (pm *PodManager) unsafeReset() {
	pm.pods = CopyPods(pm.originalPods)
}

func (pm *PodManager) unsafeSeed(working []OrgNode) {
	pm.pods = SeedPods(working)
	pm.originalPods = CopyPods(pm.pods)
}

func (pm *PodManager) unsafeListPods(working []OrgNode) []PodInfo {
	counts := map[string]int{}
	for _, p := range working {
		if p.Pod != "" && p.ManagerId != "" {
			counts[p.ManagerId+":"+p.Pod]++
		}
	}
	result := make([]PodInfo, len(pm.pods))
	for i, pod := range pm.pods {
		result[i] = PodInfo{Pod: pod, MemberCount: counts[pod.ManagerId+":"+pod.Name]}
	}
	return result
}

func (pm *PodManager) unsafeUpdatePod(podID string, fields PodUpdate, working []OrgNode) error {
	pod := findPodByID(pm.pods, podID)
	if pod == nil {
		return errNotFound("pod %s not found", podID)
	}
	if fields.Name != nil {
		if err := RenamePod(pm.pods, working, podID, *fields.Name); err != nil {
			return err
		}
	}
	if fields.PublicNote != nil {
		if err := validateNoteLen(*fields.PublicNote); err != nil {
			return err
		}
		pod.PublicNote = *fields.PublicNote
	}
	if fields.PrivateNote != nil {
		if err := validateNoteLen(*fields.PrivateNote); err != nil {
			return err
		}
		pod.PrivateNote = *fields.PrivateNote
	}
	return nil
}

func (pm *PodManager) unsafeCreatePod(managerID, name, team string) error {
	for _, p := range pm.pods {
		if p.ManagerId == managerID && p.Team == team {
			return errConflict("pod already exists for this manager and team")
		}
	}
	pod := Pod{Id: uuid.NewString(), Name: name, Team: team, ManagerId: managerID}
	pm.pods = append(pm.pods, pod)
	return nil
}

func (pm *PodManager) unsafeCleanup(working []OrgNode) {
	pm.pods = CleanupEmptyPods(pm.pods, working)
}

func (pm *PodManager) unsafeReassign(person *OrgNode) {
	pm.pods = ReassignPersonPod(pm.pods, person)
}

func (pm *PodManager) unsafeApplyNotes(sidecar []podSidecarEntry, idToName map[string]string) {
	applyPodSidecarNotes(pm.pods, sidecar, idToName)
	applyPodSidecarNotes(pm.originalPods, sidecar, idToName)
}
