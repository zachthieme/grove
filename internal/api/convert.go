package api

import (
	"github.com/google/uuid"
	"github.com/zachthieme/grove/internal/model"
)

func ConvertOrg(org *model.Org) []Person {
	return ConvertOrgWithIDMap(org, nil)
}

// ConvertOrgWithIDMap converts a model.Org to API []Person, reusing UUIDs from
// idMap where a person's name matches. This ensures people shared across
// multiple files in a ZIP import get stable IDs so diff works correctly.
// For duplicate names, IDs are matched in order of appearance.
func ConvertOrgWithIDMap(org *model.Org, idMap map[string][]string) []Person {
	// Track how many IDs we've consumed per name (for duplicate handling).
	nameUsed := make(map[string]int)

	indexToID := make([]string, len(org.People))
	for i, p := range org.People {
		used := nameUsed[p.Name]
		if idMap != nil {
			if ids, ok := idMap[p.Name]; ok && used < len(ids) {
				indexToID[i] = ids[used]
			} else {
				indexToID[i] = uuid.NewString()
			}
		} else {
			indexToID[i] = uuid.NewString()
		}
		nameUsed[p.Name] = used + 1
	}

	// Build a name-to-index map for manager resolution.
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
			Pod:             p.Pod,
			PublicNote:      p.PublicNote,
			PrivateNote:     p.PrivateNote,
			Level:           p.Level,
			Private:         p.Private,
		}
	}
	return result
}

// BuildIDMap creates a name→[]ID mapping from a slice of Person, preserving
// order for duplicate name handling.
func BuildIDMap(people []Person) map[string][]string {
	m := make(map[string][]string)
	for _, p := range people {
		m[p.Name] = append(m[p.Name], p.Id)
	}
	return m
}
