package api

import "github.com/zachthieme/grove/internal/model"

type Person struct {
	model.PersonFields
	Id        string `json:"id"`
	ManagerId string `json:"managerId"`
	SortIndex int    `json:"sortIndex"`
}

// PersonUpdate carries optional field updates for a person.
// Pointer fields: nil = not sent, zero value = set to empty/zero/false.
type PersonUpdate struct {
	Name            *string `json:"name,omitempty"`
	Role            *string `json:"role,omitempty"`
	Discipline      *string `json:"discipline,omitempty"`
	Team            *string `json:"team,omitempty"`
	ManagerId       *string `json:"managerId,omitempty"`
	Status          *string `json:"status,omitempty"`
	EmploymentType  *string `json:"employmentType,omitempty"`
	AdditionalTeams *string `json:"additionalTeams,omitempty"`
	NewRole         *string `json:"newRole,omitempty"`
	NewTeam         *string `json:"newTeam,omitempty"`
	Level           *int    `json:"level,omitempty"`
	Pod             *string `json:"pod,omitempty"`
	PublicNote      *string `json:"publicNote,omitempty"`
	PrivateNote     *string `json:"privateNote,omitempty"`
	Private         *bool   `json:"private,omitempty"`
}

type Pod struct {
	Id          string `json:"id"`
	Name        string `json:"name"`
	Team        string `json:"team"`
	ManagerId   string `json:"managerId"`
	PublicNote  string `json:"publicNote,omitempty"`
	PrivateNote string `json:"privateNote,omitempty"`
}

// PodUpdate carries optional field updates for a pod.
type PodUpdate struct {
	Name        *string `json:"name,omitempty"`
	PublicNote  *string `json:"publicNote,omitempty"`
	PrivateNote *string `json:"privateNote,omitempty"`
}

type PodInfo struct {
	Pod
	MemberCount int `json:"memberCount"`
}

type Settings struct {
	DisciplineOrder []string `json:"disciplineOrder"`
}

type OrgData struct {
	Original           []Person  `json:"original"`
	Working            []Person  `json:"working"`
	Pods               []Pod     `json:"pods,omitempty"`
	Settings           *Settings `json:"settings,omitempty"`
	PersistenceWarning string    `json:"persistenceWarning,omitempty"`
}

type AutosaveData struct {
	Original     []Person  `json:"original"`
	Working      []Person  `json:"working"`
	Recycled     []Person  `json:"recycled"`
	Pods         []Pod     `json:"pods,omitempty"`
	OriginalPods []Pod     `json:"originalPods,omitempty"`
	Settings     *Settings `json:"settings,omitempty"`
	SnapshotName string    `json:"snapshotName"`
	Timestamp    string    `json:"timestamp"`
}

type SnapshotInfo struct {
	Name      string `json:"name"`
	Timestamp string `json:"timestamp"`
}

type MappedColumn struct {
	Column     string `json:"column"`
	Confidence string `json:"confidence"` // "high", "medium", "none"
}

type PendingUpload struct {
	File     []byte
	Filename string
	IsZip    bool
}

type UploadResponse struct {
	Status             string                  `json:"status"` // "ready" or "needs_mapping"
	OrgData            *OrgData                `json:"orgData,omitempty"`
	Headers            []string                `json:"headers,omitempty"`
	Mapping            map[string]MappedColumn `json:"mapping,omitempty"`
	Preview            [][]string              `json:"preview,omitempty"`
	Snapshots          []SnapshotInfo          `json:"snapshots,omitempty"`
	PersistenceWarning string                  `json:"persistenceWarning,omitempty"`
}

// WorkingResponse is returned by mutations that affect working people and pods
// (move, update, reorder, updatePod, createPod).
type WorkingResponse struct {
	Working []Person `json:"working"`
	Pods    []Pod    `json:"pods"`
}

// AddResponse is returned when a person is added.
type AddResponse struct {
	Created Person   `json:"created"`
	Working []Person `json:"working"`
	Pods    []Pod    `json:"pods"`
}

// MutationResponse is returned by mutations that affect both working and
// recycled slices (delete, restore).
type MutationResponse struct {
	Working  []Person `json:"working"`
	Recycled []Person `json:"recycled"`
	Pods     []Pod    `json:"pods"`
}

// RecycledResponse is returned by empty-bin.
type RecycledResponse struct {
	Recycled []Person `json:"recycled"`
}

// HealthResponse is returned by the health endpoint.
type HealthResponse struct {
	Status string `json:"status"`
}

// ConfigResponse is returned by the config endpoint.
type ConfigResponse struct {
	Logging bool `json:"logging"`
}
