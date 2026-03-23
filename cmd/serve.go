package cmd

import (
	"fmt"
	"io/fs"
	"net/http"
	"os"

	"github.com/spf13/cobra"
	"github.com/zachthieme/grove/internal/api"
)

var GetFrontendFS func() (fs.FS, error)

var (
	servePort int
	serveDev  bool
)

var serveCmd = &cobra.Command{
	Use:   "serve",
	Short: "Start the web UI server",
	RunE: func(cmd *cobra.Command, args []string) error {
		svc := api.NewOrgService()
		mux := http.NewServeMux()

		apiRouter := api.NewRouter(svc)
		mux.Handle("/api/", apiRouter)

		if !serveDev {
			frontendFS, err := GetFrontendFS()
			if err != nil {
				return fmt.Errorf("loading frontend: %w", err)
			}
			mux.Handle("/", http.FileServer(http.FS(frontendFS)))
		}

		addr := fmt.Sprintf(":%d", servePort)
		fmt.Fprintf(os.Stderr, "Listening on http://localhost%s\n", addr)
		return http.ListenAndServe(addr, mux)
	},
}

func init() {
	serveCmd.Flags().IntVarP(&servePort, "port", "p", 8080, "port to listen on")
	serveCmd.Flags().BoolVar(&serveDev, "dev", false, "dev mode (frontend served by Vite)")
	rootCmd.AddCommand(serveCmd)
}
