package api

import (
	"github.com/google/uuid"
	"github.com/zach/orgchart/internal/model"
)

func ConvertOrg(org *model.Org) []Person {
	// Assign a unique UUID to each person by index (not by name, since names can be duplicated).
	indexToID := make([]string, len(org.People))
	for i := range org.People {
		indexToID[i] = uuid.NewString()
	}

	// Build a name-to-index map for manager resolution.
	// For duplicate names, nameToIndex maps to the first occurrence.
	// This is a known limitation — CSVs with duplicate names and cross-references
	// between them may resolve to the wrong person. The web UI uses UUIDs for all
	// subsequent operations, so this only affects initial import.
	nameToIndex := make(map[string]int, len(org.People))
	for i, p := range org.People {
		if _, exists := nameToIndex[p.Name]; !exists {
			nameToIndex[p.Name] = i
		}
	}

	result := make([]Person, len(org.People))
	for i, p := range org.People {
		var managerID string
		if p.Manager != "" {
			if mgrIdx, ok := nameToIndex[p.Manager]; ok {
				managerID = indexToID[mgrIdx]
			}
		}

		result[i] = Person{
			Id:              indexToID[i],
			Name:            p.Name,
			Role:            p.Role,
			Discipline:      p.Discipline,
			ManagerId:       managerID,
			Team:            p.Team,
			AdditionalTeams: p.AdditionalTeams,
			Status:          p.Status,
			EmploymentType:  p.EmploymentType,
			Warning:         p.Warning,
			NewRole:         p.NewRole,
			NewTeam:         p.NewTeam,
		}
	}
	return result
}
