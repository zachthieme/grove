package org

import (
	"sort"
	"strings"

	"github.com/zachthieme/grove/internal/apitypes"
)

// exactMatches maps trimmed, lowercased header text to the app field name.
var exactMatches = map[string]string{
	"name":             "name",
	"type":             "type",
	"role":             "role",
	"discipline":       "discipline",
	"manager":          "manager",
	"team":             "team",
	"status":           "status",
	"additional teams": "additionalTeams",
	"employment type":  "employmentType",
	"new role":         "newRole",
	"new team":         "newTeam",
	"pod":              "pod",
	"public note":      "publicNote",
	"private note":     "privateNote",
	"level":            "level",
	"private":          "private",
}

// synonyms maps lowercased synonym phrases to the app field name.
var synonyms = map[string]string{
	// type
	"node type": "type",
	"node_type": "type",
	"kind":      "type",
	// name
	"full name":     "name",
	"person":        "name",
	"employee":      "name",
	"employee name": "name",
	// role
	"title":     "role",
	"job title": "role",
	"position":  "role",
	// discipline
	"function":     "discipline",
	"job family":   "discipline",
	"job function": "discipline",
	// manager
	"reports to":   "manager",
	"supervisor":   "manager",
	"manager name": "manager",
	"reporting to": "manager",
	// team
	"department":   "team",
	"group":        "team",
	"org":          "team",
	"organization": "team",
	// status
	"employment status": "status",
	"employee status":   "status",
	// additionalTeams
	"other teams":     "additionalTeams",
	"secondary teams": "additionalTeams",
	// newRole
	"future role":  "newRole",
	"planned role": "newRole",
	// newTeam
	"future team":  "newTeam",
	"planned team": "newTeam",
	// pod
	"pod name": "pod",
	"sub-team": "pod",
	"subteam":  "pod",
	// publicNote
	"note":         "publicNote",
	"notes":        "publicNote",
	"public notes": "publicNote",
	// privateNote
	"private notes": "privateNote",
	// level
	"seniority": "level",
	"grade":     "level",
	"job level": "level",
	// employmentType
	"worker type":      "employmentType",
	"employee type":    "employmentType",
	"classification":   "employmentType",
	"employment class": "employmentType",
	"vendor type":      "employmentType",
}

// fuzzyKeywords maps a substring keyword to the app field name.
// Ordered by keyword length descending at lookup time to avoid ambiguity.
var fuzzyKeywords = map[string]string{
	"additional teams": "additionalTeams",
	"discipline":       "discipline",
	"manager":          "manager",
	"status":           "status",
	"team":             "team",
	"role":             "role",
	"name":             "name",
}

// fuzzyKeywordsOrdered holds fuzzy keywords sorted longest-first.
var fuzzyKeywordsOrdered []string

func init() {
	fuzzyKeywordsOrdered = make([]string, 0, len(fuzzyKeywords))
	for kw := range fuzzyKeywords {
		fuzzyKeywordsOrdered = append(fuzzyKeywordsOrdered, kw)
	}
	sort.Slice(fuzzyKeywordsOrdered, func(i, j int) bool {
		return len(fuzzyKeywordsOrdered[i]) > len(fuzzyKeywordsOrdered[j])
	})
}

// InferMapping takes a list of spreadsheet headers and returns a mapping from
// app field names to MappedColumn structs. Each app field is mapped at most once
// and each header is consumed at most once (first match wins across tiers).
func InferMapping(headers []string) map[string]apitypes.MappedColumn {
	result := make(map[string]apitypes.MappedColumn)
	assigned := make(map[string]bool)    // app fields already mapped
	used := make(map[int]bool)           // header indices already consumed
	usedValues := make(map[string]bool)  // normalized header values already consumed

	// claim records that header at index i (raw value h, normalized norm) has
	// been mapped to field. Both index- and value-tracking matter: when a CSV
	// has duplicate header strings, value-tracking prevents two different
	// fields from claiming what is really the same column.
	claim := func(i int, h, norm, field, confidence string) {
		result[field] = apitypes.MappedColumn{Column: h, Confidence: confidence}
		assigned[field] = true
		used[i] = true
		usedValues[norm] = true
	}

	// Tier 1: exact match (case-insensitive, trimmed)
	for i, h := range headers {
		if used[i] {
			continue
		}
		normalized := strings.ToLower(strings.TrimSpace(h))
		if usedValues[normalized] {
			continue
		}
		if field, ok := exactMatches[normalized]; ok && !assigned[field] {
			claim(i, h, normalized, field, ConfidenceHigh)
		}
	}

	// Tier 2: synonym match (case-insensitive)
	for i, h := range headers {
		if used[i] {
			continue
		}
		normalized := strings.ToLower(strings.TrimSpace(h))
		if usedValues[normalized] {
			continue
		}
		if field, ok := synonyms[normalized]; ok && !assigned[field] {
			claim(i, h, normalized, field, ConfidenceHigh)
		}
	}

	// Tier 3: fuzzy match (substring containment, longer keywords first)
	for i, h := range headers {
		if used[i] {
			continue
		}
		normalized := strings.ToLower(strings.TrimSpace(h))
		if usedValues[normalized] {
			continue
		}
		for _, kw := range fuzzyKeywordsOrdered {
			field := fuzzyKeywords[kw]
			if assigned[field] {
				continue
			}
			if strings.Contains(normalized, kw) {
				claim(i, h, normalized, field, ConfidenceMedium)
				break
			}
		}
	}

	return result
}

// AllRequiredHigh returns true if all required fields are present in the
// mapping with high confidence. Only "name" is truly required — other fields
// default to empty if unmapped.
func AllRequiredHigh(m map[string]apitypes.MappedColumn) bool {
	required := []string{"name"}
	for _, field := range required {
		mc, ok := m[field]
		if !ok || mc.Confidence != ConfidenceHigh {
			return false
		}
	}
	return true
}
