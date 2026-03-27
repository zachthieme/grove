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
	Pod             string   `json:"pod,omitempty"`
	PublicNote      string   `json:"publicNote,omitempty"`
	PrivateNote     string   `json:"privateNote,omitempty"`
	Level           int      `json:"level,omitempty"`
	Private         bool     `json:"private,omitempty"`
}

type Pod struct {
	Id          string `json:"id"`
	Name        string `json:"name"`
	Team        string `json:"team"`
	ManagerId   string `json:"managerId"`
	PublicNote  string `json:"publicNote,omitempty"`
	PrivateNote string `json:"privateNote,omitempty"`
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
