package api

import "context"

func (s *OrgService) ListPods(ctx context.Context) []PodInfo {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.podMgr.unsafeListPods(s.working)
}

func (s *OrgService) UpdatePod(ctx context.Context, podID string, fields PodUpdate) (*MoveResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.podMgr.unsafeUpdatePod(podID, fields, s.working); err != nil {
		return nil, err
	}
	return &MoveResult{Working: deepCopyNodes(s.working), Pods: CopyPods(s.podMgr.unsafeGetPods())}, nil
}

func (s *OrgService) CreatePod(ctx context.Context, managerID, name, team string) (*MoveResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.podMgr.unsafeCreatePod(managerID, name, team); err != nil {
		return nil, err
	}
	return &MoveResult{Working: deepCopyNodes(s.working), Pods: CopyPods(s.podMgr.unsafeGetPods())}, nil
}

// GetPodExportData returns a copy of pods and working people for export.
func (s *OrgService) GetPodExportData(ctx context.Context) ([]Pod, []OrgNode) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return CopyPods(s.podMgr.unsafeGetPods()), deepCopyNodes(s.working)
}
