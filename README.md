# Divyanshi Capital Unified Project

This folder is the only canonical Apps Script source. Older files and ZIPs outside this folder are historical archives and must not be mixed into deployment.

## Deployable files

- `Code.gs` — backend, sheet orchestration, role access, Divyanshi Assistant, Master Control, HR, calling and voice APIs.
- `index.html` — staff website, digital card, dashboard and authenticated module gate.
- `smart_form.html` — smart client/staff/interview/docs intake.
- `calling.html` — role-scoped assigned-case calling workspace.
- `voice.html` — authenticated FreePBX bridge interface.
- `PROJECT_CODE_PREVIEW.html` — local-only developer file tree with updated-code view and HTML preview. Do not deploy this file to the public Apps Script web app.

`AGENTS.md`, `README.md`, and `ONE_PAGE_SUMMARY.md` are project guidance and are not Apps Script source files.
`appsscript.json` pins only runtime/timezone/logging; Apps Script will calculate service scopes from the actual code during authorization. Review the generated OAuth scope screen in the owner account before publishing.

## System contract

- Staff truth: `ALL_EMPLOYEES`; product/bank/document truth: `Loan_Bank_Map`; source routing truth: `SOURCE_NAME`.
- Routing key: `MANAGER_EMAIL_ID`; `LEAD_ID` remains only the stable case/deduplication identifier.
- Flow: intake -> `COMMON_ENTRY` -> `MASTER_DATA` -> employee `PERSONAL_FILE_ID` (`MY_CASES`, then `SALES_ACTIVITY`) -> same-row status updates -> Login/Accounts/HR/MIS as applicable.
- Access: MD/Founder all; manager team; staff self/assigned work only.
- Master oversight: `SYSTEM_CONTROL`, `SYSTEM_PROCESS_CONTROL`, `AVATAR_ACTIVITY_LOG`, and Divyanshi Assistant commands.

## Required setup

1. Add/update the five deployable files in the existing Apps Script project.
2. Deploy a new version of the existing Web App; do not create a second system.
3. Run `SETUP_STANDALONE_()` and then `DC_INSTALL_P1_FINAL_()` once; approve the required permissions.
4. Set `MALLIK_API_KEY` in Apps Script Properties and the matching AI Studio server secret. Never expose it in browser code.
5. Set a unique per-employee PIN (`PIN_<EMP_CODE>` is migrated to a server-side hash at first successful sign-in). A shared `DEFAULT_PIN` is not supported.
6. Configure at least one approved AI provider key for live AI responses.
7. Configure `FREEPBX_WEBHOOK_URL` and `FREEPBX_API_TOKEN` only when real voice calling is ready.
8. Configure HR/branding/document properties listed by `technicalFixes()` as required.
9. In AI Studio, keep the existing project and use a server-side proxy to the Apps Script endpoint.
10. If Telegram is enabled, configure `TG_WEBHOOK_SECRET` and explicit `*_TG_CHAT_ID` plus `*_TG_EMP_CODE` mappings; `/core` self-registration is intentionally disabled. Built-in `DocumentApp` is used for candidate resumes; Advanced Google Docs API is not required.

## Acceptance checks

- DC002 can open Card, Dashboard, Calling, and Master Control after valid authentication.
- A normal staff account cannot see another employee's cases or department tools.
- A form link carrying `manager_email_id` routes to the correct employee and updates the same client/case through the workflow.
- Loan types, banks, TAT and document requirements come from `Loan_Bank_Map`.
- Calling and voice reject expired tokens and unassigned cases.
- Staff links carry a signed employee/manager route; the backend rejects a mismatched or expired route.
- Public client intake records consent version, privacy URL and AI disclosure; it remains closed until the approved privacy URL and consent version are configured.
- PIN change/reset revokes active sessions; Telegram requires an administrator-controlled employee mapping and webhook secret.
- Email sends are quota-aware and fail closed with an audit entry; `health_check` returns only non-sensitive readiness flags for AI Studio/monitoring.
- Loan OS website integration: configure `WEBSITE_ROUTE_EMP_CODE` (or `WEBSITE_MANAGER_EMAIL_ID`) in Apps Script Properties. The Loan OS server sends authenticated `website_lead` events; WordPress must authenticate to that server with its own webhook secret.
- No client-visible success is shown when the backend fails.

Known live prerequisites: AI Studio publication and live endpoint tests require the signed-in Google environment; FreePBX requires administrator configuration. The built-in PIN reset/change flow must use the approved employee email and HR-controlled account records.

The project deliberately does not invent legal policy. Before go-live, configure an approved HTTPS privacy notice, consent version, privacy contact, grievance officer and client/candidate retention periods. The form blocks production client submissions until the notice URL and consent version are configured.
