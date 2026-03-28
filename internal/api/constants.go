package api

const (
	// MaxUploadSize is the maximum allowed size for file uploads (50 MB).
	MaxUploadSize = 50 << 20

	// MaxBodySize is the maximum allowed size for JSON request bodies (1 MB).
	MaxBodySize = 1 << 20
)
