# Technical Analysis & Specifications — Divyanshi Capital Loan OS Setup Automation (R3)

**Author**: Explorer Subagent  
**Date**: 2026-07-24  
**Metadata Working Directory**: `C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os\.agents\explorer_setup`  
**Project Working Directory**: `C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os`  

---

## 1. Executive Summary

This report provides a comprehensive read-only audit of the Divyanshi Capital Loan OS codebase (`Code.gs`, `appsscript.json`, HTML views, and Git repository state) along with complete technical specifications for:
1. `SETUP_PROPERTIES.gs`: Idempotent script property setup and verification suite.
2. `SETUP.md`: End-to-end deployment manual covering Web App deployment, initialization, secret configuration, and time-driven trigger setup.
3. **Git Staging and Push Plan for R3**: File staging strategy, commit formatting, and remote push instructions.

---

## 2. Inspection of `Code.gs` & Script Property Keys Verification

A full inspection of `Code.gs` (1,807 lines, 94,905 bytes) was conducted to trace all references to `PropertiesService.getScriptProperties()` and verify the usage of all **11 Script Property keys**.

### 2.1 Summary Matrix of 11 Script Property Keys

| # | Script Property Key | Category | Code.gs Location(s) | Default / Fallback Value | Functional Purpose in Loan OS |
|---|---|---|---|---|---|
| 1 | `MALLIK_API_KEY` | Secret (API Key) | Lines 137, 1402 | `''` (Required for auth) | Master secret API key for RPC authentication (`P1_VERIFY_ROUTE_SIGNATURE_`), signature generation (`P1_ROUTE_SIGNATURE_`), and endpoint security. |
| 2 | `DEEPSEEK_API_KEY` | Secret (AI Key) | Line 131 | `''` | API Key for DeepSeek LLM provider calls in AI engine (`DC_CFG.DEEPSEEK_KEY`). |
| 3 | `OPENAI_API_KEY` | Secret (AI Key) | Line 132 | `''` | API Key for OpenAI provider calls (`DC_CFG.OPENAI_KEY`). |
| 4 | `GEMINI_API_KEY` | Secret (AI Key) | Line 133 | `''` | API Key for Google Gemini provider calls (`DC_CFG.GEMINI_KEY`). |
| 5 | `PRIVACY_NOTICE_URL` | Public / Config | Lines 475, 1154, 1402 | `''` | Public URL for privacy notice. Checked in `P1_GET_HR_PUBLIC_CONFIG()` via `/^https:\/\//i`. Validated during intake submission (`P1_HANDLE_INTAKE_`). |
| 6 | `CONSENT_VERSION` | Public / Config | Lines 481, 1152, 1402 | `''` | Version identifier for client data consent compliance (e.g., `'v1.0-2026'`). |
| 7 | `PRIVACY_CONTACT_EMAIL` | Public / Config | Lines 482, 1403 | `support@divyanshicapital.com` | Contact email for privacy inquiries. Cleaned via `DC_CLEAN_EMAIL_()`. |
| 8 | `GRIEVANCE_OFFICER_NAME` | Public / Config | Lines 483, 1403 | `''` | Designated Grievance Officer name for statutory DPDP / RBI compliance. |
| 9 | `HR_TC_URL` | Public / Config | Lines 477, 1404 | `''` | URL for HR / Staff Terms & Conditions, fetched by frontend `smart_form.html` (`#tcLink`). |
| 10 | `COMPANY_WEBSITE_URL` | Public / Config | Lines 478, 1404 | `https://www.divyanshicapital.com` | Official website URL for Divyanshi Capital Pvt Ltd. |
| 11 | `CLIENT_DOCS_FOLDER_ID` | Storage / Drive | Lines 856, 860, 1404 | `''` (Auto-creates folder) | Google Drive Folder ID for storing client uploaded KYC and loan documents (`P1_CLIENT_DOCS_ROOT_()`). Auto-creates `DIVYANSHI_CLIENT_DOCUMENTS` folder if empty/invalid. |

### 2.2 Additional Script Properties Used in `Code.gs`

In addition to the 11 primary keys, the codebase utilizes internal operational state keys:
- `MASTER_FILE_ID` / `P1_MASTER_FILE_ID` (Lines 208, 213, 260): Primary Google Spreadsheet ID backing the OS database.
- `P1_EXEC_URL` / `MAIN_SERVER_EXEC_URL` (Lines 242, 260): Executable Web App URL.
- `MIS_LAST_RUN` (Lines 678, 1009): ISO timestamp of last 15-minute MIS synchronization run.
- `MASTER_CONTROL_LAST_SYNC` (Lines 727, 732): ISO timestamp of last Master Control sync.
- `DASHBOARD_SYNC_PENDING` (Lines 1078, 1082): Flag for pending dashboard sheet updates (`'YES'`).
- `CLIENT_RETENTION_DAYS` / `CANDIDATE_RETENTION_DAYS` (Lines 484, 485): Data retention policy parameters in days.
- `TG_TOKEN`, `META_WA_TOKEN`, `META_WA_PHONE_ID` (Lines 134–136): Optional notification channel tokens (Telegram / Meta WhatsApp).

