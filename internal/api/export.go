package api

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/xuri/excelize/v2"
	"github.com/zachthieme/grove/internal/apitypes"
)

var exportHeaders = []string{"Name", "Type", "Role", "Discipline", "Manager", "Team", "Additional Teams", "Status", "Employment Type", "New Role", "New Team", "Level", "Pod", "Public Note", "Private Note", "Private"}

// sanitizeCell prevents CSV injection by prefixing cells that start with
// formula-triggering characters. See OWASP CSV Injection guidance.
func sanitizeCell(s string) string {
	if len(s) == 0 {
		return s
	}
	switch s[0] {
	case '=', '+', '-', '@', '\t', '\r', '\n':
		return "\t" + s
	default:
		return s
	}
}

// collectExtraKeys returns the sorted union of all Extra map keys across nodes.
func collectExtraKeys(nodes []apitypes.OrgNode) []string {
	seen := make(map[string]bool)
	for _, p := range nodes {
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

func nodeToRowWithExtra(p apitypes.OrgNode, idToName map[string]string, extraKeys []string) []string {
	row := nodeToRow(p, idToName)
	for _, k := range extraKeys {
		row = append(row, sanitizeCell(p.Extra[k]))
	}
	return row
}

func ExportCSV(people []apitypes.OrgNode) ([]byte, error) {
	idToName := buildIDToName(people)
	extraKeys := collectExtraKeys(people)
	headers := append(append([]string{}, exportHeaders...), extraKeys...)
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	if err := w.Write(headers); err != nil {
		return nil, fmt.Errorf("writing CSV headers: %w", err)
	}
	for _, p := range people {
		if err := w.Write(nodeToRowWithExtra(p, idToName, extraKeys)); err != nil {
			return nil, fmt.Errorf("writing CSV row: %w", err)
		}
	}
	w.Flush()
	if err := w.Error(); err != nil {
		return nil, fmt.Errorf("writing CSV: %w", err)
	}
	return buf.Bytes(), nil
}

func ExportXLSX(people []apitypes.OrgNode) ([]byte, error) {
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
		row := nodeToRowWithExtra(p, idToName, extraKeys)
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

func buildIDToName(people []apitypes.OrgNode) map[string]string {
	m := make(map[string]string, len(people))
	for _, p := range people {
		m[p.Id] = p.Name
	}
	return m
}

var podSidecarHeaders = []string{"Pod Name", "Manager", "Team", "Public Note", "Private Note"}

func ExportPodsSidecarCSV(pods []apitypes.Pod, people []apitypes.OrgNode) ([]byte, error) {
	idToName := buildIDToName(people)
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	if err := w.Write(podSidecarHeaders); err != nil {
		return nil, fmt.Errorf("writing pod sidecar headers: %w", err)
	}
	for _, pod := range pods {
		row := []string{
			sanitizeCell(pod.Name),
			sanitizeCell(idToName[pod.ManagerId]),
			sanitizeCell(pod.Team),
			sanitizeCell(pod.PublicNote),
			sanitizeCell(pod.PrivateNote),
		}
		if err := w.Write(row); err != nil {
			return nil, fmt.Errorf("writing pod sidecar row: %w", err)
		}
	}
	w.Flush()
	return buf.Bytes(), w.Error()
}

func ExportSettingsSidecarCSV(settings apitypes.Settings) ([]byte, error) {
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	if err := w.Write([]string{"Discipline Order"}); err != nil {
		return nil, fmt.Errorf("writing settings header: %w", err)
	}
	for _, d := range settings.DisciplineOrder {
		if err := w.Write([]string{sanitizeCell(d)}); err != nil {
			return nil, fmt.Errorf("writing settings row: %w", err)
		}
	}
	w.Flush()
	return buf.Bytes(), w.Error()
}

func nodeToRow(p apitypes.OrgNode, idToName map[string]string) []string {
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
		sanitizeCell(p.Name), sanitizeCell(p.Type), sanitizeCell(p.Role), sanitizeCell(p.Discipline),
		sanitizeCell(managerName), sanitizeCell(p.Team),
		sanitizeCell(strings.Join(p.AdditionalTeams, ",")),
		sanitizeCell(p.Status), sanitizeCell(p.EmploymentType),
		sanitizeCell(p.NewRole), sanitizeCell(p.NewTeam),
		levelStr,
		sanitizeCell(p.Pod), sanitizeCell(p.PublicNote), sanitizeCell(p.PrivateNote),
		privateStr,
	}
}
