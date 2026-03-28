package api

func (s *OrgService) ListPods() []PodInfo {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.podMgr.ListPods(s.working)
}

func (s *OrgService) UpdatePod(podID string, fields map[string]string) (*MoveResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.podMgr.UpdatePod(podID, fields, s.working); err != nil {
		return nil, err
	}
	return &MoveResult{Working: deepCopyPeople(s.working), Pods: CopyPods(s.podMgr.GetPods())}, nil
}

func (s *OrgService) CreatePod(managerID, name, team string) (*MoveResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.podMgr.CreatePod(managerID, name, team); err != nil {
		return nil, err
	}
	return &MoveResult{Working: deepCopyPeople(s.working), Pods: CopyPods(s.podMgr.GetPods())}, nil
}
