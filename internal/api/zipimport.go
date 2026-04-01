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

	"github.com/zachthieme/grove/internal/model"
	"github.com/zachthieme/grove/internal/parser"
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
		return nil, nil, nil, nil, fmt.Errorf("opening zip: %w", err)
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
			return nil, nil, nil, nil, fmt.Errorf("ZIP contents too large (max %d MB)", maxDecompressedSize>>20)
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
		return nil, nil, nil, nil, fmt.Errorf("ZIP contains no CSV or XLSX files")
	}

	sort.SliceStable(entries, func(i, j int) bool {
		if entries[i].prefix != entries[j].prefix {
			return entries[i].prefix < entries[j].prefix
		}
		return entries[i].filename < entries[j].filename
	})

	return entries, podsSidecarData, settingsSidecarData, warnings, nil
}

type podSidecarEntry struct {
	podName     string
	managerName string
	team        string
	publicNote  string
	privateNote string
}

func parsePodsSidecar(data []byte) []podSidecarEntry {
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
	var entries []podSidecarEntry
	for _, row := range records[1:] {
		entries = append(entries, podSidecarEntry{
			podName:     get(row, "pod name"),
			managerName: get(row, "manager"),
			team:        get(row, "team"),
			publicNote:  get(row, "public note"),
			privateNote: get(row, "private note"),
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

func applyPodSidecarNotes(pods []Pod, sidecar []podSidecarEntry, idToName map[string]string) {
	for i := range pods {
		mgrName := idToName[pods[i].ManagerId]
		for _, entry := range sidecar {
			if entry.podName == pods[i].Name && entry.managerName == mgrName {
				pods[i].PublicNote = entry.publicNote
				pods[i].PrivateNote = entry.privateNote
				break
			}
		}
	}
}

func parseZipEntries(entries []zipEntry, mapping map[string]string) (original []Person, working []Person, snaps map[string]snapshotData, warnings []string, err error) {
	snaps = make(map[string]snapshotData)

	// Parse raw orgs from all entries first.
	type parsedEntry struct {
		entry zipEntry
		org   *model.Org
	}
	var parsed []parsedEntry

	for _, e := range entries {
		header, dataRows, err := extractRows(e.filename, e.data)
		if err != nil {
			warnings = append(warnings, fmt.Sprintf("skipped %s: %v", e.filename, err))
			continue
		}

		org, err := parser.BuildPeopleWithMapping(header, dataRows, mapping)
		if err != nil {
			warnings = append(warnings, fmt.Sprintf("skipped %s: %v", e.filename, err))
			continue
		}

		parsed = append(parsed, parsedEntry{entry: e, org: org})
	}

	if len(parsed) == 0 {
		return nil, nil, nil, nil, fmt.Errorf("no files in ZIP could be parsed")
	}

	if len(parsed) == 1 {
		people := ConvertOrg(parsed[0].org)
		return people, deepCopyPeople(people), nil, warnings, nil
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
	original = ConvertOrg(parsed[originalIdx].org)
	idMap := BuildIDMap(original)

	working = ConvertOrgWithIDMap(parsed[workingIdx].org, idMap)

	now := time.Now()
	for i, p := range parsed {
		if i == originalIdx || i == workingIdx {
			continue
		}
		snaps[p.entry.name] = snapshotData{
			People:    ConvertOrgWithIDMap(p.org, idMap),
			Timestamp: now.Add(time.Duration(i) * time.Millisecond),
		}
	}

	return original, working, snaps, warnings, nil
}

func (s *OrgService) UploadZip(ctx context.Context, data []byte) (*UploadResponse, error) {
	// Parse before acquiring lock — no state mutation if parsing fails
	entries, podsSidecar, settingsSidecar, fileWarns, err := parseZipFileList(data)
	if err != nil {
		return nil, err
	}

	// Extract and infer before mutating state — if anything fails, service state is unchanged
	first := entries[0]
	header, dataRows, err := extractRows(first.filename, first.data)
	if err != nil {
		return nil, fmt.Errorf("parsing first file: %w", err)
	}

	mapping := InferMapping(header)

	s.mu.Lock()

	if AllRequiredHigh(mapping) {
		simpleMapping := make(map[string]string, len(mapping))
		for field, mc := range mapping {
			simpleMapping[field] = mc.Column
		}

		orig, work, snaps, parseWarns, err := parseZipEntries(entries, simpleMapping)
		if err != nil {
			s.mu.Unlock()
			return nil, fmt.Errorf("parsing zip: %w", err)
		}

		// All parsing succeeded — now commit state atomically
		s.pending = nil
		s.resetState(orig, work, snaps)

		if podsSidecar != nil {
			sidecarEntries := parsePodsSidecar(podsSidecar)
			if len(sidecarEntries) > 0 {
				idToName := buildIDToName(s.working)
				s.podMgr.ApplyNotes(sidecarEntries, idToName)
			}
		}

		s.settings = Settings{DisciplineOrder: deriveDisciplineOrder(s.working)}
		if settingsSidecar != nil {
			if order := parseSettingsSidecar(settingsSidecar); len(order) > 0 {
				s.settings = Settings{DisciplineOrder: order}
			}
		}

		snapCopy := s.snaps.CopyAll()
		resp := &UploadResponse{
			Status:    UploadReady,
			OrgData:   &OrgData{Original: deepCopyPeople(s.original), Working: deepCopyPeople(s.working), Pods: CopyPods(s.podMgr.GetPods()), Settings: &s.settings},
			Snapshots: s.ListSnapshotsUnlocked(),
		}
		s.mu.Unlock()

		// Disk I/O outside the lock
		var diskWarns []string
		if err := s.snaps.DeleteStore(); err != nil {
			diskWarns = append(diskWarns, fmt.Sprintf("snapshot cleanup failed: %v", err))
		}
		if err := s.snaps.PersistCopy(snapCopy); err != nil {
			diskWarns = append(diskWarns, fmt.Sprintf("snapshot persist error: %v", err))
		}
		resp.PersistenceWarning = mergeWarnings("", diskWarns, fileWarns, parseWarns)

		return resp, nil
	}

	// Needs mapping — store as pending.
	// Don't clear snapshots yet — user may cancel the mapping dialog.
	// Snapshots are cleared when the mapping is confirmed in ConfirmMapping.
	s.pendingEpoch++
	s.pending = &PendingUpload{File: data, Filename: "upload.zip", IsZip: true}
	s.mu.Unlock()

	preview := [][]string{header}
	for i, row := range dataRows {
		if i >= 3 {
			break
		}
		preview = append(preview, row)
	}
	return &UploadResponse{
		Status:  UploadNeedsMapping,
		Headers: header,
		Mapping: mapping,
		Preview: preview,
	}, nil
}
