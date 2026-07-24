#!/bin/bash
set -e

SCRIPT_ID="1PP7wUFkDAkmgOjgPKeWbZeg3Ajs9N4ZNRPnfih_LMv89KEdSTVPvtipp"
REPO="https://github.com/uraghav003/divyanshi-loan-os.git"
WORK="/tmp/gas_deploy_$$"
CREDS_FILE="${HOME}/.config/gcloud/application_default_credentials.json"

echo "🚀 Divyanshi Capital — Auto Deploy Starting..."

# ── 1. Get access token ──
# Try saved ADC credentials first (avoids OAuth re-login / Workspace blocks)
TOKEN=""

if [ -f "$CREDS_FILE" ]; then
  echo "🔑 Using saved credentials from $CREDS_FILE..."
  TOKEN=$(python3 - <<PYEOF
import json, urllib.request, urllib.parse, sys

with open("$CREDS_FILE") as f:
    creds = json.load(f)

data = urllib.parse.urlencode({
    "client_id":     creds["client_id"],
    "client_secret": creds["client_secret"],
    "refresh_token": creds["refresh_token"],
    "grant_type":    "refresh_token"
}).encode()

req = urllib.request.Request(
    "https://oauth2.googleapis.com/token",
    data=data,
    headers={"Content-Type": "application/x-www-form-urlencoded"}
)
try:
    with urllib.request.urlopen(req) as r:
        resp = json.load(r)
    if "access_token" in resp:
        print(resp["access_token"])
    else:
        print("ERROR:" + resp.get("error_description", str(resp)), file=sys.stderr)
        sys.exit(1)
except Exception as e:
    print("ERROR:" + str(e), file=sys.stderr)
    sys.exit(1)
PYEOF
)
fi

# Fall back to gcloud auth
if [ -z "$TOKEN" ]; then
  TOKEN=$(gcloud auth print-access-token 2>/dev/null)
fi

if [ -z "$TOKEN" ]; then
  echo "❌ No credentials found."
  echo "   Run: gcloud auth application-default login --scopes=https://www.googleapis.com/auth/script.projects,https://www.googleapis.com/auth/drive,https://www.googleapis.com/auth/cloud-platform"
  exit 1
fi
echo "✅ Auth token ready"

# ── 2. Clone latest code ──
echo "📥 Fetching latest code from GitHub..."
rm -rf "$WORK"
git clone --quiet "$REPO" "$WORK"
cd "$WORK"

# ── 3. Build API payload ──
echo "📦 Building payload..."
python3 - <<'PYEOF'
import json, os

SCRIPT_ID = "1PP7wUFkDAkmgOjgPKeWbZeg3Ajs9N4ZNRPnfih_LMv89KEdSTVPvtipp"

files = []

with open("appsscript.json", "r") as f:
    files.append({"name": "appsscript", "type": "JSON", "source": f.read()})

for fname in sorted(os.listdir(".")):
    if fname.endswith(".gs"):
        with open(fname, "r") as f:
            files.append({"name": fname[:-3], "type": "SERVER_JS", "source": f.read()})

for fname in sorted(os.listdir(".")):
    if fname.endswith(".html"):
        with open(fname, "r") as f:
            files.append({"name": fname[:-5], "type": "HTML", "source": f.read()})

payload = json.dumps({"files": files})
with open("/tmp/gas_payload.json", "w") as f:
    f.write(payload)

print(f"  → {len(files)} files ready to push")
PYEOF

# ── 4. Push to Apps Script ──
echo "🚀 Pushing to Google Apps Script..."

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
  echo "⚠️  Permission error (403). Two possible causes:"
  echo "   1. Apps Script API not enabled → run: gcloud services enable script.googleapis.com --project=YOUR_PROJECT_ID"
  echo "   2. Token missing script.projects scope → re-run ADC login with correct scopes"
  echo "   Response: $BODY"
else
  echo ""
  echo "❌ Deploy failed (HTTP $HTTP_CODE)"
  echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print('Error:', d.get('error',{}).get('message','Unknown'))" 2>/dev/null || echo "$BODY"
fi

# Cleanup
rm -rf "$WORK" /tmp/gas_payload.json
