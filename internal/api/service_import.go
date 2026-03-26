package api

import (
	"fmt"
	"maps"

	"github.com/zachthieme/grove/internal/parser"
)

func (s *OrgService) Upload(filename string, data []byte) (*UploadResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.pending = nil

	header, dataRows, err := extractRows(filename, data)
	if err != nil {
		return nil, fmt.Errorf("parsing file: %w", err)
	}

	mapping := InferMapping(header)
	if AllRequiredHigh(mapping) {
		simpleMapping := make(map[string]string, len(mapping))
		for field, mc := range mapping {
			simpleMapping[field] = mc.Column
		}
		org, err := parser.BuildPeopleWithMapping(header, dataRows, simpleMapping)
		if err != nil {
			return nil, fmt.Errorf("building org: %w", err)
		}
		people := ConvertOrg(org)
		s.snapshots = nil
		var persistWarn string
		if err := s.snapshotStore.Delete(); err != nil {
			persistWarn = fmt.Sprintf("snapshot cleanup failed: %v", err)
		}
		s.original = people
		s.working = deepCopyPeople(people)
		s.recycled = nil
		s.pods = SeedPods(s.working)
		s.originalPods = CopyPods(s.pods)
		// Seed original people's pod fields too
		_ = SeedPods(s.original)
		s.settings = Settings{DisciplineOrder: deriveDisciplineOrder(s.working)}
		return &UploadResponse{
			Status:             "ready",
			OrgData:            &OrgData{Original: deepCopyPeople(s.original), Working: deepCopyPeople(s.working), Pods: CopyPods(s.pods), Settings: &s.settings},
			PersistenceWarning: persistWarn,
		}, nil
	}

	// Required field (name) not matched with high confidence — hold as pending.
	// Don't clear snapshots yet — user may cancel the mapping dialog.
	// Snapshots are cleared when the mapping is confirmed in ConfirmMapping.
	s.pending = &PendingUpload{File: data, Filename: filename}
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

func (s *OrgService) ConfirmMapping(mapping map[string]string) (*OrgData, error) {
	s.mu.Lock()
	if s.pending == nil {
		s.mu.Unlock()
		return nil, fmt.Errorf("no pending file to confirm")
	}

	if s.pending.IsZip {
		entries, podsSidecar, settingsSidecar, err := parseZipFileList(s.pending.File)
		if err != nil {
			s.mu.Unlock()
			return nil, fmt.Errorf("parsing pending zip: %w", err)
		}
		orig, work, snaps, err := parseZipEntries(entries, mapping)
		if err != nil {
			s.mu.Unlock()
			return nil, fmt.Errorf("parsing pending zip: %w", err)
		}
		s.original = orig
		s.working = deepCopyPeople(work)
		s.recycled = nil
		s.snapshots = snaps
		s.pods = SeedPods(s.working)
		s.originalPods = CopyPods(s.pods)
		_ = SeedPods(s.original)

		if podsSidecar != nil {
			sidecarEntries := parsePodsSidecar(podsSidecar)
			if len(sidecarEntries) > 0 {
				idToName := buildIDToName(s.working)
				applyPodSidecarNotes(s.pods, sidecarEntries, idToName)
				applyPodSidecarNotes(s.originalPods, sidecarEntries, idToName)
			}
		}

		s.settings = Settings{DisciplineOrder: deriveDisciplineOrder(s.working)}
		if settingsSidecar != nil {
			if order := parseSettingsSidecar(settingsSidecar); len(order) > 0 {
				s.settings = Settings{DisciplineOrder: order}
			}
		}

		snapCopy := make(map[string]snapshotData, len(s.snapshots))
		maps.Copy(snapCopy, s.snapshots)
		s.pending = nil
		resp := &OrgData{Original: deepCopyPeople(s.original), Working: deepCopyPeople(s.working), Pods: CopyPods(s.pods), Settings: &s.settings}
		s.mu.Unlock()

		// Disk I/O outside the lock
		var persistWarn string
		if err := s.snapshotStore.Delete(); err != nil {
			persistWarn = fmt.Sprintf("snapshot cleanup failed: %v", err)
		}
		if err := s.snapshotStore.Write(snapCopy); err != nil {
			msg := fmt.Sprintf("snapshot persist error: %v", err)
			if persistWarn != "" {
				persistWarn += "; " + msg
			} else {
				persistWarn = msg
			}
		}
		resp.PersistenceWarning = persistWarn
		return resp, nil
	}

	header, dataRows, err := extractRows(s.pending.Filename, s.pending.File)
	if err != nil {
		s.mu.Unlock()
		return nil, fmt.Errorf("parsing pending file: %w", err)
	}

	org, err := parser.BuildPeopleWithMapping(header, dataRows, mapping)
	if err != nil {
		s.mu.Unlock()
		return nil, fmt.Errorf("building org: %w", err)
	}

	people := ConvertOrg(org)
	s.original = people
	s.working = deepCopyPeople(people)
	s.recycled = nil
	s.snapshots = nil
	s.pods = SeedPods(s.working)
	s.originalPods = CopyPods(s.pods)
	_ = SeedPods(s.original)
	s.settings = Settings{DisciplineOrder: deriveDisciplineOrder(s.working)}
	s.pending = nil
	resp := &OrgData{Original: deepCopyPeople(s.original), Working: deepCopyPeople(s.working), Pods: CopyPods(s.pods), Settings: &s.settings}
	s.mu.Unlock()

	// Disk I/O outside the lock
	var persistWarn string
	if err := s.snapshotStore.Delete(); err != nil {
		persistWarn = fmt.Sprintf("snapshot cleanup failed: %v", err)
	}
	resp.PersistenceWarning = persistWarn
	return resp, nil
}
