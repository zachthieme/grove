package api

import (
	"maps"
	"sort"
	"time"
)

type snapshotData struct {
	People    []Person
	Pods      []Pod
	Settings  Settings
	Timestamp time.Time
}

// Reserved snapshot names used internally for export and special operations.
const (
	SnapshotWorking    = "__working__"
	SnapshotOriginal   = "__original__"
	SnapshotExportTemp = "__export_temp__"
)

var reservedSnapshotNames = map[string]bool{
	SnapshotWorking:  true,
	SnapshotOriginal: true,
}

// SnapshotManager owns the in-memory snapshot map and delegates persistence to
// a SnapshotStore. It is NOT thread-safe — callers must hold an external lock
// (typically OrgService.mu) around all method calls.
type SnapshotManager struct {
	snapshots map[string]snapshotData
	store     SnapshotStore
}

// NewSnapshotManager creates a SnapshotManager and loads any persisted snapshots
// from the store.
func NewSnapshotManager(store SnapshotStore) *SnapshotManager {
	sm := &SnapshotManager{store: store}
	if snaps, err := store.Read(); err == nil && snaps != nil {
		sm.snapshots = snaps
	}
	return sm
}

// Save stores a named snapshot of the given state. Returns an error for reserved names.
func (sm *SnapshotManager) Save(name string, people []Person, pods []Pod, settings Settings) error {
	if reservedSnapshotNames[name] {
		return errConflict("snapshot name %q is reserved", name)
	}
	if sm.snapshots == nil {
		sm.snapshots = make(map[string]snapshotData)
	}
	sm.snapshots[name] = snapshotData{
		People:    deepCopyPeople(people),
		Pods:      CopyPods(pods),
		Settings:  settings,
		Timestamp: time.Now(),
	}
	return nil
}

// Load returns the snapshot data for a given name.
func (sm *SnapshotManager) Load(name string) (*snapshotData, error) {
	snap, ok := sm.snapshots[name]
	if !ok {
		return nil, errNotFound("snapshot '%s' not found", name)
	}
	return &snap, nil
}

// Get returns snapshot data if it exists, or nil.
func (sm *SnapshotManager) Get(name string) *snapshotData {
	snap, ok := sm.snapshots[name]
	if !ok {
		return nil
	}
	return &snap
}

// Delete removes a named snapshot.
func (sm *SnapshotManager) Delete(name string) {
	delete(sm.snapshots, name)
}

// List returns all snapshots sorted by timestamp (newest first), excluding
// the internal export-temp snapshot.
func (sm *SnapshotManager) List() []SnapshotInfo {
	list := make([]SnapshotInfo, 0)
	for name, snap := range sm.snapshots {
		if name == SnapshotExportTemp {
			continue
		}
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

// ReplaceAll replaces the entire snapshot map (used by import and autosave restore).
func (sm *SnapshotManager) ReplaceAll(snapshots map[string]snapshotData) {
	sm.snapshots = snapshots
}

// CopyAll returns a shallow copy of the snapshot map, safe for use outside the lock.
func (sm *SnapshotManager) CopyAll() map[string]snapshotData {
	if sm.snapshots == nil {
		return nil
	}
	cp := make(map[string]snapshotData, len(sm.snapshots))
	maps.Copy(cp, sm.snapshots)
	return cp
}

// Persist writes the current snapshot state to the store. This is safe to call
// outside the lock if called with a copy from CopyAll.
func (sm *SnapshotManager) Persist() error {
	return sm.store.Write(sm.snapshots)
}

// PersistCopy writes a pre-copied snapshot map to the store. Use this to persist
// outside the lock: copy under lock with CopyAll, then call PersistCopy without lock.
func (sm *SnapshotManager) PersistCopy(snapshots map[string]snapshotData) error {
	return sm.store.Write(snapshots)
}

// DeleteStore removes the persisted snapshot file.
func (sm *SnapshotManager) DeleteStore() error {
	return sm.store.Delete()
}
