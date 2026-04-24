package api

import (
	"github.com/google/uuid"
	"github.com/zachthieme/grove/internal/model"
)

func ConvertOrg(org *model.Org) []OrgNode {
	return ConvertOrgWithIDMap(org, nil)
}

// ConvertOrgWithIDMap converts a model.Org to API []OrgNode, reusing UUIDs from
// idMap where a person's name matches. This ensures people shared across
// multiple files in a ZIP import get stable IDs so diff works correctly.
// For duplicate names, IDs are matched in order of appearance.
func ConvertOrgWithIDMap(org *model.Org, idMap map[string][]string) []OrgNode {
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

	result := make([]OrgNode, len(org.People))
	for i, p := range org.People {
		var managerID string
		if p.Manager != "" {
			if mgrIdx, ok := nameToIndex[p.Manager]; ok {
				managerID = indexToID[mgrIdx]
			}
		}

		result[i] = OrgNode{
			OrgNodeFields: p.OrgNodeFields,
			Id:            indexToID[i],
			ManagerId:     managerID,
		}
	}
	return result
}

// BuildIDMap creates a name→[]ID mapping from a slice of OrgNode, preserving
// order for duplicate name handling.
func BuildIDMap(people []OrgNode) map[string][]string {
	m := make(map[string][]string)
	for _, p := range people {
		m[p.Name] = append(m[p.Name], p.Id)
	}
	return m
}
