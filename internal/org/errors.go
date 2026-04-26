package org

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
)

// HTTPStatusError is implemented by typed errors that carry an HTTP status.
// ServiceError uses this to map service errors to the right response code;
// adding a new typed error means implementing HTTPStatus on it — no central
// registry to update.
//
// Errors from sibling packages (e.g. internal/snapshot) that implement the
// same method satisfy this interface via duck typing, so handlers map them
// to the right status code without any direct dependency.
type HTTPStatusError interface {
	error
	HTTPStatus() int
}

// ValidationError indicates invalid input data (422).
type ValidationError struct{ msg string }

func (e *ValidationError) Error() string   { return e.msg }
func (e *ValidationError) HTTPStatus() int { return http.StatusUnprocessableEntity }

// NotFoundError indicates a requested resource doesn't exist (404).
type NotFoundError struct{ msg string }

func (e *NotFoundError) Error() string   { return e.msg }
func (e *NotFoundError) HTTPStatus() int { return http.StatusNotFound }

// ConflictError indicates a duplicate or conflicting state (409).
type ConflictError struct{ msg string }

func (e *ConflictError) Error() string   { return e.msg }
func (e *ConflictError) HTTPStatus() int { return http.StatusConflict }

// Constructors.
func ErrValidation(format string, args ...any) error {
	return &ValidationError{fmt.Sprintf(format, args...)}
}
func ErrNotFound(format string, args ...any) error {
	return &NotFoundError{fmt.Sprintf(format, args...)}
}
func ErrConflict(format string, args ...any) error {
	return &ConflictError{fmt.Sprintf(format, args...)}
}

// Predicates — convenience for tests and internal type checks. They check
// the HTTP-status interface so errors originating from sibling packages
// (e.g. internal/snapshot) match too.
func IsNotFound(err error) bool {
	var e HTTPStatusError
	return errors.As(err, &e) && e.HTTPStatus() == http.StatusNotFound
}

func IsConflict(err error) bool {
	var e HTTPStatusError
	return errors.As(err, &e) && e.HTTPStatus() == http.StatusConflict
}

func IsValidation(err error) bool {
	var e HTTPStatusError
	return errors.As(err, &e) && e.HTTPStatus() == http.StatusUnprocessableEntity
}

// ServiceError writes an HTTP error from a service-layer error. Typed errors
// expose their status via HTTPStatus(); anything else becomes 500.
func ServiceError(w http.ResponseWriter, err error) {
	var typed HTTPStatusError
	status := http.StatusInternalServerError
	if errors.As(err, &typed) {
		status = typed.HTTPStatus()
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	// Encode is best-effort: WriteHeader has already been committed, so any
	// encode failure can only be logged by the caller's middleware.
	_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
}
