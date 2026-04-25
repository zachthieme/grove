package api

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/zachthieme/grove/internal/apitypes"
	"github.com/zachthieme/grove/internal/model"
)

func FuzzInferMapping(f *testing.F) {
	f.Add("Name,Role,Manager,Team,Status")
	f.Add("Full Name,Job Title,Reports To,Department,Employee Status")
	f.Add("")
	f.Add(",,,")
	f.Add("asdf,qwer,zxcv")
	f.Add("name")
	f.Add("ROLE,TEAM,STATUS")
	f.Add("Employee Name,Position,Supervisor,Organization,Employment Status")
	f.Add("pod,level,discipline,additional teams,employment type")
	f.Add("public note,private note,new role,new team")

	f.Fuzz(func(t *testing.T, input string) {
		headers := strings.Split(input, ",")
		// Cap at 20 headers to avoid pathological inputs eating memory
		if len(headers) > 20 {
			headers = headers[:20]
		}
		m := InferMapping(headers)

		// Invariant: no duplicate fields in the result map
		// (Go maps enforce this by construction, but verify values are sane)
		seenColumns := map[int]bool{}
		for field, mc := range m {
			// Confidence must be "high" or "medium"
			if mc.Confidence != "high" && mc.Confidence != "medium" {
				t.Errorf("field %q has invalid confidence %q", field, mc.Confidence)
			}
			// Column must correspond to one of the input headers
			colIdx := -1
			for i, h := range headers {
				if h == mc.Column {
					colIdx = i
					break
				}
			}
			if colIdx == -1 {
				t.Errorf("field %q mapped to column %q not found in headers", field, mc.Column)
			}
			// Each header index should be consumed at most once
			if seenColumns[colIdx] {
				t.Errorf("header index %d (%q) mapped to multiple fields", colIdx, mc.Column)
			}
			seenColumns[colIdx] = true
		}
	})
}

func FuzzCSVUpload(f *testing.F) {
	f.Add([]byte("Name,Role,Manager,Team,Status\nAlice,VP,,Eng,Active\n"))
	f.Add([]byte(""))
	f.Add([]byte("Name\nBob\n"))
	f.Add([]byte("Name,Role,Discipline,Manager,Team,Status\nAlice,VP,Eng,,Eng,Active\nBob,IC,Eng,Alice,Eng,Active\n"))
	f.Add([]byte("\xff\xfe"))
	f.Add([]byte("a\nb\nc\nd\n"))
	f.Add([]byte("Name,Name,Name\nA,B,C\n"))

	f.Fuzz(func(t *testing.T, data []byte) {
		svc := NewOrgService(NewMemorySnapshotStore())
		// Should never panic regardless of input; errors are expected
		_, _ = svc.Upload(context.Background(), "test.csv", data)
	})
}

func FuzzAllRequiredHigh(f *testing.F) {
	f.Add("name", "high")
	f.Add("name", "medium")
	f.Add("name", "")
	f.Add("", "high")
	f.Add("role", "high")
	f.Add("unknown", "medium")
	f.Add("name", "none")

	f.Fuzz(func(t *testing.T, field, confidence string) {
		m := map[string]apitypes.MappedColumn{
			field: {Column: "TestCol", Confidence: confidence},
		}
		// Should never panic; result is always a bool
		result := AllRequiredHigh(m)
		_ = result
	})
}

func FuzzAllRequiredHighMultiField(f *testing.F) {
	f.Add("name,role,team", "high,medium,high")
	f.Add("name", "high")
	f.Add("", "")
	f.Add("name,discipline,manager,team,status", "high,high,high,high,high")
	f.Add("role,team", "medium,medium")

	f.Fuzz(func(t *testing.T, fieldsStr, confidencesStr string) {
		fields := strings.Split(fieldsStr, ",")
		confidences := strings.Split(confidencesStr, ",")
		m := make(map[string]apitypes.MappedColumn)
		for i, field := range fields {
			if i >= len(confidences) {
				break
			}
			if field == "" {
				continue
			}
			m[field] = apitypes.MappedColumn{
				Column:     fmt.Sprintf("Col%d", i),
				Confidence: confidences[i],
			}
		}
		// Should never panic
		result := AllRequiredHigh(m)
		_ = result
	})
}

