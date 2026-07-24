# Original User Request

## Initial Request — 2026-07-24T04:22:44Z

<USER_REQUEST>
Set up all required Google Apps Script **Script Properties** (credentials)
for the Divyanshi Capital Loan OS, create a safe local setup script, and
complete the pending GitHub push of the fixed codebase.

Working directory: `C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os`
Integrity mode: development

---

## Context

The Divyanshi Capital Loan OS is a Google Apps Script Web App.
All secrets are stored ONLY in Apps Script Script Properties (PropertiesService),
never hardcoded. The `Code.gs` references these property keys:

| Property Key | Purpose | Required? |
|---|---|---|
| `MALLIK_API_KEY` | Internal API secret (signs route URLs, auth gate) | Critical |
| `DEEPSEEK_API_KEY` | AI brain primary (DeepSeek chat) | At least 1 AI key needed |
| `OPENAI_API_KEY` | AI brain fallback (GPT-4o-mini) | Optional |
| `GEMINI_API_KEY` | AI brain fallback (Gemini 1.5 Flash) | Optional |
| `PRIVACY_NOTICE_URL` | URL to company privacy policy page | Required for intake |
| `CONSENT_VERSION` | Privacy consent version string (e.g. "v1.0") | Required for intake |
| `PRIVACY_CONTACT_EMAIL` | Privacy contact email | Required |
| `GRIEVANCE_OFFICER_NAME` | Name of grievance officer | Required |
| `HR_TC_URL` | URL to HR Terms & Conditions | Required for HR forms |
| `COMPANY_WEBSITE_URL` | Company website URL | Required |
| `CLIENT_DOCS_FOLDER_ID` | Google Drive folder ID for client documents | Required |

The current GitHub repo: https://github.com/uraghav003/divyanshi-loan-os (public, main branch)
The local working directory already has the final fixed files (Code.gs, index.html,
smart_form.html, calling.html, voice.html, appsscript.json).

Company details for default values:
- Company: Divyanshi Capital Pvt Ltd
- Website: https://www.divyanshicapital.com
- MD Email: upendra.raghav@divyanshicapital.com
- HR Email: khushboo.divyanshicapital@gmail.com
- Support: support@divyanshicapital.com
- Spreadsheet ID: 1Mk9AzGdKK07WZCKV6lZgtlM4JWy2sdESQwh70r0UicU

---

## Requirements

### R1. Credential Setup Script
Create a file `SETUP_PROPERTIES.gs` in the working directory.
This is a standalone Apps Script helper that the user pastes into their
Apps Script project and runs **once** as a function to set all required
Script Properties. The script must:
- Set non-secret properties (PRIVACY_NOTICE_URL, CONSENT_VERSION,
  PRIVACY_CONTACT_EMAIL, GRIEVANCE_OFFICER_NAME, HR_TC_URL,
  COMPANY_WEBSITE_URL) to sensible Divyanshi Capital defaults.
- Leave secret keys (MALLIK_API_KEY, DEEPSEEK_API_KEY, OPENAI_API_KEY,
  GEMINI_API_KEY, CLIENT_DOCS_FOLDER_ID) as clearly-labelled TODO placeholders
  with inline comments explaining where to get each key.
- Include a `verifyProperties()` function that logs which keys are set vs missing.
- Be safe to run multiple times (idempotent — only sets missing keys, never
  overwrites existing ones).
- Use PropertiesService.getScriptProperties() — no external dependencies.

### R2. README / Setup Guide
Create `SETUP.md` in the working directory with a clear, step-by-step deployment guide:
1. How to open Apps Script editor for the linked spreadsheet
2. How to paste Code.gs, all HTML files, appsscript.json
3. How to paste and run SETUP_PROPERTIES.gs
4. How to manually add the 4 secret keys in Apps Script UI
   (Project Settings → Script Properties)
5. How to deploy as Web App (executeAs: USER_DEPLOYING, access: ANYONE_ANONYMOUS)
6. How to run `DC_INSTALL_P1_FINAL_()` to generate staff URLs
7. How to set up time-driven triggers (MIS_TRIGGER_15MIN_, MASTER_CONTROL_TRIGGER_1H_)

### R3. Complete the GitHub Push
Check git status in the working directory. Stage all changed/new files
(Code.gs, index.html, smart_form.html, calling.html, voice.html,
appsscript.json, SETUP_PROPERTIES.gs, SETUP.md) and push to the `main` branch
with commit message:
`feat: add credential setup script, deployment guide, complete HTML files`

If there are any git issues (detached HEAD, wrong remote, etc.), fix them
before pushing.

---

## Acceptance Criteria

### Credential Setup Script
- [ ] `SETUP_PROPERTIES.gs` exists in working directory
- [ ] Contains a function named `setupProperties()`
- [ ] Contains a function named `verifyProperties()`
- [ ] All 11 property keys from the table above are referenced
- [ ] Secret keys have TODO placeholder comments, not hardcoded values
- [ ] Non-secret keys have real Divyanshi Capital default values
- [ ] Script is idempotent (safe to run multiple times without overwriting)

### Setup Guide
- [ ] `SETUP.md` exists in working directory
- [ ] Contains numbered deployment steps
- [ ] Mentions `DC_INSTALL_P1_FINAL_()` function
- [ ] Mentions time-driven triggers setup
- [ ] Mentions Script Properties UI path in Apps Script

### GitHub Push
- [ ] `git log --oneline -1` shows the new commit on main
- [ ] `git status` shows clean working tree
- [ ] All 8 files present in repo: Code.gs, index.html, smart_form.html,
      calling.html, voice.html, appsscript.json, SETUP_PROPERTIES.gs, SETUP.md
</USER_REQUEST>
