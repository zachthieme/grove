package api

import (
	"context"

	"github.com/zachthieme/grove/internal/apitypes"
)

// Snapshot delegate methods on *OrgService — thin wrappers that forward to
// the embedded *SnapshotService. These satisfy the SnapshotOps interface so
// that *OrgService can be wired directly into Services.Snaps without an
// adapter, and so that existing tests calling svc.SaveSnapshot(...) etc.
// continue to work without modification.

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

func (s *OrgService) ListSnapshots(ctx context.Context) []SnapshotInfo {
	return s.snap.List()
}

func (s *OrgService) ExportSnapshot(ctx context.Context, name string) ([]apitypes.OrgNode, error) {
	return s.snap.Export(ctx, name)
}
