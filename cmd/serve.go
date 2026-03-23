package cmd

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"os/signal"
	"time"

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

		ctx, stop := signal.NotifyContext(cmd.Context(), os.Interrupt)
		defer stop()

		server := &http.Server{
			Addr:         addr,
			Handler:      mux,
			ReadTimeout:  30 * time.Second,
			WriteTimeout: 60 * time.Second,
			IdleTimeout:  120 * time.Second,
		}

		go func() {
			<-ctx.Done()
			shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			_ = server.Shutdown(shutdownCtx)
		}()

		fmt.Fprintf(os.Stderr, "Listening on http://localhost%s\n", addr)
		err := server.ListenAndServe()
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	},
}

func init() {
	serveCmd.Flags().IntVarP(&servePort, "port", "p", 8080, "port to listen on")
	serveCmd.Flags().BoolVar(&serveDev, "dev", false, "dev mode (frontend served by Vite)")
	rootCmd.AddCommand(serveCmd)
}
