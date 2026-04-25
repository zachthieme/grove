package api

// Scenarios: CONTRACT-001, CONTRACT-013 — all tests in this file

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"sync"
	"testing"

	"github.com/zachthieme/grove/internal/apitypes"
	"github.com/zachthieme/grove/internal/model"
)

// tsTypesSrc reads web/src/api/types.ts once per test run. Used as the source
// of truth for the API contract: each Go struct's JSON tag set must match the
// fields declared on the corresponding TS interface, so adding/removing a
// field on one side without the other fails CI.
var (
	tsTypesOnce sync.Once
	tsTypesData string
	tsTypesErr  error
)

func tsTypesSource(t *testing.T) string {
	t.Helper()
	tsTypesOnce.Do(func() {
		_, file, _, ok := runtime.Caller(0)
		if !ok {
			tsTypesErr = fmt.Errorf("could not resolve test file path")
			return
		}
		// internal/api/contract_test.go -> repo root -> web/src/api/types.ts
		repoRoot := filepath.Join(filepath.Dir(file), "..", "..")
		path := filepath.Join(repoRoot, "web", "src", "api", "types.ts")
		data, err := os.ReadFile(path)
		if err != nil {
			tsTypesErr = err
			return
		}
		tsTypesData = string(data)
	})
	if tsTypesErr != nil {
		t.Fatalf("read TS types: %v", tsTypesErr)
	}
	return tsTypesData
}

// tsInterfaceFields extracts field names from `export interface <name> { ... }`
// in types.ts. Assumes flat (non-nested) interface bodies — types.ts follows
// that convention. Errors loudly if the interface is missing.
func tsInterfaceFields(t *testing.T, name string) []string {
	t.Helper()
	src := tsTypesSource(t)
	// Allow `export interface X { ... }` and `export interface X extends Y { ... }`.
	re := regexp.MustCompile(`(?s)export interface\s+` + regexp.QuoteMeta(name) + `(?:\s+extends\s+[\w,\s]+)?\s*\{([^}]*)\}`)
	m := re.FindStringSubmatch(src)
	if m == nil {
		t.Fatalf("interface %q not found in web/src/api/types.ts — keep test names in sync with TS", name)
	}
	body := m[1]
	fieldRe := regexp.MustCompile(`(?m)^\s*(\w+)\??\s*:`)
	matches := fieldRe.FindAllStringSubmatch(body, -1)
	fields := make([]string, 0, len(matches))
	for _, mm := range matches {
		fields = append(fields, mm[1])
	}
	sort.Strings(fields)
	return fields
}

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
	expected := tsInterfaceFields(t, "OrgNode")
	got := jsonFieldNames(apitypes.OrgNode{})
	assertFieldsMatch(t, "OrgNode", expected, got)
}

func TestContractPodFields(t *testing.T) {
	t.Parallel()
	expected := tsInterfaceFields(t, "Pod")
	got := jsonFieldNames(apitypes.Pod{})
	assertFieldsMatch(t, "Pod", expected, got)
}

func TestContractPodInfoFields(t *testing.T) {
	t.Parallel()
	// PodInfo (TS) extends Pod, so the regex captures only the additional
	// fields. Combine with Pod fields to get the full set.
	expected := append(tsInterfaceFields(t, "Pod"), tsInterfaceFields(t, "PodInfo")...)
	sort.Strings(expected)
	got := jsonFieldNames(apitypes.PodInfo{})
	assertFieldsMatch(t, "PodInfo", expected, got)
}

func TestContractOrgDataFields(t *testing.T) {
	t.Parallel()
	expected := tsInterfaceFields(t, "OrgData")
	got := jsonFieldNames(OrgData{})
	assertFieldsMatch(t, "OrgData", expected, got)
}

func TestContractAutosaveDataFields(t *testing.T) {
	t.Parallel()
	expected := tsInterfaceFields(t, "AutosaveData")
	got := jsonFieldNames(AutosaveData{})
	assertFieldsMatch(t, "AutosaveData", expected, got)
}

func TestContractSnapshotInfoFields(t *testing.T) {
	t.Parallel()
	expected := tsInterfaceFields(t, "SnapshotInfo")
	got := jsonFieldNames(SnapshotInfo{})
	assertFieldsMatch(t, "SnapshotInfo", expected, got)
}

