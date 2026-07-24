#!/usr/bin/env bash
# setup-github-secrets.sh
# Run this ONCE in Google Cloud Shell to add GitHub Secrets for auto-deploy.
# Usage:
#   bash setup-github-secrets.sh
# or:
#   GH_TOKEN=ghp_xxxx bash setup-github-secrets.sh

set -euo pipefail

REPO_OWNER="uraghav003"
REPO_NAME="divyanshi-loan-os"
APPS_SCRIPT_ID="1PP7wUFkDAkmgOjgPKeWbZeg3Ajs9N4ZNRPnfih_LMv89KEdSTVPvtipp"
CREDS_FILE="${HOME}/.config/gcloud/application_default_credentials.json"
WORK_DIR=$(mktemp -d)
trap "rm -rf $WORK_DIR" EXIT

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  Divyanshi Capital — GitHub Secrets Setup       ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ── 1. Check GCP credentials file ──
if [ ! -f "$CREDS_FILE" ]; then
  echo "❌ GCP credentials not found at $CREDS_FILE"
  echo "   Run first:"
  echo "   gcloud auth application-default login \\"
  echo "     --scopes=https://www.googleapis.com/auth/script.projects,https://www.googleapis.com/auth/drive,https://www.googleapis.com/auth/cloud-platform"
  exit 1
fi
echo "✅ GCP credentials found"

# ── 2. Get GitHub Personal Access Token ──
if [ -z "${GH_TOKEN:-}" ]; then
  echo ""
  echo "Need a GitHub Personal Access Token with 'repo' scope."
  echo "Create one at:"
  echo "  https://github.com/settings/tokens/new?scopes=repo&description=divyanshi-deploy"
  echo ""
  read -rsp "Paste your GitHub token (hidden): " GH_TOKEN
  echo ""
fi

if [ -z "${GH_TOKEN:-}" ]; then
  echo "❌ No GitHub token provided. Exiting."
  exit 1
fi

# Validate token
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: token $GH_TOKEN" \
  "https://api.github.com/repos/$REPO_OWNER/$REPO_NAME")

if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ GitHub token invalid or no repo access (HTTP $HTTP_CODE)"
  exit 1
fi
echo "✅ GitHub token valid"

# ── 3. Install PyNaCl if needed ──
if ! python3 -c "import nacl" 2>/dev/null; then
  echo "📦 Installing PyNaCl..."
  pip3 install --quiet PyNaCl 2>/dev/null || pip install --quiet PyNaCl 2>/dev/null
fi

# ── 4. Encrypt + upload one secret ──
push_secret() {
  local NAME="$1"
  local VALUE_FILE="$2"

  # Get repo public key
  curl -s \
    -H "Authorization: token $GH_TOKEN" \
    -H "Accept: application/vnd.github.v3+json" \
    "https://api.github.com/repos/$REPO_OWNER/$REPO_NAME/actions/secrets/public-key" \
    > "$WORK_DIR/pubkey.json"

  # Encrypt using PyNaCl SealedBox (safe: reads from file, no shell interpolation)
  python3 - "$VALUE_FILE" "$WORK_DIR/pubkey.json" "$WORK_DIR/payload.json" <<'PYEOF'
import sys, json, base64
from nacl.public import PublicKey, SealedBox

value_file, pubkey_file, out_file = sys.argv[1], sys.argv[2], sys.argv[3]

with open(pubkey_file) as f:
    pk_info = json.load(f)

pub_key = PublicKey(base64.b64decode(pk_info["key"]))
box = SealedBox(pub_key)

with open(value_file, "rb") as f:
    plaintext = f.read()

encrypted = box.encrypt(plaintext)
encrypted_b64 = base64.b64encode(encrypted).decode()

payload = {"encrypted_value": encrypted_b64, "key_id": pk_info["key_id"]}
with open(out_file, "w") as f:
    json.dump(payload, f)
PYEOF

  # Upload to GitHub
  HTTP=$(curl -s -o "$WORK_DIR/resp.json" -w "%{http_code}" \
    -X PUT \
    -H "Authorization: token $GH_TOKEN" \
    -H "Accept: application/vnd.github.v3+json" \
    -H "Content-Type: application/json" \
    --data @"$WORK_DIR/payload.json" \
    "https://api.github.com/repos/$REPO_OWNER/$REPO_NAME/actions/secrets/$NAME")

  if [ "$HTTP" = "201" ] || [ "$HTTP" = "204" ]; then
    echo "✅ $NAME → set"
  else
    echo "❌ Failed to set $NAME (HTTP $HTTP)"
    cat "$WORK_DIR/resp.json" 2>/dev/null || true
    exit 1
  fi
}

# ── 5. Set GOOGLE_CREDENTIALS ──
echo ""
echo "🔑 Setting GOOGLE_CREDENTIALS..."
cp "$CREDS_FILE" "$WORK_DIR/creds_value.txt"
push_secret "GOOGLE_CREDENTIALS" "$WORK_DIR/creds_value.txt"

# ── 6. Set APPS_SCRIPT_ID ──
echo "🔑 Setting APPS_SCRIPT_ID..."
echo -n "$APPS_SCRIPT_ID" > "$WORK_DIR/id_value.txt"
push_secret "APPS_SCRIPT_ID" "$WORK_DIR/id_value.txt"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  ✅ DONE! Auto-deploy is fully wired up.        ║"
echo "║  Every git push to main now deploys to GAS.    ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "To deploy NOW, re-run the last failed workflow at:"
echo "  https://github.com/$REPO_OWNER/$REPO_NAME/actions"
echo ""
