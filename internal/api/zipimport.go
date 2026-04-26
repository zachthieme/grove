package api

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"math"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/zachthieme/grove/internal/apitypes"
	"github.com/zachthieme/grove/internal/logbuf"
	"github.com/zachthieme/grove/internal/model"
	"github.com/zachthieme/grove/internal/org"
	"github.com/zachthieme/grove/internal/parser"
	"github.com/zachthieme/grove/internal/pod"
	"github.com/zachthieme/grove/internal/snapshot"
)

const maxDecompressedSize = 200 << 20 // 200 MB

var prefixRegex = regexp.MustCompile(`^(\d+)-(.+)$`)

type zipEntry struct {
	prefix   int
	name     string
	filename string
	data     []byte
}

func parseZipFileList(data []byte) ([]zipEntry, []byte, []byte, []string, error) {
	r, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, nil, nil, nil, org.ErrValidation("opening zip: %v", err)
	}

	var entries []zipEntry
	var podsSidecarData []byte
	var settingsSidecarData []byte
	var totalSize int64
	var warnings []string

	for _, f := range r.File {
		base := filepath.Base(f.Name)
		ext := strings.ToLower(filepath.Ext(base))
		if ext != ".csv" && ext != ".xlsx" {
			continue
		}

		rc, err := f.Open()
		if err != nil {
			warnings = append(warnings, fmt.Sprintf("skipped %s: %v", f.Name, err))
			continue
		}
		content, err := io.ReadAll(io.LimitReader(rc, maxDecompressedSize-totalSize+1))
		_ = rc.Close()
		if err != nil {
			warnings = append(warnings, fmt.Sprintf("skipped %s: %v", f.Name, err))
			continue
		}
		totalSize += int64(len(content))
		if totalSize > maxDecompressedSize {
			return nil, nil, nil, nil, org.ErrValidation("ZIP contents too large (max %d MB)", maxDecompressedSize>>20)
		}

		nameNoExt := strings.TrimSuffix(base, filepath.Ext(base))

		// pods.csv sidecar — store separately, don't treat as person data
		if strings.ToLower(nameNoExt) == "pods" && ext == ".csv" {
			podsSidecarData = content
			continue
		}

		// settings.csv sidecar — store separately, don't treat as person data
		if strings.ToLower(nameNoExt) == "settings" && ext == ".csv" {
			settingsSidecarData = content
			continue
		}

		prefix := math.MaxInt
		displayName := nameNoExt

		if m := prefixRegex.FindStringSubmatch(nameNoExt); m != nil {
			_, _ = fmt.Sscanf(m[1], "%d", &prefix)
			displayName = m[2]
		}

		entries = append(entries, zipEntry{
			prefix:   prefix,
			name:     displayName,
			filename: base,
			data:     content,
		})
	}

	if len(entries) == 0 {
		return nil, nil, nil, nil, org.ErrValidation("ZIP contains no CSV or XLSX files")
	}

	sort.SliceStable(entries, func(i, j int) bool {
		if entries[i].prefix != entries[j].prefix {
			return entries[i].prefix < entries[j].prefix
		}
		return entries[i].filename < entries[j].filename
	})

	return entries, podsSidecarData, settingsSidecarData, warnings, nil
}

func parsePodsSidecar(data []byte) []pod.SidecarEntry {
	reader := csv.NewReader(bytes.NewReader(data))
	records, err := reader.ReadAll()
	if err != nil || len(records) < 2 {
		return nil
	}
	header := records[0]
	idx := map[string]int{}
	for i, h := range header {
		idx[strings.ToLower(strings.TrimSpace(h))] = i
	}
	get := func(row []string, key string) string {
		if i, ok := idx[key]; ok && i < len(row) {
			return strings.TrimSpace(row[i])
		}
		return ""
	}
	var entries []pod.SidecarEntry
	for _, row := range records[1:] {
		entries = append(entries, pod.SidecarEntry{
			PodName:     get(row, "pod name"),
			ManagerName: get(row, "manager"),
			Team:        get(row, "team"),
			PublicNote:  get(row, "public note"),
			PrivateNote: get(row, "private note"),
		})
	}
	return entries
}

func parseSettingsSidecar(data []byte) []string {
	reader := csv.NewReader(bytes.NewReader(data))
	records, err := reader.ReadAll()
	if err != nil || len(records) < 2 {
		return nil
	}
	var order []string
	for _, row := range records[1:] {
		if len(row) > 0 && strings.TrimSpace(row[0]) != "" {
			order = append(order, strings.TrimSpace(row[0]))
		}
	}
	return order
}