func FuzzUpdateFields(f *testing.F) {
	f.Add("John", "Engineer", "Design")
	f.Add("", "", "")
	f.Add("Alice", "VP", "Eng")
	f.Add(strings.Repeat("x", 600), "Senior", "SRE")

	f.Fuzz(func(t *testing.T, name, role, disc string) {
		svc := NewOrgService(NewMemorySnapshotStore())
		csv := []byte("Name,Role,Discipline,Manager,Team,Status\nAlice,VP,Eng,,Eng,Active\n")
		resp, err := svc.Upload(context.Background(), "test.csv", csv)
		if err != nil || resp.Status != UploadReady {
			return
		}
		people := svc.GetWorking(context.Background())
		if len(people) == 0 {
			return
		}
		// Should never panic; errors are expected for invalid values
		_, _ = svc.Update(context.Background(), people[0].Id, apitypes.OrgNodeUpdate{
			Name: &name, Role: &role, Discipline: &disc,
		})
	})
}

// Scenarios: EXPORT-008
func FuzzSanitizeCell(f *testing.F) {
	f.Add("Alice")
	f.Add("=SUM(1,1)")
	f.Add("+cmd")
	f.Add("-2+3")
	f.Add("@SUM")
	f.Add("")
	f.Add("\tfoo")
	f.Add("\rfoo")
	f.Add("\nfoo")

	f.Fuzz(func(t *testing.T, input string) {
		result := sanitizeCell(input)
		if len(result) == 0 && len(input) == 0 {
			return
		}
		// Invariant: result never starts with a dangerous character
		if len(result) > 0 {
			switch result[0] {
			case '=', '+', '-', '@', '\r', '\n':
				t.Errorf("sanitizeCell(%q) = %q starts with dangerous char", input, result)
			}
		}
	})
}

func FuzzZipUpload(f *testing.F) {
	// Seed with a valid minimal ZIP containing a CSV
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	w, _ := zw.Create("0-original.csv")
	_, _ = w.Write([]byte("Name,Role,Manager,Team,Status\nAlice,VP,,Eng,Active\n"))
	_ = zw.Close()
	f.Add(buf.Bytes())

	// Seed with empty bytes
	f.Add([]byte{})
	// Seed with not-a-zip
	f.Add([]byte("this is not a zip file"))
	// Seed with truncated zip magic bytes
	f.Add([]byte("PK\x03\x04"))

	f.Fuzz(func(t *testing.T, data []byte) {
		svc := NewOrgService(NewMemorySnapshotStore())
		// Must not panic — errors are acceptable
		resp, err := svc.UploadZip(context.Background(), data)
		if err != nil {
			return
		}
		// If successful, verify basic invariants
		if resp.OrgData != nil {
			if len(resp.OrgData.Working) == 0 {
				t.Error("successful upload returned empty working set")
			}
		}
	})
}

func FuzzParseZipFileList(f *testing.F) {
	// Seed with valid zip
	var buf2 bytes.Buffer
	zw2 := zip.NewWriter(&buf2)
	w2, _ := zw2.Create("test.csv")
	_, _ = w2.Write([]byte("Name\nAlice\n"))
	_ = zw2.Close()
	f.Add(buf2.Bytes())

	f.Add([]byte{})

	f.Fuzz(func(t *testing.T, data []byte) {
		entries, _, _, _, err := parseZipFileList(data)
		if err != nil {
			return
		}
		// Invariant: all entries have non-empty filenames and non-nil data
		for _, e := range entries {
			if e.filename == "" {
				t.Error("parsed entry has empty filename")
			}
			if e.data == nil {
				t.Error("parsed entry has nil data")
			}
		}
	})
}

func FuzzWouldCreateCycle(f *testing.F) {
	f.Add("alice", "bob", "bob,alice", "alice,")
	f.Add("a", "a", "a,", "")
	f.Add("", "", "", "")

	f.Fuzz(func(t *testing.T, personId, newManagerId, names, managers string) {
		nameList := strings.Split(names, ",")
		managerList := strings.Split(managers, ",")
		if len(nameList) > 50 {
			nameList = nameList[:50]
		}

		var people []apitypes.OrgNode
		for i, name := range nameList {
			if name == "" {
				continue
			}
			mgr := ""
			if i < len(managerList) {
				mgr = managerList[i]
			}
			people = append(people, apitypes.OrgNode{OrgNodeFields: model.OrgNodeFields{Name: name}, Id: name,

				ManagerId: mgr,
			})
		}

		// Must never panic
		idIndex := make(map[string]int, len(people))
		for i, p := range people {
			idIndex[p.Id] = i
		}
		_ = wouldCreateCycle(people, idIndex, personId, newManagerId)
	})
}
