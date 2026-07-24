# Original User Request

## 2026-07-24T03:52:16Z

Fix and complete the **Divyanshi Capital Loan OS** — a Google Apps Script (GAS) Web App backed by Google Sheets. The core `Code.gs` has already been written and saved. The task is to complete the three truncated HTML files, verify the full file set is internally consistent, and push everything to the GitHub repo so it can be deployed into Apps Script.

Working directory: `C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os`
Integrity mode: development

---

## Context

| Item | Status |
|------|--------|
| `Code.gs` | ✅ Written (V9.3.1-MERGED, all sections complete including doGet/doPost/MIS/Dashboard engine) |
| `appsscript.json` | ✅ Written (correct scopes + advanced services) |
| `index.html` | ❌ Truncated mid-CSS in GitHub at `.section { padding: 5` |
| `smart_form.html` | ❌ Truncated mid-HTML at `<option value="` inside entry_type select |
| `calling.html` | ❌ Truncated mid-CSS at `.ai-metric-label{font-siz` |
| `voice.html` | ⚠️ Needs verification (short file — may be complete) |

**Key constraint:** Minimal changes only — do NOT redesign or rebuild. Complete only the truncated portions using the exact same coding style, colour palette (`--primary: #C9A84C`, `--bg: #0B1F3A`), and patterns already present in each file.

The GitHub repo is: https://github.com/uraghav003/divyanshi-loan-os (public, main branch)
The local working directory already has Code.gs and appsscript.json written.
For the HTML files, read the current (truncated) versions from GitHub raw:
- https://raw.githubusercontent.com/uraghav003/divyanshi-loan-os/main/index.html
- https://raw.githubusercontent.com/uraghav003/divyanshi-loan-os/main/smart_form.html
- https://raw.githubusercontent.com/uraghav003/divyanshi-loan-os/main/calling.html
- https://raw.githubusercontent.com/uraghav003/divyanshi-loan-os/main/voice.html

The local Code.gs (already written) is at:
`C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os\Code.gs`

---

## Requirements

### R1. Complete `index.html`
Read the file from GitHub raw. Identify the exact truncation point. Complete the missing CSS rules, any unclosed HTML tags, and the JavaScript section — following the existing design system exactly. The finished file must be valid HTML with no unclosed tags, no orphaned style blocks, and no broken JS.
Write the completed file to the working directory.

### R2. Complete `smart_form.html`
Read the file from GitHub raw. Complete the truncated `<select>` element for `entry_type`, all remaining `<option>` elements, any missing form steps (multi-step intake form with doc checklist, bank chip selector), and the JS submission logic. Follow the existing style and step-flow exactly.
Write the completed file to the working directory.

### R3. Complete `calling.html`
Read the file from GitHub raw. Complete `.ai-metric-label` CSS property, all remaining CSS rules, the full HTML body (calling workspace: contact card, call controls, stats grid, AI agent card, quick actions, bottom nav), and all JavaScript (preloader, contact cycling, session/auth calls, AI chat panel).
Style must match the existing gold/dark palette and phone-frame layout.
Write the completed file to the working directory.

### R4. Verify `voice.html`
Check if `voice.html` is complete (has closing `</html>` tag and JS logic). If truncated, complete it. If complete, copy it to the working directory unchanged.

### R5. Cross-file consistency check
After all files are written, verify:
- Every `google.script.run.*` or `fetch(...)` `action:` value called from the HTML files has a matching `case 'action':` in `doPost()` in `Code.gs`.
- `doGet` in `Code.gs` maps `page=form` → `smart_form`, `page=calling` → `calling`, `page=voice` → `voice`, default → `index`.
- `appsscript.json` lists all required OAuth scopes.
Fix any mismatches found.

### R6. Push to GitHub
Commit and push all changed files to the `main` branch of the repo using git.
Commit message: `fix: complete truncated HTML files + merge dashboard engine into Code.gs`

---

## Acceptance Criteria

### HTML Completeness
- [ ] `index.html` has exactly one `</html>` closing tag
- [ ] `smart_form.html` contains `</form>`, `</html>`, and at least 3 `<option>` elements inside the `entry_type` select
- [ ] `calling.html` contains `.ai-metric-label` with a complete CSS rule and ends with `</html>`
- [ ] All four HTML files: each file ends with `</html>`

### Code.gs Consistency
- [ ] Every `action:` string called from HTML has a `case 'action':` block in `doPost()` in `Code.gs`
- [ ] `GET_TAT_BY_PRODUCT_` function has a closing `}` (not truncated)
- [ ] `MIS_15MIN_FULL_SYNC_`, `APPLY_DASHBOARD_PROTECTION_`, `DASHBOARD_SYNC_TRIGGER_ENGINE` all exist as named functions in `Code.gs`

### GitHub Push
- [ ] `git log --oneline -1` on the repo shows the fix commit
- [ ] `git status` shows a clean working tree after push
