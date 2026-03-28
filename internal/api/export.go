package api

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/xuri/excelize/v2"
)

var exportHeaders = []string{"Name", "Role", "Discipline", "Manager", "Team", "Additional Teams", "Status", "Employment Type", "New Role", "New Team", "Level", "Pod", "Public Note", "Private Note", "Private"}

// collectExtraKeys returns the sorted union of all Extra map keys across people.
func collectExtraKeys(people []Person) []string {
	seen := make(map[string]bool)
	for _, p := range people {
		for k := range p.Extra {
			seen[k] = true
		}
	}
	keys := make([]string, 0, len(seen))
	for k := range seen {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func personToRowWithExtra(p Person, idToName map[string]string, extraKeys []string) []string {
	row := personToRow(p, idToName)
	for _, k := range extraKeys {
		row = append(row, p.Extra[k])
	}
	return row
}

func ExportCSV(people []Person) ([]byte, error) {
	idToName := buildIDToName(people)
	extraKeys := collectExtraKeys(people)
	headers := append(append([]string{}, exportHeaders...), extraKeys...)
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	if err := w.Write(headers); err != nil {
		return nil, fmt.Errorf("writing CSV headers: %w", err)
	}
	for _, p := range people {
		if err := w.Write(personToRowWithExtra(p, idToName, extraKeys)); err != nil {
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
	extraKeys := collectExtraKeys(people)
	headers := append(append([]string{}, exportHeaders...), extraKeys...)
	f := excelize.NewFile()
	defer func() { _ = f.Close() }()
	sheet := "Sheet1"
	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		if err := f.SetCellValue(sheet, cell, h); err != nil {
			return nil, fmt.Errorf("setting header cell: %w", err)
		}
	}
	for rowIdx, p := range people {
		row := personToRowWithExtra(p, idToName, extraKeys)
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

func ExportSettingsSidecarCSV(settings Settings) ([]byte, error) {
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	if err := w.Write([]string{"Discipline Order"}); err != nil {
		return nil, fmt.Errorf("writing settings header: %w", err)
	}
	for _, d := range settings.DisciplineOrder {
		if err := w.Write([]string{d}); err != nil {
			return nil, fmt.Errorf("writing settings row: %w", err)
		}
	}
	w.Flush()
	return buf.Bytes(), w.Error()
}

func personToRow(p Person, idToName map[string]string) []string {
	managerName := idToName[p.ManagerId]
	levelStr := ""
	if p.Level != 0 {
		levelStr = strconv.Itoa(p.Level)
	}
	privateStr := "false"
	if p.Private {
		privateStr = "true"
	}
	return []string{
		p.Name, p.Role, p.Discipline, managerName, p.Team,
		strings.Join(p.AdditionalTeams, ","), p.Status, p.EmploymentType,
		p.NewRole, p.NewTeam, levelStr, p.Pod, p.PublicNote, p.PrivateNote,
		privateStr,
	}
}
