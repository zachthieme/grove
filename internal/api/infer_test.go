package api

import (
	"testing"
)

// Scenarios: UPLOAD-005
func TestInferMapping_ExactMatch(t *testing.T) {
	t.Parallel()
	headers := []string{"Name", "Role", "Discipline", "Manager", "Team", "Status", "Additional Teams", "New Role", "New Team"}
	m := InferMapping(headers)

	want := map[string]struct {
		column     string
		confidence string
	}{
		"name":            {"Name", "high"},
		"role":            {"Role", "high"},
		"discipline":      {"Discipline", "high"},
		"manager":         {"Manager", "high"},
		"team":            {"Team", "high"},
		"status":          {"Status", "high"},
		"additionalTeams": {"Additional Teams", "high"},
		"newRole":         {"New Role", "high"},
		"newTeam":         {"New Team", "high"},
	}

	for field, exp := range want {
		mc, ok := m[field]
		if !ok {
			t.Errorf("field %q not found in mapping", field)
			continue
		}
		if mc.Column != exp.column {
			t.Errorf("field %q: column = %q, want %q", field, mc.Column, exp.column)
		}
		if mc.Confidence != exp.confidence {
			t.Errorf("field %q: confidence = %q, want %q", field, mc.Confidence, exp.confidence)
		}
	}
}

// Scenarios: UPLOAD-005
func TestInferMapping_CaseInsensitive(t *testing.T) {
	t.Parallel()
	headers := []string{"NAME", "rOlE", "  discipline  ", "MANAGER", "team"}
	m := InferMapping(headers)

	cases := []struct {
		field      string
		column     string
		confidence string
	}{
		{"name", "NAME", "high"},
		{"role", "rOlE", "high"},
		{"discipline", "  discipline  ", "high"},
		{"manager", "MANAGER", "high"},
		{"team", "team", "high"},
	}

	for _, tc := range cases {
		mc, ok := m[tc.field]
		if !ok {
			t.Errorf("field %q not found", tc.field)
			continue
		}
		if mc.Column != tc.column {
			t.Errorf("field %q: column = %q, want %q", tc.field, mc.Column, tc.column)
		}
		if mc.Confidence != tc.confidence {
			t.Errorf("field %q: confidence = %q, want %q", tc.field, mc.Confidence, tc.confidence)
		}
	}
}

// Scenarios: UPLOAD-005
func TestInferMapping_SynonymMatch(t *testing.T) {
	t.Parallel()
	headers := []string{"Full Name", "Job Title", "Job Family", "Reports To", "Department", "Employment Status", "Other Teams", "Future Role", "Future Team"}
	m := InferMapping(headers)

	want := map[string]string{
		"name":            "Full Name",
		"role":            "Job Title",
		"discipline":      "Job Family",
		"manager":         "Reports To",
		"team":            "Department",
		"status":          "Employment Status",
		"additionalTeams": "Other Teams",
		"newRole":         "Future Role",
		"newTeam":         "Future Team",
	}

	for field, col := range want {
		mc, ok := m[field]
		if !ok {
			t.Errorf("field %q not found", field)
			continue
		}
		if mc.Column != col {
			t.Errorf("field %q: column = %q, want %q", field, mc.Column, col)
		}
		if mc.Confidence != "high" {
			t.Errorf("field %q: confidence = %q, want %q", field, mc.Confidence, "high")
		}
	}
}

// Scenarios: UPLOAD-005
func TestInferMapping_FuzzyMatch(t *testing.T) {
	t.Parallel()
	headers := []string{"Employee Name Field", "Current Role Info", "Primary Discipline Area", "Team Assignment", "Current Status"}
	m := InferMapping(headers)

	cases := []struct {
		field      string
		column     string
		confidence string
	}{
		{"name", "Employee Name Field", "medium"},
		{"role", "Current Role Info", "medium"},
		{"discipline", "Primary Discipline Area", "medium"},
		{"team", "Team Assignment", "medium"},
		{"status", "Current Status", "medium"},
	}

	for _, tc := range cases {
		mc, ok := m[tc.field]
		if !ok {
			t.Errorf("field %q not found", tc.field)
			continue
		}
		if mc.Column != tc.column {
			t.Errorf("field %q: column = %q, want %q", tc.field, mc.Column, tc.column)
		}
		if mc.Confidence != tc.confidence {
			t.Errorf("field %q: confidence = %q, want %q", tc.field, mc.Confidence, tc.confidence)
		}
	}
}

