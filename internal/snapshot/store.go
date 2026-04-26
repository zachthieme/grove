package snapshot

import (
	"fmt"
	"maps"
)

// Store abstracts persistence for snapshot data.
type Store interface {
	Read() (map[string]Data, error)
	Write(snapshots map[string]Data) error
	Delete() error
}

// FileStore implements Store using the filesystem (~/.grove/snapshots.json).
type FileStore struct{}

// NewFileStore returns a filesystem-backed Store.
func NewFileStore() FileStore { return FileStore{} }

func (FileStore) Read() (map[string]Data, error) { return ReadSnapshots() }
func (FileStore) Write(s map[string]Data) error  { return WriteSnapshots(s) }
func (FileStore) Delete() error                  { return DeleteSnapshotStore() }

// MemoryStore implements Store in memory (for tests).
type MemoryStore struct {
	data      map[string]Data
	writeErr  error
	readErr   error
	deleteErr error
}

// NewMemoryStore returns an in-memory Store for tests.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{}
}

func (m *MemoryStore) Read() (map[string]Data, error) {
	if m.readErr != nil {
		return nil, m.readErr
	}
	if m.data == nil {
		return nil, nil
	}
	cp := make(map[string]Data, len(m.data))
	maps.Copy(cp, m.data)
	return cp, nil
}

func (m *MemoryStore) Write(s map[string]Data) error {
	if m.writeErr != nil {
		return m.writeErr
	}
	m.data = make(map[string]Data, len(s))
	maps.Copy(m.data, s)
	return nil
}

func (m *MemoryStore) Delete() error {
	if m.deleteErr != nil {
		return m.deleteErr
	}
	m.data = nil
	return nil
}

// SetWriteErr configures the store to return an error on Write calls.
func (m *MemoryStore) SetWriteErr(msg string) {
	if msg == "" {
		m.writeErr = nil
	} else {
		m.writeErr = fmt.Errorf("%s", msg)
	}
}

// SetReadErr configures the store to return an error on Read calls.
func (m *MemoryStore) SetReadErr(msg string) {
	if msg == "" {
		m.readErr = nil
	} else {
		m.readErr = fmt.Errorf("%s", msg)
	}
}

// SetDeleteErr configures the store to return an error on Delete calls.
func (m *MemoryStore) SetDeleteErr(msg string) {
	if msg == "" {
		m.deleteErr = nil
	} else {
		m.deleteErr = fmt.Errorf("%s", msg)
	}
}
