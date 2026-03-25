package api

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"strings"

	"github.com/xuri/excelize/v2"
)

var exportHeaders = []string{"Name", "Role", "Discipline", "Manager", "Team", "Additional Teams", "Status", "Employment Type", "New Role", "New Team", "Pod", "Public Note", "Private Note"}

func ExportCSV(people []Person) ([]byte, error) {
	idToName := buildIDToName(people)
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	if err := w.Write(exportHeaders); err != nil {
		return nil, fmt.Errorf("writing CSV headers: %w", err)
	}
	for _, p := range people {
		if err := w.Write(personToRow(p, idToName)); err != nil {
			return nil, fmt.Errorf("writing CSV row: %w", err)
		}
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
	defer func() { _ = f.Close() }()
	sheet := "Sheet1"
	for i, h := range exportHeaders {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		if err := f.SetCellValue(sheet, cell, h); err != nil {
			return nil, fmt.Errorf("setting header cell: %w", err)
		}
	}
	for rowIdx, p := range people {
		row := personToRow(p, idToName)
		for colIdx, val := range row {
			cell, _ := excelize.CoordinatesToCellName(colIdx+1, rowIdx+2)
			if err := f.SetCellValue(sheet, cell, val); err != nil {
				return nil, fmt.Errorf("setting cell value: %w", err)
			}
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

var podSidecarHeaders = []string{"Pod Name", "Manager", "Team", "Public Note", "Private Note"}

func ExportPodsSidecarCSV(pods []Pod, people []Person) ([]byte, error) {
	idToName := buildIDToName(people)
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	if err := w.Write(podSidecarHeaders); err != nil {
		return nil, fmt.Errorf("writing pod sidecar headers: %w", err)
	}
	for _, pod := range pods {
		row := []string{pod.Name, idToName[pod.ManagerId], pod.Team, pod.PublicNote, pod.PrivateNote}
		if err := w.Write(row); err != nil {
			return nil, fmt.Errorf("writing pod sidecar row: %w", err)
		}
	}
	w.Flush()
	return buf.Bytes(), w.Error()
}

func personToRow(p Person, idToName map[string]string) []string {
	managerName := idToName[p.ManagerId]
	return []string{
		p.Name, p.Role, p.Discipline, managerName, p.Team,
		strings.Join(p.AdditionalTeams, ","), p.Status, p.EmploymentType,
		p.NewRole, p.NewTeam, p.Pod, p.PublicNote, p.PrivateNote,
	}
}
