package model

import (
	"fmt"
	"strings"
)

// ValidPersonStatuses is the set of allowed statuses for person-type nodes.
var ValidPersonStatuses = map[string]bool{
	StatusActive:      true,
	StatusOpen:        true,
	StatusTransferIn:  true,
	StatusTransferOut: true,
	StatusBackfill:    true,
	StatusPlanned:     true,
}

// ValidProductStatuses is the set of allowed statuses for product-type nodes.
var ValidProductStatuses = map[string]bool{
	StatusActive:     true,
	StatusDeprecated: true,
	StatusPlanned:    true,
	StatusSunsetting: true,
}

// ValidStatuses returns the correct status set for a given node type.
// Empty type is treated as "person".
func ValidStatuses(nodeType string) map[string]bool {
	if nodeType == "product" {
		return ValidProductStatuses
	}
	return ValidPersonStatuses
}

const (
	StatusActive      = "Active"
	StatusOpen        = "Open"
	StatusTransferIn  = "Transfer In"
	StatusTransferOut = "Transfer Out"
	StatusBackfill    = "Backfill"
	StatusPlanned     = "Planned"

	// Product-specific statuses
	StatusDeprecated = "Deprecated"
	StatusSunsetting = "Sunsetting"
)

// OrgNodeFields holds fields shared between the domain model and the API wire
// format. When adding a new field, add it here once rather than in both
// OrgNode and api.OrgNode.
type OrgNodeFields struct {
	Type            string            `json:"type,omitempty"`
	Name            string            `json:"name"`
	Role            string            `json:"role"`
	Discipline      string            `json:"discipline"`
	Team            string            `json:"team"`
	AdditionalTeams []string          `json:"additionalTeams"`
	Status          string            `json:"status"`
	EmploymentType  string            `json:"employmentType"`
	Warning         string            `json:"warning,omitempty"`
	NewRole         string            `json:"newRole,omitempty"`
	NewTeam         string            `json:"newTeam,omitempty"`
	Pod             string            `json:"pod,omitempty"`
	PublicNote      string            `json:"publicNote,omitempty"`
	PrivateNote     string            `json:"privateNote,omitempty"`
	Level           int               `json:"level,omitempty"`
	Private         bool              `json:"private,omitempty"`
	Extra           map[string]string `json:"extra,omitempty"`
}

type OrgNode struct {
	OrgNodeFields
	Manager string // manager by name, used only during CSV import
}

type Org struct {
	People   []OrgNode
	Warnings []string
}

// NewOrg validates nodes. Rows with issues are kept but flagged with a Warning.
// Only truly empty/unparseable data returns an error.
func NewOrg(people []OrgNode) (*Org, error) {
	if len(people) == 0 {
		return nil, fmt.Errorf("no data rows found")
	}

	var warnings []string
	for i := range people {
		p := &people[i]
		row := i + 2
		var issues []string

		if p.Name == "" {
			issues = append(issues, "missing Name")
		}
		statusSet := ValidStatuses(p.Type)
		if p.Status == "" {
			issues = append(issues, "missing Status")
		} else if !statusSet[p.Status] {
			issues = append(issues, fmt.Sprintf("invalid status '%s'", p.Status))
		}

		if len(issues) > 0 {
			msg := fmt.Sprintf("row %d: %s", row, strings.Join(issues, "; "))
			p.Warning = msg
			warnings = append(warnings, msg)
		}
	}

	return &Org{People: people, Warnings: warnings}, nil
}
