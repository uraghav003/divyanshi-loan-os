# Review Report — Milestone 4 (Cross-File Consistency & Design Verification)

**Reviewer**: Reviewer 2 (Cross-File Consistency & Design Auditor)  
**Date**: 2026-07-24  
**Scope**: `index.html`, `smart_form.html`, `calling.html`, `voice.html`, `Code.gs`, `appsscript.json`  

---

## Executive Summary

**Verdict**: **REQUEST_CHANGES (VETO)**  
**Overall Risk Level**: **HIGH**  
**Integrity Status**: **CRITICAL INTEGRITY VIOLATION DETECTED**

While the project demonstrates high frontend HTML structural validity, clean tag syntax, and complete RPC name alignment between HTML JS and `Code.gs`, deep code inspection revealed multiple **facade/stub implementations** in `Code.gs` Section 20. These functions return hardcoded static data or dummy success objects without executing real business logic, database persistence, Drive storage, or external API communication.

---

## Detailed Findings

### 1. Integrity Violation — Facade / Mock Implementations in `Code.gs`
- **Severity**: **CRITICAL**
- **Tag**: `INTEGRITY VIOLATION`
- **Location**: `Code.gs` (Section 20, Lines 1475–1607)
- **Description**: The following RPC endpoints present facade implementations returning hardcoded or synthetic success responses:
  1. `P1_GET_CALLING_QUEUE` (Line 1475): Returns a hardcoded `mockQueue` array of 3 sample leads (`LD_1001 Rahul Sharma`, `LD_1002 Priya Singh`, `LD_1003 Amit Verma`) instead of querying live assigned lead records from `MASTER_DATA` or `COMMON_ENTRY`.
  2. `P1_CALLING_AI_REMARK` (Line 1507): Returns a hardcoded static string (`"Client profile analyzed. Highly suitable for Personal Loan..."`) instead of executing `BULBHUL_CHAT_API_` or `MULTI_BRAIN_REPLY_`.
  3. `P1_UPDATE_CALLING_CASE` / `P1_CALLING_UPDATE` (Line 1533 & 1547): Returns `{ ok: true, success: true }` without writing disposition updates to `MASTER_DATA` or `COMMON_ENTRY`.
  4. `P1_SAVE_CALC_LEAD` (Line 1555): Returns dummy `{ ok: true, success: true, leadId: ... }` without persisting lead data to `COMMON_ENTRY` or `MASTER_DATA`.
  5. `P1_MINI_CRM_UPLOAD` (Line 1520): Returns dummy success without reading base64 file payloads, saving files to Google Drive, or recording details in `SALES_ACTIVITY`.
  6. `P1_VOICE_CALL` / `P1_PROCESS_VOICE_COMMAND` (Line 1567 & 1580): Returns dummy success message without integrating with FreePBX/WebRTC backend.
  7. `MLA_UPDATE_MINI_STATUS` (Line 1588): Returns dummy success without writing status updates to the master spreadsheet.
  8. `DC_TG_BROADCAST` (Line 1600): Returns dummy broadcast ID without calling `UrlFetchApp.fetch` to send messages via Telegram Bot API.
- **Impact**: Frontend components appear functional during superficial UI testing, but user data, call dispositions, EMI calculator submissions, and CRM file uploads are quietly lost without any persistence in the Google Sheet database.
- **Required Remediation**: Replace mock/facade implementations with real sheet reads/writes using existing helpers (`UPSERT_BY_KEY_`, `UPSERT_MERGE_BY_KEY_`, `P1_SAVE_CLIENT_DOCS_`, `BULBHUL_CHAT_API_`, `UrlFetchApp.fetch`).

---

### 2. Design Palette Audit
- **Severity**: **MINOR / OBSERVATION**
- **Brand Palette**: Primary Gold (`#C9A84C`), Dark Blue (`#0B1F3A`).
- **Audit Findings**:
  - `index.html`: Fully aligned (`--primary: #C9A84C`, `--bg: #0B1F3A`).
  - `smart_form.html`: Fully aligned (`--gold: #C9A84C`, `--blue: #0B1F3A`, `theme-color: #0B1F3A`).
  - `calling.html`: Fully aligned (`--primary: #C9A84C`, `--bg: #0B1F3A`, `theme-color: #0B1F3A`).
  - `Code.gs` (`_P1_ERROR_PAGE_`): Fully aligned (`background: #0B1F3A`, `h2 color: #C9A84C`).
  - `voice.html`: Uses a custom futuristic dark navy theme (`--bg: #020617`, `--blue: #2563eb`). While functional for a voice console widget, it diverges from the primary `#C9A84C` / `#0B1F3A` brand palette variables.

---

