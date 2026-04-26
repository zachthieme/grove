package api

import (
	"context"
	"errors"

	"github.com/zachthieme/grove/internal/apitypes"
	"github.com/zachthieme/grove/internal/pod"
)

func (s *OrgService) ListPods(ctx context.Context) []apitypes.PodInfo {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.podMgr.List(s.working)
}

func (s *OrgService) UpdatePod(ctx context.Context, podID string, fields apitypes.PodUpdate) (*MoveResult, error) {
	// Validate note lengths before taking the lock; pod.Manager.Update is
	// the leaf-package store and does not validate field lengths.
	if fields.PublicNote != nil {
		if err := validateNoteLen(*fields.PublicNote); err != nil {
			return nil, err
		}
	}
	if fields.PrivateNote != nil {
		if err := validateNoteLen(*fields.PrivateNote); err != nil {
			return nil, err
		}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.podMgr.Update(podID, fields, s.working); err != nil {
		if errors.Is(err, pod.ErrNotFound) {
			return nil, errNotFound("pod %s not found", podID)
		}
		return nil, err
	}
	return &MoveResult{Working: deepCopyNodes(s.working), Pods: pod.Copy(s.podMgr.Pods())}, nil
}

func (s *OrgService) CreatePod(ctx context.Context, managerID, name, team string) (*MoveResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.podMgr.Create(managerID, name, team); err != nil {
		if errors.Is(err, pod.ErrDuplicate) {
			return nil, errConflict("pod already exists for this manager and team")
		}
		return nil, err
	}
	return &MoveResult{Working: deepCopyNodes(s.working), Pods: pod.Copy(s.podMgr.Pods())}, nil
}

// GetPodExportData returns a copy of pods and working people for export.
func (s *OrgService) GetPodExportData(ctx context.Context) ([]apitypes.Pod, []apitypes.OrgNode) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return pod.Copy(s.podMgr.Pods()), deepCopyNodes(s.working)
}
