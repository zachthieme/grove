# Smart Column Mapping

## Overview

When a user uploads a CSV/XLSX, automatically infer which spreadsheet columns map to app fields. If all required fields are confidently mapped, auto-proceed. If not, show a mapping UI pre-filled with best guesses for the user to correct before loading.

## Inference Logic

Runs on the backend. Given a list of headers, produces a mapping from app fields to spreadsheet columns with confidence scores.

### App Fields

| Field | Required | Description |
|-------|----------|-------------|
| Name | yes | Person's name |
| Role | yes | Job title/role |
| Discipline | yes | Engineering, Design, PM, etc. |
| Manager | no | Name of manager |
| Team | yes | Team name |
| Status | yes | Active, Hiring, Open, Transfer |
| Additional Teams | no | Comma-separated extra teams |
| New Role | no | Planned future role |
| New Team | no | Planned future team |

### Matching Strategy

Three tiers, checked in order:

1. **Exact match** (case-insensitive, trimmed): header "Name" → Name, "Role" → Role, etc. Confidence: **high**.

2. **Synonym match** (case-insensitive): known synonyms map to app fields. Confidence: **high**.

| App Field | Synonyms |
|-----------|----------|
| Name | full name, person, employee, employee name |
| Role | title, job title, position |
| Discipline | function, job family, job function |
| Manager | reports to, supervisor, manager name, reporting to |
| Team | department, group, org, organization |
| Status | employment status, employee status |
| Additional Teams | other teams, secondary teams |
| New Role | future role, planned role |
| New Team | future team, planned team |

3. **Fuzzy match** (substring containment, case-insensitive): if a header contains the field name as a substring (e.g., "manager_name" contains "manager"). Confidence: **medium**.

Unmatched fields get confidence: **none**.

### Confidence Threshold

If all required fields (Name, Role, Discipline, Team, Status) have **high** confidence, auto-proceed — parse and load the org immediately. Otherwise, return the proposed mapping for user confirmation.

## API Changes

### Modified Endpoint: POST /api/upload

Currently: accepts multipart file, parses, loads org, returns `OrgData`.

New behavior: accepts multipart file, runs inference. Returns one of two response shapes:

**Auto-proceed (all required fields high confidence):**
```json
{
  "status": "ready",
  "orgData": { "original": [...], "working": [...] }
}
```

**Needs mapping:**
```json
{
  "status": "needs_mapping",
  "headers": ["Full Name", "Title", "Dept", ...],
  "mapping": {
    "name": { "column": "Full Name", "confidence": "high" },
    "role": { "column": "Title", "confidence": "high" },
    "discipline": { "column": "", "confidence": "none" },
    "manager": { "column": "", "confidence": "none" },
    "team": { "column": "Dept", "confidence": "medium" },
    "status": { "column": "", "confidence": "none" },
    "additionalTeams": { "column": "", "confidence": "none" },
    "newRole": { "column": "", "confidence": "none" },
    "newTeam": { "column": "", "confidence": "none" }
  },
  "preview": [
    ["Full Name", "Title", "Dept", ...],
    ["Alice Smith", "VP Engineering", "Engineering", ...],
    ["Bob Jones", "Engineer", "Platform", ...]
  ]
}
```

The backend holds the uploaded file bytes in memory (on the OrgService) until the mapping is confirmed or a new file is uploaded.

### New Endpoint: POST /api/upload/confirm

Accepts JSON:
```json
{
  "mapping": {
    "name": "Full Name",
    "role": "Title",
    "discipline": "Dept",
    "manager": "",
    "team": "Dept",
    "status": "Status",
    "additionalTeams": "",
    "newRole": "",
    "newTeam": ""
  }
}
```

Applies the user-confirmed mapping to the held file bytes. Uses the mapping to override the default header-name lookup in `BuildPeople`. Returns `OrgData` (same as current successful upload).

If no file is pending, returns 400.

## Backend Implementation

### New Types

```go
type MappedColumn struct {
    Column     string `json:"column"`
    Confidence string `json:"confidence"` // "high", "medium", "none"
}

type UploadResponse struct {
    Status  string                 `json:"status"` // "ready" or "needs_mapping"
    OrgData *OrgData               `json:"orgData,omitempty"`
    Headers []string               `json:"headers,omitempty"`
    Mapping map[string]MappedColumn `json:"mapping,omitempty"`
    Preview [][]string             `json:"preview,omitempty"`
}
```

### OrgService Changes

- Add `pendingFile []byte` and `pendingFilename string` fields to hold an unconfirmed upload.
- `Upload` now runs inference first. If confident, parses and loads as before (clearing pending). If not, stores the file as pending and returns the mapping.
- New `ConfirmMapping(mapping map[string]string) error` method: takes the user mapping, parses the pending file with that mapping, loads the org, clears pending.
- `Upload` of a new file clears any existing pending file.

### Parser Changes

`BuildPeople` currently builds its column index from the header row directly. Add an optional `columnMapping map[string]string` parameter. When provided, use the mapping to find columns instead of matching by header name. The mapping keys are lowercase app field names ("name", "role", etc.), values are the actual header strings from the spreadsheet.

### InferMapping Function

New function `InferMapping(headers []string) map[string]MappedColumn`. Implements the three-tier matching strategy described above. Returns a mapping entry for each app field.

## Frontend Changes

### New Component: ColumnMappingModal

A modal overlay shown when upload returns `needs_mapping`. Contains:

- Title: "Map Your Columns"
- One row per app field:
  - Field label (with asterisk for required)
  - `<select>` dropdown with all spreadsheet headers plus "— unmapped —"
  - Pre-selected with the inferred column (or unmapped if none)
  - Confidence indicator: green dot (high), yellow dot (medium), red dot (none/unmapped required)
- Data preview: a small table showing the first 2-3 data rows with the current mapping applied. Updates live as the user changes dropdowns.
- "Load" button — disabled until all required fields are mapped. Calls `POST /api/upload/confirm`.
- "Cancel" button — discards the pending file.

### OrgContext Changes

- Upload action now handles both response shapes.
- If `status === "ready"`, load the org as before.
- If `status === "needs_mapping"`, store the mapping/headers/preview in state and show the modal.
- New `confirmMapping(mapping)` action calls the confirm endpoint and loads the org.
- New `cancelMapping()` action clears the pending state.

### API Client Additions

- Update `uploadFile` return type to `UploadResponse`.
- Add `confirmMapping(mapping: Record<string, string>): Promise<OrgData>`.
