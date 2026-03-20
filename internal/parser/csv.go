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
		p := model.Person{
			Name:       strings.TrimSpace(row[cols["name"]]),
			Role:       strings.TrimSpace(row[cols["role"]]),
			Discipline: strings.TrimSpace(row[cols["discipline"]]),
			Team:       strings.TrimSpace(row[cols["team"]]),
			Status:     strings.TrimSpace(row[cols["status"]]),
		}

		if idx, ok := cols["manager"]; ok && idx < len(row) {
			p.Manager = strings.TrimSpace(row[idx])
		}

		if idx, ok := cols["additional teams"]; ok && idx < len(row) {
			raw := strings.TrimSpace(row[idx])
			if raw != "" {
				for _, t := range strings.Split(raw, ",") {
					t = strings.TrimSpace(t)
					if t != "" {
						p.AdditionalTeams = append(p.AdditionalTeams, t)
					}
				}
			}
		}

		people = append(people, p)
	}

	return model.NewOrg(people)
}
