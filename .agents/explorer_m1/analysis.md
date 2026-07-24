# Milestone 1 Comprehensive Exploration & Audit Report (M1_Explore)

**Project Path**: `C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os`  
**Report Location**: `.agents/explorer_m1/analysis.md`  
**Date**: July 24, 2026  
**Auditor**: Explorer Subagent (Milestone 1)

---

## 1. Executive Summary

A comprehensive read-only audit of the Divyanshi Loan OS codebase was performed, examining local Google Apps Script files (`Code.gs`, `appsscript.json`) and raw HTML components fetched from GitHub (`index.html`, `smart_form.html`, `calling.html`, `voice.html`).

### Key Discoveries:
1. **`Code.gs` Status**: The backend script contains 1,397 lines of V8 Google Apps Script code across 88 function definitions. Key functions previously reported as truncated (specifically `GET_TAT_BY_PRODUCT_`) are **complete and properly closed** in the active `Code.gs` file.
2. **HTML File Completeness**:
   - `index.html` (987 lines), `smart_form.html` (991 lines), `calling.html` (745 lines), and `voice.html` (286 lines) are syntactically complete in the main branch (ending with proper `</html>` closing tags).
   - However, **severe endpoint gaps** exist between frontend `google.script.run` calls and backend `Code.gs` handler functions.
3. **Endpoint Disconnect**:
   - `smart_form.html` has full alignment with `Code.gs` backend calls (`P1_GET_LOAN_CATALOG`, `P1_GET_HR_PUBLIC_CONFIG`, `P1_ISSUE_UPLOAD_TOKEN`, `P1_HANDLE_INTAKE_`).
   - `calling.html`, `index.html`, and `voice.html` contain **8 missing backend functions** in `Code.gs` (e.g. `P1_GET_CALLING_QUEUE`, `P1_CALLING_START`, `P1_CALLING_AI_REMARK`, `P1_MINI_CRM_UPLOAD`, `P1_UPDATE_CALLING_CASE`, `P1_VERIFY_ACCESS`, `MLA_UPDATE_MINI_STATUS`, `P1_VOICE_CALL`).

---

## 2. File-by-File Technical Analysis

### 2.1 `index.html` (Public Portal & Dashboard Interface)
* **File Metrics**: 987 lines | 56,138 bytes | Valid `<!DOCTYPE html>` to `</html>`.
* **CSS & Color Theme Inspection**:
  * CSS variables: `--blue: #0B1F3A`, `--gold: #C9A84C`, `--bg: #060f1e`, `--card: #0d1d3a`, `--muted: #94A3B8`.
  * Section layout rules: Line 54 `.section { padding: 80px 5%; }` and mobile query line 155 `.section { padding:50px 5%; }`.
  * Visual standardization requirement: Ensure `--primary: #C9A84C` and `--bg: #0B1F3A` are consistently aliased across all components.
* **Frontend-to-Backend Mismatches in `index.html`**:
  | Frontend Function Call | Target Line | Code.gs Status | Impact / Fix Required |
  |---|---|---|---|
  | `google.script.run.P1_SMART_FORM_SUBMIT(formData)` | Line 720 | ❌ Missing | Replace call with `P1_HANDLE_INTAKE_` or add `P1_SMART_FORM_SUBMIT` alias in `Code.gs`. |
  | `google.script.run.MLA_UPDATE_MINI_STATUS(callData)` | Line 805 | ❌ Missing | Missing backend call logger function in `Code.gs`. |
  | `google.script.run.DC_TG_BROADCAST(...)` | Line 828 | ❌ Missing | Missing Telegram broadcast function in `Code.gs`. |
  | `google.script.run.BULBHUL_CHAT_API(...)` | Line 870 | ✅ Present | Aligned with `Code.gs` line 582. |
  | `google.script.run.P1_VERIFY_ACCESS(...)` | Line 947 | ❌ Missing | Staff access gate verification wrapper missing in `Code.gs`. |

---

### 2.2 `smart_form.html` (Smart Intake & Lead Submission Engine)
* **File Metrics**: 991 lines | 57,338 bytes | Valid HTML structure.
* **Form Structure & Step Workflow**:
  * **Step 1: Entry & Primary Information**: Includes `entry_type` select (`SALES_LEAD`, `CLIENT_ENTRY`, `NEW_STAFF_ENTRY`, `VISITOR_ENTRY`).
  * *Missing Options*: `INTERVIEW_ENTRY` (handled in JS on line 563 but missing from `<select>`), `PARTNER_ENTRY` / `DSA_ENTRY`.
  * **Step 2: Loan Details & Preferred Lenders**: Dynamic Loan Type dropdown, Employment Type, Loan Amount, Preferred Bank Chip Selector (`renderBankChips()`), Manager Email, Referral Code.
  * **Step 3: Document Checklist & Verification**:
    * Dynamic document checklist (`renderDocChecklist()`) based on loan type and employment category (PAN, Aadhaar/OVD, Photo, Salary Slips/ITR, Bank Statements, Property Title Docs).
    * File upload interface (`docFiles` file input with 5MB individual / 10MB total constraints).
    * Mandatory Data Processing Consent & AI Redaction Notice checkboxes.
    * Live AI Pre-check monitor block (`runAIMonitor()`).