### 2.3 Existing Verification Function (`technicalFixes()`)

Line 1400 of `Code.gs` defines `technicalFixes()`:
```javascript
function technicalFixes() {
  const props   = PropertiesService.getScriptProperties().getProperties();
  const required = ['MALLIK_API_KEY','PRIVACY_NOTICE_URL','CONSENT_VERSION',
    'PRIVACY_CONTACT_EMAIL','GRIEVANCE_OFFICER_NAME','HR_TC_URL',
    'COMPANY_WEBSITE_URL','CLIENT_DOCS_FOLDER_ID'];
  const missing = required.filter(k => !props[k]);
  const present = required.filter(k => !!props[k]);
  Logger.log('✅ Configured: ' + (present.join(', ')||'(none)'));
  if (missing.length) Logger.log('⚠️  Missing   : ' + missing.join(', '));
  return {present, missing};
}
```
*Note*: `technicalFixes()` checks 8 keys. The new `verifyProperties()` function in `SETUP_PROPERTIES.gs` will audit all **11 keys** including the 3 AI keys (`DEEPSEEK_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`).

---

## 3. Project Directory File Audit

| File Name | File Size | Line Count | Purpose & Integrity Status |
|---|---|---|---|
| `Code.gs` | 94,905 bytes | 1,807 lines | **Core Apps Script Backend Engine**. Contains `doGet`/`doPost`, intake processing (`P1_HANDLE_INTAKE_`), staff authentication (`P1_VERIFY_ACCESS`), AI engine (`DC_CFG`), Google Sheets database synchronization, installer (`DC_INSTALL_P1_FINAL_`), and triggers (`MIS_TRIGGER_15MIN_`, `MASTER_CONTROL_TRIGGER_1H_`). Complete and intact. |
| `appsscript.json` | 1,068 bytes | 39 lines | **Apps Script Manifest**. Specifies `V8` runtime, `Asia/Kolkata` time zone, Web App authorization (`USER_DEPLOYING`, `ANYONE_ANONYMOUS`), 9 OAuth scopes, and Advanced Services (`Gmail` v1, `Drive` v3, `Sheets` v4). Valid JSON. |
| `index.html` | 57,164 bytes | 987 lines | **Main Web Portal / Dashboard UI**. Contains responsive SPA layouts for staff dashboard, lead tracking, and system control. Integrates `google.script.run` backend calls. Complete. |
| `smart_form.html` | 58,409 bytes | 992 lines | **Public Client Loan Application Smart Form**. Public intake form with dynamic loan calculations, document upload support, and DPDP privacy/consent compliance integration. Loads config via `P1_GET_HR_PUBLIC_CONFIG()`. Complete. |
| `calling.html` | 57,439 bytes | 745 lines | **Tele-calling & CRM Dashboard**. UI for outbound calling agents, lead status transitions, calling logs (`P1_CALLING_START`), and AI script suggestions. Complete. |
| `voice.html` | 9,178 bytes | 286 lines | **Voice Assistance Component**. Interactive voice/audio bridge interface using standard browser speech synthesis and Google Apps Script bridge. Complete. |

---

## 4. Git Repository Audit

- **Current Branch**: `main`
- **Recent Commit History (`git log -n 5`)**:
  1. `fc6ce57917b6dea0dc05d7f7f16482ceaece9c2a` — `chore: sync remaining agent state` (2026-07-24 09:53:46 +0530)
  2. `4090ed7173177ee0426c1c8db97541556508a88e` — `chore: add final agent logs` (2026-07-24 09:53:21 +0530)
  3. `c859a619704c73abf2791b921d5264d37a549638` — `fix: complete truncated HTML files + merge dashboard engine into Code.gs` (2026-07-24 09:52:48 +0530)
- **Remote Configuration**:
  - `git remote -v` returned **empty output**. No remote URL is currently configured for this local git repository, and no upstream tracking branch (`@{u}`) is set.
- **Working Tree State**:
  - Uncommitted changes exist exclusively in `.agents/` metadata subdirectories (`.agents/orchestrator/BRIEFING.md`, `.agents/worker_git_push/`, `.agents/explorer_setup/`).
  - Working tree is clean regarding core project code files (`Code.gs`, HTML files, `appsscript.json`).

