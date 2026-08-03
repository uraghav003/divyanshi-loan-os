# Deploy: Google OAuth & GitHub Secrets — Quick Fix

This document explains how to provide the missing Google OAuth credentials so the repository's CI can perform the automatic live deployment to Google Apps Script.

Why this is needed
- The workflow `.github/workflows/deploy-apps-script.yml` requires either a single `GOOGLE_CREDENTIALS` JSON secret, or the three CLASP secrets: `CLASP_CLIENT_ID`, `CLASP_CLIENT_SECRET`, and `CLASP_REFRESH_TOKEN`. Without these GitHub Actions secrets the deployment job will skip (or fail) and automatic live deploy remains pending.

Two recommended options (pick one)

Option A — Provide a single GOOGLE_CREDENTIALS JSON (recommended)
1. In Google Cloud Console (https://console.cloud.google.com):
   - Select or create the project where you manage Apps Script credentials.
   - Go to APIs & Services → Credentials → Create Credentials → OAuth client ID.
   - Choose "Desktop app" (or "Other") as the application type and create the client.
   - Copy the Client ID and Client Secret.

2. Obtain a refresh token for that client id/secret:
   - Easiest: use the OAuth 2.0 Playground (https://developers.google.com/oauthplayground):
     - Click the gear icon (top-right) and check “Use your own OAuth credentials”, paste your Client ID & Client Secret.
     - In Step 1, enter the scopes required by the workflow and clasp: 
       https://www.googleapis.com/auth/script.deployments https://www.googleapis.com/auth/script.projects https://www.googleapis.com/auth/script.webapp.deploy https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/cloud-platform
     - Authorize APIs, exchange authorization code for tokens — copy the refresh_token from the response.
   - Alternative: use an OAuth helper CLI (oauth2l, google-auth-oauthlib) or a short local script to perform the OAuth flow and get refresh token.

3. Create the JSON file (google_creds.json) with this shape:

{
  "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
  "client_secret": "YOUR_CLIENT_SECRET",
  "refresh_token": "YOUR_REFRESH_TOKEN"
}

4. Add it as a GitHub Actions secret named `GOOGLE_CREDENTIALS`:
   - On GitHub: Repository → Settings → Secrets and variables → Actions → New repository secret
   - Name: `GOOGLE_CREDENTIALS`
   - Value: paste the full JSON content from step 3

Option B — Set CLASP_* secrets individually
- If you prefer not to use a single JSON secret, set these three secrets individually (same values as above):
  - `CLASP_CLIENT_ID` → client_id
  - `CLASP_CLIENT_SECRET` → client_secret
  - `CLASP_REFRESH_TOKEN` → refresh_token

How to set secrets from your workstation (scripted)
- This repository already contains `setup-github-secrets.sh` which will upload `GOOGLE_CREDENTIALS` for you (it uses the GitHub API). Example usage (local shell):

1. Create `google_creds.json` as shown above.
2. Export variables and run the script (example):

export GH_TOKEN="ghp_..."              # GitHub token with `repo` and `repo:actions`/`secrets` permissions
export REPO_OWNER="uraghav003"
export REPO_NAME="divyanshi-loan-os"
export CREDS_FILE="./google_creds.json"
export APPS_SCRIPT_ID="1PP7wUFkDAkmgOjgPKeWbZeg3Ajs9N4ZNRPnfih_LMv89KEdSTVPvtipp"  # replace if different

bash setup-github-secrets.sh

- The script will encrypt and upload `GOOGLE_CREDENTIALS` then set `APPS_SCRIPT_ID` as `APPS_SCRIPT_ID` secret.

Verify and re-run the workflow
1. Go to: https://github.com/uraghav003/divyanshi-loan-os/actions
2. Re-run the failed or most recent workflow `Deploy to Google Apps Script (Jankpuri)`.
   - If `GOOGLE_CREDENTIALS` exists and parses correctly the job step `Check deployment authorization` will report configured=true and the action will proceed.

Notes & troubleshooting
- If the workflow still fails with a parsing error: ensure the secret value is valid JSON and does NOT include extra newlines or shell-escaped quotes.
- Permission scopes: the refresh token must be obtained after consenting the scopes listed earlier; otherwise clasp push may fail with insufficient scopes.
- Alternative local deploy: you can also run `gcloud auth application-default login` locally and run `./deploy.sh` — `deploy.sh` already falls back to `gcloud auth print-access-token` when `GOOGLE_CREDENTIALS` not present. This is useful for immediate manual pushes.

Security reminders
- Never commit client secrets, tokens, or the `google_creds.json` file to the repository.
- Use GitHub Secrets for Actions only.

Need me to do more?
- I can open a PR that adds a short checklist to SETUP.md or create a nicer deployment helper that validates secrets before running the workflow.
- If you grant me permission to create an issue, I can file a QA checklist issue in the repo with these steps so you can track completion.
