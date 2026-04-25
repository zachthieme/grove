package api

import (
	"context"
	"fmt"
	"regexp"
	"sort"
	"sync"
	"time"

	"github.com/zachthieme/grove/internal/apitypes"
	"github.com/zachthieme/grove/internal/logbuf"
)

// validSnapshotName allows names starting with a letter or digit, followed by
// letters, digits, spaces, hyphens, underscores, or dots.
var validSnapshotName = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9 _\-\.]*$`)

func isValidSnapshotName(name string) bool {
	return validSnapshotName.MatchString(name)
}

type snapshotData struct {
	People    []apitypes.OrgNode
	Pods      []apitypes.Pod
	Settings  apitypes.Settings
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

// orgStateProvider is the interface SnapshotService uses to capture and
// apply org state. Implemented by *OrgService.
type orgStateProvider interface {
	CaptureState() OrgState
	ApplyState(OrgState)
	GetWorking(ctx context.Context) []apitypes.OrgNode
	GetOriginal(ctx context.Context) []apitypes.OrgNode
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
// snapshots from the store. Read failures are logged and the service starts
// empty — desktop tool, no remote operator to halt for.
func NewSnapshotService(store SnapshotStore, org orgStateProvider) *SnapshotService {
	ss := &SnapshotService{store: store, org: org}
	snaps, err := store.Read()
	switch {
	case err != nil:
		logbuf.Logger().Warn("snapshot store unreadable, starting empty", "source", "snap", "op", "load", "err", err.Error())
	case snaps != nil:
		ss.snaps = snaps
		logbuf.Logger().Info("snapshots loaded", "source", "snap", "count", len(snaps))
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
		logbuf.Logger().Error("snapshot persist failed", "source", "snap", "op", "save", "name", name, "err", err.Error())
		return fmt.Errorf("persisting snapshot: %w", err)
	}
	logbuf.Logger().Info("snapshot saved", "source", "snap", "op", "save", "name", name, "people", len(state.People), "pods", len(state.Pods), "overwrote", existed)
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
	logbuf.Logger().Info("snapshot loaded", "source", "snap", "op", "load", "name", name, "people", len(state.People))
	return nil
}

// Delete removes a named snapshot and persists the change. Idempotent:
// deleting a nonexistent snapshot is a no-op.
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
		logbuf.Logger().Error("snapshot delete persist failed", "source", "snap", "op", "delete", "name", name, "err", err.Error())
		return fmt.Errorf("persisting snapshot deletion: %w", err)
	}
	logbuf.Logger().Info("snapshot deleted", "source", "snap", "op", "delete", "name", name)
	return nil
}

// Export returns the People slice for a snapshot. Special names route to
// the live working/original via the orgStateProvider. Named snapshots are
// read under mu_snap.RLock and deep-copied so callers can mutate freely.
func (ss *SnapshotService) Export(ctx context.Context, name string) ([]apitypes.OrgNode, error) {
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

// SnapshotClearer is the narrow interface OrgService uses to invalidate
// snapshots when org state is reset (Reset/Create/Upload). Implemented
// by *SnapshotService.
type SnapshotClearer interface {
	Clear() error
	ReplaceAll(map[string]snapshotData) error
}

// Clear wipes the snapshot map, bumps the epoch (invalidating any in-flight
// Save), and removes the persisted file.
func (ss *SnapshotService) Clear() error {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	prev := len(ss.snaps)
	ss.snaps = nil
	ss.epoch++
	if err := ss.store.Delete(); err != nil {
		logbuf.Logger().Error("snapshot clear persist failed", "source", "snap", "op", "clear", "err", err.Error())
		return err
	}
	if prev > 0 {
		logbuf.Logger().Info("snapshots cleared", "source", "snap", "op", "clear", "evicted", prev)
	}
	return nil
}

// ReplaceAll replaces the snapshot map (used by zip import to install
// imported snapshots), bumps the epoch, and persists. Rolls back to the
// prior map and epoch on store.Write failure.
func (ss *SnapshotService) ReplaceAll(snaps map[string]snapshotData) error {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	prevSnaps := ss.snaps
	prevEpoch := ss.epoch
	ss.snaps = snaps
	ss.epoch++
	if snaps == nil {
		if err := ss.store.Delete(); err != nil {
			ss.snaps = prevSnaps
			ss.epoch = prevEpoch
			logbuf.Logger().Error("snapshot replaceAll delete failed", "source", "snap", "op", "replaceAll", "err", err.Error())
			return fmt.Errorf("deleting snapshot store: %w", err)
		}
		logbuf.Logger().Info("snapshots replaced (cleared)", "source", "snap", "op", "replaceAll", "previous", len(prevSnaps))
		return nil
	}
	if err := ss.store.Write(ss.snaps); err != nil {
		ss.snaps = prevSnaps
		ss.epoch = prevEpoch
		logbuf.Logger().Error("snapshot replaceAll persist failed", "source", "snap", "op", "replaceAll", "err", err.Error())
		return fmt.Errorf("persisting snapshots: %w", err)
	}
	logbuf.Logger().Info("snapshots replaced", "source", "snap", "op", "replaceAll", "previous", len(prevSnaps), "new", len(snaps))
	return nil
}

// Compile-time assertion: *SnapshotService satisfies SnapshotClearer.
var _ SnapshotClearer = (*SnapshotService)(nil)
