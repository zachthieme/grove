package parser

import (
	"fmt"
	"strings"

	"github.com/zachthieme/grove/internal/model"
)

// BuildPeopleWithMapping converts raw spreadsheet rows into an Org using an
// explicit column mapping. The mapping keys are lowercase app field names
// (e.g. "name", "role") and values are the actual header strings from the
// spreadsheet (e.g. "Full Name", "Job Title").
func BuildPeopleWithMapping(header []string, dataRows [][]string, mapping map[string]string) (*model.Org, error) {
	// Build header-string → column-index lookup.
	headerIndex := make(map[string]int, len(header))
	for i, h := range header {
		headerIndex[strings.TrimSpace(h)] = i
	}

	// Build field-name → column-index lookup from the mapping.
	cols := make(map[string]int, len(mapping))
	for field, headerName := range mapping {
		idx, ok := headerIndex[headerName]
		if !ok {
			return nil, fmt.Errorf("mapped header '%s' (for field '%s') not found in header row", headerName, field)
		}
		cols[field] = idx
	}

	// Validate that at least "name" is mapped — other fields default to empty if unmapped.
	if _, ok := cols["name"]; !ok {
		return nil, fmt.Errorf("missing required field mapping: name")
	}

	var people []model.Person
	for _, row := range dataRows {
		get := func(field string) string {
			idx, ok := cols[field]
			if !ok || idx >= len(row) {
				return ""
			}
			return strings.TrimSpace(row[idx])
		}

		status := get("status")
		switch status {
		case "Hiring":
			status = "Open"
		case "Transfer":
			status = "Transfer In"
		}

		empType := get("employmentType")
		if empType == "" {
			empType = get("employment type")
		}

		p := model.Person{
			Name:           get("name"),
			Role:           get("role"),
			Discipline:     get("discipline"),
			Manager:        get("manager"),
			Team:           get("team"),
			Status:         status,
			EmploymentType: empType,
			NewRole:        get("newRole"),
			NewTeam:        get("newTeam"),
		}

		raw := get("additionalTeams")
		if raw != "" {
			for _, t := range strings.Split(raw, ",") {
				t = strings.TrimSpace(t)
				if t != "" {
					p.AdditionalTeams = append(p.AdditionalTeams, t)
				}
			}
		}

		people = append(people, p)
	}

	return model.NewOrg(people)
}

