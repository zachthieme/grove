package cmd

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
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

		url := fmt.Sprintf("http://localhost%s", addr)
		fmt.Fprintf(os.Stderr, "Listening on %s\n", url)
		if !serveDev {
			go openBrowser(url)
		}
		err := server.ListenAndServe()
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	},
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default: // linux, freebsd, etc.
		cmd = exec.Command("xdg-open", url)
	}
	_ = cmd.Start()
}

func init() {
	serveCmd.Flags().IntVarP(&servePort, "port", "p", 8080, "port to listen on")
	serveCmd.Flags().BoolVar(&serveDev, "dev", false, "dev mode (frontend served by Vite)")
	rootCmd.AddCommand(serveCmd)
}
