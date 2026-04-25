package api

import (
	"context"
	"fmt"
)

func (s *OrgService) SaveSnapshot(ctx context.Context, name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.snaps.unsafeSave(name, s.working, s.podMgr.unsafeGetPods(), s.settings); err != nil {
		return err
	}
	if err := s.snaps.unsafePersistAll(); err != nil {
		return fmt.Errorf("persisting snapshot: %w", err)
	}
	return nil
}

func (s *OrgService) ExportSnapshot(ctx context.Context, name string) ([]OrgNode, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	switch name {
	case SnapshotWorking:
		return deepCopyNodes(s.working), nil
	case SnapshotOriginal:
		return deepCopyNodes(s.original), nil
	default:
		snap := s.snaps.unsafeGet(name)
		if snap == nil {
			return nil, errNotFound("snapshot '%s' not found", name)
		}
		return deepCopyNodes(snap.People), nil
	}
}

func (s *OrgService) LoadSnapshot(ctx context.Context, name string) (*OrgData, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	snap, err := s.snaps.unsafeLoad(name)
	if err != nil {
		return nil, err
	}
	s.working = deepCopyNodes(snap.People)
	s.rebuildIndex()
	if snap.Pods != nil {
		s.podMgr.unsafeSetPods(CopyPods(snap.Pods))
	} else {
		s.podMgr.unsafeSetPods(SeedPods(s.working))
	}
	s.recycled = nil
	if len(snap.Settings.DisciplineOrder) > 0 {
		s.settings = snap.Settings
	} else {
		s.settings = Settings{DisciplineOrder: deriveDisciplineOrder(s.working)}
	}
	return &OrgData{Original: deepCopyNodes(s.original), Working: deepCopyNodes(s.working), Pods: CopyPods(s.podMgr.unsafeGetPods()), Settings: &s.settings}, nil
}

func (s *OrgService) DeleteSnapshot(ctx context.Context, name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.snaps.unsafeDelete(name)
	if err := s.snaps.unsafePersistAll(); err != nil {
		return fmt.Errorf("persisting snapshot deletion: %w", err)
	}
	return nil
}

// ListSnapshotsUnlocked returns snapshot info without acquiring the lock.
// Must be called with s.mu held.
func (s *OrgService) ListSnapshotsUnlocked() []SnapshotInfo {
	return s.snaps.unsafeList()
}

func (s *OrgService) ListSnapshots(ctx context.Context) []SnapshotInfo {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.snaps.unsafeList()
}
