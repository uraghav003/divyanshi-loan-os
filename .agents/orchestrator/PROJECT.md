# Project: Divyanshi Capital Loan OS Setup & Deployment

## Architecture
Google Apps Script Web App for Divyanshi Capital Loan OS.
- `Code.gs`: Core server-side controller, API router, auth gate, intake forms, MIS generator.
- `index.html`: Main web app UI shell.
- `smart_form.html`: Borrower loan application intake form.
- `calling.html`: Telecalling & CRM portal interface.
- `voice.html`: Voice AI / call logs interface.
- `appsscript.json`: Manifest configuration (timeZone, dependencies, webapp access).
- `SETUP_PROPERTIES.gs`: Apps Script helper script to set non-secret script properties and verify state.
- `SETUP.md`: Full step-by-step deployment guide & Apps Script instructions.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: SETUP_PROPERTIES.gs | Create SETUP_PROPERTIES.gs with setupProperties() and verifyProperties() | None | PLANNED |
| 2 | M2: SETUP.md | Create SETUP.md deployment guide with full instructions | None | PLANNED |
| 3 | M3: Git Push | Stage changed/new files, commit with feat message, push to main | M1, M2 | PLANNED |
| 4 | M4: Audit & Verification | Perform reviewer, challenger, and forensic audit checks | M3 | PLANNED |

## Interface Contracts
- `setupProperties()`: Sets default non-secret properties (`PRIVACY_NOTICE_URL`, `CONSENT_VERSION`, `PRIVACY_CONTACT_EMAIL`, `GRIEVANCE_OFFICER_NAME`, `HR_TC_URL`, `COMPANY_WEBSITE_URL`) if missing. Defines TODO placeholder instructions for secret keys (`MALLIK_API_KEY`, `DEEPSEEK_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `CLIENT_DOCS_FOLDER_ID`). Must be idempotent.
- `verifyProperties()`: Logs all 11 keys and reports status (`SET` vs `MISSING`).

## Code Layout
- Root directory: `C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os`
- Code files: `Code.gs`, `appsscript.json`, `index.html`, `smart_form.html`, `calling.html`, `voice.html`, `SETUP_PROPERTIES.gs`, `SETUP.md`.
