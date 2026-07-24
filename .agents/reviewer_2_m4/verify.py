import os
import re
import json
from html.parser import HTMLParser

workspace_dir = r"C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os"
html_files = ["index.html", "smart_form.html", "calling.html", "voice.html"]
gs_file = "Code.gs"
json_file = "appsscript.json"

print("=== STARTING CROSS-FILE CONSISTENCY & DESIGN VERIFICATION ===")

# 1. Parse Code.gs functions
code_gs_path = os.path.join(workspace_dir, gs_file)
with open(code_gs_path, "r", encoding="utf-8") as f:
    code_gs_content = f.read()

# Extract top level function definitions in Code.gs
# Function regex: function functionName(...)
fn_defs = re.findall(r'^\s*function\s+([a-zA-Z0-9_$]+)\s*\(', code_gs_content, re.MULTILINE)
fn_set = set(fn_defs)
print(f"Total functions found in Code.gs: {len(fn_defs)} (Unique: {len(fn_set)})")

# 2. Extract doPost action cases in Code.gs
# Look for action checks, switch(action), switch(e.parameter.action), switch(data.action), etc.
dopost_match = re.search(r'function\s+doPost\s*\([^)]*\)\s*\{([\s\S]*?)\n\}', code_gs_content)
dopost_actions = set()
if dopost_match:
    dopost_body = dopost_match.group(1)
    # Find case 'xyz': or case "xyz": or action === 'xyz' or action == 'xyz'
    cases = re.findall(r"case\s+['\"]([^'\"]+)['\"]", dopost_body)
    ifs = re.findall(r"action\s*===\s*['\"]([^'\"]+)['\"]", dopost_body)
    dopost_actions.update(cases)
    dopost_actions.update(ifs)
print(f"doPost actions handled in Code.gs: {sorted(list(dopost_actions))}")

# 3. Check HTML files for RPC (google.script.run) calls and fetch/doPost action calls
frontend_rpcs = {}
frontend_post_actions = {}
color_usage = {}
html_structures = {}

for hf in html_files:
    path = os.path.join(workspace_dir, hf)
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    
    # RPC calls: google.script.run...functionName(...)
    # e.g., google.script.run.withSuccessHandler(...).withFailureHandler(...).myFunc(...)
    # or google.script.run.myFunc(...)
    # Let's find all identifiers called after google.script.run (chaining methods: withSuccessHandler, withFailureHandler, withUserObject)
    # Match pattern google.script.run ( .with... (...) )* . functionName (
    rpc_matches = re.findall(r'google\.script\.run(?:\.[a-zA-Z0-9_$]+\([^)]*\))*\.([a-zA-Z0-9_$]+)\s*\(', content)
    # Exclude standard handler setters: withSuccessHandler, withFailureHandler, withUserObject
    actual_rpcs = [m for m in rpc_matches if m not in ['withSuccessHandler', 'withFailureHandler', 'withUserObject']]
    frontend_rpcs[hf] = sorted(list(set(actual_rpcs)))
    
    # Fetch / Action calls (e.g. action: 'xyz', action: "xyz", "action": "xyz")
    actions_found = re.findall(r"['\"]?action['\"]?\s*:\s*['\"]([^'\"]+)['\"]", content)
    frontend_post_actions[hf] = sorted(list(set(actions_found)))
    
    # Extract hex colors
    colors = re.findall(r'#[0-9a-fA-F]{3,8}', content)
    color_usage[hf] = {}
    for c in colors:
        c_upper = c.upper()
        color_usage[hf][c_upper] = color_usage[hf].get(c_upper, 0) + 1
    
    # Count <html> tags and basic syntax check
    html_count = len(re.findall(r'<html[\s>]', content, re.IGNORECASE))
    html_close_count = len(re.findall(r'</html>', content, re.IGNORECASE))
    doctype_count = len(re.findall(r'<!DOCTYPE\s+html', content, re.IGNORECASE))
    html_structures[hf] = {
        "html_open": html_count,
        "html_close": html_close_count,
        "doctype": doctype_count
    }

print("\n--- FRONTEND RPC CALLS (google.script.run) ---")
all_frontend_rpcs = set()
for hf, rpcs in frontend_rpcs.items():
    print(f"{hf}: {rpcs}")
    all_frontend_rpcs.update(rpcs)

missing_rpcs = all_frontend_rpcs - fn_set
print(f"\nMissing RPC functions in Code.gs: {missing_rpcs if missing_rpcs else 'NONE! All RPC functions exist.'}")

print("\n--- FRONTEND POST ACTIONS ---")
all_frontend_post_actions = set()
for hf, actions in frontend_post_actions.items():
    print(f"{hf}: {actions}")
    all_frontend_post_actions.update(actions)

missing_post_actions = all_frontend_post_actions - dopost_actions
print(f"\nMissing doPost action handlers in Code.gs: {missing_post_actions if missing_post_actions else 'NONE! All post actions are handled.'}")

print("\n--- HTML STRUCTURE CHECKS ---")
for hf, struct in html_structures.items():
    print(f"{hf}: {struct}")

print("\n--- DESIGN PALETTE COLOR USAGE ---")
palette_primary = "#0B1F3A"
palette_gold = "#C9A84C"
for hf, colors in color_usage.items():
    print(f"\n{hf} color breakdown:")
    gold_count = colors.get("#C9A84C", 0) + colors.get("#C9A84C", 0) # case
    # Normalize hex colors (expand 3-char to 6-char if needed)
    norm_colors = {}
    for c, cnt in colors.items():
        if len(c) == 4: # #ABC -> #AABBCC
            c_norm = f"#{c[1]*2}{c[2]*2}{c[3]*2}"
        else:
            c_norm = c
        norm_colors[c_norm] = norm_colors.get(c_norm, 0) + cnt
    
    print(f"  Gold (#C9A84C): {norm_colors.get('#C9A84C', 0)}")
    print(f"  Dark Blue (#0B1F3A): {norm_colors.get('#0B1F3A', 0)}")
    print(f"  Total unique hex colors: {len(norm_colors)}")
    print(f"  Top 10 colors used: {sorted(norm_colors.items(), key=lambda x: x[1], reverse=True)[:10]}")

print("\n=== VERIFICATION SCRIPT COMPLETED ===")