### 3. Cross-File RPC Function Consistency
- **Status**: **PASS (100% Mapping)**
- **Verification Details**:
  - `index.html`: `P1_SAVE_CALC_LEAD`, `P1_SMART_FORM_SUBMIT`, `MLA_UPDATE_MINI_STATUS`, `DC_TG_BROADCAST`, `BULBHUL_CHAT_API`, `P1_VERIFY_ACCESS` → All defined in `Code.gs`.
  - `smart_form.html`: `P1_GET_HR_PUBLIC_CONFIG`, `P1_ISSUE_UPLOAD_TOKEN`, `P1_GET_LOAN_CATALOG`, `P1_SMART_FORM_SUBMIT` → All defined in `Code.gs`.
  - `calling.html`: `P1_GET_CALLING_QUEUE`, `P1_CALLING_START`, `P1_CALLING_AI_REMARK`, `P1_CALLING_UPDATE`, `P1_MINI_CRM_UPLOAD`, `BULBHUL_CHAT_API` → All defined in `Code.gs`.
  - `voice.html`: `P1_PROCESS_VOICE_COMMAND` → Defined in `Code.gs`.

---

### 4. `doPost` Action Switch Routing
- **Status**: **PASS**
- **Handled Actions**: 25 case branches in `Code.gs` (`health_check`, `chat`, `get_products`, `get_doc_requirements`, `get_hr_public_config`, `intake`, `issue_upload_token`, `get_master_control`, `get_employee`, `get_source_routing`, `mis_sync`, `invalidate_cache`, `smart_form_submit`, `verify_access`, `get_calling_queue`, `calling_start`, `calling_ai_remark`, `mini_crm_upload`, `update_calling_case`, `calling_update`, `save_calc_lead`, `voice_call`, `process_voice_command`, `update_mini_status`, `tg_broadcast`).

---

### 5. HTML Syntax & Structural Integrity
- **Status**: **PASS**
- **Audit Results**:
  - `index.html`: 1 doctype, 1 `<html>`, 1 `</html>`, 0 duplicate IDs, 0 unclosed tags.
  - `smart_form.html`: 1 doctype, 1 `<html>`, 1 `</html>`, 0 duplicate IDs, 0 unclosed tags.
  - `calling.html`: 1 doctype, 1 `<html>`, 1 `</html>`, 0 duplicate IDs, 0 unclosed tags.
  - `voice.html`: 1 doctype, 1 `<html>`, 1 `</html>`, 0 duplicate IDs, 0 unclosed tags.

---

## Verified Claims Matrix

| Claim / Component | Verification Method | Result | Notes |
|---|---|---|---|
| Frontend RPC functions exist in `Code.gs` | AST Regex & String match across HTML JS and `Code.gs` | PASS | 100% RPC mapping verified |
| `doPost` action switch completeness | Inspected switch cases in `Code.gs` vs API specifications | PASS | All 23 actions + aliases supported |
| HTML syntax & structural tag balance | Custom HTMLParser AST & tag stack validation | PASS | 0 unclosed non-void tags, single `</html>` per file |
| Design palette consistency | Hex color frequency & `:root` CSS variable inspection | PASS (Minor note on `voice.html`) | Gold (`#C9A84C`) & Dark Blue (`#0B1F3A`) used in core files |
| Production backend implementation logic | Deep code inspection of `Code.gs` Section 20 | **FAIL** | **Integrity Violation**: 8 RPC handlers are facade/stubs returning mock data |

---

## Required Remediation Steps

1. **`P1_GET_CALLING_QUEUE`**: Connect to `MASTER_DATA` sheet using `P1_SHEET_OBJECTS_('MASTER_DATA')` and filter cases assigned to `empCode`.
2. **`P1_CALLING_AI_REMARK`**: Wire to `BULBHUL_CHAT_API_` or `MULTI_BRAIN_REPLY_` using live case parameters instead of static string.
3. **`P1_UPDATE_CALLING_CASE`**: Call `UPSERT_MERGE_BY_KEY_` on `MASTER_DATA` sheet to update `CASE_CATEGORY`, `REMARKS`, and `LAST_UPDATED`.
4. **`P1_SAVE_CALC_LEAD`**: Call `P1_HANDLE_INTAKE_` or write entry directly to `COMMON_ENTRY` sheet.
5. **`P1_MINI_CRM_UPLOAD`**: Integrate `P1_SAVE_CLIENT_DOCS_` to store uploaded base64 attachments in Google Drive.
6. **`DC_TG_BROADCAST`**: Execute `UrlFetchApp.fetch` targeting `https://api.telegram.org/bot<TOKEN>/sendMessage` using `DC_CFG.TG_TOKEN`.
