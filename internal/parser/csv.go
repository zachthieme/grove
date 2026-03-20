package parser

import (
	"encoding/csv"
	"fmt"
	"os"
	"strings"

	"github.com/zach/orgchart/internal/model"
)

func parseCSV(path string) (*model.Org, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("opening file: %w", err)
	}
	defer f.Close()

	reader := csv.NewReader(f)
	records, err := reader.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("reading CSV: %w", err)
	}

	if len(records) < 2 {
		return nil, fmt.Errorf("CSV file must have a header row and at least one data row")
	}

	header := records[0]
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
	for _, row := range records[1:] {
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
