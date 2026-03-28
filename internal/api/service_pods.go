package api

import "context"

func (s *OrgService) ListPods(ctx context.Context) []PodInfo {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.podMgr.ListPods(s.working)
}

func (s *OrgService) UpdatePod(ctx context.Context, podID string, fields map[string]string) (*MoveResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.podMgr.UpdatePod(podID, fields, s.working); err != nil {
		return nil, err
	}
	return &MoveResult{Working: deepCopyPeople(s.working), Pods: CopyPods(s.podMgr.GetPods())}, nil
}

func (s *OrgService) CreatePod(ctx context.Context, managerID, name, team string) (*MoveResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.podMgr.CreatePod(managerID, name, team); err != nil {
		return nil, err
	}
	return &MoveResult{Working: deepCopyPeople(s.working), Pods: CopyPods(s.podMgr.GetPods())}, nil
}
