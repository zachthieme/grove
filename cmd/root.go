package cmd

import (
	"log/slog"
	"os"

	"github.com/spf13/cobra"
)

var version = "dev"

var rootCmd = &cobra.Command{
	Use:   "grove",
	Short: "Interactive org chart tool",
	Long:  "grove /ɡroʊv/ n. — a small group of trees, deliberately planted and carefully tended.\n\nOrg planning for people who think in structures, not spreadsheets.",
	// Run the server by default when no subcommand is given.
	RunE:          runServe,
	SilenceErrors: true,
	SilenceUsage:  true,
	Version:       version,
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		slog.Error("grove exited with error", "source", "cli", "err", err.Error())
		os.Exit(1)
	}
}
