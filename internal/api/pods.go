package api

import (
	"fmt"

	"github.com/google/uuid"
)

const maxNoteLen = 2000

// SeedPods groups people by (ManagerId, Team) and creates a Pod for each group.
// Root nodes (empty ManagerId) are skipped. Each member's Pod field is set to
// the pod name. If any member already has a non-empty Pod field, that value is
// used as the pod name instead of the team name. Modifies people in-place.
func SeedPods(people []Person) []Pod {
	type groupKey struct {
		ManagerId string
		Team      string
	}

	// Collect indices by group key, preserving order.
	orderKeys := []groupKey{}
	groups := map[groupKey][]int{}
	for i := range people {
		if people[i].ManagerId == "" {
			continue
		}
		key := groupKey{ManagerId: people[i].ManagerId, Team: people[i].Team}
		if _, exists := groups[key]; !exists {
			orderKeys = append(orderKeys, key)
		}
		groups[key] = append(groups[key], i)
	}

	var pods []Pod
	for _, key := range orderKeys {
		indices := groups[key]

		// Determine pod name: use first non-empty Pod field from members,
		// falling back to the team name.
		podName := key.Team
		for _, idx := range indices {
			if people[idx].Pod != "" {
				podName = people[idx].Pod
				break
			}
		}

		pod := Pod{
			Id:        uuid.NewString(),
			Name:      podName,
			Team:      key.Team,
			ManagerId: key.ManagerId,
		}
		pods = append(pods, pod)

		// Set each member's Pod field to the pod name.
		for _, idx := range indices {
			people[idx].Pod = podName
		}
	}

	return pods
}

// CleanupEmptyPods returns only pods that have at least one member.
// A person is a member of a pod if their ManagerId matches the pod's ManagerId
// AND their Pod field matches the pod's Name.
func CleanupEmptyPods(pods []Pod, people []Person) []Pod {
	var result []Pod
	for _, pod := range pods {
		hasMember := false
		for _, p := range people {
			if p.ManagerId == pod.ManagerId && p.Pod == pod.Name {
				hasMember = true
				break
			}
		}
		if hasMember {
			result = append(result, pod)
		}
	}
	return result
}

// FindPod finds a pod by name and managerID. Returns a pointer into the slice,
// or nil if not found.
func FindPod(pods []Pod, name, managerID string) *Pod {
	for i := range pods {
		if pods[i].Name == name && pods[i].ManagerId == managerID {
			return &pods[i]
		}
	}
	return nil
}

// FindPodByID finds a pod by UUID. Returns a pointer into the slice, or nil
// if not found.
func FindPodByID(pods []Pod, id string) *Pod {
	for i := range pods {
		if pods[i].Id == id {
			return &pods[i]
		}
	}
	return nil
}

// RenamePod finds a pod by ID, updates its Name, and updates all members'
// Pod field from the old name to the new name.
func RenamePod(pods []Pod, people []Person, podID, newName string) error {
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

// ReassignPersonPod assigns a person to the correct pod based on their
// ManagerId and Team. If the person has no ManagerId, their Pod field is
// cleared. If a matching pod exists, the person is assigned to it. Otherwise,
// a new pod is auto-created and appended. Returns the (possibly grown) pods slice.
func ReassignPersonPod(pods []Pod, person *Person) []Pod {
	if person.ManagerId == "" {
		person.Pod = ""
		return pods
	}

	existing := FindPod(pods, person.Team, person.ManagerId)
	if existing == nil {
		// Also check by (ManagerId, Team) where any pod matches
		for i := range pods {
			if pods[i].ManagerId == person.ManagerId && pods[i].Team == person.Team {
				existing = &pods[i]
				break
			}
		}
	}

	if existing != nil {
		person.Pod = existing.Name
		return pods
	}

	// Auto-create a new pod
	newPod := Pod{
		Id:        uuid.NewString(),
		Name:      person.Team,
		Team:      person.Team,
		ManagerId: person.ManagerId,
	}
	person.Pod = newPod.Name
	return append(pods, newPod)
}

// CopyPods returns a shallow copy of the pods slice. Returns nil if src is nil.
func CopyPods(src []Pod) []Pod {
	if src == nil {
		return nil
	}
	dst := make([]Pod, len(src))
	copy(dst, src)
	return dst
}

// validateNoteLen returns an error if the note value exceeds maxNoteLen.
func validateNoteLen(value string) error {
	if len(value) > maxNoteLen {
		return fmt.Errorf("note too long (max %d characters)", maxNoteLen)
	}
	return nil
}
