package cmd

import (
	"github.com/spf13/cobra"
	"github.com/zach/orgchart/internal/renderer"
	"github.com/zach/orgchart/internal/views"
)

var (
	peopleOutput    string
	peoplePlanned   bool
	peopleNoCross   bool
)

var peopleCmd = &cobra.Command{
	Use:   "people <file>",
	Short: "Generate org chart with names and roles",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		org, err := loadOrg(args[0], peoplePlanned)
		if err != nil {
			return err
		}
		vm := views.PeopleView(org, views.PeopleOptions{ShowCrossTeam: !peopleNoCross})
		result := renderer.Render(vm)
		return writeOutput(result, peopleOutput)
	},
}

func init() {
	peopleCmd.Flags().StringVarP(&peopleOutput, "output", "o", "", "output file path")
	peopleCmd.Flags().BoolVar(&peoplePlanned, "planned", false, "show planned state (apply New Role/New Team)")
	peopleCmd.Flags().BoolVar(&peopleNoCross, "no-crossteam", false, "hide cross-team dotted lines")
	rootCmd.AddCommand(peopleCmd)
}
