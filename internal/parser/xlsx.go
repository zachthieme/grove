package parser

import (
	"fmt"

	"github.com/xuri/excelize/v2"
	"github.com/zach/orgchart/internal/model"
)

func parseXLSX(path string) (*model.Org, error) {
	f, err := excelize.OpenFile(path)
	if err != nil {
		return nil, fmt.Errorf("opening xlsx: %w", err)
	}
	defer f.Close()

	sheet := f.GetSheetName(0)
	rows, err := f.GetRows(sheet)
	if err != nil {
		return nil, fmt.Errorf("reading rows: %w", err)
	}

	if len(rows) < 2 {
		return nil, fmt.Errorf("xlsx must have a header row and at least one data row")
	}

	return buildPeople(rows[0], rows[1:])
}
