package autosave

import "fmt"

// AutosaveStore abstracts persistence for autosave data.
type AutosaveStore interface {
	Read() (*AutosaveData, error)
	Write(data AutosaveData) error
	Delete() error
}

// FileAutosaveStore implements AutosaveStore using the filesystem (~/.grove/autosave.json).
type FileAutosaveStore struct{}

// NewFileStore returns a filesystem-backed AutosaveStore.
func NewFileStore() FileAutosaveStore { return FileAutosaveStore{} }

func (FileAutosaveStore) Read() (*AutosaveData, error) { return ReadAutosave() }
func (FileAutosaveStore) Write(d AutosaveData) error   { return WriteAutosave(d) }
func (FileAutosaveStore) Delete() error                { return DeleteAutosave() }

// MemoryAutosaveStore implements AutosaveStore in memory (for tests).
type MemoryAutosaveStore struct {
	data      *AutosaveData
	writeErr  error
	readErr   error
	deleteErr error
}

// NewMemoryStore returns an in-memory AutosaveStore for tests.
func NewMemoryStore() *MemoryAutosaveStore {
	return &MemoryAutosaveStore{}
}

func (m *MemoryAutosaveStore) Read() (*AutosaveData, error) {
	if m.readErr != nil {
		return nil, m.readErr
	}
	return m.data, nil
}

func (m *MemoryAutosaveStore) Write(d AutosaveData) error {
	if m.writeErr != nil {
		return m.writeErr
	}
	m.data = &d
	return nil
}

func (m *MemoryAutosaveStore) Delete() error {
	if m.deleteErr != nil {
		return m.deleteErr
	}
	m.data = nil
	return nil
}

// SetWriteErr configures the store to return an error on Write calls.
func (m *MemoryAutosaveStore) SetWriteErr(msg string) {
	if msg == "" {
		m.writeErr = nil
	} else {
		m.writeErr = fmt.Errorf("%s", msg)
	}
}

// SetReadErr configures the store to return an error on Read calls.
func (m *MemoryAutosaveStore) SetReadErr(msg string) {
	if msg == "" {
		m.readErr = nil
	} else {
		m.readErr = fmt.Errorf("%s", msg)
	}
}

// SetDeleteErr configures the store to return an error on Delete calls.
func (m *MemoryAutosaveStore) SetDeleteErr(msg string) {
	if msg == "" {
		m.deleteErr = nil
	} else {
		m.deleteErr = fmt.Errorf("%s", msg)
	}
}
