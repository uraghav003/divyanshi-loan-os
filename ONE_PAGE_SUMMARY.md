# Divyanshi Capital — One-Page Project Summary

## Purpose

One AI-assisted enterprise workspace connects loan intake, employee assignment, personal work files, sales activity, login processing, HR onboarding, management monitoring, calling, voice and digital identity. The existing Apps Script Web App is the operational backend; the existing Google AI Studio app is the staff-facing enterprise interface. This is one integrated project, not separate rebuilt apps.

## Single sources of truth

`ALL_EMPLOYEES` controls employee identity, role, department, manager, access and `PERSONAL_FILE_ID`. `Loan_Bank_Map` controls active loan products, banks, TAT, policy and document requirements. `SOURCE_NAME` controls business routing. `COMMON_ENTRY` is the intake ledger, `MASTER_DATA` is the consolidated case record, `HR_MD_APPROVAL` controls staff approval/onboarding, and `SYSTEM_CONTROL` is management's operational view.

## Business flow

Every form/API entry is validated and routed primarily by `MANAGER_EMAIL_ID`. `LEAD_ID` remains a stable case/deduplication identifier only. The same case flows from `COMMON_ENTRY` to `MASTER_DATA`, then to the correct employee's `PERSONAL_FILE_ID` in `MY_CASES` and `SALES_ACTIVITY`. Status changes update the existing case. Selecting `SEND TO LOGIN` transfers the same case to the login workflow; approvals, bank feedback, documents, TAT and remarks stay attached to that case. HR entries wait in `HR_MD_APPROVAL`; employee code, salary and active status are finalized by HR/MD before joining-kit actions.

## Role model and AI

DC002 is the MD master identity. MD/Founder can monitor the whole system, managers only their teams, and staff only their assigned/self work. Card, dashboard, calling, voice, targets, work queues and Divyanshi Assistant responses must follow this scope. `SYSTEM_CONTROL`, `SYSTEM_PROCESS_CONTROL` and `AVATAR_ACTIVITY_LOG` show workload, performance, TAT breaches, errors, process health and next actions. Divyanshi Assistant may advise and monitor but must never invent a call, approval, document check, lead or success result.

## Interfaces

`index.html` provides digital identity, dashboard and authenticated module access. `smart_form.html` provides client, staff, interview, banker and document intake with consent and lender-oriented document guidance. `calling.html` loads only assigned cases and records verified dispositions. `voice.html` sends only assigned-case calls to a configured FreePBX HTTPS bridge. The AI Studio application must call Apps Script through a server-side proxy; secrets never go into browser code.

## Current readiness and remaining live work

**Canonical source correction:** this `DIVYANSHI_CAPITAL_UNIFIED_PROJECT_2026-07-18` folder is the deployment source. Do not mix it with historical `FINAL_DEPLOY` copies.

The unified source is `FINAL_DEPLOY`: `Code.gs`, `index.html`, `smart_form.html`, `calling.html`, and `voice.html`. Hard-coded fallback credentials and sample/demo data were removed, employee verification now uses one throttled backend path, dashboard payloads require a server-validated token, staff links use signed employee/manager routing, public intake records consent and AI disclosure, Divyanshi Assistant requires a verified session and remains advisory-only, Telegram uses administrator-controlled chat mappings and a webhook secret, PIN reset/change revokes sessions, outbound mail is quota-aware, the public health action exposes only safe readiness flags, and the installable edit handler runs once. Before production close: update the existing Apps Script deployment, run `SETUP_STANDALONE_()` followed by `DC_INSTALL_P1_FINAL_()`, configure server secrets, privacy policy and unique employee PINs, test DC002 plus one manager and one staff account, verify a full form-to-personal-file-to-login case, then update/publish the existing AI Studio app. FreePBX stays disabled until its real URL/token exist.

Production sign-off still requires: rate limiting/bot protection for public intake; Google Form consent/routing validation parity; a real privacy notice covering AI processors, retention and grievance/withdrawal; secret validation for Telegram webhook traffic; review of short-lived launch tokens and the intentionally public smart-form embed; and AI Studio session binding so its server proxy cannot request another employee's scope. MD, HR and Login/Operations should approve the live smoke test and retain the prior Apps Script deployment as rollback.
