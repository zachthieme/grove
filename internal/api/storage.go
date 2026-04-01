package api

import (
	"fmt"
	"os"
	"path/filepath"
)

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
