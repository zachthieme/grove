package pod

import (
	"fmt"

	"github.com/google/uuid"
	"github.com/zachthieme/grove/internal/apitypes"
)

// SeedPods creates Pod objects for people who have an explicit Pod field set.
// People without a Pod field are left unchanged. Root nodes (empty ManagerId)
// are skipped. Does not modify people's Pod fields.
func SeedPods(people []apitypes.OrgNode) []apitypes.Pod {
	type groupKey struct {
		ManagerId string
		PodName   string
	}

	orderKeys := []groupKey{}
	groups := map[groupKey][]int{}
	teamForGroup := map[groupKey]string{}
	for i := range people {
		if people[i].ManagerId == "" || people[i].Pod == "" {
			continue
		}
		key := groupKey{ManagerId: people[i].ManagerId, PodName: people[i].Pod}
		if _, exists := groups[key]; !exists {
			orderKeys = append(orderKeys, key)
			teamForGroup[key] = people[i].Team
		}
		groups[key] = append(groups[key], i)
	}

	var pods []apitypes.Pod
	for _, key := range orderKeys {
		pod := apitypes.Pod{
			Id:        uuid.NewString(),
			Name:      key.PodName,
			Team:      teamForGroup[key],
			ManagerId: key.ManagerId,
		}
		pods = append(pods, pod)
	}

	return pods
}

// CleanupEmpty returns only pods that have at least one member.
// A person is a member of a pod if their ManagerId matches the pod's ManagerId
// AND their Pod field matches the pod's Name.
func CleanupEmpty(pods []apitypes.Pod, people []apitypes.OrgNode) []apitypes.Pod {
	// Build O(n) membership set: "managerId:podName" → true
	members := make(map[string]bool, len(people)/4)
	for _, p := range people {
		if p.ManagerId != "" && p.Pod != "" {
			members[p.ManagerId+":"+p.Pod] = true
		}
	}
	var result []apitypes.Pod
	for _, pod := range pods {
		if members[pod.ManagerId+":"+pod.Name] {
			result = append(result, pod)
		}
	}
	return result
}

// FindPod finds a pod by name and managerID. Returns a pointer into the
// slice, or nil if not found.
func FindPod(pods []apitypes.Pod, name, managerID string) *apitypes.Pod {
	for i := range pods {
		if pods[i].Name == name && pods[i].ManagerId == managerID {
			return &pods[i]
		}
	}
	return nil
}

// FindPodByID finds a pod by UUID. Returns a pointer into the slice, or
// nil if not found.
func FindPodByID(pods []apitypes.Pod, id string) *apitypes.Pod {
	for i := range pods {
		if pods[i].Id == id {
			return &pods[i]
		}
	}
	return nil
}

// Rename finds a pod by ID, updates its Name, and updates all members'
// Pod field from the old name to the new name.
func Rename(pods []apitypes.Pod, people []apitypes.OrgNode, podID, newName string) error {
	pod := FindPodByID(pods, podID)
	if pod == nil {
		return fmt.Errorf("pod %s not found", podID)
	}

	oldName := pod.Name
	pod.Name = newName

	for i := range people {
		if people[i].ManagerId == pod.ManagerId && people[i].Pod == oldName {
			people[i].Pod = newName
		}
	}

	return nil
}

// ReassignPerson clears a person's pod if it's no longer valid (e.g. after
// a manager or team change). Pods are optional — if a person has no pod,
// none is assigned. Never auto-creates pods.
func ReassignPerson(pods []apitypes.Pod, person *apitypes.OrgNode) []apitypes.Pod {
	if person.ManagerId == "" || person.Pod == "" {
		person.Pod = ""
		return pods
	}
	// Check if the person's current pod still exists under their manager
	if FindPod(pods, person.Pod, person.ManagerId) != nil {
		return pods
	}
	// Pod no longer valid — clear it
	person.Pod = ""
	return pods
}

// Copy returns a shallow copy of the pods slice. Returns an empty (non-nil)
// slice if src is nil, so callers always get a JSON-serializable [].
func Copy(src []apitypes.Pod) []apitypes.Pod {
	if src == nil {
		return []apitypes.Pod{}
	}
	dst := make([]apitypes.Pod, len(src))
	copy(dst, src)
	return dst
}

// SidecarEntry is one row of the pods.csv sidecar in a ZIP import. Public
// notes are restored onto the in-memory pod state by Manager.ApplyNotes
// matching on (PodName, ManagerName).
type SidecarEntry struct {
	PodName     string
	ManagerName string
	Team        string
	PublicNote  string
	PrivateNote string
}

// applyPodSidecarNotes overlays public/private notes from sidecar onto
// pods, matching by (PodName, manager-name-via-idToName). Used internally
// by Manager.ApplyNotes.
func applyPodSidecarNotes(pods []apitypes.Pod, sidecar []SidecarEntry, idToName map[string]string) {
	for i := range pods {
		mgrName := idToName[pods[i].ManagerId]
		for _, entry := range sidecar {
			if entry.PodName == pods[i].Name && entry.ManagerName == mgrName {
				pods[i].PublicNote = entry.PublicNote
				pods[i].PrivateNote = entry.PrivateNote
				break
			}
		}
	}
}
