package org

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"path/filepath"
	"strings"
	"sync"

	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"
	"github.com/zachthieme/grove/internal/apitypes"
	"github.com/zachthieme/grove/internal/autosave"
	"github.com/zachthieme/grove/internal/logbuf"
	"github.com/zachthieme/grove/internal/model"
	"github.com/zachthieme/grove/internal/pod"
	"github.com/zachthieme/grove/internal/snapshot"
)

type OrgService struct {
	mu       sync.RWMutex
	original []apitypes.OrgNode
	working  []apitypes.OrgNode
	recycled []apitypes.OrgNode
	settings apitypes.Settings
	pending  *apitypes.PendingUpload
	// pendingEpoch increments on each Upload that creates a pending mapping;
	// confirmedEpoch is set when a ConfirmMapping commits. ConfirmMapping
	// captures the expected epoch (confirmedEpoch+1) before parsing outside
	// the lock, then refuses to commit if pendingEpoch has advanced — i.e.
	// a newer Upload superseded this one. See service_import.go.
	pendingEpoch   uint64
	confirmedEpoch uint64
	snap           *snapshot.Service
	podMgr         *pod.Manager
	idIndex        map[string]int
}

func New(snapStore snapshot.Store) *OrgService {
	svc := &OrgService{podMgr: pod.New()}
	svc.snap = snapshot.New(snapStore, svc)
	return svc
}

// SnapshotService returns the snapshot.Service bound to this OrgService.
// Used by the Services constructor to wire HTTP routes.
func (s *OrgService) SnapshotService() *snapshot.Service { return s.snap }

func extractRows(filename string, data []byte) ([]string, [][]string, error) {
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ExtCSV:
		return extractRowsCSV(data)
	case ExtXLSX:
		return extractRowsXLSX(data)
	default:
		return nil, nil, ErrValidation("unsupported file format '%s'", ext)
	}
}

func extractRowsCSV(data []byte) ([]string, [][]string, error) {
	reader := csv.NewReader(bytes.NewReader(data))
	records, err := reader.ReadAll()
	if err != nil {
		return nil, nil, ErrValidation("reading CSV: %v", err)
	}
	if len(records) < 2 {
		return nil, nil, ErrValidation("CSV must have a header and at least one data row")
	}
	return records[0], records[1:], nil
}

func extractRowsXLSX(data []byte) ([]string, [][]string, error) {
	f, err := excelize.OpenReader(bytes.NewReader(data))
	if err != nil {
		return nil, nil, ErrValidation("opening xlsx: %v", err)
	}
	defer func() { _ = f.Close() }()
	sheet := f.GetSheetName(0)
	rows, err := f.GetRows(sheet)
	if err != nil {
		return nil, nil, ErrValidation("reading rows: %v", err)
	}
	if len(rows) < 2 {
		return nil, nil, ErrValidation("xlsx must have a header and at least one data row")
	}
	return rows[0], rows[1:], nil
}

// normalizeEmploymentType sets EmploymentType to "FTE" for any non-product node
// missing one. FTE is the canonical default — the codebase treats empty as FTE
// (form default, card abbrev, status colors), so normalize at ingress to avoid a
// "No type" bucket appearing for what is effectively unset/legacy data.
func normalizeEmploymentType(nodes []apitypes.OrgNode) {
	for i := range nodes {
		if !model.IsProduct(nodes[i].Type) && nodes[i].EmploymentType == "" {
			nodes[i].EmploymentType = "FTE"
		}
	}
}

// RestoreState loads full state from an autosave payload into the service,
// syncing the backend with a frontend that restored from autosave.
func (s *OrgService) RestoreState(ctx context.Context, data autosave.AutosaveData) {
	s.mu.Lock()
	s.original = deepCopyNodes(data.Original)
	s.working = deepCopyNodes(data.Working)
	normalizeEmploymentType(s.original)
	normalizeEmploymentType(s.working)
	s.rebuildIndex()
	s.recycled = deepCopyNodes(data.Recycled)
	normalizeEmploymentType(s.recycled)
	s.podMgr.SetState(pod.Copy(data.Pods), pod.Copy(data.OriginalPods))
	if data.Settings != nil {
		s.settings = *data.Settings
	} else {
		s.settings = apitypes.Settings{DisciplineOrder: DeriveDisciplineOrder(s.original)}
	}
	people := len(s.working)
	recycled := len(s.recycled)
	s.mu.Unlock()
	logbuf.Logger().Info("state restored from autosave", "source", "org", "op", "restoreState", "people", people, "recycled", recycled, "snapshot", data.SnapshotName)
}

