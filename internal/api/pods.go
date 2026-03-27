package api

import (
	"fmt"

	"github.com/google/uuid"
)

// SeedPods creates Pod objects for people who have an explicit Pod field set.
// People without a Pod field are left unchanged. Root nodes (empty ManagerId)
// are skipped. Does not modify people's Pod fields.
func SeedPods(people []Person) []Pod {
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

	var pods []Pod
	for _, key := range orderKeys {
		pod := Pod{
			Id:        uuid.NewString(),
			Name:      key.PodName,
			Team:      teamForGroup[key],
			ManagerId: key.ManagerId,
		}
		pods = append(pods, pod)
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

// ReassignPersonPod clears a person's pod if it's no longer valid (e.g. after
// a manager or team change). Pods are optional — if a person has no pod, none
// is assigned. Never auto-creates pods.
func ReassignPersonPod(pods []Pod, person *Person) []Pod {
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

// CopyPods returns a shallow copy of the pods slice. Returns nil if src is nil.
func CopyPods(src []Pod) []Pod {
	if src == nil {
		return nil
	}
	dst := make([]Pod, len(src))
	copy(dst, src)
	return dst
}

