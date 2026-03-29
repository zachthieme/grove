package model

import (
	"fmt"
	"strings"
)

// ValidStatuses is the set of allowed person statuses.
var ValidStatuses = map[string]bool{
	StatusActive:      true,
	StatusOpen:        true,
	StatusTransferIn:  true,
	StatusTransferOut: true,
	StatusBackfill:    true,
	StatusPlanned:     true,
}

const (
	StatusActive      = "Active"
	StatusOpen        = "Open"
	StatusTransferIn  = "Transfer In"
	StatusTransferOut = "Transfer Out"
	StatusBackfill    = "Backfill"
	StatusPlanned     = "Planned"
)

type Person struct {
	Name            string
	Role            string
	Discipline      string
	Manager         string
	Team            string
	AdditionalTeams []string
	Status          string
	EmploymentType  string
	NewRole         string
	NewTeam         string
	Warning         string // non-empty if this row had validation issues
	Pod             string
	PublicNote      string
	PrivateNote     string
	Level           int
	Private         bool
	Extra           map[string]string // unmapped spreadsheet columns, keyed by original header name
}

type Org struct {
	People   []Person
	Warnings []string
}

// NewOrg validates people. Rows with issues are kept but flagged with a Warning.
// Only truly empty/unparseable data returns an error.
func NewOrg(people []Person) (*Org, error) {
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
		if p.Status == "" {
			issues = append(issues, "missing Status")
		} else if !ValidStatuses[p.Status] {
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

