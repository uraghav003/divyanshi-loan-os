#!/bin/bash
set -e

SCRIPT_ID="1PP7wUFkDAkmgOjgPKeWbZeg3Ajs9N4ZNRPnfih_LMv89KEdSTVPvtipp"
REPO="https://github.com/uraghav003/divyanshi-loan-os.git"
WORK="/tmp/gas_deploy_$$"

echo "🚀 Divyanshi Capital — Auto Deploy Starting..."

# ── 1. Get access token ──
TOKEN=$(gcloud auth print-access-token 2>/dev/null)
if [ -z "$TOKEN" ]; then
  echo "❌ Not logged in. Run: gcloud auth login"
  exit 1
fi
echo "✅ Auth token ready"

# ── 2. Test Apps Script API access ──
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "https://script.googleapis.com/v1/projects/$SCRIPT_ID")

if [ "$STATUS" = "403" ] || [ "$STATUS" = "401" ]; then
  echo "🔑 Need additional scope — re-authenticating..."
  gcloud auth application-default login \
    --scopes="https://www.googleapis.com/auth/script.projects,https://www.googleapis.com/auth/drive,https://www.googleapis.com/auth/cloud-platform" \
    --quiet 2>/dev/null || true
  TOKEN=$(gcloud auth application-default print-access-token 2>/dev/null || gcloud auth print-access-token)
fi

# ── 3. Clone latest code ──
echo "📥 Fetching latest code from GitHub..."
rm -rf "$WORK"
git clone --quiet "$REPO" "$WORK"
cd "$WORK"

# ── 4. Build API payload ──
echo "📦 Building payload..."
python3 - <<'PYEOF'
import json, os, sys

SCRIPT_ID = "1PP7wUFkDAkmgOjgPKeWbZeg3Ajs9N4ZNRPnfih_LMv89KEdSTVPvtipp"

TYPE_MAP = {
    ".gs":   "SERVER_JS",
    ".html": "HTML",
    ".json": "JSON"
}

files = []

# appsscript.json must be named "appsscript"
with open("appsscript.json", "r") as f:
    files.append({"name": "appsscript", "type": "JSON", "source": f.read()})

# All .gs files
for fname in sorted(os.listdir(".")):
    if fname.endswith(".gs"):
        name = fname[:-3]  # strip .gs
        with open(fname, "r") as f:
            files.append({"name": name, "type": "SERVER_JS", "source": f.read()})

# All .html files
for fname in sorted(os.listdir(".")):
    if fname.endswith(".html"):
        name = fname[:-5]  # strip .html
        with open(fname, "r") as f:
            files.append({"name": name, "type": "HTML", "source": f.read()})

payload = json.dumps({"files": files})
with open("/tmp/gas_payload.json", "w") as f:
    f.write(payload)

print(f"  → {len(files)} files ready to push")
PYEOF

# ── 5. Push to Apps Script ──
echo "🚀 Pushing to Google Apps Script..."
TOKEN=$(gcloud auth print-access-token 2>/dev/null || gcloud auth application-default print-access-token)

RESULT=$(curl -s -w "\nHTTP_%{http_code}" -X PUT \
  "https://script.googleapis.com/v1/projects/$SCRIPT_ID/content" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data @/tmp/gas_payload.json)

HTTP_CODE=$(echo "$RESULT" | grep "HTTP_" | sed 's/HTTP_//')
BODY=$(echo "$RESULT" | grep -v "HTTP_")

if [ "$HTTP_CODE" = "200" ]; then
  echo ""
  echo "✅✅✅ DEPLOY SUCCESSFUL ✅✅✅"
  echo "All code is now live in your Apps Script."
  echo "Open your web app URL to use the updated system."
elif [ "$HTTP_CODE" = "403" ]; then
  echo ""
  echo "⚠️  Permission error — Apps Script API not enabled."
  echo "Run this once: gcloud services enable script.googleapis.com"
  echo "Then run deploy.sh again."
else
  echo ""
  echo "❌ Deploy failed (HTTP $HTTP_CODE)"
  echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print('Error:', d.get('error',{}).get('message','Unknown'))" 2>/dev/null || echo "$BODY"
fi

# Cleanup
rm -rf "$WORK" /tmp/gas_payload.json
