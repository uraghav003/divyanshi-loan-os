## 2026-07-24T04:02:01Z
<USER_REQUEST>
You are the Implementation Worker subagent for Milestone 2 & Milestone 3 (HTML Completion & Cross-File Consistency).
Your working directory is: `C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os\.agents\worker_m2_m3`
The workspace root directory is: `C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os`

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Detailed Instructions:

1. Setup:
   - Create your working directory `.agents/worker_m2_m3` and write your `BRIEFING.md` and `progress.md`.
   - Read the Explorer analysis and handoff reports at `.agents/explorer_m1/analysis.md` and `.agents/explorer_m1/handoff.md`.

2. Requirement R1: Complete `index.html`
   - Read `index.html` from `.agents/explorer_m1/index.html` (or raw GitHub).
   - Ensure all CSS rules (including `.section { padding: 80px 5%; }`), layout, and JS logic are complete.
   - Standardize style variables to use `--primary: #C9A84C` and `--bg: #0B1F3A` (and existing alias variables).
   - Ensure the file is valid HTML, ending with exactly one `</html>` tag.
   - Write the finalized file to `C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os\index.html`.

3. Requirement R2: Complete `smart_form.html`
   - Read `smart_form.html` from `.agents/explorer_m1/smart_form.html` (or raw GitHub).
   - Complete `<select name="entry_type" ...>` so it includes at least 3 `<option>`s (e.g. `SALES_LEAD`, `CLIENT_ENTRY`, `NEW_STAFF_ENTRY`, `VISITOR_ENTRY`, `INTERVIEW_ENTRY`).
   - Ensure `</form>` tag is present.
   - Retain multi-step intake workflow, bank chip selector, doc checklist, and JS submission logic.
   - Ensure the file ends with `</html>`.
   - Write the finalized file to `C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os\smart_form.html`.

4. Requirement R3: Complete `calling.html`
   - Read `calling.html` from `.agents/explorer_m1/calling.html` (or raw GitHub).
   - Complete `.ai-metric-label` CSS rule (e.g. `.ai-metric-label{font-size: 11px; color: var(--muted); text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px;}`).
   - Include complete calling workspace: header, preloader, stats grid, contact card, call controls, AI agent card, quick actions, bottom nav, and JS logic.
   - Ensure the file ends with `</html>`.
   - Write the finalized file to `C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os\calling.html`.

5. Requirement R4: Verify `voice.html`
   - Read `voice.html` from `.agents/explorer_m1/voice.html`.
   - Verify it ends with `</html>` and has complete WebRTC / FreePBX bridge preview UI and JS.
   - Write to `C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os\voice.html`.

6. Requirement R5: Cross-File Consistency & Code.gs Backend Alignment
   - Inspect `doGet(e)` in `Code.gs` (`C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os\Code.gs`).
     Ensure routing maps:
     `page=form` or `page=smart_form` -> `smart_form`
     `page=calling` -> `calling`
     `page=voice` -> `voice`
     default -> `index`
   - Inspect all `google.script.run` statements in the HTML files.
     Add clean, functional implementations to `Code.gs` for all frontend calls that do not yet exist:
     - `P1_SMART_FORM_SUBMIT`
     - `P1_VERIFY_ACCESS`
     - `P1_GET_CALLING_QUEUE`
     - `P1_CALLING_START`
     - `P1_CALLING_AI_REMARK`
     - `P1_MINI_CRM_UPLOAD`
     - `P1_UPDATE_CALLING_CASE`
     - `P1_SAVE_CALC_LEAD`
     - `P1_VOICE_CALL`
     - `MLA_UPDATE_MINI_STATUS`
     - `DC_TG_BROADCAST`
   - Ensure `doPost(e)` action handler covers all `action:` strings in `fetch` requests.
   - Verify `GET_TAT_BY_PRODUCT_`, `MIS_15MIN_FULL_SYNC_`, `APPLY_DASHBOARD_PROTECTION_`, `DASHBOARD_SYNC_TRIGGER_ENGINE` exist as named functions and are properly closed.
   - Verify `appsscript.json` lists all OAuth scopes.

7. Verification:
   - Run a Python or Node verification script to check every Acceptance Criteria:
     * `index.html` has exactly one `</html>`
     * `smart_form.html` contains `</form>`, `</html>`, and >= 3 `<option>`s in `entry_type`
     * `calling.html` contains `.ai-metric-label` with complete CSS and ends with `</html>`
     * All 4 HTML files end with `</html>`
     * Every `google.script.run` function used in HTML exists as a top-level function in `Code.gs`
     * `GET_TAT_BY_PRODUCT_` has closing `}`
     * Named functions exist in `Code.gs`.
   - Write full verification output and test results in your handoff report `.agents/worker_m2_m3/handoff.md`.
   - Send completion message to parent.
</USER_REQUEST>
