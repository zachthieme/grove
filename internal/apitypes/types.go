// Package apitypes defines the data types that cross package boundaries
// in the Grove backend. These are pure data — no methods, no logic —
// and form the lingua franca between org, snapshot, pod, autosave,
// and httpapi packages.
package apitypes

import "github.com/zachthieme/grove/internal/model"

type OrgNode struct {
	model.OrgNodeFields
	Id        string `json:"id"`
	ManagerId string `json:"managerId"`
	SortIndex int    `json:"sortIndex"`
}

// OrgNodeUpdate carries optional field updates for a person.
// Pointer fields: nil = not sent, zero value = set to empty/zero/false.
type OrgNodeUpdate struct {
	Type            *string `json:"type,omitempty"`
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

type MappedColumn struct {
	Column     string `json:"column"`
	Confidence string `json:"confidence"` // "high", "medium", "none"
}

type PendingUpload struct {
	File     []byte
	Filename string
	IsZip    bool
}
