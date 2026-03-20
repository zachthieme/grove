package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
	"github.com/zach/orgchart/internal/parser"
	"github.com/zach/orgchart/internal/renderer"
	"github.com/zach/orgchart/internal/views"
)

var peopleOutput string

var peopleCmd = &cobra.Command{
	Use:   "people <file>",
	Short: "Generate org chart with names and roles",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		org, err := parser.Parse(args[0])
		if err != nil {
			return err
		}
		vm := views.PeopleView(org)
		result := renderer.Render(vm)
		return writeOutput(result, peopleOutput)
	},
}

func init() {
	peopleCmd.Flags().StringVarP(&peopleOutput, "output", "o", "", "output file path")
	rootCmd.AddCommand(peopleCmd)
}

func writeOutput(content, outputPath string) error {
	if outputPath == "" {
		fmt.Print(content)
		return nil
	}
	return os.WriteFile(outputPath, []byte(content), 0644)
}
