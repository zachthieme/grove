package api

import "fmt"

func (s *OrgService) SaveSnapshot(name string) error {
	s.mu.Lock()
	err := s.snaps.Save(name, s.working, s.pods, s.settings)
	snapCopy := s.snaps.CopyAll()
	s.mu.Unlock()
	if err != nil {
		return err
	}
	if err := s.snaps.PersistCopy(snapCopy); err != nil {
		return fmt.Errorf("persisting snapshot: %w", err)
	}
	return nil
}

func (s *OrgService) ExportSnapshot(name string) ([]Person, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	switch name {
	case SnapshotWorking:
		return deepCopyPeople(s.working), nil
	case SnapshotOriginal:
		return deepCopyPeople(s.original), nil
	default:
		snap := s.snaps.Get(name)
		if snap == nil {
			return nil, errNotFound("snapshot '%s' not found", name)
		}
		return deepCopyPeople(snap.People), nil
	}
}

func (s *OrgService) LoadSnapshot(name string) (*OrgData, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	snap, err := s.snaps.Load(name)
	if err != nil {
		return nil, err
	}
	s.working = deepCopyPeople(snap.People)
	s.rebuildIndex()
	if snap.Pods != nil {
		s.pods = CopyPods(snap.Pods)
	} else {
		s.pods = SeedPods(s.working)
	}
	s.recycled = nil
	if len(snap.Settings.DisciplineOrder) > 0 {
		s.settings = snap.Settings
	} else {
		s.settings = Settings{DisciplineOrder: deriveDisciplineOrder(s.working)}
	}
	return &OrgData{Original: deepCopyPeople(s.original), Working: deepCopyPeople(s.working), Pods: CopyPods(s.pods), Settings: &s.settings}, nil
}

func (s *OrgService) DeleteSnapshot(name string) error {
	s.mu.Lock()
	s.snaps.Delete(name)
	snapCopy := s.snaps.CopyAll()
	s.mu.Unlock()
	if err := s.snaps.PersistCopy(snapCopy); err != nil {
		return fmt.Errorf("persisting snapshot deletion: %w", err)
	}
	return nil
}

// ListSnapshotsUnlocked returns snapshot info without acquiring the lock.
// Must be called with s.mu held.
func (s *OrgService) ListSnapshotsUnlocked() []SnapshotInfo {
	return s.snaps.List()
}

func (s *OrgService) ListSnapshots() []SnapshotInfo {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.snaps.List()
}
