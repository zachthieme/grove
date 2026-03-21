package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
	"github.com/zach/orgchart/internal/model"
	"github.com/zach/orgchart/internal/parser"
)

var rootCmd = &cobra.Command{
	Use:   "orgchart",
	Short: "Generate mermaid org charts from spreadsheets",
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

// loadOrg parses the file and optionally applies planned changes.
func loadOrg(path string, planned bool) (*model.Org, error) {
	org, err := parser.Parse(path)
	if err != nil {
		return nil, err
	}
	if planned {
		return model.ApplyPlanned(org)
	}
	return org, nil
}

func writeOutput(content, outputPath string) error {
	if outputPath == "" {
		fmt.Print(content)
		return nil
	}
	return os.WriteFile(outputPath, []byte(content), 0644)
}
