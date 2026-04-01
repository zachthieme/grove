package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
)

func autosavePath() (string, error) {
	dir, err := groveDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "autosave.json"), nil
}

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
