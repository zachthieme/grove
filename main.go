package main

import "github.com/zach/orgchart/cmd"

func main() {
	cmd.GetFrontendFS = getFrontendFS
	cmd.Execute()
}
