package org

import (
	"github.com/zachthieme/grove/internal/apitypes"
	"github.com/zachthieme/grove/internal/snapshot"
)

// MoveResult holds working people and pods, returned from mutations that
// affect both (e.g. Move, Update, Reorder).
type MoveResult struct {
	Working []apitypes.OrgNode
	Pods    []apitypes.Pod
}

// MutationResult holds working, recycled, and pods slices, returned atomically
// from mutations that affect all three (e.g. Delete, Restore).
type MutationResult struct {
	Working  []apitypes.OrgNode
	Recycled []apitypes.OrgNode
	Pods     []apitypes.Pod
}

// OrgData is the canonical org payload returned by reads, resets, and
// imports. Original is the immutable post-import state; Working is the
// editable copy. Pods and Settings are optional sidecars.
type OrgData struct {
	Original           []apitypes.OrgNode `json:"original"`
	Working            []apitypes.OrgNode `json:"working"`
	Pods               []apitypes.Pod     `json:"pods,omitempty"`
	Settings           *apitypes.Settings `json:"settings,omitempty"`
	PersistenceWarning string             `json:"persistenceWarning,omitempty"`
}

// UploadResponse is returned by the Upload and UploadZip endpoints. When
// Status is "ready", OrgData is populated and the caller can show the org
// chart immediately. When Status is "needs_mapping", Headers/Mapping/Preview
// drive the column-mapping UI.
type UploadResponse struct {
	Status             string                           `json:"status"`
	OrgData            *OrgData                         `json:"orgData,omitempty"`
	Headers            []string                         `json:"headers,omitempty"`
	Mapping            map[string]apitypes.MappedColumn `json:"mapping,omitempty"`
	Preview            [][]string                       `json:"preview,omitempty"`
	Snapshots          []snapshot.Info                  `json:"snapshots,omitempty"`
	PersistenceWarning string                           `json:"persistenceWarning,omitempty"`
}
