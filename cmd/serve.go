package cmd

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"time"

	"github.com/spf13/cobra"
	"github.com/zachthieme/grove/internal/api"
	"github.com/zachthieme/grove/internal/autosave"
	"github.com/zachthieme/grove/internal/logbuf"
	"github.com/zachthieme/grove/internal/org"
	"github.com/zachthieme/grove/internal/snapshot"
)

var GetFrontendFS func() (fs.FS, error)

var (
	servePort int
	serveDev  bool
	serveLog  bool
)

func runServe(cmd *cobra.Command, args []string) error {
	var logBuf *logbuf.LogBuffer
	if serveLog {
		logBuf = logbuf.New(1000)
	}
	configureLogging(logBuf)

	svc := org.New(snapshot.NewFileStore())
	autoStore := autosave.NewFileStore()
	mux := http.NewServeMux()

	apiRouter := api.NewRouter(api.NewServices(svc), logBuf, autoStore)
	if logBuf != nil {
		mux.Handle("/api/", api.LoggingMiddleware(logBuf)(apiRouter))
	} else {
		mux.Handle("/api/", apiRouter)
	}

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

	var handler http.Handler = mux
	if serveDev {
		handler = corsDevMiddleware(mux)
	}

	server := &http.Server{
		Addr:         addr,
		Handler:      handler,
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

	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("listen: %w", err)
	}

	url := fmt.Sprintf("http://localhost%s", addr)
	logbuf.Logger().Info("server listening", "source", "server", "url", url, "dev", serveDev, "log", serveLog)
	if !serveDev {
		go openBrowser(url)
	}
	err = server.Serve(ln)
	if errors.Is(err, http.ErrServerClosed) {
		logbuf.Logger().Info("server shut down", "source", "server")
		return nil
	}
	return err
}

// configureLogging installs the package logger used across the api package and
// reroutes stdlib log output through slog. When --log is on, records also land
// in the in-app LogBuffer alongside HTTP request entries.
func configureLogging(buf *logbuf.LogBuffer) {
	level := slog.LevelInfo
	if serveLog {
		level = slog.LevelDebug
	}
	textOpts := &slog.HandlerOptions{Level: level}
	textHandler := slog.NewTextHandler(os.Stderr, textOpts)

	var handler slog.Handler = textHandler
	if buf != nil {
		handler = logbuf.NewMultiHandler(textHandler, logbuf.NewBufferHandler(buf, level))
	}
	logger := slog.New(handler)
	logbuf.SetLogger(logger)
	slog.SetDefault(logger)
	log.SetOutput(logbuf.SlogWriter{Logger: logger, Level: slog.LevelWarn})
	log.SetFlags(0)
}

// corsDevMiddleware adds permissive CORS headers for development mode,
// where the Vite dev server runs on a different port than the Go API.
func corsDevMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Correlation-ID")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
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
	rootCmd.Flags().IntVarP(&servePort, "port", "p", 8080, "port to listen on")
	rootCmd.Flags().BoolVar(&serveDev, "dev", false, "dev mode (frontend served by Vite)")
	rootCmd.Flags().BoolVar(&serveLog, "log", false, "enable request logging and log viewer")
}
