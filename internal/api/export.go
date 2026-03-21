package api

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"strings"

	"github.com/xuri/excelize/v2"
)

var exportHeaders = []string{"Name", "Role", "Discipline", "Manager", "Team", "Additional Teams", "Status"}

func ExportCSV(people []Person) ([]byte, error) {
	idToName := buildIDToName(people)
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	w.Write(exportHeaders)
	for _, p := range people {
		w.Write(personToRow(p, idToName))
	}
	w.Flush()
	if err := w.Error(); err != nil {
		return nil, fmt.Errorf("writing CSV: %w", err)
	}
	return buf.Bytes(), nil
}

func ExportXLSX(people []Person) ([]byte, error) {
	idToName := buildIDToName(people)
	f := excelize.NewFile()
	sheet := "Sheet1"
	for i, h := range exportHeaders {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellValue(sheet, cell, h)
	}
	for rowIdx, p := range people {
		row := personToRow(p, idToName)
		for colIdx, val := range row {
			cell, _ := excelize.CoordinatesToCellName(colIdx+1, rowIdx+2)
			f.SetCellValue(sheet, cell, val)
		}
	}
	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		return nil, fmt.Errorf("writing XLSX: %w", err)
	}
	return buf.Bytes(), nil
}

func buildIDToName(people []Person) map[string]string {
	m := make(map[string]string, len(people))
	for _, p := range people {
		m[p.Id] = p.Name
	}
	return m
}

func personToRow(p Person, idToName map[string]string) []string {
	managerName := idToName[p.ManagerId]
	return []string{
		p.Name, p.Role, p.Discipline, managerName, p.Team,
		strings.Join(p.AdditionalTeams, ","), p.Status,
	}
}
