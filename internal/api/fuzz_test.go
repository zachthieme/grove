package api

import (
	"context"
	"fmt"
	"strings"
	"testing"
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
		m := map[string]MappedColumn{
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
		m := make(map[string]MappedColumn)
		for i, field := range fields {
			if i >= len(confidences) {
				break
			}
			if field == "" {
				continue
			}
			m[field] = MappedColumn{
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
	f.Add("name", "John")
	f.Add("role", "Engineer")
	f.Add("unknownField", "value")
	f.Add("status", "Invalid")
	f.Add("status", "Active")
	f.Add("team", "NewTeam")
	f.Add("discipline", "Design")
	f.Add("managerId", "")
	f.Add("employmentType", "Contractor")
	f.Add("additionalTeams", "TeamA,TeamB")
	f.Add("newRole", "Senior")
	f.Add("newTeam", "Platform")
	f.Add("level", "5")
	f.Add("level", "not-a-number")
	f.Add("publicNote", "a note")
	f.Add("privateNote", "secret")
	f.Add("pod", "alpha")
	f.Add("", "")

	f.Fuzz(func(t *testing.T, field, value string) {
		svc := NewOrgService(NewMemorySnapshotStore())
		csv := []byte("Name,Role,Discipline,Manager,Team,Status\nAlice,VP,Eng,,Eng,Active\n")
		resp, err := svc.Upload(context.Background(), "test.csv", csv)
		if err != nil || resp.Status != "ready" {
			return
		}
		people := svc.GetWorking(context.Background())
		if len(people) == 0 {
			return
		}
		// Should never panic; errors are expected for unknown fields or invalid values
		_, _ = svc.Update(context.Background(), people[0].Id, map[string]string{field: value})
	})
}
