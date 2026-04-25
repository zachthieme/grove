package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"time"

	"github.com/zachthieme/grove/internal/apitypes"
)

func snapshotStorePath() (string, error) {
	dir, err := groveDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "snapshots.json"), nil
}

type persistedSnapshot struct {
	People    []apitypes.OrgNode `json:"people"`
	Pods      []apitypes.Pod     `json:"pods,omitempty"`
	Settings  apitypes.Settings  `json:"settings,omitempty"`
	Timestamp time.Time          `json:"timestamp"`
}

// WriteSnapshots persists all snapshots to disk.
func WriteSnapshots(snapshots map[string]snapshotData) error {
	path, err := snapshotStorePath()
	if err != nil {
		return err
	}
	persisted := make(map[string]persistedSnapshot, len(snapshots))
	for name, snap := range snapshots {
		persisted[name] = persistedSnapshot(snap)
	}
	data, err := json.Marshal(persisted)
	if err != nil {
		return fmt.Errorf("marshaling snapshots: %w", err)
	}
	return atomicWriteFile(path, data, 0644)
}

// ReadSnapshots loads snapshots from disk. Returns nil if file doesn't exist.
func ReadSnapshots() (map[string]snapshotData, error) {
	path, err := snapshotStorePath()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, nil
		}
		return nil, fmt.Errorf("reading snapshots: %w", err)
	}
	var persisted map[string]persistedSnapshot
	if err := json.Unmarshal(data, &persisted); err != nil {
		return nil, fmt.Errorf("parsing snapshots: %w", err)
	}
	result := make(map[string]snapshotData, len(persisted))
	for name, ps := range persisted {
		result[name] = snapshotData(ps)
	}
	return result, nil
}

// atomicWriteFile writes data to path atomically by writing to a temp file
// in the same directory then renaming it, preventing corruption on crash mid-write.
func atomicWriteFile(path string, data []byte, perm os.FileMode) error {
	dir := filepath.Dir(path)
	f, err := os.CreateTemp(dir, filepath.Base(path)+".tmp")
	if err != nil {
		return fmt.Errorf("creating temp file: %w", err)
	}
	tmpPath := f.Name()
	if _, err := f.Write(data); err != nil {
		_ = f.Close()
		_ = os.Remove(tmpPath)
		return fmt.Errorf("writing temp file: %w", err)
	}
	if err := f.Sync(); err != nil {
		_ = f.Close()
		_ = os.Remove(tmpPath)
		return fmt.Errorf("syncing temp file: %w", err)
	}
	if err := f.Close(); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("closing temp file: %w", err)
	}
	if err := os.Chmod(tmpPath, perm); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("setting file permissions: %w", err)
	}
	if err := os.Rename(tmpPath, path); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("renaming temp file: %w", err)
	}
	return nil
}

// DeleteSnapshotStore removes the snapshots file.
func DeleteSnapshotStore() error {
	path, err := snapshotStorePath()
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	return nil
}
