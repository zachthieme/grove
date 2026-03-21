package parser

import (
	"encoding/csv"
	"fmt"
	"os"

	"github.com/zach/orgchart/internal/model"
)

func parseCSV(path string) (*model.Org, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("opening file: %w", err)
	}
	defer f.Close()

	reader := csv.NewReader(f)
	records, err := reader.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("reading CSV: %w", err)
	}

	if len(records) < 2 {
		return nil, fmt.Errorf("CSV file must have a header row and at least one data row")
	}

	return buildPeople(records[0], records[1:])
}