* **Backend Endpoint Alignment**:
  * ✅ `P1_GET_LOAN_CATALOG()` — Line 804 in `Code.gs`
  * ✅ `P1_GET_HR_PUBLIC_CONFIG()` — Line 473 in `Code.gs`
  * ✅ `P1_ISSUE_UPLOAD_TOKEN(SUBMISSION_KEY, route)` — Line 832 in `Code.gs`
  * ✅ `P1_HANDLE_INTAKE_(payload)` — Line 1115 in `Code.gs`

---

### 2.3 `calling.html` (Sales & Staff Calling Desk Workspace)
* **File Metrics**: 745 lines | 55,356 bytes | Valid HTML structure.
* **UI Component Analysis**:
  * CSS Styling: Includes JetBrains Mono font, dark mode theme variables (`--primary-light: #E5C158`, `--bg: #0B1F3A`), call control animations, disposition modal, and responsive media queries.
  * Body Structure: Top status header (time, connection state, notifications), Preloader animation, Stats grid (`statsPending`, `statsDone`, `aiTatMetric`), Lead Contact Card (name, mobile, loan type, preferred bank, call action buttons), Call Overlay Modal (timer, audio waveform, mute/end call controls), Disposition & Notes Modal (disposition selector, remarks input, file attachment upload block), Bulbhul AI Assistant Panel.
* **Backend Endpoint Gaps in `calling.html`**:
  | Invoked Endpoint | HTML Line | Status in `Code.gs` | Required Implementation |
  |---|---|---|---|
  | `P1_GET_CALLING_QUEUE` | Line 335 | ❌ Missing | Returns caller queue array for logged-in employee (`CRM_LIST`). |
  | `P1_CALLING_START` | Line 405 | ❌ Missing | Records call attempt initiation timestamp in `SALES_ACTIVITY`. |
  | `P1_CALLING_AI_REMARK` | Line 450 | ❌ Missing | Generates AI disposition suggestion based on lead history. |
  | `BULBHUL_CHAT_API` | Line 510 | ✅ Present | Aligned with `Code.gs` line 582. |
  | `P1_MINI_CRM_UPLOAD` | Line 530 | ❌ Missing | Saves uploaded case attachments to Drive and links URL. |
  | `P1_UPDATE_CALLING_CASE` | Line 540 | ❌ Missing | Saves call outcome, remarks, disposition, and schedules next follow-up. |

---

### 2.4 `voice.html` (FreePBX / WebRTC Voice Bridge Preview)
* **File Metrics**: 286 lines | 8,888 bytes | Ends cleanly with `</html>`.
* **Completeness & Functionality Audit**:
  * Includes complete UI layout: header, lead phone input, call status indicator (`bridgeStatus`), action log terminal, initiate call button, and `initVoice()` startup script.
  * **Backend Gap**: Invokes `P1_VOICE_CALL` / `P1_INITIATE_VOICE_CALL` via `google.script.run`, which is **MISSING** in `Code.gs`. When opened standalone, displays "Preview Only / Backend not connected".

---

## 3. Code.gs Deep Audit

### 3.1 Verification of Target Backend Functions

1. **`GET_TAT_BY_PRODUCT_` (Lines 910–918)**:
   * **Verification Result**: **COMPLETE & VALID**.
   * **Code Inspection**:
     ```javascript
     function GET_TAT_BY_PRODUCT_(loanType,preferredBank){
       const key=String(loanType||'').trim().toUpperCase(),catalog=GET_LOAN_BANK_CATALOG_();
       const selected=String(preferredBank||'').split(',').map(x=>x.trim().toUpperCase()).filter(Boolean);
       if(selected.length){const matching=catalog.rules.filter(rule=>rule.loanType.toUpperCase()===key&&selected.includes(rule.bank.toUpperCase())&&Number(rule.tatDays)>0);if(matching.length)return Math.min.apply(null,matching.map(rule=>Number(rule.tatDays)));}
       const matchingAll=catalog.rules.filter(rule=>rule.loanType.toUpperCase()===key&&Number(rule.tatDays)>0);
       if(matchingAll.length)return Math.min.apply(null,matchingAll.map(rule=>Number(rule.tatDays)));
       const product=catalog.products.find(p=>p.name.toUpperCase()===key);
       return product?product.tat:7;
     }
     ```
   * Function is fully closed with matching `}` and contains valid bank-specific TAT lookup logic with fallbacks.

