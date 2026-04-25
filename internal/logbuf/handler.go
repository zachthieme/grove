package logbuf

import (
	"context"
	"encoding/json"
	"log/slog"
)

// BufferHandler is a slog.Handler that converts each Record into a LogEntry
// and appends it to a LogBuffer. Lets app-level slog calls show up in the
// in-app log viewer alongside HTTP request entries.
//
// Reserved attribute keys map onto LogEntry fields:
//
//	source         -> Source        (default "app")
//	correlationId  -> CorrelationID
//	method         -> Method
//	path           -> Path
//	status         -> ResponseStatus
//	durationMs     -> DurationMs
//	err / error    -> Error
//
// Anything else is collected into the Attrs JSON blob.
type BufferHandler struct {
	buf   *LogBuffer
	level slog.Leveler
	attrs []slog.Attr
}

func NewBufferHandler(buf *LogBuffer, level slog.Leveler) *BufferHandler {
	if level == nil {
		level = slog.LevelInfo
	}
	return &BufferHandler{buf: buf, level: level}
}

func (h *BufferHandler) Enabled(_ context.Context, level slog.Level) bool {
	return level >= h.level.Level()
}

func (h *BufferHandler) Handle(_ context.Context, r slog.Record) error {
	entry := LogEntry{
		Timestamp: r.Time,
		Level:     r.Level.String(),
		Message:   r.Message,
		Source:    "app",
	}
	extra := map[string]any{}
	apply := func(a slog.Attr) bool {
		switch a.Key {
		case "source":
			entry.Source = a.Value.String()
		case "correlationId":
			entry.CorrelationID = a.Value.String()
		case "method":
			entry.Method = a.Value.String()
		case "path":
			entry.Path = a.Value.String()
		case "status":
			entry.ResponseStatus = int(a.Value.Int64())
		case "durationMs":
			entry.DurationMs = a.Value.Int64()
		case "err", "error":
			entry.Error = a.Value.String()
		default:
			extra[a.Key] = a.Value.Any()
		}
		return true
	}
	for _, a := range h.attrs {
		apply(a)
	}
	r.Attrs(apply)
	if len(extra) > 0 {
		if b, err := json.Marshal(extra); err == nil {
			entry.Attrs = b
		}
	}
	h.buf.Add(entry)
	return nil
}

func (h *BufferHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	cp := *h
	cp.attrs = append(append([]slog.Attr{}, h.attrs...), attrs...)
	return &cp
}

// WithGroup is a no-op: BufferHandler flattens attrs into a fixed LogEntry
// schema so group-prefix nesting doesn't translate cleanly.
func (h *BufferHandler) WithGroup(_ string) slog.Handler { return h }

// multiHandler fans every record out to all wrapped handlers. Used so a single
// slog call lands in both the in-app LogBuffer and stderr.
type multiHandler []slog.Handler

func NewMultiHandler(hs ...slog.Handler) slog.Handler { return multiHandler(hs) }

func (m multiHandler) Enabled(ctx context.Context, level slog.Level) bool {
	for _, h := range m {
		if h.Enabled(ctx, level) {
			return true
		}
	}
	return false
}

func (m multiHandler) Handle(ctx context.Context, r slog.Record) error {
	var firstErr error
	for _, h := range m {
		if !h.Enabled(ctx, r.Level) {
			continue
		}
		if err := h.Handle(ctx, r.Clone()); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}

func (m multiHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	out := make(multiHandler, len(m))
	for i, h := range m {
		out[i] = h.WithAttrs(attrs)
	}
	return out
}

func (m multiHandler) WithGroup(name string) slog.Handler {
	out := make(multiHandler, len(m))
	for i, h := range m {
		out[i] = h.WithGroup(name)
	}
	return out
}
