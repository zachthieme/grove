package api

// Scenarios: CONTRACT-001 — all tests in this file

import (
	"encoding/json"
	"reflect"
	"sort"
	"strings"
	"testing"
)

// jsonFieldNames extracts JSON field names from a struct type via reflection.
// It flattens embedded (anonymous) struct fields.
func jsonFieldNames(v any) []string {
	t := reflect.TypeOf(v)
	return collectJSONFields(t)
}

func collectJSONFields(t reflect.Type) []string {
	var names []string
	for i := 0; i < t.NumField(); i++ {
		field := t.Field(i)
		if field.Anonymous {
			// Recurse into embedded struct
			names = append(names, collectJSONFields(field.Type)...)
			continue
		}
		tag := field.Tag.Get("json")
		if tag == "" || tag == "-" {
			continue
		}
		name := strings.Split(tag, ",")[0]
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

func TestContractPersonFields(t *testing.T) {
	t.Parallel()
	// TypeScript Person interface fields
	expected := []string{
		"additionalTeams",
		"discipline",
		"employmentType",
		"extra",
		"id",
		"level",
		"managerId",
		"name",
		"newRole",
		"newTeam",
		"pod",
		"private",
		"privateNote",
		"publicNote",
		"role",
		"sortIndex",
		"status",
		"team",
		"warning",
	}
	sort.Strings(expected)

	got := jsonFieldNames(Person{})
	assertFieldsMatch(t, "Person", expected, got)
}

func TestContractPodFields(t *testing.T) {
	t.Parallel()
	expected := []string{
		"id",
		"managerId",
		"name",
		"privateNote",
		"publicNote",
		"team",
	}
	sort.Strings(expected)

	got := jsonFieldNames(Pod{})
	assertFieldsMatch(t, "Pod", expected, got)
}

func TestContractPodInfoFields(t *testing.T) {
	t.Parallel()
	// PodInfo extends Pod with memberCount
	expected := []string{
		"id",
		"managerId",
		"memberCount",
		"name",
		"privateNote",
		"publicNote",
		"team",
	}
	sort.Strings(expected)

	got := jsonFieldNames(PodInfo{})
	assertFieldsMatch(t, "PodInfo", expected, got)
}

func TestContractOrgDataFields(t *testing.T) {
	t.Parallel()
	expected := []string{
		"original",
		"persistenceWarning",
		"pods",
		"settings",
		"working",
	}
	sort.Strings(expected)

	got := jsonFieldNames(OrgData{})
	assertFieldsMatch(t, "OrgData", expected, got)
}

func TestContractAutosaveDataFields(t *testing.T) {
	t.Parallel()
	expected := []string{
		"original",
		"originalPods",
		"pods",
		"recycled",
		"settings",
		"snapshotName",
		"timestamp",
		"working",
	}
	sort.Strings(expected)

	got := jsonFieldNames(AutosaveData{})
	assertFieldsMatch(t, "AutosaveData", expected, got)
}

func TestContractSnapshotInfoFields(t *testing.T) {
	t.Parallel()
	expected := []string{
		"name",
		"timestamp",
	}
	sort.Strings(expected)

	got := jsonFieldNames(SnapshotInfo{})
	assertFieldsMatch(t, "SnapshotInfo", expected, got)
}

func TestContractMappedColumnFields(t *testing.T) {
	t.Parallel()
	expected := []string{
		"column",
		"confidence",
	}
	sort.Strings(expected)

	got := jsonFieldNames(MappedColumn{})
	assertFieldsMatch(t, "MappedColumn", expected, got)
}

func TestContractUploadResponseFields(t *testing.T) {
	t.Parallel()
	expected := []string{
		"headers",
		"mapping",
		"orgData",
		"persistenceWarning",
		"preview",
		"snapshots",
		"status",
	}
	sort.Strings(expected)

	got := jsonFieldNames(UploadResponse{})
	assertFieldsMatch(t, "UploadResponse", expected, got)
}

func TestContractSettingsFields(t *testing.T) {
	t.Parallel()
	expected := []string{
		"disciplineOrder",
	}
	sort.Strings(expected)

	got := jsonFieldNames(Settings{})
	assertFieldsMatch(t, "Settings", expected, got)
}

func TestContractPersonJSONRoundTrip(t *testing.T) {
	t.Parallel()
	original := Person{
		Id:              "uuid-123",
		Name:            "Jane Doe",
		Role:            "Staff Engineer",
		Discipline:      "Engineering",
		ManagerId:       "uuid-456",
		Team:            "Platform",
		AdditionalTeams: []string{"Infra", "DevEx"},
		Status:          "Active",
		EmploymentType:  "FTE",
		Warning:         "duplicate name",
		SortIndex:       3,
		NewRole:         "Senior Staff",
		NewTeam:         "Core Platform",
		Pod:             "pod-alpha",
		PublicNote:      "Transitioning Q3",
		PrivateNote:     "Promo candidate",
		Level:           7,
		Private:         true,
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("failed to marshal Person: %v", err)
	}

	var roundTripped Person
	if err := json.Unmarshal(data, &roundTripped); err != nil {
		t.Fatalf("failed to unmarshal Person: %v", err)
	}

	if !reflect.DeepEqual(original, roundTripped) {
		t.Errorf("Person round-trip failed.\nOriginal:     %+v\nRound-tripped: %+v", original, roundTripped)
	}

	// Also verify JSON contains all expected keys
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatalf("failed to unmarshal to map: %v", err)
	}

	expectedKeys := []string{
		"id", "name", "role", "discipline", "managerId", "team",
		"additionalTeams", "status", "employmentType", "warning",
		"sortIndex", "newRole", "newTeam", "pod", "publicNote",
		"privateNote", "level", "private",
	}
	for _, key := range expectedKeys {
		if _, ok := raw[key]; !ok {
			t.Errorf("JSON output missing expected key %q", key)
		}
	}
}

// assertFieldsMatch compares two sorted slices of field names and reports
// missing or extra fields with a clear message.
func assertFieldsMatch(t *testing.T, typeName string, expected, got []string) {
	t.Helper()

	extraInGo := difference(got, expected)
	missingFromGo := difference(expected, got)

	if len(extraInGo) > 0 {
		t.Errorf("%s: Go has fields not in TypeScript: %v", typeName, extraInGo)
	}
	if len(missingFromGo) > 0 {
		t.Errorf("%s: TypeScript has fields not in Go: %v", typeName, missingFromGo)
	}
	if len(extraInGo) == 0 && len(missingFromGo) == 0 && !reflect.DeepEqual(expected, got) {
		t.Errorf("%s: field lists differ.\n  Expected: %v\n  Got:      %v", typeName, expected, got)
	}
}

// difference returns elements in a that are not in b.
func difference(a, b []string) []string {
	set := make(map[string]bool, len(b))
	for _, s := range b {
		set[s] = true
	}
	var diff []string
	for _, s := range a {
		if !set[s] {
			diff = append(diff, s)
		}
	}
	return diff
}
