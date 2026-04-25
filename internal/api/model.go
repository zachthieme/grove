package api

import "github.com/zachthieme/grove/internal/apitypes"

type OrgData struct {
	Original           []apitypes.OrgNode `json:"original"`
	Working            []apitypes.OrgNode `json:"working"`
	Pods               []apitypes.Pod     `json:"pods,omitempty"`
	Settings           *apitypes.Settings `json:"settings,omitempty"`
	PersistenceWarning string             `json:"persistenceWarning,omitempty"`
}

type AutosaveData struct {
	Original     []apitypes.OrgNode `json:"original"`
	Working      []apitypes.OrgNode `json:"working"`
	Recycled     []apitypes.OrgNode `json:"recycled"`
	Pods         []apitypes.Pod     `json:"pods,omitempty"`
	OriginalPods []apitypes.Pod     `json:"originalPods,omitempty"`
	Settings     *apitypes.Settings `json:"settings,omitempty"`
	SnapshotName string             `json:"snapshotName"`
	Timestamp    string             `json:"timestamp"`
}

type SnapshotInfo struct {
	Name      string `json:"name"`
	Timestamp string `json:"timestamp"`
}

type UploadResponse struct {
	Status             string                           `json:"status"` // "ready" or "needs_mapping"
	OrgData            *OrgData                         `json:"orgData,omitempty"`
	Headers            []string                         `json:"headers,omitempty"`
	Mapping            map[string]apitypes.MappedColumn `json:"mapping,omitempty"`
	Preview            [][]string                       `json:"preview,omitempty"`
	Snapshots          []SnapshotInfo                   `json:"snapshots,omitempty"`
	PersistenceWarning string                           `json:"persistenceWarning,omitempty"`
}

// WorkingResponse is returned by mutations that affect working people and pods
// (move, update, reorder, updatePod, createPod).
type WorkingResponse struct {
	Working []apitypes.OrgNode `json:"working"`
	Pods    []apitypes.Pod     `json:"pods"`
}

// AddResponse is returned when a person is added.
type AddResponse struct {
	Created apitypes.OrgNode   `json:"created"`
	Working []apitypes.OrgNode `json:"working"`
	Pods    []apitypes.Pod     `json:"pods"`
}

// MutationResponse is returned by mutations that affect both working and
// recycled slices (delete, restore).
type MutationResponse struct {
	Working  []apitypes.OrgNode `json:"working"`
	Recycled []apitypes.OrgNode `json:"recycled"`
	Pods     []apitypes.Pod     `json:"pods"`
}

// RecycledResponse is returned by empty-bin.
type RecycledResponse struct {
	Recycled []apitypes.OrgNode `json:"recycled"`
}

// HealthResponse is returned by the health endpoint.
type HealthResponse struct {
	Status string `json:"status"`
}

// ConfigResponse is returned by the config endpoint.
type ConfigResponse struct {
	Logging bool `json:"logging"`
}