// Scenarios: UPLOAD-005
func TestInferMapping_UnmatchedHeaders(t *testing.T) {
	t.Parallel()
	headers := []string{"Name", "Favorite Color", "Shoe Size"}
	m := InferMapping(headers)

	if _, ok := m["name"]; !ok {
		t.Error("expected name to be mapped")
	}
	// unmatched headers should not appear as values
	for field, mc := range m {
		if mc.Column == "Favorite Color" || mc.Column == "Shoe Size" {
			t.Errorf("unexpected mapping: field %q → column %q", field, mc.Column)
		}
	}
	// should only have one mapping
	if len(m) != 1 {
		t.Errorf("expected 1 mapping, got %d: %v", len(m), m)
	}
}

// Scenarios: UPLOAD-005
func TestInferMapping_FirstMatchWins(t *testing.T) {
	t.Parallel()
	// "Name" is an exact match (tier 1) and "Person" is a synonym (tier 2).
	// Tier 1 runs first across all headers, so "Name" wins even though "Person"
	// appears earlier in the header list.
	headers := []string{"Person", "Name"}
	m := InferMapping(headers)

	mc, ok := m["name"]
	if !ok {
		t.Fatal("expected name to be mapped")
	}
	if mc.Column != "Name" {
		t.Errorf("name column = %q, want %q (exact match tier wins over synonym tier)", mc.Column, "Name")
	}
}

// Scenarios: UPLOAD-005
func TestInferMapping_FirstMatchWins_SameTier(t *testing.T) {
	t.Parallel()
	// Two synonyms for the same field — first header in order wins within a tier.
	headers := []string{"Supervisor", "Reports To"}
	m := InferMapping(headers)

	mc, ok := m["manager"]
	if !ok {
		t.Fatal("expected manager to be mapped")
	}
	if mc.Column != "Supervisor" {
		t.Errorf("manager column = %q, want %q (first header wins within same tier)", mc.Column, "Supervisor")
	}
}

// Scenarios: UPLOAD-005
func TestInferMapping_FuzzyLongerKeywordsFirst(t *testing.T) {
	t.Parallel()
	// "discipline" contains "name" as a substring but "discipline" keyword is longer
	// and should be checked first, so it should map to discipline not name
	headers := []string{"discipline info"}
	m := InferMapping(headers)

	mc, ok := m["discipline"]
	if !ok {
		t.Fatal("expected discipline to be mapped")
	}
	if mc.Column != "discipline info" {
		t.Errorf("discipline column = %q, want %q", mc.Column, "discipline info")
	}
	// should NOT also be mapped to name
	if _, ok := m["name"]; ok {
		t.Error("discipline info should not also map to name")
	}
}

// Scenarios: UPLOAD-005
func TestInferMapping_PodAndNotes(t *testing.T) {
	t.Parallel()
	// Exact matches
	headers := []string{"Name", "Pod", "Public Note", "Private Note"}
	m := InferMapping(headers)

	want := map[string]struct {
		column     string
		confidence string
	}{
		"pod":         {"Pod", "high"},
		"publicNote":  {"Public Note", "high"},
		"privateNote": {"Private Note", "high"},
	}

	for field, exp := range want {
		mc, ok := m[field]
		if !ok {
			t.Errorf("field %q not found in mapping", field)
			continue
		}
		if mc.Column != exp.column {
			t.Errorf("field %q: column = %q, want %q", field, mc.Column, exp.column)
		}
		if mc.Confidence != exp.confidence {
			t.Errorf("field %q: confidence = %q, want %q", field, mc.Confidence, exp.confidence)
		}
	}

	// Synonym matches
	synHeaders := []string{"Name", "Pod Name", "Notes", "Private Notes"}
	synM := InferMapping(synHeaders)

	synWant := map[string]struct {
		column     string
		confidence string
	}{
		"pod":         {"Pod Name", "high"},
		"publicNote":  {"Notes", "high"},
		"privateNote": {"Private Notes", "high"},
	}

	for field, exp := range synWant {
		mc, ok := synM[field]
		if !ok {
			t.Errorf("synonym: field %q not found in mapping", field)
			continue
		}
		if mc.Column != exp.column {
			t.Errorf("synonym: field %q: column = %q, want %q", field, mc.Column, exp.column)
		}
		if mc.Confidence != exp.confidence {
			t.Errorf("synonym: field %q: confidence = %q, want %q", field, mc.Confidence, exp.confidence)
		}
	}
}

