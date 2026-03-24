package api

type Person struct {
	Id              string   `json:"id"`
	Name            string   `json:"name"`
	Role            string   `json:"role"`
	Discipline      string   `json:"discipline"`
	ManagerId       string   `json:"managerId"`
	Team            string   `json:"team"`
	AdditionalTeams []string `json:"additionalTeams"`
	Status          string   `json:"status"`
	EmploymentType  string   `json:"employmentType"`
	Warning         string   `json:"warning,omitempty"`
	SortIndex       int      `json:"sortIndex"`
	NewRole         string   `json:"newRole,omitempty"`
	NewTeam         string   `json:"newTeam,omitempty"`
}

type OrgData struct {
	Original           []Person `json:"original"`
	Working            []Person `json:"working"`
	PersistenceWarning string   `json:"persistenceWarning,omitempty"`
}

type AutosaveData struct {
	Original     []Person `json:"original"`
	Working      []Person `json:"working"`
	Recycled     []Person `json:"recycled"`
	SnapshotName string   `json:"snapshotName"`
	Timestamp    string   `json:"timestamp"`
}

type SnapshotInfo struct {
	Name      string `json:"name"`
	Timestamp string `json:"timestamp"`
}

type MappedColumn struct {
	Column     string `json:"column"`
	Confidence string `json:"confidence"` // "high", "medium", "none"
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