---

## 5. Technical Specification: `SETUP_PROPERTIES.gs`

### 5.1 Purpose & Design Principles
- **Idempotency**: Existing script properties must **NEVER** be overwritten. `setupProperties()` checks existing properties via `PropertiesService.getScriptProperties().getProperties()` and only writes keys that are currently undefined or empty string `""`.
- **Default Seeding**: Seed production-grade non-secret public defaults for Divyanshi Capital Pvt Ltd.
- **Secret Placeholders**: Seed explicit `TODO_SET_<KEY>` placeholder values for secret API keys to ensure all 11 keys exist in `ScriptProperties` while preventing accidental authorization until valid credentials are added.
- **Comprehensive Audit**: `verifyProperties()` inspects all 11 keys, categorizes each key into `VALID`, `TODO_PLACEHOLDER`, or `MISSING`, and logs a detailed report.

### 5.2 Complete Source Code Specification for `SETUP_PROPERTIES.gs`

```javascript
/**
 * ================================================================
 * DIVYANSHI CAPITAL LOAN OS — SCRIPT PROPERTIES SETUP & AUDIT
 * File: SETUP_PROPERTIES.gs
 * Description: Idempotent initialization and validation of all 11
 *              required Script Properties for Loan OS.
 * ================================================================
 */

/**
 * Initializes missing Script Properties for Divyanshi Capital Loan OS.
 * IDEMPOTENT: Existing properties are NEVER overwritten.
 */
function setupProperties() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const existing = scriptProperties.getProperties();

  // Define Divyanshi Capital defaults and secret placeholders
  const defaults = {
    // Secrets (API Keys) — Set TODO placeholders if missing
    'MALLIK_API_KEY':         'TODO_SET_MALLIK_API_KEY',
    'DEEPSEEK_API_KEY':       'TODO_SET_DEEPSEEK_API_KEY',
    'OPENAI_API_KEY':         'TODO_SET_OPENAI_API_KEY',
    'GEMINI_API_KEY':         'TODO_SET_GEMINI_API_KEY',

    // Public / Legal & HR Compliance Configurations
    'PRIVACY_NOTICE_URL':     'https://www.divyanshicapital.com/privacy',
    'CONSENT_VERSION':        'v1.0-2026',
    'PRIVACY_CONTACT_EMAIL':  'support@divyanshicapital.com',
    'GRIEVANCE_OFFICER_NAME': 'Grievance Officer',
    'HR_TC_URL':              'https://www.divyanshicapital.com/terms',
    'COMPANY_WEBSITE_URL':    'https://www.divyanshicapital.com',

    // Drive Storage Folder ID (Empty string allows P1_CLIENT_DOCS_ROOT_ to auto-create)
    'CLIENT_DOCS_FOLDER_ID':   ''
  };

  const toSet = {};
  let setCounter = 0;
  let skippedCounter = 0;

  Object.keys(defaults).forEach(key => {
    const currentVal = existing[key];
    // Write property only if key is not present or value is empty
    if (currentVal === undefined || currentVal === null || String(currentVal).trim() === '') {
      toSet[key] = defaults[key];
      setCounter++;
    } else {
      skippedCounter++;
    }
  });

  if (setCounter > 0) {
    scriptProperties.setProperties(toSet, false); // false = do not delete existing properties
    Logger.log(`✅ setupProperties(): Successfully set ${setCounter} default property keys.`);
  } else {
    Logger.log(`ℹ️ setupProperties(): All properties already exist. No changes made.`);
  }

  Logger.log(`📊 Summary: ${setCounter} set, ${skippedCounter} preserved.`);
  return verifyProperties();
}

/**
 * Audits all 11 required Script Properties for Divyanshi Capital Loan OS.
 * Logs status for each key (VALID, TODO_PLACEHOLDER, or MISSING).
 * 
 * @returns {Object} Audit result object containing lists of valid, placeholder, and missing keys.
 */
function verifyProperties() {
  const props = PropertiesService.getScriptProperties().getProperties();

  const requiredKeys = [
    'MALLIK_API_KEY',
    'DEEPSEEK_API_KEY',
    'OPENAI_API_KEY',
    'GEMINI_API_KEY',
    'PRIVACY_NOTICE_URL',
    'CONSENT_VERSION',
    'PRIVACY_CONTACT_EMAIL',
    'GRIEVANCE_OFFICER_NAME',
    'HR_TC_URL',
    'COMPANY_WEBSITE_URL',
    'CLIENT_DOCS_FOLDER_ID'
  ];

  const valid = [];
  const placeholders = [];
  const missing = [];

  requiredKeys.forEach(key => {
    const val = String(props[key] || '').trim();
    if (!val) {
      // Special case: CLIENT_DOCS_FOLDER_ID can be auto-created by DriveApp on first upload if empty
      if (key === 'CLIENT_DOCS_FOLDER_ID') {
        valid.push(`${key} (Auto-create on demand)`);
      } else {
        missing.push(key);
      }
    } else if (val.startsWith('TODO_SET_')) {
      placeholders.push(key);
    } else {
      valid.push(key);
    }
  });

  Logger.log('====================================================');
  Logger.log('  DIVYANSHI CAPITAL LOAN OS — SCRIPT PROPERTY AUDIT ');
  Logger.log('====================================================');
  Logger.log(`✅ Valid Configured Keys (${valid.length}/11):\n   - ` + (valid.join('\n   - ') || '(None)'));

  if (placeholders.length > 0) {
    Logger.log(`⚠️ Placeholder Secret Keys (${placeholders.length}/11) — ACTION REQUIRED:\n   - ` + placeholders.join('\n   - '));
    Logger.log('👉 Please replace placeholder values in Project Settings -> Script Properties UI.');
  }

  if (missing.length > 0) {
    Logger.log(`❌ Missing Required Keys (${missing.length}/11):\n   - ` + missing.join('\n   - '));
  }

  const isReady = (placeholders.length === 0 && missing.length === 0);
  Logger.log('----------------------------------------------------');
  Logger.log(`System Configuration Status: ${isReady ? 'READY FOR PRODUCTION 🚀' : 'ATTENTION REQUIRED ⚠️'}`);
  Logger.log('====================================================');

  return {
    isReady,
    validCount: valid.length,
    placeholderCount: placeholders.length,
    missingCount: missing.length,
    valid,
    placeholders,
    missing
  };
}
```

