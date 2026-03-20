package parser

import (
	"fmt"
	"strings"

	"github.com/xuri/excelize/v2"
	"github.com/zach/orgchart/internal/model"
)

func parseXLSX(path string) (*model.Org, error) {
	f, err := excelize.OpenFile(path)
	if err != nil {
		return nil, fmt.Errorf("opening xlsx: %w", err)
	}
	defer f.Close()

	sheet := f.GetSheetName(0)
	rows, err := f.GetRows(sheet)
	if err != nil {
		return nil, fmt.Errorf("reading rows: %w", err)
	}

	if len(rows) < 2 {
		return nil, fmt.Errorf("xlsx must have a header row and at least one data row")
	}

	header := rows[0]
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
	for _, row := range rows[1:] {
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
