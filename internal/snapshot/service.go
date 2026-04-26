// Package snapshot owns the named-snapshot subsystem: capturing, persisting,
// listing, loading, and clearing snapshots of org state. It exposes Service
// (the in-memory map + race-guarded mutations) and Store (the persistence
// abstraction). Snapshots cross between this package and the org-owning
// package via the OrgStateProvider bridge interface and the OrgState value
// type — neither side imports the other.
package snapshot

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"sort"
	"sync"
	"time"

	"github.com/zachthieme/grove/internal/apitypes"
	"github.com/zachthieme/grove/internal/logbuf"
	"github.com/zachthieme/grove/internal/pod"
)

// validSnapshotName allows names starting with a letter or digit, followed by
// letters, digits, spaces, hyphens, underscores, or dots.
var validSnapshotName = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9 _\-\.]*$`)

func isValidSnapshotName(name string) bool {
	return validSnapshotName.MatchString(name)
}

// Data is the on-disk + in-memory shape of a single named snapshot. Exported
// so cross-package callers (zip import) can construct snapshot maps.
type Data struct {
	People    []apitypes.OrgNode
	Pods      []apitypes.Pod
	Settings  apitypes.Settings
	Timestamp time.Time
}

// Info is the over-the-wire shape returned by List and the snapshot HTTP
// handlers. Mirrors the frontend SnapshotInfo TypeScript interface.
type Info struct {
	Name      string `json:"name"`
	Timestamp string `json:"timestamp"`
}

// OrgState is a frozen, deep-copied view of org state at a point in time.
// Used as the bridge format between the org-owning service and Service for
// Save/Load, and stored as the in-memory snapshot payload.
type OrgState struct {
	People   []apitypes.OrgNode
	Pods     []apitypes.Pod
	Settings apitypes.Settings
}

// Reserved snapshot names used internally for export and special operations.
const (
	Working    = "__working__"
	Original   = "__original__"
	ExportTemp = "__export_temp__"
)

var reservedSnapshotNames = map[string]bool{
	Working:  true,
	Original: true,
}

// OrgStateProvider is the interface Service uses to capture and apply org
// state. Implemented by the org-owning service (*api.OrgService for now).
type OrgStateProvider interface {
	CaptureState() OrgState
	ApplyState(OrgState)
	GetWorking(ctx context.Context) []apitypes.OrgNode
	GetOriginal(ctx context.Context) []apitypes.OrgNode
}

// Service owns the snapshot map and disk store under its own mutex. It is
// the snapshot-counterpart to the org service — never held under the org
// service's lock. Cross-service ops (Save captures from org; Load applies to
// org) always release one lock before acquiring the other.
type Service struct {
	mu    sync.RWMutex
	snaps map[string]Data
	store Store
	epoch uint64 // bumped on Clear/ReplaceAll; Save aborts if epoch advances
	org   OrgStateProvider
}

// New constructs a Service and loads any persisted snapshots from the store.
// Read failures are logged and the service starts empty — desktop tool, no
// remote operator to halt for.
func New(store Store, org OrgStateProvider) *Service {
	ss := &Service{store: store, org: org}
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
func (ss *Service) List() []Info {
	ss.mu.RLock()
	defer ss.mu.RUnlock()
	list := make([]Info, 0)
	for name, snap := range ss.snaps {
		if name == ExportTemp {
			continue
		}
		list = append(list, Info{
			Name:      name,
			Timestamp: snap.Timestamp.Format(time.RFC3339Nano),
		})
	}
	sort.Slice(list, func(i, j int) bool {
		return list[i].Timestamp > list[j].Timestamp
	})
	return list
}

// Save captures org state and persists a named snapshot. Returns *ConflictError
// if the snapshot epoch advanced (Clear/ReplaceAll ran) between capture and
// commit, or if the name is reserved. Returns *ValidationError for invalid names.
func (ss *Service) Save(ctx context.Context, name string) error {
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
		ss.snaps = make(map[string]Data)
	}
	ss.snaps[name] = Data{
		People:    deepCopyNodes(state.People),
		Pods:      pod.Copy(state.Pods),
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
func (ss *Service) Load(ctx context.Context, name string) error {
	ss.mu.RLock()
	snap, ok := ss.snaps[name]
	if !ok {
		ss.mu.RUnlock()
		return errNotFound("snapshot '%s' not found", name)
	}
	state := OrgState{
		People:   deepCopyNodes(snap.People),
		Pods:     pod.Copy(snap.Pods),
		Settings: snap.Settings,
	}
	ss.mu.RUnlock()

	ss.org.ApplyState(state)
	logbuf.Logger().Info("snapshot loaded", "source", "snap", "op", "load", "name", name, "people", len(state.People))
	return nil
}

// Delete removes a named snapshot and persists the change. Idempotent:
// deleting a nonexistent snapshot is a no-op.
func (ss *Service) Delete(ctx context.Context, name string) error {
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
// the live working/original via the OrgStateProvider. Named snapshots are
// read under mu_snap.RLock and deep-copied so callers can mutate freely.
func (ss *Service) Export(ctx context.Context, name string) ([]apitypes.OrgNode, error) {
	switch name {
	case Working:
		return ss.org.GetWorking(ctx), nil
	case Original:
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

// Clearer is the narrow interface the org-owning service uses to invalidate
// snapshots when org state is reset (Reset/Create/Upload). Implemented by
// *Service.
type Clearer interface {
	Clear() error
	ReplaceAll(map[string]Data) error
}

// Clear wipes the snapshot map, bumps the epoch (invalidating any in-flight
// Save), and removes the persisted file.
func (ss *Service) Clear() error {
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
func (ss *Service) ReplaceAll(snaps map[string]Data) error {
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

// Compile-time assertion: *Service satisfies Clearer.
var _ Clearer = (*Service)(nil)

// --- Errors ---
//
// Snapshot-package errors mirror the api package's typed errors: they
// implement HTTPStatus() so the http handler in the api package can map them
// to the correct response code via its httpStatusError interface, without
// needing to import this package.

// ValidationError indicates invalid input data (422).
type ValidationError struct{ msg string }

func (e *ValidationError) Error() string   { return e.msg }
func (e *ValidationError) HTTPStatus() int { return http.StatusUnprocessableEntity }

// NotFoundError indicates a requested resource doesn't exist (404).
type NotFoundError struct{ msg string }

func (e *NotFoundError) Error() string   { return e.msg }
func (e *NotFoundError) HTTPStatus() int { return http.StatusNotFound }

// ConflictError indicates a duplicate or conflicting state (409).
type ConflictError struct{ msg string }

func (e *ConflictError) Error() string   { return e.msg }
func (e *ConflictError) HTTPStatus() int { return http.StatusConflict }

func errValidation(format string, args ...any) error {
	return &ValidationError{fmt.Sprintf(format, args...)}
}
func errNotFound(format string, args ...any) error {
	return &NotFoundError{fmt.Sprintf(format, args...)}
}
func errConflict(format string, args ...any) error {
	return &ConflictError{fmt.Sprintf(format, args...)}
}

// Predicates — convenience for tests.
func isNotFound(err error) bool {
	var e *NotFoundError
	return errors.As(err, &e)
}

func isConflict(err error) bool {
	var e *ConflictError
	return errors.As(err, &e)
}

func isValidation(err error) bool {
	var e *ValidationError
	return errors.As(err, &e)
}

// deepCopyNodes returns an independent copy of src, including each person's
// AdditionalTeams slice. Used so snapshots are insulated from later mutations
// of the working slice they were captured from. Mirrors api.deepCopyNodes.
func deepCopyNodes(src []apitypes.OrgNode) []apitypes.OrgNode {
	dst := make([]apitypes.OrgNode, len(src))
	for i, p := range src {
		dst[i] = p
		if p.AdditionalTeams != nil {
			dst[i].AdditionalTeams = make([]string, len(p.AdditionalTeams))
			copy(dst[i].AdditionalTeams, p.AdditionalTeams)
		}
	}
	return dst
}
