package api

import (
	"context"
	"regexp"
	"sort"
	"sync"
	"time"
)

// validSnapshotName allows names starting with a letter or digit, followed by
// letters, digits, spaces, hyphens, underscores, or dots.
var validSnapshotName = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9 _\-\.]*$`)

func isValidSnapshotName(name string) bool {
	return validSnapshotName.MatchString(name)
}

type snapshotData struct {
	People    []OrgNode
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

// unsafeSave stores a named snapshot of the given state. Returns an error for invalid or reserved names.
// Caller must hold the external lock.
func (sm *SnapshotManager) unsafeSave(name string, people []OrgNode, pods []Pod, settings Settings) error {
	if name == "" {
		return errValidation("snapshot name is required")
	}
	if len(name) > 100 {
		return errValidation("snapshot name too long (max 100 characters)")
	}
	if !isValidSnapshotName(name) {
		return errValidation("snapshot name contains invalid characters (use letters, numbers, spaces, hyphens, underscores, dots)")
	}
	if reservedSnapshotNames[name] {
		return errConflict("snapshot name %q is reserved", name)
	}
	if sm.snapshots == nil {
		sm.snapshots = make(map[string]snapshotData)
	}
	sm.snapshots[name] = snapshotData{
		People:    deepCopyNodes(people),
		Pods:      CopyPods(pods),
		Settings:  settings,
		Timestamp: time.Now(),
	}
	return nil
}

// Load returns the snapshot data for a given name.
func (sm *SnapshotManager) unsafeLoad(name string) (*snapshotData, error) {
	snap, ok := sm.snapshots[name]
	if !ok {
		return nil, errNotFound("snapshot '%s' not found", name)
	}
	return &snap, nil
}

// Get returns snapshot data if it exists, or nil.
func (sm *SnapshotManager) unsafeGet(name string) *snapshotData {
	snap, ok := sm.snapshots[name]
	if !ok {
		return nil
	}
	return &snap
}

// Delete removes a named snapshot.
func (sm *SnapshotManager) unsafeDelete(name string) {
	delete(sm.snapshots, name)
}

// List returns all snapshots sorted by timestamp (newest first), excluding
// the internal export-temp snapshot.
func (sm *SnapshotManager) unsafeList() []SnapshotInfo {
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
func (sm *SnapshotManager) unsafeReplaceAll(snapshots map[string]snapshotData) {
	sm.snapshots = snapshots
}

// PersistAll writes the current snapshot map to the store.
// Must be called with the external lock held.
func (sm *SnapshotManager) unsafePersistAll() error {
	return sm.store.Write(sm.snapshots)
}

// DeleteStore removes the persisted snapshot file.
func (sm *SnapshotManager) unsafeDeleteStore() error {
	return sm.store.Delete()
}

// orgStateProvider is the interface SnapshotService uses to capture and
// apply org state. Implemented by *OrgService.
type orgStateProvider interface {
	CaptureState() OrgState
	ApplyState(OrgState)
	GetWorking(ctx context.Context) []OrgNode
	GetOriginal(ctx context.Context) []OrgNode
}

// SnapshotService owns the snapshot map and disk store under its own mutex.
// It is the snapshot-counterpart to OrgService — never held under OrgService's
// lock. Cross-service ops (Save captures from org; Load applies to org) always
// release one lock before acquiring the other.
type SnapshotService struct {
	mu    sync.RWMutex
	snaps map[string]snapshotData
	store SnapshotStore
	epoch uint64 // bumped on Clear/ReplaceAll; Save aborts if epoch advances
	org   orgStateProvider
}

// NewSnapshotService constructs a SnapshotService and loads any persisted
// snapshots from the store.
func NewSnapshotService(store SnapshotStore, org orgStateProvider) *SnapshotService {
	ss := &SnapshotService{store: store, org: org}
	if snaps, err := store.Read(); err == nil && snaps != nil {
		ss.snaps = snaps
	}
	return ss
}

// List returns all snapshots sorted by timestamp (newest first), excluding
// the internal export-temp snapshot. Acquires mu_snap.RLock.
func (ss *SnapshotService) List() []SnapshotInfo {
	ss.mu.RLock()
	defer ss.mu.RUnlock()
	list := make([]SnapshotInfo, 0)
	for name, snap := range ss.snaps {
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

// Save captures org state and persists a named snapshot. Returns errConflict
// if the snapshot epoch advanced (Clear/ReplaceAll ran) between capture and
// commit, or if the name is reserved. Returns errValidation for invalid names.
func (ss *SnapshotService) Save(ctx context.Context, name string) error {
	if name == "" {
		return errValidation("snapshot name is required")
	}
	// Check reserved names before the character-validity check: reserved names
	// use double-underscore delimiters and would otherwise trigger the
	// invalid-characters error instead of the more-specific conflict error.
	if reservedSnapshotNames[name] {
		return errConflict("snapshot name %q is reserved", name)
	}
	if len(name) > 100 {
		return errValidation("snapshot name too long (max 100 characters)")
	}
	if !isValidSnapshotName(name) {
		return errValidation("snapshot name contains invalid characters (use letters, numbers, spaces, hyphens, underscores, dots)")
	}

	// Read epoch BEFORE capturing state. A Clear/ReplaceAll that runs
	// after this read but before the commit Lock will advance ss.epoch
	// past expectedEpoch and the commit will abort. Reading after
	// CaptureState would miss the race entirely (the post-capture read
	// would already see the advanced epoch and match it under Lock).
	ss.mu.RLock()
	expectedEpoch := ss.epoch
	ss.mu.RUnlock()

	// Capture state outside snap lock — this acquires mu_org briefly.
	state := ss.org.CaptureState()

	ss.mu.Lock()
	defer ss.mu.Unlock()
	if ss.epoch != expectedEpoch {
		return errConflict("snapshot superseded — org state was reset")
	}

	prev, existed := ss.snaps[name]
	if ss.snaps == nil {
		ss.snaps = make(map[string]snapshotData)
	}
	ss.snaps[name] = snapshotData{
		People:    deepCopyNodes(state.People),
		Pods:      CopyPods(state.Pods),
		Settings:  state.Settings,
		Timestamp: time.Now(),
	}
	if err := ss.store.Write(ss.snaps); err != nil {
		// Roll back: restore prior entry on overwrite, or delete on insert.
		if existed {
			ss.snaps[name] = prev
		} else {
			delete(ss.snaps, name)
		}
		return errValidation("persisting snapshot: %v", err)
	}
	return nil
}

// Load reads a named snapshot under mu_snap (briefly), then calls
// org.ApplyState — which acquires mu_org. The two locks are never held
// simultaneously: mu_snap is fully released before ApplyState is called.
func (ss *SnapshotService) Load(ctx context.Context, name string) error {
	ss.mu.RLock()
	snap, ok := ss.snaps[name]
	if !ok {
		ss.mu.RUnlock()
		return errNotFound("snapshot '%s' not found", name)
	}
	state := OrgState{
		People:   deepCopyNodes(snap.People),
		Pods:     CopyPods(snap.Pods),
		Settings: snap.Settings,
	}
	ss.mu.RUnlock()

	ss.org.ApplyState(state)
	return nil
}

// Delete removes a named snapshot and persists the change. Idempotent:
// deleting a nonexistent snapshot is a no-op (matches legacy
// SnapshotManager.Delete behavior).
func (ss *SnapshotService) Delete(ctx context.Context, name string) error {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	prev, existed := ss.snaps[name]
	if !existed {
		return nil
	}
	delete(ss.snaps, name)
	if err := ss.store.Write(ss.snaps); err != nil {
		// Roll back so map and disk stay in sync.
		ss.snaps[name] = prev
		return errValidation("persisting snapshot deletion: %v", err)
	}
	return nil
}

// Export returns the People slice for a snapshot. Special names route to
// the live working/original via the orgStateProvider. Named snapshots are
// read under mu_snap.RLock and deep-copied so callers can mutate freely.
func (ss *SnapshotService) Export(ctx context.Context, name string) ([]OrgNode, error) {
	switch name {
	case SnapshotWorking:
		return ss.org.GetWorking(ctx), nil
	case SnapshotOriginal:
		return ss.org.GetOriginal(ctx), nil
	}

	ss.mu.RLock()
	defer ss.mu.RUnlock()
	snap, ok := ss.snaps[name]
	if !ok {
		return nil, errNotFound("snapshot '%s' not found", name)
	}
	return deepCopyNodes(snap.People), nil
}
