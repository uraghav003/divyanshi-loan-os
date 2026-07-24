import re
import os
import sys

root_dir = r'C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os'
html_files = ['index.html', 'smart_form.html', 'calling.html', 'voice.html']
gs_file = os.path.join(root_dir, 'Code.gs')
appsscript_file = os.path.join(root_dir, 'appsscript.json')

results = []

def check(condition, desc):
    status = "PASS" if condition else "FAIL"
    results.append((desc, status))
    print(f"[{status}] {desc}")
    return condition

print("==================================================")
print("   DIVYANSHI LOAN OS M2/M3 VERIFICATION SUITE    ")
print("==================================================\n")

# 1. HTML Ending & Validity Checks
for fn in html_files:
    fp = os.path.join(root_dir, fn)
    check(os.path.exists(fp), f"File {fn} exists in root")
    with open(fp, 'r', encoding='utf-8') as f:
        content = f.read()
    check(content.strip().endswith('</html>'), f"{fn} ends with </html>")
    check(content.count('</html>') == 1, f"{fn} contains exactly one </html> tag")

# 2. index.html Specific Checks
with open(os.path.join(root_dir, 'index.html'), 'r', encoding='utf-8') as f:
    idx_content = f.read()

check('--primary: #C9A84C' in idx_content, "index.html defines --primary: #C9A84C")
check('--bg: #0B1F3A' in idx_content, "index.html defines --bg: #0B1F3A")
check('.section { padding: 80px 5%; }' in idx_content or '.section{padding:80px 5%}' in idx_content.replace(' ', ''), "index.html contains .section padding rule")

# 3. smart_form.html Specific Checks
with open(os.path.join(root_dir, 'smart_form.html'), 'r', encoding='utf-8') as f:
    sf_content = f.read()

check('</form>' in sf_content, "smart_form.html contains </form> tag")
# Check entry_type options count
entry_type_match = re.search(r'<select[^>]*name=["\']entry_type["\'][^>]*>(.*?)</select>', sf_content, re.DOTALL)
if not entry_type_match:
    entry_type_match = re.search(r'<select[^>]*id=["\']entry_type["\'][^>]*>(.*?)</select>', sf_content, re.DOTALL)

if entry_type_match:
    options = re.findall(r'<option[^>]*>', entry_type_match.group(1))
    check(len(options) >= 3, f"smart_form.html entry_type select contains >= 3 options (found {len(options)})")
else:
    check(False, "smart_form.html entry_type select element found")

# 4. calling.html Specific Checks
with open(os.path.join(root_dir, 'calling.html'), 'r', encoding='utf-8') as f:
    call_content = f.read()

check('.ai-metric-label' in call_content and ('font-size:' in call_content or 'font-size :' in call_content), "calling.html contains .ai-metric-label CSS rule")

# 5. voice.html Specific Checks
with open(os.path.join(root_dir, 'voice.html'), 'r', encoding='utf-8') as f:
    voice_content = f.read()

check('FreePBX' in voice_content or 'WebRTC' in voice_content or 'voice' in voice_content.lower(), "voice.html contains WebRTC / FreePBX bridge preview")

# 6. Code.gs Functions Check
with open(gs_file, 'r', encoding='utf-8') as f:
    gs_content = f.read()

declared_funcs = set(re.findall(r'function\s+([A-Za-z0-9_]+)\s*\(', gs_content))

required_named_funcs = [
    'P1_SMART_FORM_SUBMIT',
    'P1_VERIFY_ACCESS',
    'P1_GET_CALLING_QUEUE',
    'P1_CALLING_START',
    'P1_CALLING_AI_REMARK',
    'P1_MINI_CRM_UPLOAD',
    'P1_UPDATE_CALLING_CASE',
    'P1_SAVE_CALC_LEAD',
    'P1_VOICE_CALL',
    'MLA_UPDATE_MINI_STATUS',
    'DC_TG_BROADCAST',
    'GET_TAT_BY_PRODUCT_',
    'MIS_15MIN_FULL_SYNC_',
    'APPLY_DASHBOARD_PROTECTION_',
    'DASHBOARD_SYNC_TRIGGER_ENGINE'
]

for func in required_named_funcs:
    check(func in declared_funcs, f"Code.gs contains named function '{func}'")

# Check GET_TAT_BY_PRODUCT_ closing bracket
tat_func_match = re.search(r'function\s+GET_TAT_BY_PRODUCT_\s*\([^)]*\)\s*\{([\s\S]*?)\}', gs_content)
check(tat_func_match is not None, "GET_TAT_BY_PRODUCT_ has valid structure and closing bracket '}'")

# 7. Check doGet routing in Code.gs
check("page === 'form' || page === 'smart_form'" in gs_content or "page === 'smart_form'" in gs_content, "doGet maps page=form/smart_form to smart_form")
check("page === 'calling'" in gs_content, "doGet maps page=calling to calling")
check("page === 'voice'" in gs_content, "doGet maps page=voice to voice")

# 8. Check appsscript.json OAuth Scopes
with open(appsscript_file, 'r', encoding='utf-8') as f:
    app_content = f.read()

check('"oauthScopes"' in app_content, "appsscript.json lists oauthScopes")

# 9. Verify every google.script.run endpoint call in HTML exists in Code.gs
missing_endpoints = []
for fn in html_files:
    fp = os.path.join(root_dir, fn)
    with open(fp, 'r', encoding='utf-8') as f:
        c = f.read()
    # Find endpoints called after google.script.run
    for m in re.finditer(r'google\.script\.run', c):
        snippet = c[m.start():m.start()+800]
        # find method names in snippet
        methods = re.findall(r'\.([A-Z0-9_]+)\s*\(', snippet)
        for meth in methods:
            if meth not in ('WITHSUCCESSSTUFF',) and not meth.startswith('WITH'):
                if meth not in declared_funcs:
                    missing_endpoints.append((fn, meth))

check(len(missing_endpoints) == 0, f"All google.script.run endpoints exist in Code.gs (Missing: {missing_endpoints})")

print("\n==================================================")
passes = sum(1 for _, s in results if s == "PASS")
fails = sum(1 for _, s in results if s == "FAIL")
print(f"RESULTS: {passes} PASSED, {fails} FAILED out of {len(results)} checks.")
print("==================================================")

if fails > 0:
    sys.exit(1)
