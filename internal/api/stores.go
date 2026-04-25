package api

import (
	"fmt"
	"maps"
)

// SnapshotStore abstracts persistence for snapshot data.
type SnapshotStore interface {
	Read() (map[string]snapshotData, error)
	Write(snapshots map[string]snapshotData) error
	Delete() error
}

// FileSnapshotStore implements SnapshotStore using the filesystem (~/.grove/snapshots.json).
type FileSnapshotStore struct{}

func (FileSnapshotStore) Read() (map[string]snapshotData, error) { return ReadSnapshots() }
func (FileSnapshotStore) Write(s map[string]snapshotData) error  { return WriteSnapshots(s) }
func (FileSnapshotStore) Delete() error                          { return DeleteSnapshotStore() }

// MemorySnapshotStore implements SnapshotStore in memory (for tests).
type MemorySnapshotStore struct {
	data      map[string]snapshotData
	writeErr  error
	readErr   error
	deleteErr error
}

func NewMemorySnapshotStore() *MemorySnapshotStore {
	return &MemorySnapshotStore{}
}

func (m *MemorySnapshotStore) Read() (map[string]snapshotData, error) {
	if m.readErr != nil {
		return nil, m.readErr
	}
	if m.data == nil {
		return nil, nil
	}
	cp := make(map[string]snapshotData, len(m.data))
	maps.Copy(cp, m.data)
	return cp, nil
}

func (m *MemorySnapshotStore) Write(s map[string]snapshotData) error {
	if m.writeErr != nil {
		return m.writeErr
	}
	m.data = make(map[string]snapshotData, len(s))
	maps.Copy(m.data, s)
	return nil
}

func (m *MemorySnapshotStore) Delete() error {
	if m.deleteErr != nil {
		return m.deleteErr
	}
	m.data = nil
	return nil
}

// SetWriteErr configures the store to return an error on Write calls.
func (m *MemorySnapshotStore) SetWriteErr(msg string) {
	if msg == "" {
		m.writeErr = nil
	} else {
		m.writeErr = fmt.Errorf("%s", msg)
	}
}

// SetReadErr configures the store to return an error on Read calls.
func (m *MemorySnapshotStore) SetReadErr(msg string) {
	if msg == "" {
		m.readErr = nil
	} else {
		m.readErr = fmt.Errorf("%s", msg)
	}
}

// SetDeleteErr configures the store to return an error on Delete calls.
func (m *MemorySnapshotStore) SetDeleteErr(msg string) {
	if msg == "" {
		m.deleteErr = nil
	} else {
		m.deleteErr = fmt.Errorf("%s", msg)
	}
}
