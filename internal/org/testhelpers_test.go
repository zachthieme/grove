package org

import (
	"bytes"
	"encoding/csv"
	"testing"

	"github.com/zachthieme/grove/internal/apitypes"
	"github.com/zachthieme/grove/internal/model"
	"github.com/zachthieme/grove/internal/parser"
)

// importForTest parses CSV input through the standard inference pipeline and
// returns the resulting []apitypes.OrgNode. Mirrors what OrgService.Upload does
// for a CSV with high-confidence headers, without depending on OrgService.
func importForTest(t *testing.T, input string) []apitypes.OrgNode {
	t.Helper()
	r := csv.NewReader(bytes.NewReader([]byte(input)))
	rows, err := r.ReadAll()
	if err != nil {
		t.Fatalf("parse csv: %v", err)
	}
	if len(rows) < 2 {
		t.Fatalf("input must have header + at least one data row")
	}
	header := rows[0]
	dataRows := rows[1:]

	mapping := InferMapping(header)
	simpleMapping := make(map[string]string, len(mapping))
	for field, mc := range mapping {
		simpleMapping[field] = mc.Column
	}
	parsed, err := parser.BuildPeopleWithMapping(header, dataRows, simpleMapping)
	if err != nil {
		t.Fatalf("build people: %v", err)
	}
	people := ConvertOrg(parsed)
	// Match OrgService.Upload normalisation: non-product nodes without an
	// explicit EmploymentType default to FTE.
	for i := range people {
		if !model.IsProduct(people[i].Type) && people[i].EmploymentType == "" {
			people[i].EmploymentType = "FTE"
		}
	}
	return people
}
