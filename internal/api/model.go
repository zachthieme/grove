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
	NewRole         string   `json:"newRole,omitempty"`
	NewTeam         string   `json:"newTeam,omitempty"`
}

type OrgData struct {
	Original []Person `json:"original"`
	Working  []Person `json:"working"`
}
