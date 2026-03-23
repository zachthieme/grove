package api

import (
	"fmt"
	"sort"
	"time"
)

type snapshotData struct {
	People    []Person
	Timestamp time.Time
}

var reservedSnapshotNames = map[string]bool{
	"__working__":  true,
	"__original__": true,
}

func (s *OrgService) SaveSnapshot(name string) error {
	if reservedSnapshotNames[name] {
		return fmt.Errorf("snapshot name %q is reserved", name)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.snapshots == nil {
		s.snapshots = make(map[string]snapshotData)
	}
	s.snapshots[name] = snapshotData{
		People:    deepCopyPeople(s.working),
		Timestamp: time.Now(),
	}
	return nil
}

func (s *OrgService) ExportSnapshot(name string) ([]Person, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	switch name {
	case "__working__":
		return deepCopyPeople(s.working), nil
	case "__original__":
		return deepCopyPeople(s.original), nil
	default:
		snap, ok := s.snapshots[name]
		if !ok {
			return nil, fmt.Errorf("snapshot '%s' not found", name)
		}
		return deepCopyPeople(snap.People), nil
	}
}

func (s *OrgService) LoadSnapshot(name string) (*OrgData, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	snap, ok := s.snapshots[name]
	if !ok {
		return nil, fmt.Errorf("snapshot '%s' not found", name)
	}
	s.working = deepCopyPeople(snap.People)
	s.recycled = nil
	return &OrgData{Original: deepCopyPeople(s.original), Working: deepCopyPeople(s.working)}, nil
}

func (s *OrgService) DeleteSnapshot(name string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.snapshots, name)
}

// ListSnapshotsUnlocked returns snapshot info without acquiring the lock.
// Must be called with s.mu held.
func (s *OrgService) ListSnapshotsUnlocked() []SnapshotInfo {
	var list []SnapshotInfo
	for name, snap := range s.snapshots {
		list = append(list, SnapshotInfo{
			Name:      name,
			Timestamp: snap.Timestamp.Format(time.RFC3339Nano),
		})
	}
	sort.Slice(list, func(i, j int) bool {
		return list[i].Timestamp > list[j].Timestamp
	})
	return list
}

func (s *OrgService) ListSnapshots() []SnapshotInfo {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.ListSnapshotsUnlocked()
}
