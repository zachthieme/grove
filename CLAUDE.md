# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Version Control

This project uses **jj** (Jujutsu) for version control, colocated with git. Use `jj` commands instead of `git` for all VCS operations (commit, branch, push, etc.).

## Development

This is a Go CLI tool (`orgchart`) that generates Mermaid flowchart diagrams from org chart spreadsheets (CSV/XLSX).

### Commands

```bash
go build -o orgchart .          # Build
go test ./...                   # Run all tests (unit + integration)
go test ./internal/model/       # Run a single package's tests
go test -run TestFoo ./...      # Run a single test by name
go test -v ./...                # Verbose output
```

### Testing

Follow TDD: write a failing test first, then implement the feature.

Integration tests live in `integration_test.go` at the repo root — they build the binary and run it against `testdata/` fixtures. Unit tests are colocated with their packages (`*_test.go`).

## Architecture

The pipeline is: **parse → model → view → render**.

- `cmd/` — Cobra CLI commands. Each subcommand (`people`, `headcount`) loads an `Org`, builds a `ViewModel`, renders it, and writes output.
- `internal/parser/` — Reads CSV or XLSX into `model.Org`. The shared `buildPeople` function maps spreadsheet columns to `Person` structs by header name (case-insensitive).
- `internal/model/` — Core domain: `Person`, `Org` (with indexes `ByName`, `ByTeam`, `ByManager`, `Roots`). `NewOrg` validates required fields, detects duplicates, resolves manager references, and checks for cycles. `ApplyPlanned` swaps `NewRole`/`NewTeam` fields to show future state.
- `internal/views/` — Transforms `Org` into a `ViewModel` (subgraphs, nodes, edges, class defs). `PeopleView` shows individual people with reporting lines; `HeadcountView` shows discipline counts per team. Both produce the same `ViewModel` struct.
- `internal/renderer/` — Serializes a `ViewModel` into a Mermaid `flowchart TD` string. Stateless, single function.

### Key Concepts

- **Status types**: Active, Hiring, Open, Transfer — each gets different visual styling (dashed borders, emoji prefixes).
- **Cross-team**: People with `AdditionalTeams` get dotted-line edges to other team subgraphs. Controllable via `--no-crossteam`.
- **Planned state**: `--planned` flag applies `NewRole`/`NewTeam` columns to preview future org changes.
- **Root nodes**: People without a manager render as `FreeNodes` outside any subgraph.