func (s *OrgService) GetOrg(ctx context.Context) *OrgData {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.original == nil {
		return nil
	}
	return &OrgData{Original: deepCopyNodes(s.original), Working: deepCopyNodes(s.working), Pods: pod.Copy(s.podMgr.Pods()), Settings: &s.settings}
}

func (s *OrgService) GetWorking(ctx context.Context) []apitypes.OrgNode {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return deepCopyNodes(s.working)
}

// GetOriginal returns a deep-copy of the original (pre-import) state.
// Like GetWorking but for the immutable original slice.
func (s *OrgService) GetOriginal(ctx context.Context) []apitypes.OrgNode {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return deepCopyNodes(s.original)
}

func (s *OrgService) GetRecycled(ctx context.Context) []apitypes.OrgNode {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return deepCopyNodes(s.recycled)
}

func (s *OrgService) ResetToOriginal(ctx context.Context) *OrgData {
	s.mu.Lock()
	s.working = deepCopyNodes(s.original)
	s.rebuildIndex()
	s.recycled = nil
	s.podMgr.Reset()
	s.settings = apitypes.Settings{DisciplineOrder: DeriveDisciplineOrder(s.original)}
	resp := &OrgData{Original: deepCopyNodes(s.original), Working: deepCopyNodes(s.working), Pods: pod.Copy(s.podMgr.Pods()), Settings: &s.settings}
	s.mu.Unlock()

	// Clear snapshots after releasing org lock — load-bearing rule:
	// never hold mu_org and mu_snap simultaneously. Bumping snap epoch
	// invalidates any in-flight Save that captured pre-Reset state.
	// Signature returns *OrgData (no error), so disk failures here surface
	// only via the structured logger — consistent with podMgr.unsafeReset
	// semantics, but no longer silent.
	if err := s.snap.Clear(); err != nil {
		logbuf.Logger().Error("snapshot clear during reset failed", "source", "org", "op", "reset", "err", err.Error())
	}
	logbuf.Logger().Info("org reset to original", "source", "org", "op", "reset")
	return resp
}

// resetState replaces the full org state after an import. Must be called with s.mu held.
// Callers are responsible for setting s.settings and s.pending as appropriate.
// Snapshot replacement (if needed) is the caller's responsibility — call
// s.snap.ReplaceAll() or s.snap.Clear() AFTER s.mu is released to avoid
// violating the "never hold both locks" invariant.
func (s *OrgService) resetState(original, working []apitypes.OrgNode) {
	s.original = original
	s.working = deepCopyNodes(working)
	s.rebuildIndex()
	s.recycled = nil
	s.podMgr.Seed(s.working)
	_ = pod.SeedPods(s.original)
}

// rebuildIndex rebuilds the idIndex from the current working slice.
// Must be called with s.mu held after any operation that changes the
// working slice's structure (append, remove, replace).
//
// O(n) on every structural mutation. Intentional: at Grove's product scope
// (single-user, hundreds of people, occasional thousands) the rebuild is
// microseconds and never appears in profiles — TestLargeOrg_500People and the
// benchmark suite verify this. Switching to incremental index maintenance
// (add on append, swap-and-pop on delete, refresh on replace) would distribute
// the same work across mutation sites and add a class of "forgot to update the
// index" bugs for no observable gain. Revisit only if a benchmark regression
// makes this hot.
func (s *OrgService) rebuildIndex() {
	s.idIndex = make(map[string]int, len(s.working))
	for i, p := range s.working {
		s.idIndex[p.Id] = i
	}
}

// findWorking finds a person by ID in the working slice. Must be called with s.mu held.
func (s *OrgService) findWorking(id string) (int, *apitypes.OrgNode) {
	if idx, ok := s.idIndex[id]; ok && idx < len(s.working) && s.working[idx].Id == id {
		return idx, &s.working[idx]
	}
	return -1, nil
}

// deepCopyNodes returns an independent copy of src, including each person's
// AdditionalTeams slice. This is the concurrency safety boundary: every value
// returned from OrgService to a handler (or stored internally as a separate
// generation, e.g. original vs working) MUST go through deepCopyNodes so
// that in-place mutations on one slice never corrupt another. The struct
// fields themselves are value types (strings, ints) and are copied by the
// range loop; only slice fields (AdditionalTeams) need explicit cloning.
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

