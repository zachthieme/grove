package parser

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/zach/orgchart/internal/model"
)

func Parse(path string) (*model.Org, error) {
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".csv":
		return parseCSV(path)
	case ".xlsx":
		return parseXLSX(path)
	default:
		return nil, fmt.Errorf("unsupported file format '%s' (expected .csv or .xlsx)", ext)
	}
}

// BuildPeople converts raw spreadsheet rows (header + data) into an Org.
func BuildPeople(header []string, dataRows [][]string) (*model.Org, error) {
	cols := make(map[string]int)
	for i, h := range header {
		cols[strings.TrimSpace(strings.ToLower(h))] = i
	}

	required := []string{"name", "role", "discipline", "team", "status"}
	for _, r := range required {
		if _, ok := cols[r]; !ok {
			return nil, fmt.Errorf("missing required column '%s' in header", r)
		}
	}

	var people []model.Person
	for _, row := range dataRows {
		get := func(col string) string {
			idx, ok := cols[col]
			if !ok || idx >= len(row) {
				return ""
			}
			return strings.TrimSpace(row[idx])
		}

		p := model.Person{
			Name:       get("name"),
			Role:       get("role"),
			Discipline: get("discipline"),
			Manager:    get("manager"),
			Team:       get("team"),
			Status:     get("status"),
			NewRole:    get("new role"),
			NewTeam:    get("new team"),
		}

		raw := get("additional teams")
		if raw != "" {
			for _, t := range strings.Split(raw, ",") {
				t = strings.TrimSpace(t)
				if t != "" {
					p.AdditionalTeams = append(p.AdditionalTeams, t)
				}
			}
		}

		people = append(people, p)
	}

	return model.NewOrg(people)
}
