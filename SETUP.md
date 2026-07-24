# Divyanshi Capital Loan OS — Deployment & Setup Guide

This guide provides step-by-step instructions to deploy, configure, and initialize the **Divyanshi Capital Loan OS** on Google Apps Script and Google Sheets.

---

## Overview of System Files

- **`Code.gs`**: Master Apps Script backend (REST APIs, data router, AI fallback system, logging, triggers).
- **`SETUP_PROPERTIES.gs`**: Script Property helper script (`setupProperties()` and `verifyProperties()`).
- **`appsscript.json`**: Manifest configuration file (scopes, web app config, time zone).
- **`index.html`**: Master Staff Dashboard frontend.
- **`smart_form.html`**: Customer & Staff Loan Application Smart Form.
- **`calling.html`**: Telecalling & Lead Management Console.
- **`voice.html`**: Voice AI / Audio Notes Interface.

---

## Step-by-Step Deployment Protocol

### Step 1: Open Master Google Spreadsheet & Apps Script Editor
1. Open the Master Spreadsheet in Google Sheets:
   - **Spreadsheet ID**: `1Mk9AzGdKK07WZCKV6lZgtlM4JWy2sdESQwh70r0UicU`
   - **Direct URL**: `https://docs.google.com/spreadsheets/d/1Mk9AzGdKK07WZCKV6lZgtlM4JWy2sdESQwh70r0UicU/edit`
2. From the top menu, navigate to:
   - **`Extensions`** → **`Apps Script`**.

---

### Step 2: Copy Backend and Frontend Files into Apps Script
Create and copy the content for each file into the Apps Script project editor:

1. **`Code.gs`** (Server-side Script File):
   - Replace default content in `Code.gs` with the content of `Code.gs` from this repository.
2. **`appsscript.json`** (Manifest File):
   - Enable manifest editing: Click **Project Settings** (gear icon) → Check **"Show \"appsscript.json\" manifest file in editor"**.
   - Return to the Editor tab (`< >`), open `appsscript.json`, and replace with the repository's `appsscript.json`.
3. **`index.html`** (HTML File):
   - Click `+` → **HTML** → Name it `index`. Paste the contents of `index.html`.
4. **`smart_form.html`** (HTML File):
   - Click `+` → **HTML** → Name it `smart_form`. Paste the contents of `smart_form.html`.
5. **`calling.html`** (HTML File):
   - Click `+` → **HTML** → Name it `calling`. Paste the contents of `calling.html`.
6. **`voice.html`** (HTML File):
   - Click `+` → **HTML** → Name it `voice`. Paste the contents of `voice.html`.

---

### Step 3: Add `SETUP_PROPERTIES.gs` & Run Default Initialization
1. Click `+` → **Script** → Name it `SETUP_PROPERTIES`.
2. Paste the contents of `SETUP_PROPERTIES.gs`.
3. Select `setupProperties` from the top function dropdown menu and click **Run**.
4. Grant authorization when prompted by Google Apps Script.
5. `setupProperties()` will set default non-secret values idempotently:
   - `PRIVACY_NOTICE_URL`: `https://www.divyanshicapital.com/privacy`
   - `CONSENT_VERSION`: `v1.0`
   - `PRIVACY_CONTACT_EMAIL`: `support@divyanshicapital.com`
   - `GRIEVANCE_OFFICER_NAME`: `Grievance Officer - Divyanshi Capital`
   - `HR_TC_URL`: `https://www.divyanshicapital.com/hr-terms`
   - `COMPANY_WEBSITE_URL`: `https://www.divyanshicapital.com`

---

### Step 4: Configure Secret API Keys in Script Properties
Navigate to **Project Settings** (Gear icon on the left sidebar) → Scroll down to **Script Properties** → Click **Edit script properties** / **Add script property**.

Add the following 5 secret keys manually:

| Property Key | Description / Purpose |
|---|---|
| `MALLIK_API_KEY` | Internal API secret for route URL signing & auth gate |
| `DEEPSEEK_API_KEY` | DeepSeek API key (Primary AI brain for evaluation & chat) |
| `OPENAI_API_KEY` | OpenAI API key (Fallback AI brain) |
| `GEMINI_API_KEY` | Gemini API key (Fallback AI brain) |
| `CLIENT_DOCS_FOLDER_ID` | Google Drive Folder ID for client document uploads |

After adding all secrets, return to `SETUP_PROPERTIES.gs`, run `verifyProperties()`, and confirm in Execution Log that `allValid` returns `true` and all 11 keys show `[SET]`.

---

### Step 5: Deploy as Web App
1. Click **Deploy** button (top right) → **New deployment**.
2. Click the gear icon next to "Select type" → Select **Web app**.
3. Fill in Deployment Settings:
   - **Description**: `Divyanshi Capital Loan OS Production Deployment`
   - **Execute as**: `Me (USER_DEPLOYING)` (Runs under your Google account permissions).
   - **Who has access**: `Anyone` (`ANYONE_ANONYMOUS`).
4. Click **Deploy**.
5. Copy the generated **Web App URL** (e.g., `https://script.google.com/macros/s/.../exec`).

---

### Step 6: Initialize Spreadsheet Structure & Staff URLs
1. In the Apps Script editor, open `Code.gs`.
2. Select `DC_INSTALL_P1_FINAL_` from the function dropdown menu.
3. Click **Run**.
4. This initialization process will:
   - Create missing tabs (`MASTER_DATA`, `COMMON_ENTRY`, `ALL_EMPLOYEES`, `SMART_LOG`, `SOURCE_NAME`, `MIS_LOG`, `AUDIT_LOG`, etc.) with correct column schemas.
   - Generate custom staff URLs (`STAFF_URL`, `P1_DASHBOARD_URL`, `P1_SMART_FORM_URL`, `P1_CALLING_URL`, `P1_VOICE_URL`, etc.) for all registered active employees in `ALL_EMPLOYEES`.
   - Clear and reset system caches.

---

### Step 7: Configure Time-Driven Automation Triggers
Navigate to **Triggers** (Clock icon on the left sidebar) → Click **Add Trigger** (bottom right):

1. **Trigger 1: 15-Minute Sync & Health Check**
   - **Choose function to run**: `MIS_TRIGGER_15MIN_`
   - **Choose deployment**: `Head`
   - **Select event source**: `Time-driven`
   - **Select type of time based trigger**: `Minutes timer`
   - **Select minute interval**: `Every 15 minutes`
   - Click **Save**.

2. **Trigger 2: Hourly Master Control & TAT Audit**
   - **Choose function to run**: `MASTER_CONTROL_TRIGGER_1H_`
   - **Choose deployment**: `Head`
   - **Select event source**: `Time-driven`
   - **Select type of time based trigger**: `Hour timer`
   - **Select hour interval**: `Every hour`
   - Click **Save**.

---

## Verification & Health Check

To verify deployment success:
1. Run `verifyProperties()` in `SETUP_PROPERTIES.gs` and ensure `allValid` is `true`.
2. Open the Web App URL in a browser with query parameter `?action=ping` (e.g., `https://script.google.com/macros/s/.../exec?action=ping`) and verify it returns a successful JSON status response.
3. Verify that all tabs in Spreadsheet `1Mk9AzGdKK07WZCKV6lZgtlM4JWy2sdESQwh70r0UicU` are properly formatted.
