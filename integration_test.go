package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestIntegration_PeopleCSV(t *testing.T) {
	binary := buildBinary(t)
	out, err := exec.Command(binary, "people", "testdata/crossteam.csv").CombinedOutput()
	if err != nil {
		t.Fatalf("command failed: %v\nOutput: %s", err, out)
	}

	output := string(out)
	checks := []string{
		"flowchart TD",
		"subgraph",
		"Alice",
		"Eve",
		"-.->",
		"classDef hiring",
	}
	for _, check := range checks {
		if !strings.Contains(output, check) {
			t.Errorf("expected output to contain %q\nGot:\n%s", check, output)
		}
	}
}

func TestIntegration_HeadcountCSV(t *testing.T) {
	binary := buildBinary(t)
	out, err := exec.Command(binary, "headcount", "testdata/crossteam.csv").CombinedOutput()
	if err != nil {
		t.Fatalf("command failed: %v\nOutput: %s", err, out)
	}

	output := string(out)
	checks := []string{
		"flowchart TD",
		"Engineering:",
		"Cross-Team",
		"TPM:",
	}
	for _, check := range checks {
		if !strings.Contains(output, check) {
			t.Errorf("expected output to contain %q\nGot:\n%s", check, output)
		}
	}
}

func TestIntegration_OutputFile(t *testing.T) {
	binary := buildBinary(t)
	dir := t.TempDir()
	outPath := filepath.Join(dir, "output.md")

	err := exec.Command(binary, "people", "testdata/simple.csv", "-o", outPath).Run()
	if err != nil {
		t.Fatalf("command failed: %v", err)
	}

	data, err := os.ReadFile(outPath)
	if err != nil {
		t.Fatalf("failed to read output: %v", err)
	}
	if !strings.Contains(string(data), "flowchart TD") {
		t.Error("expected output file to contain mermaid content")
	}
}

func TestIntegration_InvalidFile(t *testing.T) {
	binary := buildBinary(t)
	err := exec.Command(binary, "people", "nonexistent.csv").Run()
	if err == nil {
		t.Fatal("expected error for nonexistent file")
	}
}

func buildBinary(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	binary := filepath.Join(dir, "orgchart")
	cmd := exec.Command("go", "build", "-o", binary, ".")
	cmd.Dir = "."
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("failed to build: %v\n%s", err, out)
	}
	return binary
}