func parseZipEntries(entries []zipEntry, mapping map[string]string) (original []apitypes.OrgNode, working []apitypes.OrgNode, snaps map[string]snapshot.Data, warnings []string, err error) {
	snaps = make(map[string]snapshot.Data)

	// Parse raw orgs from all entries first.
	type parsedEntry struct {
		entry zipEntry
		mod   *model.Org
	}
	var parsed []parsedEntry

	for _, e := range entries {
		header, dataRows, err := extractRows(e.filename, e.data)
		if err != nil {
			warnings = append(warnings, fmt.Sprintf("skipped %s: %v", e.filename, err))
			continue
		}

		mod, err := parser.BuildPeopleWithMapping(header, dataRows, mapping)
		if err != nil {
			warnings = append(warnings, fmt.Sprintf("skipped %s: %v", e.filename, err))
			continue
		}

		parsed = append(parsed, parsedEntry{entry: e, mod: mod})
	}

	if len(parsed) == 0 {
		return nil, nil, nil, nil, org.ErrValidation("no files in ZIP could be parsed")
	}

	if len(parsed) == 1 {
		people := org.ConvertOrg(parsed[0].mod)
		return people, deepCopyNodes(people), nil, warnings, nil
	}

	// Find original (prefix 0) and working (prefix 1)
	originalIdx := 0
	workingIdx := len(parsed) - 1

	for i, p := range parsed {
		if p.entry.prefix == 0 {
			originalIdx = i
		}
		if p.entry.prefix == 1 {
			workingIdx = i
		}
	}

	// Convert original first to establish stable IDs, then reuse them
	// for working and snapshot files so diff can match people by UUID.
	original = org.ConvertOrg(parsed[originalIdx].mod)
	idMap := org.BuildIDMap(original)

	working = org.ConvertOrgWithIDMap(parsed[workingIdx].mod, idMap)

	now := time.Now()
	for i, p := range parsed {
		if i == originalIdx || i == workingIdx {
			continue
		}
		snaps[p.entry.name] = snapshot.Data{
			People:    org.ConvertOrgWithIDMap(p.mod, idMap),
			Timestamp: now.Add(time.Duration(i) * time.Millisecond),
		}
	}

	return original, working, snaps, warnings, nil
}

func (s *OrgService) UploadZip(ctx context.Context, data []byte) (*org.UploadResponse, error) {
	// Parse before acquiring lock — no state mutation if parsing fails
	entries, podsSidecar, settingsSidecar, fileWarns, err := parseZipFileList(data)
	if err != nil {
		return nil, err
	}

	// Extract and infer before mutating state — if anything fails, service state is unchanged
	first := entries[0]
	header, dataRows, err := extractRows(first.filename, first.data)
	if err != nil {
		return nil, err
	}

	mapping := org.InferMapping(header)

	s.mu.Lock()

	if org.AllRequiredHigh(mapping) {
		simpleMapping := make(map[string]string, len(mapping))
		for field, mc := range mapping {
			simpleMapping[field] = mc.Column
		}

		orig, work, snaps, parseWarns, err := parseZipEntries(entries, simpleMapping)
		if err != nil {
			s.mu.Unlock()
			return nil, err
		}

		// All parsing succeeded — now commit state atomically
		s.pending = nil
		s.resetState(orig, work)

		if podsSidecar != nil {
			sidecarEntries := parsePodsSidecar(podsSidecar)
			if len(sidecarEntries) > 0 {
				idToName := org.BuildIDToName(s.working)
				s.podMgr.ApplyNotes(sidecarEntries, idToName)
			}
		}

		s.settings = apitypes.Settings{DisciplineOrder: org.DeriveDisciplineOrder(s.working)}
		if settingsSidecar != nil {
			if order := parseSettingsSidecar(settingsSidecar); len(order) > 0 {
				s.settings = apitypes.Settings{DisciplineOrder: order}
			}
		}

		resp := &org.UploadResponse{
			Status:  org.UploadReady,
			OrgData: &org.OrgData{Original: deepCopyNodes(s.original), Working: deepCopyNodes(s.working), Pods: pod.Copy(s.podMgr.Pods()), Settings: &s.settings},
		}
		s.mu.Unlock()

		// Apply parsed snapshots after releasing org lock. List after ReplaceAll/Clear.
		var diskWarns []string
		if len(snaps) == 0 {
			if err := s.snap.Clear(); err != nil {
				diskWarns = append(diskWarns, fmt.Sprintf("snapshot cleanup failed: %v", err))
			}
		} else {
			if err := s.snap.ReplaceAll(snaps); err != nil {
				diskWarns = append(diskWarns, fmt.Sprintf("snapshot replace error: %v", err))
			}
		}
		resp.Snapshots = s.snap.List()
		resp.PersistenceWarning = mergeWarnings("", diskWarns, fileWarns, parseWarns)

		logbuf.Logger().Info("zip upload completed", "source", "import", "people", len(work), "snapshots", len(snaps), "fileWarns", len(fileWarns), "parseWarns", len(parseWarns), "diskWarns", len(diskWarns))
		return resp, nil
	}

	// Needs mapping — store as pending.
	// Don't clear snapshots yet — user may cancel the mapping dialog.
	// Snapshots are cleared when the mapping is confirmed in ConfirmMapping.
	s.pendingEpoch++
	s.pending = &apitypes.PendingUpload{File: data, Filename: "upload.zip", IsZip: true}
	s.mu.Unlock()

	logbuf.Logger().Info("zip upload needs mapping", "source", "import", "headers", len(header), "rows", len(dataRows))

	preview := [][]string{header}
	for i, row := range dataRows {
		if i >= 3 {
			break
		}
		preview = append(preview, row)
	}
	return &org.UploadResponse{
		Status:  org.UploadNeedsMapping,
		Headers: header,
		Mapping: mapping,
		Preview: preview,
	}, nil
}
