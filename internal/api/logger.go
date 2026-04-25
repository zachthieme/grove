package api

import (
	"io"
	"log/slog"
	"os"
	"sync/atomic"
)

// loggerPtr holds the package-wide *slog.Logger. Reads through Logger() are
// lock-free; cmd/serve.go installs the configured logger once at startup via
// SetLogger so tests retain the default stderr text logger.
var loggerPtr atomic.Pointer[slog.Logger]

func init() {
	loggerPtr.Store(slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo})))
}

// Logger returns the active package logger. Always invoke at use site so a
// later SetLogger call takes effect — never cache the result.
func Logger() *slog.Logger { return loggerPtr.Load() }

// SetLogger installs the package logger. No-op if l is nil.
func SetLogger(l *slog.Logger) {
	if l == nil {
		return
	}
	loggerPtr.Store(l)
}

// SlogWriter adapts slog into an io.Writer so stdlib `log` output can be
// rerouted through the structured logger. Each Write becomes one Warn record;
// the stdlib log package already trims trailing newlines so messages stay clean.
type SlogWriter struct {
	Logger *slog.Logger
	Level  slog.Level
}

func (w SlogWriter) Write(p []byte) (int, error) {
	msg := string(p)
	// stdlib log appends a single trailing newline; strip it so the message
	// reads naturally in JSON viewers and stderr text alike.
	for len(msg) > 0 && (msg[len(msg)-1] == '\n' || msg[len(msg)-1] == '\r') {
		msg = msg[:len(msg)-1]
	}
	logger := w.Logger
	if logger == nil {
		logger = Logger()
	}
	logger.Log(nil, w.Level, msg, "source", "stdlib")
	return len(p), nil
}

// Discard returns an io.Writer that drops everything. Convenience for tests
// that want to silence stdlib log without affecting slog.
func Discard() io.Writer { return io.Discard }