---

## 6. Technical Specification: `SETUP.md`

Below is the complete text and structure for the deployment and operational guide `SETUP.md`.

```markdown
# Divyanshi Capital Loan OS — Deployment & Operational Manual

This guide details the complete deployment process for Divyanshi Capital Loan OS on Google Apps Script.

---

## Prerequisites
- Access to a Google Account with permission to create Google Sheets and Google Apps Script projects.
- Recommended Google Workspace account with Google Drive, Sheets, and Gmail enabled.

---

## Step 1: Open Apps Script Project
1. Open [Google Sheets](https://sheets.google.com) and create a new Spreadsheet titled `Divyanshi Capital Loan OS Master`.
2. In the top menu, navigate to **Extensions** > **Apps Script**.
3. Rename the Apps Script project to `Divyanshi Capital Loan OS Backend`.

---

## Step 2: Add Project Files
Copy and paste the following files into the Apps Script editor:

1. **`appsscript.json`** (Manifest file):
   - Click the gear icon (**Project Settings** ⚙️) in the left sidebar.
   - Check **"Show "appsscript.json" manifest file in editor"**.
   - Return to the editor (`< >`), select `appsscript.json`, and replace its content with the contents of `appsscript.json`.
2. **`Code.gs`**: Create/replace `Code.gs` with the project backend code.
3. **`SETUP_PROPERTIES.gs`**: Click **+** > **Script**, name it `SETUP_PROPERTIES`, and paste the contents of `SETUP_PROPERTIES.gs`.
4. **HTML Files**: Click **+** > **HTML** for each of the following files:
   - `index.html`
   - `smart_form.html`
   - `calling.html`
   - `voice.html`

---

## Step 3: Initialize Script Properties
1. In the Apps Script editor, select function `setupProperties` from the top execution dropdown.
2. Click **Run**.
3. Authorize script permissions when prompted by Google.
4. Check the **Execution log** to verify that non-secret default properties have been created.

---

## Step 4: Configure Secret API Keys via Apps Script UI
1. Click **Project Settings** (⚙️ icon) in the left navigation sidebar.
2. Scroll down to **Script Properties**.
3. Locate the placeholder keys and click **Edit script properties**:
   - `MALLIK_API_KEY`: Set your master secret API key for RPC security.
   - `DEEPSEEK_API_KEY`: Set your DeepSeek API key.
   - `OPENAI_API_KEY`: Set your OpenAI API key.
   - `GEMINI_API_KEY`: Set your Google Gemini API key.
4. Click **Save script properties**.
5. Return to the editor, select `verifyProperties`, and click **Run**. Verify in the Execution log that `System Configuration Status` displays `READY FOR PRODUCTION 🚀`.

---

## Step 5: Execute System Installation (`DC_INSTALL_P1_FINAL_`)
1. In the top dropdown, select function `DC_INSTALL_P1_FINAL_`.
2. Click **Run**.
3. This function initializes:
   - All required Master Spreadsheet database tabs (`CLIENT_MASTER`, `SALES_LEADS`, `STAFF_MASTER`, `SYSTEM_CONTROL`, etc.).
   - Standard employee records and security credentials.
   - Staff Web App routing URLs.
   - Initial Master Control Center state.
4. Inspect the Execution log for `✅ DC_INSTALL_P1_FINAL_ complete. Staff URLs generated.`.

---

## Step 6: Deploy as Web App
1. Click **Deploy** > **New deployment** (top-right button).
2. Click the gear icon next to **Select type** and choose **Web app**.
3. Configure deployment options:
   - **Description**: `Divyanshi Capital Loan OS R3 Release`
   - **Execute as**: `Me (<your-email@domain.com>)` (`USER_DEPLOYING`)
   - **Who has access**: `Anyone` (`ANYONE_ANONYMOUS`)
4. Click **Deploy**.
5. Copy the generated **Web App URL** (ends in `/exec`).
6. *Optional*: Save the Web App URL in Script Properties under `P1_EXEC_URL` for reference.

---

## Step 7: Setup Time-Driven Triggers
To maintain real-time MIS synchronization and control center metrics, configure two time-driven triggers:

### Option A: Manual Setup via Apps Script UI
1. Click **Triggers** (⏰ icon) in the left sidebar.
2. Click **+ Add Trigger** (bottom-right):
   - **Function to run**: `MIS_TRIGGER_15MIN_`
   - **Deployment**: `Head`
   - **Event source**: `Time-driven`
   - **Type of time based trigger**: `Minutes timer`
   - **Select minute interval**: `Every 15 minutes`
   - Click **Save**.
3. Click **+ Add Trigger** again:
   - **Function to run**: `MASTER_CONTROL_TRIGGER_1H_`
   - **Deployment**: `Head`
   - **Event source**: `Time-driven`
   - **Type of time based trigger**: `Hour timer`
   - **Select hour interval**: `Every hour`
   - Click **Save**.

---

## Verification & Health Check
- Open the Web App URL in a web browser.
- Append `?page=smart_form` to open the public client application form.
- Confirm legal notice links (`Privacy Notice`, `Terms & Conditions`) resolve to configured URLs.
- Submit a test lead to confirm storage in `SALES_LEADS` and document folder initialization in Google Drive.
```