// Scenarios: UPLOAD-004
func TestAllRequiredHigh_True(t *testing.T) {
	t.Parallel()
	m := map[string]MappedColumn{
		"name":       {Column: "Name", Confidence: "high"},
		"role":       {Column: "Role", Confidence: "high"},
		"discipline": {Column: "Discipline", Confidence: "high"},
		"team":       {Column: "Team", Confidence: "high"},
		"status":     {Column: "Status", Confidence: "high"},
	}
	if !AllRequiredHigh(m) {
		t.Error("expected AllRequiredHigh to return true")
	}
}

// Scenarios: UPLOAD-004
func TestAllRequiredHigh_MissingName(t *testing.T) {
	t.Parallel()
	m := map[string]MappedColumn{
		"role":       {Column: "Role", Confidence: "high"},
		"discipline": {Column: "Discipline", Confidence: "high"},
		"team":       {Column: "Team", Confidence: "high"},
		"status":     {Column: "Status", Confidence: "high"},
	}
	if AllRequiredHigh(m) {
		t.Error("expected AllRequiredHigh to return false when name is missing")
	}
}

// Scenarios: UPLOAD-004
func TestAllRequiredHigh_NameMediumConfidence(t *testing.T) {
	t.Parallel()
	m := map[string]MappedColumn{
		"name": {Column: "Name", Confidence: "medium"},
	}
	if AllRequiredHigh(m) {
		t.Error("expected AllRequiredHigh to return false when name is medium confidence")
	}
}

// Scenarios: UPLOAD-004
func TestAllRequiredHigh_OnlyNameRequired(t *testing.T) {
	t.Parallel()
	m := map[string]MappedColumn{
		"name": {Column: "Name", Confidence: "high"},
	}
	if !AllRequiredHigh(m) {
		t.Error("expected AllRequiredHigh to return true with only name mapped")
	}
}

// Scenarios: UPLOAD-005
func TestInferMapping_Level(t *testing.T) {
	t.Parallel()
	headers := []string{"Name", "Team", "Level"}
	m := InferMapping(headers)
	if mc, ok := m["level"]; !ok || mc.Column != "Level" {
		t.Errorf("expected level mapped, got %+v", m["level"])
	}
}

// Scenarios: UPLOAD-005
func TestInferMapping_TypeColumn(t *testing.T) {
	t.Parallel()
	headers := []string{"Name", "Type", "Status", "Manager"}
	m := InferMapping(headers)
	if mc, ok := m["type"]; !ok {
		t.Error("expected 'type' field to be mapped")
	} else if mc.Confidence != ConfidenceHigh {
		t.Errorf("expected high confidence, got %s", mc.Confidence)
	}
}

// Scenarios: UPLOAD-005
func TestInferMapping_TypeSynonyms(t *testing.T) {
	t.Parallel()
	for _, header := range []string{"Node Type", "Kind", "node_type"} {
		t.Run(header, func(t *testing.T) {
			t.Parallel()
			headers := []string{"Name", header, "Status"}
			m := InferMapping(headers)
			if _, ok := m["type"]; !ok {
				t.Errorf("expected synonym '%s' to map to 'type'", header)
			}
		})
	}
}

// Scenarios: UPLOAD-005
func TestInferMapping_Private(t *testing.T) {
	t.Parallel()
	headers := []string{"Name", "Role", "private"}
	result := InferMapping(headers)
	mc, ok := result["private"]
	if !ok {
		t.Fatal("expected 'private' to be mapped")
	}
	if mc.Confidence != "high" {
		t.Errorf("expected high confidence, got %s", mc.Confidence)
	}
	if mc.Column != "private" {
		t.Errorf("expected column 'private', got %s", mc.Column)
	}
}
