package apitypes

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/zachthieme/grove/internal/model"
)

// roundTrip marshals v to JSON, unmarshals into a fresh T, and returns it.
// JSON round-trip is the contract that handlers, snapshots, and the
// frontend share; if a struct loses information across this trip, the
// breakage is silent and the test surfaces it.
func roundTrip[T any](t *testing.T, v T) T {
	t.Helper()
	data, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	var out T
	if err := json.Unmarshal(data, &out); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	return out
}

// Scenarios: API-CONTRACT
func TestOrgNode_RoundTrip(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name string
		in   OrgNode
	}{
		{"minimal", OrgNode{
			OrgNodeFields: model.OrgNodeFields{Name: "Alice", Status: "Active"},
			Id:            "uuid-1",
		}},
		{"full", OrgNode{
			OrgNodeFields: model.OrgNodeFields{
				Type:            "person",
				Name:            "Alice",
				Role:            "VP",
				Discipline:      "Engineering",
				Team:            "Platform",
				AdditionalTeams: []string{"Infra", "SRE"},
				Status:          "Active",
				EmploymentType:  "FTE",
				Level:           5,
				Pod:             "pod-1",
				PublicNote:      "public",
				PrivateNote:     "private",
				Private:         true,
				Extra:           map[string]string{"x": "y"},
			},
			Id:        "uuid-2",
			ManagerId: "uuid-mgr",
			SortIndex: 3,
		}},
		{"product node", OrgNode{
			OrgNodeFields: model.OrgNodeFields{Type: "product", Name: "Widget"},
			Id:            "p1",
		}},
		{"open req", OrgNode{
			OrgNodeFields: model.OrgNodeFields{Name: "Open", Status: "Open", NewRole: "SWE", NewTeam: "Platform"},
			Id:            "o1",
		}},
		{"empty additional teams omitted", OrgNode{
			OrgNodeFields: model.OrgNodeFields{Name: "X", AdditionalTeams: nil},
			Id:            "x",
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			out := roundTrip(t, tc.in)
			if !reflect.DeepEqual(tc.in, out) {
				t.Errorf("round-trip mismatch\n in: %+v\nout: %+v", tc.in, out)
			}
		})
	}
}

// Scenarios: API-CONTRACT
//
// OrgNode wire fields are part of the contract with the frontend. Locking
// the JSON keys here surfaces accidental renames as a test failure rather
// than a silent breakage.
func TestOrgNode_WireFormat(t *testing.T) {
	t.Parallel()
	in := OrgNode{
		OrgNodeFields: model.OrgNodeFields{
			Name:           "Alice",
			Role:           "VP",
			Discipline:     "Eng",
			Team:           "P",
			Status:         "Active",
			EmploymentType: "FTE",
		},
		Id:        "uuid-1",
		ManagerId: "uuid-mgr",
		SortIndex: 2,
	}
	data, err := json.Marshal(in)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	var generic map[string]any
	if err := json.Unmarshal(data, &generic); err != nil {
		t.Fatalf("Unmarshal generic: %v", err)
	}
	required := []string{"id", "managerId", "sortIndex", "name", "role", "discipline", "team", "status", "employmentType"}
	for _, key := range required {
		if _, ok := generic[key]; !ok {
			t.Errorf("missing required wire key %q", key)
		}
	}
}

// Scenarios: API-CONTRACT
//
// OrgNodeUpdate uses pointer fields to distinguish "not sent" (nil) from
// "set to zero" (e.g. *bool=false). Round-trip must preserve both states.
func TestOrgNodeUpdate_PointerSemantics(t *testing.T) {
	t.Parallel()
	str := func(s string) *string { return &s }
	i := func(n int) *int { return &n }
	b := func(v bool) *bool { return &v }

	cases := []struct {
		name string
		in   OrgNodeUpdate
	}{
		{"all nil (no-op update)", OrgNodeUpdate{}},
		{"name only", OrgNodeUpdate{Name: str("Bob")}},
		{"private=false explicitly", OrgNodeUpdate{Private: b(false)}},
		{"private=true explicitly", OrgNodeUpdate{Private: b(true)}},
		{"level=0 explicitly", OrgNodeUpdate{Level: i(0)}},
		{"empty string clears field", OrgNodeUpdate{Role: str("")}},
		{"every field set", OrgNodeUpdate{
			Type: str("person"), Name: str("X"), Role: str("R"),
			Discipline: str("D"), Team: str("T"), ManagerId: str("M"),
			Status: str("Active"), EmploymentType: str("FTE"),
			AdditionalTeams: str("A,B"), NewRole: str("NR"), NewTeam: str("NT"),
			Level: i(3), Pod: str("p1"), PublicNote: str("pub"),
			PrivateNote: str("priv"), Private: b(true),
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			out := roundTrip(t, tc.in)
			if !reflect.DeepEqual(tc.in, out) {
				t.Errorf("round-trip mismatch\n in: %+v\nout: %+v", tc.in, out)
			}
		})
	}
}

