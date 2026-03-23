package api

import (
	"archive/zip"
	"bytes"
	"fmt"
	"io"
	"log"
	"math"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

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

func parseZipFileList(data []byte) ([]zipEntry, error) {
	r, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, fmt.Errorf("opening zip: %w", err)
	}

	var entries []zipEntry
	var totalSize int64

	for _, f := range r.File {
		base := filepath.Base(f.Name)
		ext := strings.ToLower(filepath.Ext(base))
		if ext != ".csv" && ext != ".xlsx" {
			continue
		}

		rc, err := f.Open()
		if err != nil {
			log.Printf("skipping zip entry %s: %v", f.Name, err)
			continue
		}
		content, err := io.ReadAll(io.LimitReader(rc, maxDecompressedSize-totalSize+1))
		_ = rc.Close()
		if err != nil {
			log.Printf("skipping zip entry %s: %v", f.Name, err)
			continue
		}
		totalSize += int64(len(content))
		if totalSize > maxDecompressedSize {
			return nil, fmt.Errorf("ZIP contents too large (max %d MB)", maxDecompressedSize>>20)
		}

		nameNoExt := strings.TrimSuffix(base, filepath.Ext(base))
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
		return nil, fmt.Errorf("ZIP contains no CSV or XLSX files")
	}

	sort.SliceStable(entries, func(i, j int) bool {
		if entries[i].prefix != entries[j].prefix {
			return entries[i].prefix < entries[j].prefix
		}
		return entries[i].filename < entries[j].filename
	})

	return entries, nil
}

func parseZipEntries(entries []zipEntry, mapping map[string]string) (original []Person, working []Person, snaps map[string]snapshotData, err error) {
	snaps = make(map[string]snapshotData)
	var parsed []struct {
		entry  zipEntry
		people []Person
	}

	for _, e := range entries {
		header, dataRows, err := extractRows(e.filename, e.data)
		if err != nil {
			log.Printf("skipping zip entry %s: %v", e.filename, err)
			continue
		}

		org, err := parser.BuildPeopleWithMapping(header, dataRows, mapping)
		if err != nil {
			log.Printf("skipping zip entry %s: %v", e.filename, err)
			continue
		}

		people := ConvertOrg(org)
		parsed = append(parsed, struct {
			entry  zipEntry
			people []Person
		}{entry: e, people: people})
	}

	if len(parsed) == 0 {
		return nil, nil, nil, fmt.Errorf("no files in ZIP could be parsed")
	}

	if len(parsed) == 1 {
		people := parsed[0].people
		return people, deepCopyPeople(people), nil, nil
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

	original = parsed[originalIdx].people
	working = parsed[workingIdx].people

	now := time.Now()
	for i, p := range parsed {
		if i == originalIdx || i == workingIdx {
			continue
		}
		snaps[p.entry.name] = snapshotData{
			People:    p.people,
			Timestamp: now.Add(time.Duration(i) * time.Millisecond),
		}
	}

	return original, working, snaps, nil
}

func (s *OrgService) UploadZip(data []byte) (*UploadResponse, error) {
	// Parse before acquiring lock — no state mutation if parsing fails
	entries, err := parseZipFileList(data)
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
	defer s.mu.Unlock()

	if AllRequiredHigh(mapping) {
		simpleMapping := make(map[string]string, len(mapping))
		for field, mc := range mapping {
			simpleMapping[field] = mc.Column
		}

		orig, work, snaps, err := parseZipEntries(entries, simpleMapping)
		if err != nil {
			return nil, fmt.Errorf("parsing zip: %w", err)
		}

		// All parsing succeeded — now commit state atomically
		s.pendingFile = nil
		s.pendingFilename = ""
		s.pendingIsZip = false
		s.original = orig
		s.working = deepCopyPeople(work)
		s.recycled = nil
		s.snapshots = snaps
		_ = DeleteSnapshotStore()
		if err := WriteSnapshots(s.snapshots); err != nil {
			log.Printf("snapshot persist error: %v", err)
		}

		return &UploadResponse{
			Status:    "ready",
			OrgData:   &OrgData{Original: deepCopyPeople(s.original), Working: deepCopyPeople(s.working)},
			Snapshots: s.ListSnapshotsUnlocked(),
		}, nil
	}

	// Needs mapping — store as pending, clear old snapshots
	s.snapshots = nil
	_ = DeleteSnapshotStore()
	s.pendingFile = data
	s.pendingFilename = "upload.zip"
	s.pendingIsZip = true
	preview := [][]string{header}
	for i, row := range dataRows {
		if i >= 3 {
			break
		}
		preview = append(preview, row)
	}
	return &UploadResponse{
		Status:  "needs_mapping",
		Headers: header,
		Mapping: mapping,
		Preview: preview,
	}, nil
}
