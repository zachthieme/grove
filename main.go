package main

import "github.com/zachthieme/grove/cmd"

func main() {
	cmd.GetFrontendFS = getFrontendFS
	cmd.Execute()
}