// Scenarios: API-CONTRACT
//
// nil pointer fields must be omitted from the wire output (omitempty).
// Otherwise frontend cannot distinguish "field not sent" from "field set
// to null".
func TestOrgNodeUpdate_NilFieldsOmitted(t *testing.T) {
	t.Parallel()
	data, err := json.Marshal(OrgNodeUpdate{})
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	if string(data) != "{}" {
		t.Errorf("expected empty object, got %s", string(data))
	}
}

// Scenarios: API-CONTRACT
func TestPod_RoundTrip(t *testing.T) {
	t.Parallel()
	cases := []Pod{
		{Id: "p1", Name: "Pod1", Team: "Eng", ManagerId: "m1"},
		{Id: "p2", Name: "Pod2", Team: "Eng", ManagerId: "m2", PublicNote: "x", PrivateNote: "y"},
	}
	for _, in := range cases {
		out := roundTrip(t, in)
		if !reflect.DeepEqual(in, out) {
			t.Errorf("round-trip mismatch\n in: %+v\nout: %+v", in, out)
		}
	}
}

// Scenarios: API-CONTRACT
func TestPodUpdate_RoundTrip(t *testing.T) {
	t.Parallel()
	str := func(s string) *string { return &s }
	cases := []struct {
		name string
		in   PodUpdate
	}{
		{"all nil", PodUpdate{}},
		{"rename", PodUpdate{Name: str("NewName")}},
		{"clear note", PodUpdate{PublicNote: str("")}},
		{"every field", PodUpdate{Name: str("N"), PublicNote: str("pub"), PrivateNote: str("priv")}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			out := roundTrip(t, tc.in)
			if !reflect.DeepEqual(tc.in, out) {
				t.Errorf("round-trip mismatch\n in: %+v\nout: %+v", tc.in, out)
			}
		})
	}
}

// Scenarios: API-CONTRACT
//
// PodInfo embeds Pod and adds memberCount. Confirm the embedded fields
// flatten into the wire object (no nested "pod" key).
func TestPodInfo_RoundTripAndFlattening(t *testing.T) {
	t.Parallel()
	in := PodInfo{
		Pod:         Pod{Id: "p1", Name: "Pod1", Team: "Eng", ManagerId: "m1"},
		MemberCount: 5,
	}
	data, err := json.Marshal(in)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	var generic map[string]any
	if err := json.Unmarshal(data, &generic); err != nil {
		t.Fatalf("Unmarshal generic: %v", err)
	}
	for _, key := range []string{"id", "name", "team", "managerId", "memberCount"} {
		if _, ok := generic[key]; !ok {
			t.Errorf("missing flat wire key %q (embedded fields must flatten)", key)
		}
	}
	if _, ok := generic["Pod"]; ok {
		t.Errorf("Pod must be embedded, not nested as %q", "Pod")
	}

	out := roundTrip(t, in)
	if !reflect.DeepEqual(in, out) {
		t.Errorf("round-trip mismatch\n in: %+v\nout: %+v", in, out)
	}
}

// Scenarios: API-CONTRACT
func TestSettings_RoundTrip(t *testing.T) {
	t.Parallel()
	cases := []Settings{
		{DisciplineOrder: nil},
		{DisciplineOrder: []string{}},
		{DisciplineOrder: []string{"Eng", "Design", "PM"}},
	}
	for i, in := range cases {
		out := roundTrip(t, in)
		// nil and []string{} both marshal to [] and unmarshal to []string{}; treat as equal.
		gotLen := len(out.DisciplineOrder)
		wantLen := len(in.DisciplineOrder)
		if gotLen != wantLen {
			t.Errorf("case %d: len mismatch %d != %d", i, gotLen, wantLen)
		}
		for j := range in.DisciplineOrder {
			if in.DisciplineOrder[j] != out.DisciplineOrder[j] {
				t.Errorf("case %d: order[%d] mismatch", i, j)
			}
		}
	}
}

// Scenarios: API-CONTRACT
func TestMappedColumn_RoundTrip(t *testing.T) {
	t.Parallel()
	cases := []MappedColumn{
		{Column: "name", Confidence: "high"},
		{Column: "", Confidence: "none"},
		{Column: "team", Confidence: "medium"},
	}
	for _, in := range cases {
		out := roundTrip(t, in)
		if !reflect.DeepEqual(in, out) {
			t.Errorf("round-trip mismatch\n in: %+v\nout: %+v", in, out)
		}
	}
}

// Scenarios: API-CONTRACT
//
// PendingUpload is server-internal (not over the wire) — File is []byte and
// has no JSON tags. Verify it serializes safely if accidentally marshaled
// (e.g. inside a debug log) without panicking and round-trips structurally.
func TestPendingUpload_StructuralRoundTrip(t *testing.T) {
	t.Parallel()
	in := PendingUpload{
		File:     []byte("name,team\nAlice,Eng"),
		Filename: "people.csv",
		IsZip:    false,
	}
	out := roundTrip(t, in)
	if !reflect.DeepEqual(in, out) {
		t.Errorf("round-trip mismatch\n in: %+v\nout: %+v", in, out)
	}
}
