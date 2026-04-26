package httpapi

import (
	"net/http"
	"net/url"
)

// csrfProtect guards POST and DELETE with a layered defence:
//  1. X-Requested-With must be present. Browsers don't add custom headers on
//     cross-origin form/img/script submissions, so simple-request CSRF is blocked.
//  2. If Origin or Referer is present, its host must equal r.Host. Modern
//     browsers always send Origin on POST, so a fetch-from-evil.com attack is
//     rejected even if it sets the XHR header.
//
// Non-browser clients (curl, tests) typically omit Origin/Referer and pass
// step 1 alone — acceptable because they aren't subject to CSRF.
func csrfProtect(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost || r.Method == http.MethodDelete {
			if r.Header.Get("X-Requested-With") == "" {
				writeError(w, http.StatusForbidden, "missing X-Requested-With header")
				return
			}
			if !sameOriginOrAbsent(r) {
				writeError(w, http.StatusForbidden, "origin mismatch")
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

// sameOriginOrAbsent returns true if the request's Origin/Referer host matches
// r.Host, or if neither header is present. An unparseable Origin/Referer is
// treated as a mismatch.
func sameOriginOrAbsent(r *http.Request) bool {
	for _, h := range []string{"Origin", "Referer"} {
		raw := r.Header.Get(h)
		if raw == "" {
			continue
		}
		u, err := url.Parse(raw)
		if err != nil || u.Host == "" {
			return false
		}
		return u.Host == r.Host
	}
	return true
}