2. **`MIS_15MIN_FULL_SYNC_` (Lines 1003–1025)**:
   * **Verification Result**: **COMPLETE & FUNCTIONAL**.
   * Uses script locks (`LockService.getScriptLock()`) with 30-second timeout. Reads `MASTER_DATA`, groups cases by `EMP_CODE`, syncs to personal employee Google Sheets (`P1_SYNC_PERSONAL_FILE_`), calls `SYNC_MASTER_CONTROL_CENTER_()`, and clears cache keys.

3. **`APPLY_DASHBOARD_PROTECTION_` (Lines 1043–1054)**:
   * **Verification Result**: **COMPLETE & FUNCTIONAL**.
   * Normalizes editor email lists, sets sheet-level protection, removes unauthorized editors, and explicitly adds MD/Founder allowed editors.

4. **`DASHBOARD_SYNC_TRIGGER_ENGINE` (Lines 1081–1093)**:
   * **Verification Result**: **COMPLETE & FUNCTIONAL**.
   * Checks `DASHBOARD_SYNC_PENDING` property in `PropertiesService`, acquires script lock, executes `SYNC_ROLE_DASHBOARDS_AND_LOCK_ENGINE_()`, and resets pending flag.

---

### 3.2 Backend `doPost()` Handler Catalog

The `doPost(e)` function (lines 1239–1314) parses incoming JSON/URL-encoded requests and dispatches to 12 distinct action cases:

```javascript
switch(action) {
  case 'health_check':        // System status & AI key count
  case 'chat':                // BULBHUL_CHAT_API_(p)
  case 'get_products':        // P1_GET_LOAN_CATALOG()
  case 'get_doc_requirements':// P1_GET_DOC_REQUIREMENTS(...)
  case 'get_hr_public_config':// P1_GET_HR_PUBLIC_CONFIG()
  case 'intake':              // P1_HANDLE_INTAKE_(p)
  case 'issue_upload_token':  // P1_ISSUE_UPLOAD_TOKEN(...)
  case 'get_master_control':  // Requires API Key -> P1_GET_MASTER_CONTROL_()
  case 'get_employee':        // Requires API Key -> FIND_EMPLOYEE_FULL_()
  case 'get_source_routing':  // Requires API Key -> GET_SOURCE_ROUTING_MAP_()
  case 'mis_sync':            // Requires API Key -> MIS_15MIN_FULL_SYNC_()
  case 'invalidate_cache':   // Requires API Key -> INVALIDATE_ALL_CACHES_()
}
```

---

## 4. `appsscript.json` Configuration Audit

```json
{
  "timeZone": "Asia/Kolkata",
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  },
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/script.send_mail",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/script.scriptapp",
    "https://www.googleapis.com/auth/script.container.ui"
  ],
  "dependencies": {
    "enabledAdvancedServices": [
      { "userSymbol": "Gmail", "version": "v1", "serviceId": "gmail" },
      { "userSymbol": "Drive", "version": "v3", "serviceId": "drive" },
      { "userSymbol": "Sheets", "version": "v4", "serviceId": "sheets" }
    ]
  }
}
```

* **Security & Execution Settings**:
  * `access: ANYONE_ANONYMOUS` is correctly configured to allow unauthenticated public intake from `smart_form.html` and `index.html`.
  * `executeAs: USER_DEPLOYING` ensures script execution has full authority to write to the master spreadsheet and personal employee sheets.
  * All required OAuth scopes and Advanced Services (Sheets v4, Drive v3, Gmail v1) are explicitly declared.

---

## 5. Summary of Missing Backend Functions Needed for Milestone 2

To achieve complete end-to-end functionality across all 4 frontend views, the following functions must be added to `Code.gs` in subsequent implementation milestones:

1. `P1_VERIFY_ACCESS(empCode, pinCode)` — Validates staff employee code + PIN and returns `{success: true, accessToken: '...'}`.
2. `P1_GET_CALLING_QUEUE(p)` — Fetches calling desk lead queue assigned to employee.
3. `P1_CALLING_START(p)` — Logs call start timestamp for duration tracking.
4. `P1_CALLING_AI_REMARK(p)` — Returns AI assistance disposition suggestion.
5. `P1_MINI_CRM_UPLOAD(p)` — Uploads calling desk attachments to Google Drive.
6. `P1_UPDATE_CALLING_CASE(p)` — Updates case disposition, remarks, follow-up date in `MASTER_DATA` / `SALES_ACTIVITY`.
7. `P1_SAVE_CALC_LEAD(p)` — Saves EMI calculator lead submissions.
8. `P1_VOICE_CALL(p)` — Voice call initiation request handler.

---

## 6. Verification Method

To verify these findings independently:
1. View `Code.gs` lines 910–918 to confirm `GET_TAT_BY_PRODUCT_` syntax and closing bracket.
2. View `Code.gs` lines 1239–1314 to confirm `doPost` action cases.
3. Inspect `index.html`, `smart_form.html`, `calling.html`, and `voice.html` in `.agents/explorer_m1/` to confirm HTML structure and `google.script.run` calls.
