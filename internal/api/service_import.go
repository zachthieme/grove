package api

import (
	"context"
	"fmt"

	"github.com/zachthieme/grove/internal/parser"
)

func (s *OrgService) Upload(ctx context.Context, filename string, data []byte) (*UploadResponse, error) {
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
		var persistWarn string
		if err := s.snaps.DeleteStore(); err != nil {
			persistWarn = fmt.Sprintf("snapshot cleanup failed: %v", err)
		}
		s.resetState(people, people, nil)
		s.settings = Settings{DisciplineOrder: deriveDisciplineOrder(s.working)}
		return &UploadResponse{
			Status:             UploadReady,
			OrgData:            &OrgData{Original: deepCopyPeople(s.original), Working: deepCopyPeople(s.working), Pods: CopyPods(s.podMgr.GetPods()), Settings: &s.settings},
			PersistenceWarning: persistWarn,
		}, nil
	}

	// Required field (name) not matched with high confidence — hold as pending.
	s.pendingEpoch++
	s.pending = &PendingUpload{File: data, Filename: filename}
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

func (s *OrgService) ConfirmMapping(ctx context.Context, mapping map[string]string) (*OrgData, error) {
	// Phase 1: grab and clear pending data under lock.
	// epoch captures the expected pendingEpoch value for a single un-superseded
	// upload: pendingBase+1. If pendingEpoch has advanced past that (concurrent or
	// sequential second upload), Phase 3 will detect the mismatch.
	s.mu.Lock()
	pending := s.pending
	epoch := s.pendingBase + 1
	s.pending = nil
	s.mu.Unlock()

	if pending == nil {
		return nil, errValidation("no pending file to confirm")
	}

	// Check for cancellation before expensive parsing
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	// Phase 2: parse entirely outside the lock (CPU work, no state mutation)
	if pending.IsZip {
		return s.confirmMappingZip(pending, mapping, epoch)
	}
	return s.confirmMappingCSV(pending, mapping, epoch)
}

// confirmMappingCSV handles the non-zip ConfirmMapping path.
// Called without holding s.mu.
func (s *OrgService) confirmMappingCSV(pending *PendingUpload, mapping map[string]string, epoch uint64) (*OrgData, error) {
	header, dataRows, err := extractRows(pending.Filename, pending.File)
	if err != nil {
		return nil, errValidation("parsing pending file: %v", err)
	}
	org, err := parser.BuildPeopleWithMapping(header, dataRows, mapping)
	if err != nil {
		return nil, errValidation("building org: %v", err)
	}
	people := ConvertOrg(org)

	// Phase 3: commit state under lock — check epoch hasn't changed
	s.mu.Lock()
	if s.pendingEpoch != epoch {
		s.mu.Unlock()
		return nil, errConflict("upload superseded by a newer upload")
	}
	s.pendingBase = s.pendingEpoch
	s.resetState(people, people, nil)
	s.settings = Settings{DisciplineOrder: deriveDisciplineOrder(s.working)}
	resp := &OrgData{Original: deepCopyPeople(s.original), Working: deepCopyPeople(s.working), Pods: CopyPods(s.podMgr.GetPods()), Settings: &s.settings}
	s.mu.Unlock()

	// Phase 4: disk I/O outside lock
	var persistWarn string
	if err := s.snaps.DeleteStore(); err != nil {
		persistWarn = fmt.Sprintf("snapshot cleanup failed: %v", err)
	}
	resp.PersistenceWarning = persistWarn
	return resp, nil
}

// confirmMappingZip handles the zip ConfirmMapping path.
// Called without holding s.mu.
func (s *OrgService) confirmMappingZip(pending *PendingUpload, mapping map[string]string, epoch uint64) (*OrgData, error) {
	entries, podsSidecar, settingsSidecar, fileWarns, err := parseZipFileList(pending.File)
	if err != nil {
		return nil, errValidation("parsing pending zip: %v", err)
	}
	orig, work, snaps, parseWarns, err := parseZipEntries(entries, mapping)
	if err != nil {
		return nil, errValidation("parsing pending zip: %v", err)
	}

	// Commit state under lock — check epoch hasn't changed
	s.mu.Lock()
	if s.pendingEpoch != epoch {
		s.mu.Unlock()
		return nil, errConflict("upload superseded by a newer upload")
	}
	s.pendingBase = s.pendingEpoch
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
	// s.pending already cleared in Phase 1
	resp := &OrgData{Original: deepCopyPeople(s.original), Working: deepCopyPeople(s.working), Pods: CopyPods(s.podMgr.GetPods()), Settings: &s.settings}
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
