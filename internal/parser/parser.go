package parser

import (
	"fmt"
	"strconv"
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
		idx, ok := headerIndex[strings.TrimSpace(headerName)]
		if !ok {
			return nil, fmt.Errorf("mapped header '%s' (for field '%s') not found in header row", headerName, field)
		}
		cols[field] = idx
	}

	// Validate that at least "name" is mapped — other fields default to empty if unmapped.
	if _, ok := cols["name"]; !ok {
		return nil, fmt.Errorf("missing required field mapping: name")
	}

	// Identify extra (unmapped) column indices.
	consumedIndices := make(map[int]bool, len(cols))
	for _, idx := range cols {
		consumedIndices[idx] = true
	}
	type extraCol struct {
		name string
		idx  int
	}
	var extraCols []extraCol
	for i, h := range header {
		h = strings.TrimSpace(h)
		if h != "" && !consumedIndices[i] {
			extraCols = append(extraCols, extraCol{name: h, idx: i})
		}
	}

	var people []model.OrgNode
	for _, row := range dataRows {
		get := func(field string) string {
			idx, ok := cols[field]
			if !ok || idx >= len(row) {
				return ""
			}
			return strings.TrimSpace(row[idx])
		}

		status := get("status")
		if status == "" {
			status = model.StatusActive
		}

		empType := get("employmentType")
		if empType == "" {
			empType = "FTE"
		}

		p := model.OrgNode{
			OrgNodeFields: model.OrgNodeFields{
				Type:           get("type"),
				Name:           get("name"),
				Role:           get("role"),
				Discipline:     get("discipline"),
				Team:           get("team"),
				Status:         status,
				EmploymentType: empType,
				NewRole:        get("newRole"),
				NewTeam:        get("newTeam"),
				Pod:            get("pod"),
				PublicNote:     get("publicNote"),
				PrivateNote:    get("privateNote"),
			},
			Manager: get("manager"),
		}

		if raw := get("level"); raw != "" {
			if n, err := strconv.Atoi(raw); err == nil {
				p.Level = n
			}
		}

		if raw := get("private"); raw != "" {
			low := strings.ToLower(raw)
			p.Private = low == "true" || low == "1" || low == "yes"
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

		// Collect extra columns.
		for _, ec := range extraCols {
			if ec.idx < len(row) {
				val := strings.TrimSpace(row[ec.idx])
				if val != "" {
					if p.Extra == nil {
						p.Extra = make(map[string]string)
					}
					p.Extra[ec.name] = val
				}
			}
		}

		people = append(people, p)
	}

	return model.NewOrg(people)
}

