package autosave

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"

	"github.com/zachthieme/grove/internal/apitypes"
)

// AutosaveData is the on-disk + over-the-wire shape of the debounced autosave
// payload. Mirrors the frontend AutosaveData TypeScript interface.
type AutosaveData struct {
	Original     []apitypes.OrgNode `json:"original"`
	Working      []apitypes.OrgNode `json:"working"`
	Recycled     []apitypes.OrgNode `json:"recycled"`
	Pods         []apitypes.Pod     `json:"pods,omitempty"`
	OriginalPods []apitypes.Pod     `json:"originalPods,omitempty"`
	Settings     *apitypes.Settings `json:"settings,omitempty"`
	SnapshotName string             `json:"snapshotName"`
	Timestamp    string             `json:"timestamp"`
}

// storageDir can be overridden in tests to redirect file I/O.
var storageDir = ""

// groveDir returns the ~/.grove directory path, creating it if needed.
func groveDir() (string, error) {
	dir := storageDir
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
	return dir, nil
}

func autosavePath() (string, error) {
	dir, err := groveDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "autosave.json"), nil
}

// WriteAutosave persists the autosave payload to ~/.grove/autosave.json.
func WriteAutosave(data AutosaveData) error {
	path, err := autosavePath()
	if err != nil {
		return err
	}
	b, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("marshaling autosave: %w", err)
	}
	return atomicWriteFile(path, b, 0644)
}

// ReadAutosave loads the autosave payload, or returns (nil, nil) if missing.
func ReadAutosave() (*AutosaveData, error) {
	path, err := autosavePath()
	if err != nil {
		return nil, err
	}
	b, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, nil
		}
		return nil, fmt.Errorf("reading autosave: %w", err)
	}
	var data AutosaveData
	if err := json.Unmarshal(b, &data); err != nil {
		return nil, fmt.Errorf("parsing autosave: %w", err)
	}
	return &data, nil
}

// DeleteAutosave removes the autosave file. Missing file is not an error.
func DeleteAutosave() error {
	path, err := autosavePath()
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	return nil
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
