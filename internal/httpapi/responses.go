package httpapi

import (
	"github.com/zachthieme/grove/internal/apitypes"
)

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

// CopyResponse is returned by copy-subtree. IdMap maps original-id → new-id
// so the client can locate the new copies (e.g. to auto-select the first
// copy after paste).
type CopyResponse struct {
	IdMap   map[string]string  `json:"idMap"`
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
