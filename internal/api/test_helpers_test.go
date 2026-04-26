package api

import (
	"github.com/zachthieme/grove/internal/apitypes"
)

// findByName looks up a person by Name in a slice. Used across api tests.
// (Previously lived in convert_test.go before that file moved to internal/org.)
func findByName(people []apitypes.OrgNode, name string) *apitypes.OrgNode {
	for i := range people {
		if people[i].Name == name {
			return &people[i]
		}
	}
	return nil
}
