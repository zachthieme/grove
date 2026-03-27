package api

import "github.com/google/uuid"

func (s *OrgService) ListPods() []PodInfo {
	s.mu.RLock()
	defer s.mu.RUnlock()
	counts := map[string]int{}
	for _, p := range s.working {
		if p.Pod != "" && p.ManagerId != "" {
			counts[p.ManagerId+":"+p.Pod]++
		}
	}
	result := make([]PodInfo, len(s.pods))
	for i, pod := range s.pods {
		result[i] = PodInfo{Pod: pod, MemberCount: counts[pod.ManagerId+":"+pod.Name]}
	}
	return result
}

func (s *OrgService) UpdatePod(podID string, fields map[string]string) (*MoveResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	pod := FindPodByID(s.pods, podID)
	if pod == nil {
		return nil, errNotFound("pod %s not found", podID)
	}
	for k, v := range fields {
		switch k {
		case "name":
			if err := RenamePod(s.pods, s.working, podID, v); err != nil {
				return nil, err
			}
		case "publicNote":
			if err := validateNoteLen(v); err != nil {
				return nil, err
			}
			pod.PublicNote = v
		case "privateNote":
			if err := validateNoteLen(v); err != nil {
				return nil, err
			}
			pod.PrivateNote = v
		default:
			return nil, errValidation("unknown pod field: %s", k)
		}
	}
	return &MoveResult{Working: deepCopyPeople(s.working), Pods: CopyPods(s.pods)}, nil
}

func (s *OrgService) CreatePod(managerID, name, team string) (*MoveResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, p := range s.pods {
		if p.ManagerId == managerID && p.Team == team {
			return nil, errConflict("pod already exists for this manager and team")
		}
	}
	pod := Pod{Id: uuid.NewString(), Name: name, Team: team, ManagerId: managerID}
	s.pods = append(s.pods, pod)
	return &MoveResult{Working: deepCopyPeople(s.working), Pods: CopyPods(s.pods)}, nil
}
