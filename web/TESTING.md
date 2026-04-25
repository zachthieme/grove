# Frontend Test Conventions

## Naming

Allowed test filename patterns. **No other suffixes.**

| Pattern | Purpose | Example |
|---|---|---|
| `*.test.{ts,tsx}` | Default unit/component tests | `Toolbar.test.tsx` |
| `*.golden.test.tsx` | Golden-file/snapshot tests (preferred over heavy `vi.mock`) | `Toolbar.golden.test.tsx` |
| `*.a11y.test.tsx` | Accessibility (uses `vitest-axe`) | `Toolbar.a11y.test.tsx` |
| `*.property.test.ts` | Property-based (uses `fast-check`) | `shared.property.test.ts` |

## Banned suffixes

Do not introduce new files with categorical-by-content suffixes. Examples of banned patterns:

- `*.branches.test.*` — coverage-driven; merge into the main file or rename basename
- `*.coverage.test.*` — same
- `*.errors.test.*` / `*.errorReporter.test.*` — same
- `*.invariants.test.*` — same
- `*.integration.test.*` — same
- `*.resize-edges.test.*` — same
- Any other `*.<category>.test.*` not in the allowed table

If a single source file accumulates too many tests to live in one `*.test.tsx`, split by **basename** (e.g. `ToolbarBranches.test.tsx`), not by suffix.

## Why

Categorical suffixes encode test *intent* in the filename, which:

- Multiplies conventions over time (we accumulated `.branches`, `.coverage`, `.errors`, `.errorReporter`, `.invariants`, `.integration`, `.resize-edges` before pruning)
- Implies a taxonomy that's hard to maintain consistently
- Mixes "what the test exercises" (intent) with "what tooling it uses" (which is the only legitimate suffix axis — `golden`, `a11y`, `property`)

A test name should describe the test, not its coverage motivation.

## Lint enforcement

Future work: add an ESLint rule or pre-commit check that rejects new categorical suffixes.
