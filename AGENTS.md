# Divyanshi Capital Project Rules

1. Time is precious. For substantial, independent work, use the maximum useful parallel agents with non-overlapping scopes; keep one integration owner. Do not create agent overhead for a small task.
2. This folder is the canonical project. Do not rebuild, recreate, or replace the complete application when a minimal repair is possible.
3. Preserve existing design and public behavior unless a requested correction requires a change.
4. Never mix staff work. Visibility and actions must follow employee code, role, department, manager relationship, and access level from `ALL_EMPLOYEES`.
5. `MANAGER_EMAIL_ID` is the routing key. `LEAD_ID` is only a case identifier/deduplication key, never the staff-routing source.
6. Authoritative sheets are `ALL_EMPLOYEES`, `Loan_Bank_Map`, `SOURCE_NAME`, `COMMON_ENTRY`, `MASTER_DATA`, `HR_MD_APPROVAL`, and `SYSTEM_CONTROL`. Do not create competing stores.
7. Expected case flow is `Form/API -> COMMON_ENTRY -> MASTER_DATA -> employee PERSONAL_FILE_ID/MY_CASES -> SALES_ACTIVITY`; `SEND TO LOGIN` continues the same case into the login workflow without creating a new client row.
8. DC002 is the MD master-control identity. MD/Founder may see all; managers see their team; staff see only assigned/self work.
9. Never ship fake leads, fake calls, fake AI results, hard-coded passwords/PINs, browser-exposed API keys, or success messages before the backend confirms success.
10. Secrets belong only in Apps Script Properties or the AI Studio server environment. Do not log, embed, or commit them.
11. Before handoff, run syntax/static checks, inspect the changed flow, list required configuration, and clearly separate verified facts from live-deployment steps.
12. Improve by recording reusable verified rules in this file or the project README; do not silently broaden scope or install untrusted tools.