func TestContractMappedColumnFields(t *testing.T) {
	t.Parallel()
	expected := tsInterfaceFields(t, "MappedColumn")
	got := jsonFieldNames(apitypes.MappedColumn{})
	assertFieldsMatch(t, "MappedColumn", expected, got)
}

func TestContractUploadResponseFields(t *testing.T) {
	t.Parallel()
	expected := tsInterfaceFields(t, "UploadResponse")
	got := jsonFieldNames(UploadResponse{})
	assertFieldsMatch(t, "UploadResponse", expected, got)
}

func TestContractSettingsFields(t *testing.T) {
	t.Parallel()
	expected := tsInterfaceFields(t, "Settings")
	got := jsonFieldNames(apitypes.Settings{})
	assertFieldsMatch(t, "Settings", expected, got)
}

func TestContractPersonUpdateFields(t *testing.T) {
	t.Parallel()
	expected := tsInterfaceFields(t, "OrgNodeUpdatePayload")
	got := jsonFieldNames(apitypes.OrgNodeUpdate{})
	assertFieldsMatch(t, "OrgNodeUpdate", expected, got)
}

func TestContractPodUpdateFields(t *testing.T) {
	t.Parallel()
	expected := tsInterfaceFields(t, "PodUpdatePayload")
	got := jsonFieldNames(apitypes.PodUpdate{})
	assertFieldsMatch(t, "PodUpdate", expected, got)
}

func TestContractPersonJSONRoundTrip(t *testing.T) {
	t.Parallel()
	original := apitypes.OrgNode{OrgNodeFields: model.OrgNodeFields{Name: "Jane Doe",
		Role:       "Staff Engineer",
		Discipline: "Engineering",

		Team:            "Platform",
		AdditionalTeams: []string{"Infra", "DevEx"},
		Status:          "Active",
		EmploymentType:  "FTE",
		Warning:         "duplicate name",

		NewRole:     "Senior Staff",
		NewTeam:     "Core Platform",
		Pod:         "pod-alpha",
		PublicNote:  "Transitioning Q3",
		PrivateNote: "Promo candidate",
		Level:       7,
		Private:     true}, Id: "uuid-123",

		ManagerId: "uuid-456",

		SortIndex: 3,
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("failed to marshal OrgNode: %v", err)
	}

	var roundTripped apitypes.OrgNode
	if err := json.Unmarshal(data, &roundTripped); err != nil {
		t.Fatalf("failed to unmarshal OrgNode: %v", err)
	}

	if !reflect.DeepEqual(original, roundTripped) {
		t.Errorf("OrgNode round-trip failed.\nOriginal:     %+v\nRound-tripped: %+v", original, roundTripped)
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

// Scenarios: CONTRACT-013

func TestContractPersonFieldTypes(t *testing.T) {
	t.Parallel()
	p := apitypes.OrgNode{OrgNodeFields: model.OrgNodeFields{Name: "Alice", Role: "VP", Discipline: "Eng",
		Team: "Platform", AdditionalTeams: []string{"Infra"},
		Status: "Active", EmploymentType: "FTE", Level: 5, Private: true,
		Extra: map[string]string{"Custom": "val"}}, Id: "uuid-1",
		ManagerId: "uuid-2",

		SortIndex: 1,
	}
	data, err := json.Marshal(p)
	if err != nil {
		t.Fatal(err)
	}
	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatal(err)
	}

	// String fields
	for _, key := range []string{"id", "name", "role", "discipline", "managerId", "team", "status", "employmentType"} {
		if _, ok := raw[key].(string); !ok {
			t.Errorf("expected %q to be string, got %T", key, raw[key])
		}
	}
	// Array field
	if _, ok := raw["additionalTeams"].([]any); !ok {
		t.Errorf("expected additionalTeams to be array, got %T", raw["additionalTeams"])
	}
	// Number fields
	for _, key := range []string{"level", "sortIndex"} {
		if _, ok := raw[key].(float64); !ok {
			t.Errorf("expected %q to be number, got %T", key, raw[key])
		}
	}
	// Boolean
	if _, ok := raw["private"].(bool); !ok {
		t.Errorf("expected private to be bool, got %T", raw["private"])
	}
	// Object (Extra)
	if _, ok := raw["extra"].(map[string]any); !ok {
		t.Errorf("expected extra to be object, got %T", raw["extra"])
	}
}

func TestContractErrorResponseShape(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	router := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())

	cases := []struct {
		name   string
		method string
		path   string
		body   string
	}{
		{"not found", "POST", "/api/move", `{"personId":"nonexistent","newManagerId":"x"}`},
		{"validation: empty body", "POST", "/api/move", "{}"},
		{"bad JSON", "POST", "/api/update", `{invalid`},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			var body io.Reader
			if tc.body != "" {
				body = strings.NewReader(tc.body)
			} else {
				body = strings.NewReader("{}")
			}
			req := httptest.NewRequest(tc.method, tc.path, body)
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("X-Requested-With", "XMLHttpRequest")
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			if rec.Code < 400 {
				t.Fatalf("expected error status (>=400), got %d", rec.Code)
			}

			// All error responses must have {"error": "<message>"} shape
			var errResp map[string]string
			if err := json.NewDecoder(rec.Body).Decode(&errResp); err != nil {
				t.Fatalf("error response is not valid JSON: %v", err)
			}
			msg, ok := errResp["error"]
			if !ok {
				t.Error("error response missing 'error' key")
			}
			if msg == "" {
				t.Error("error message is empty")
			}
		})
	}
}

