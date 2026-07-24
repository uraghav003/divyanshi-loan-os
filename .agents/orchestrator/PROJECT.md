# Project: Divyanshi Capital Loan OS

## Architecture
Google Apps Script (GAS) Web App backed by Google Sheets.
- Backend: `Code.gs` (handles `doGet`, `doPost`, MIS engine, Dashboard protection, 15-min sync)
- Config: `appsscript.json` (OAuth scopes, runtime version V8, webapp execution context)
- Frontend templates:
  - `index.html` (Main dashboard & overview interface)
  - `smart_form.html` (Multi-step intake form with doc checklist & bank chip selector)
  - `calling.html` (Calling workspace: contact card, call controls, stats grid, AI agent card)
  - `voice.html` (Voice assistant / agent view)

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1_Explore | Fetch raw HTML files from GitHub and analyze truncation points and styling requirements | None | IN_PROGRESS |
| 2 | M2_HTML_Completion | Complete missing CSS, HTML, and JS in index.html, smart_form.html, calling.html, voice.html | M1 | PLANNED |
| 3 | M3_Consistency | Cross-file consistency checks for actions, doGet mappings, appsscript.json scopes, Code.gs helper functions | M2 | PLANNED |
| 4 | M4_Verification_GitPush | Independent review, adversarial testing, forensic audit, git commit and push | M3 | PLANNED |

## Code Layout
- Root directory: `C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os`
  - `Code.gs`
  - `appsscript.json`
  - `index.html`
  - `smart_form.html`
  - `calling.html`
  - `voice.html`

## Design & Palette Constraints
- `--primary`: `#C9A84C` (Gold)
- `--bg`: `#0B1F3A` (Dark Blue)
- Minimal changes only — do NOT redesign or rebuild.
- Complete truncated portions matching existing structure, naming conventions, and style rules.
