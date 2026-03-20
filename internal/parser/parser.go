package parser

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/zach/orgchart/internal/model"
)

func Parse(path string) (*model.Org, error) {
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".csv":
		return parseCSV(path)
	case ".xlsx":
		return parseXLSX(path)
	default:
		return nil, fmt.Errorf("unsupported file format '%s' (expected .csv or .xlsx)", ext)
	}
}