func TestContractGetOrgResponseShape(t *testing.T) {
	t.Parallel()
	svc := newTestService(t)
	router := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())

	req := httptest.NewRequest("GET", "/api/org", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var raw map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&raw); err != nil {
		t.Fatalf("response is not valid JSON: %v", err)
	}

	// Required top-level keys (always present when org data is loaded)
	for _, key := range []string{"original", "working"} {
		if _, ok := raw[key]; !ok {
			t.Errorf("response missing key %q", key)
		}
	}
	// Arrays
	if _, ok := raw["original"].([]any); !ok {
		t.Errorf("expected original to be array, got %T", raw["original"])
	}
	if _, ok := raw["working"].([]any); !ok {
		t.Errorf("expected working to be array, got %T", raw["working"])
	}
	// Settings object (present when non-nil; omitted via omitempty when nil)
	if v, ok := raw["settings"]; ok {
		if _, ok := v.(map[string]any); !ok {
			t.Errorf("expected settings to be object, got %T", v)
		}
	}
	// Pods array (present when non-empty; omitted via omitempty when empty)
	if v, ok := raw["pods"]; ok {
		if _, ok := v.([]any); !ok {
			t.Errorf("expected pods to be array, got %T", v)
		}
	}
}

func TestContractUploadResponseShape(t *testing.T) {
	t.Parallel()
	svc := NewOrgService(NewMemorySnapshotStore())
	router := NewRouter(NewServices(svc), nil, NewMemoryAutosaveStore())

	// Upload via handler
	csv := "Name,Role,Discipline,Manager,Team,Status\nAlice,VP,Eng,,Eng,Active\n"
	body, contentType := createMultipartUpload(t, "test.csv", []byte(csv))
	req := httptest.NewRequest("POST", "/api/upload", body)
	req.Header.Set("Content-Type", contentType)
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var raw map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&raw); err != nil {
		t.Fatalf("response is not valid JSON: %v", err)
	}

	// status must be string
	status, ok := raw["status"].(string)
	if !ok {
		t.Fatalf("expected status to be string, got %T", raw["status"])
	}
	if status != "ready" {
		t.Fatalf("expected status 'ready', got %q", status)
	}
	// orgData must be object
	if _, ok := raw["orgData"].(map[string]any); !ok {
		t.Errorf("expected orgData to be object, got %T", raw["orgData"])
	}
}

// createMultipartUpload builds a multipart form body with a single file field.
func createMultipartUpload(t *testing.T, filename string, content []byte) (*bytes.Buffer, string) {
	t.Helper()
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		t.Fatalf("creating form file: %v", err)
	}
	if _, err = part.Write(content); err != nil {
		t.Fatalf("writing form data: %v", err)
	}
	if err = writer.Close(); err != nil {
		t.Fatalf("closing multipart writer: %v", err)
	}
	return &buf, writer.FormDataContentType()
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
