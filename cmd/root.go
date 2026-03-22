package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "grove",
	Short: "Interactive org chart tool",
	Long:  "grove /ɡroʊv/ n. — a small group of trees, deliberately planted and carefully tended.\n\nOrg planning for people who think in structures, not spreadsheets.",
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
