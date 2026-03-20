package cmd

import (
	"github.com/spf13/cobra"
	"github.com/zach/orgchart/internal/parser"
	"github.com/zach/orgchart/internal/renderer"
	"github.com/zach/orgchart/internal/views"
)

var headcountOutput string

var headcountCmd = &cobra.Command{
	Use:   "headcount <file>",
	Short: "Generate org chart with discipline counts",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		org, err := parser.Parse(args[0])
		if err != nil {
			return err
		}
		vm := views.HeadcountView(org)
		result := renderer.Render(vm)
		return writeOutput(result, headcountOutput)
	},
}

func init() {
	headcountCmd.Flags().StringVarP(&headcountOutput, "output", "o", "", "output file path")
	rootCmd.AddCommand(headcountCmd)
}