---

## 7. Git Staging & Push Plan for R3

### 7.1 Objective
Stage and track all newly added setup automation files (`SETUP_PROPERTIES.gs`, `SETUP.md`), verified project files, and associated metadata.

### 7.2 File Staging Scope
- **Project Files**:
  - `SETUP_PROPERTIES.gs` (New)
  - `SETUP.md` (New)
  - `Code.gs`
  - `appsscript.json`
  - `index.html`
  - `smart_form.html`
  - `calling.html`
  - `voice.html`
- **Agent Metadata**:
  - `.agents/explorer_setup/`
  - Relevant active agent briefing/progress files in `.agents/`

### 7.3 Step-by-Step Git Execution Commands

#### Step 1: Verify Local Workspace Status
```bash
git status
```

#### Step 2: Stage Project Code & Documentation
```bash
git add SETUP_PROPERTIES.gs SETUP.md Code.gs appsscript.json index.html smart_form.html calling.html voice.html .agents/
```

#### Step 3: Commit with Conventional Commit Formatting
```bash
git commit -m "feat(setup): add SETUP_PROPERTIES.gs, SETUP.md deployment guide, and R3 specifications"
```

#### Step 4: Configure Remote Repository & Push (When Remote is Provided)
*Note*: As observed in Section 4, no git remote is currently configured (`git remote -v` returns empty output).
When pushing to a remote repository (e.g. GitHub/GitLab), execute:
```bash
# Add remote URL if not already added
git remote add origin <REMOTE_REPOSITORY_URL>

# Push main branch and set upstream tracking
git push -u origin main
```

---

## 8. Conclusion & Recommendations

1. **Code & Property Alignment**: All 11 Script Property keys used across `Code.gs` and frontend components have been verified and mapped to functional requirements.
2. **Idempotent Properties Implementation**: `SETUP_PROPERTIES.gs` guarantees safe execution without overwriting production credentials.
3. **Deployment Readiness**: Following `SETUP.md` enables repeatable deployment of Divyanshi Capital Loan OS R3.
4. **Git Operations**: Staging plan ensures clean project history upon remote repository assignment.
