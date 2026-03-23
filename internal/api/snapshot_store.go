package api

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// snapshotStoreDir can be overridden in tests (same pattern as autosave.go).
var snapshotStoreDir = ""

func snapshotStorePath() (string, error) {
	dir := snapshotStoreDir
	if dir == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("getting home dir: %w", err)
		}
		dir = filepath.Join(home, ".grove")
	}
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", fmt.Errorf("creating dir: %w", err)
	}
	return filepath.Join(dir, "snapshots.json"), nil
}

type persistedSnapshot struct {
	People    []Person  `json:"people"`
	Timestamp time.Time `json:"timestamp"`
}

// WriteSnapshots persists all snapshots to disk.
func WriteSnapshots(snapshots map[string]snapshotData) error {
	path, err := snapshotStorePath()
	if err != nil {
		return err
	}
	persisted := make(map[string]persistedSnapshot, len(snapshots))
	for name, snap := range snapshots {
		persisted[name] = persistedSnapshot{
			People:    snap.People,
			Timestamp: snap.Timestamp,
		}
	}
	data, err := json.Marshal(persisted)
	if err != nil {
		return fmt.Errorf("marshaling snapshots: %w", err)
	}
	return os.WriteFile(path, data, 0644)
}

// ReadSnapshots loads snapshots from disk. Returns nil if file doesn't exist.
func ReadSnapshots() (map[string]snapshotData, error) {
	path, err := snapshotStorePath()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
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
		result[name] = snapshotData{
			People:    ps.People,
			Timestamp: ps.Timestamp,
		}
	}
	return result, nil
}

// DeleteSnapshotStore removes the snapshots file.
func DeleteSnapshotStore() error {
	path, err := snapshotStorePath()
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}
