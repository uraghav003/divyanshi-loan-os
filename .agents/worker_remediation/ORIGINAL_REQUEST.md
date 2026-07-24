## 2026-07-24T04:13:03Z
You are the Remediation Worker subagent for Milestone 4 (Integrity Fixes in Code.gs & calling.html).
Your working directory is: `C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os\.agents\worker_remediation`
Workspace root: `C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os`

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Detailed Instructions:

1. Setup:
   - Create your working directory `.agents/worker_remediation` and write your `BRIEFING.md` and `progress.md`.
   - Read the Remediation Plan at `.agents/explorer_remediation/remediation_plan.md`.

2. Update `Code.gs` (`C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os\Code.gs`):
   Replace Section 20 facade functions with genuine logic exactly as specified in `remediation_plan.md`:
   - `P1_GET_CALLING_QUEUE(p)`: Query live `GET_MASTER_SNAPSHOT_()`, filter by staff `empCode` via `P1_CALLING_CAN_ACCESS_()`, map fields, and compute real statistics (`tatBreaches`, `pending`, `doneToday`, `tatHealth`, `performance`, `aiAvailable`).
   - `P1_CALLING_AI_REMARK(p)`: Query case details from `GET_MASTER_SNAPSHOT_()` and delegate dynamic prompt to `BULBHUL_CHAT_API_()`.
   - `P1_UPDATE_CALLING_CASE(p)` & `P1_CALLING_UPDATE(p)`: Write disposition, status, remarks, duration to `MASTER_DATA` & `COMMON_ENTRY` via `UPSERT_MERGE_BY_KEY_()`.
   - `P1_SAVE_CALC_LEAD(p)`: Route lead data through `P1_HANDLE_INTAKE_()`.
   - `MLA_UPDATE_MINI_STATUS(p)`: Merge call status, notes, and mobile into `MASTER_DATA` & `COMMON_ENTRY` via `UPSERT_MERGE_BY_KEY_()`.

3. Update `calling.html` (`C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os\calling.html`):
   - Update line 519 `google.script.run...P1_GET_CALLING_QUEUE(AGENT_CODE, ACCESS_TOKEN)` to pass object `{empCode: AGENT_CODE, accessToken: ACCESS_TOKEN}`.

4. Local Verification:
   - Run a python/node script to verify:
     * Zero occurrences of `'LD_1001'`, `'Rahul Sharma'`, or hardcoded mock queues in `Code.gs`.
     * `Code.gs` contains genuine calls to `GET_MASTER_SNAPSHOT_()`, `BULBHUL_CHAT_API_()`, `UPSERT_MERGE_BY_KEY_()`, and `P1_HANDLE_INTAKE_()` in Section 20.
     * All HTML files end with `</html>`.
     * `run_verification.py` passes 100%.

5. Deliver Handoff Report:
   - Write handoff report to `.agents/worker_remediation/handoff.md` and send message to parent.
