package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
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

func writeOutput(content, outputPath string) error {
	if outputPath == "" {
		fmt.Print(content)
		return nil
	}
	return os.WriteFile(outputPath, []byte(content), 0644)
}
