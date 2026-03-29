package api

const (
	// MaxUploadSize is the maximum allowed size for file uploads (50 MB).
	MaxUploadSize = 50 << 20

	// MaxBodySize is the maximum allowed size for JSON request bodies (1 MB).
	MaxBodySize = 1 << 20
)

// UploadStatus values returned by Upload/UploadZip handlers.
const (
	UploadReady        = "ready"
	UploadNeedsMapping = "needs_mapping"
)

// ConfidenceLevel values for column inference results.
const (
	ConfidenceHigh   = "high"
	ConfidenceMedium = "medium"
	ConfidenceNone   = "none"
)

// ExportFormat values for export endpoints.
const (
	FormatCSV  = "csv"
	FormatXLSX = "xlsx"
)

// FileExtension values for upload parsing.
const (
	ExtCSV  = ".csv"
	ExtXLSX = ".xlsx"
)
