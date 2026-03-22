package api

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// autosaveDir overrides the default ~/.grove directory. Only set in tests.
var autosaveDir = ""

func autosavePath() string {
	dir := autosaveDir
	if dir == "" {
		home, _ := os.UserHomeDir()
		dir = filepath.Join(home, ".grove")
	}
	return filepath.Join(dir, "autosave.json")
}

func WriteAutosave(data AutosaveData) error {
	path := autosavePath()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	b, err := json.Marshal(data)
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0644)
}

func ReadAutosave() (*AutosaveData, error) {
	b, err := os.ReadFile(autosavePath())
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var data AutosaveData
	if err := json.Unmarshal(b, &data); err != nil {
		return nil, err
	}
	return &data, nil
}

func DeleteAutosave() error {
	err := os.Remove(autosavePath())
	if os.IsNotExist(err) {
		return nil
	}
	return err
}
