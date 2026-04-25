package api

import (
	"errors"
	"fmt"
	"net/http"
)

// httpStatusError is implemented by typed errors that carry an HTTP status.
// serviceError uses this to map service errors to the right response code;
// adding a new typed error means implementing HTTPStatus on it — no central
// registry to update.
type httpStatusError interface {
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
func errValidation(format string, args ...any) error { return &ValidationError{fmt.Sprintf(format, args...)} }
func errNotFound(format string, args ...any) error   { return &NotFoundError{fmt.Sprintf(format, args...)} }
func errConflict(format string, args ...any) error   { return &ConflictError{fmt.Sprintf(format, args...)} }

// Predicates — convenience for tests and internal type checks.
func isNotFound(err error) bool {
	var e *NotFoundError
	return errors.As(err, &e)
}

func isConflict(err error) bool {
	var e *ConflictError
	return errors.As(err, &e)
}

func isValidation(err error) bool {
	var e *ValidationError
	return errors.As(err, &e)
}

// serviceError writes an HTTP error from a service-layer error. Typed errors
// expose their status via HTTPStatus(); anything else becomes 500.
func serviceError(w http.ResponseWriter, err error) {
	var typed httpStatusError
	if errors.As(err, &typed) {
		writeError(w, typed.HTTPStatus(), err.Error())
		return
	}
	writeError(w, http.StatusInternalServerError, err.Error())
}