// CaptureState returns a deep-copied snapshot of the current org state.
// Held under read lock for the minimum time needed to copy.
// Pods is always a non-nil slice (may be empty) so callers can JSON-encode
// it as [] rather than null.
func (s *OrgService) CaptureState() snapshot.OrgState {
	s.mu.RLock()
	defer s.mu.RUnlock()
	pods := pod.Copy(s.podMgr.Pods())
	if pods == nil {
		pods = []apitypes.Pod{}
	}
	order := make([]string, len(s.settings.DisciplineOrder))
	copy(order, s.settings.DisciplineOrder)
	return snapshot.OrgState{
		People:   deepCopyNodes(s.working),
		Pods:     pods,
		Settings: apitypes.Settings{DisciplineOrder: order},
	}
}

// ApplyState replaces working/pods/settings from the given state under write lock.
// Recycled is cleared (snapshot loads start fresh) and idIndex is rebuilt.
func (s *OrgService) ApplyState(state snapshot.OrgState) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.working = deepCopyNodes(state.People)
	s.rebuildIndex()
	s.recycled = nil
	if state.Pods != nil {
		s.podMgr.SetPods(pod.Copy(state.Pods))
	} else {
		s.podMgr.SetPods(pod.SeedPods(s.working))
	}
	if len(state.Settings.DisciplineOrder) > 0 {
		order := make([]string, len(state.Settings.DisciplineOrder))
		copy(order, state.Settings.DisciplineOrder)
		s.settings = apitypes.Settings{DisciplineOrder: order}
	} else {
		s.settings = apitypes.Settings{DisciplineOrder: DeriveDisciplineOrder(s.working)}
	}
}

// Create initializes a new org with a single root person. It replaces any
// existing org state and clears snapshots, returning the new OrgData.
func (s *OrgService) Create(ctx context.Context, name string) (*OrgData, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, ErrValidation("name is required")
	}
	if len(name) > maxFieldLen {
		return nil, ErrValidation("name too long (max %d characters)", maxFieldLen)
	}

	p := apitypes.OrgNode{
		OrgNodeFields: model.OrgNodeFields{Name: name, Status: "Active"},
		Id:            uuid.NewString(),
	}

	s.mu.Lock()
	s.pending = nil
	people := []apitypes.OrgNode{p}
	s.resetState(people, people)
	s.settings = apitypes.Settings{DisciplineOrder: []string{}}
	resp := &OrgData{
		Original: deepCopyNodes(s.original),
		Working:  deepCopyNodes(s.working),
		Pods:     pod.Copy(s.podMgr.Pods()),
		Settings: &s.settings,
	}
	s.mu.Unlock()

	// Clear snapshots after releasing org lock — never hold both locks.
	var persistWarn string
	if err := s.snap.Clear(); err != nil {
		persistWarn = fmt.Sprintf("snapshot cleanup failed: %v", err)
	}
	resp.PersistenceWarning = persistWarn
	logbuf.Logger().Info("org created", "source", "org", "name", name)
	return resp, nil
}

// --- snapshot delegations ---
// Thin wrappers on *OrgService that forward to the embedded *snapshot.Service.
// These satisfy the SnapshotOps interface in internal/httpapi so that *OrgService
// can be wired directly into Services.Snaps without an adapter, and so that
// existing tests calling svc.SaveSnapshot(...) etc. continue to work.

func (s *OrgService) SaveSnapshot(ctx context.Context, name string) error {
	return s.snap.Save(ctx, name)
}

func (s *OrgService) LoadSnapshot(ctx context.Context, name string) (*OrgData, error) {
	if err := s.snap.Load(ctx, name); err != nil {
		return nil, err
	}
	return s.GetOrg(ctx), nil
}

func (s *OrgService) DeleteSnapshot(ctx context.Context, name string) error {
	return s.snap.Delete(ctx, name)
}

func (s *OrgService) ListSnapshots(ctx context.Context) []snapshot.Info {
	return s.snap.List()
}

func (s *OrgService) ExportSnapshot(ctx context.Context, name string) ([]apitypes.OrgNode, error) {
	return s.snap.Export(ctx, name)
}
