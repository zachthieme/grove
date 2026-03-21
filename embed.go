package main

import (
	"embed"
	"io/fs"
)

//go:embed web/dist
var frontendDist embed.FS

func getFrontendFS() (fs.FS, error) {
	return fs.Sub(frontendDist, "web/dist")
}
