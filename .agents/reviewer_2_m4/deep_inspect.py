import os
import re
import sys
import json
from html.parser import HTMLParser

# Reconfigure stdout to utf-8 for Windows console safety
sys.stdout.reconfigure(encoding='utf-8')

workspace_dir = r"C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os"
html_files = ["index.html", "smart_form.html", "calling.html", "voice.html"]
gs_file = "Code.gs"

print("=== DEEP JS & RPC & ACTION INSPECTION ===")

code_gs_path = os.path.join(workspace_dir, gs_file)
with open(code_gs_path, "r", encoding="utf-8") as f:
    code_gs = f.read()

# All top-level function names in Code.gs
gs_functions = set(re.findall(r'^\s*function\s+([a-zA-Z0-9_$]+)\s*\(', code_gs, re.MULTILINE))
print(f"Total Code.gs functions defined: {len(gs_functions)}")

# Extract doPost action switch cases
dopost_match = re.search(r'function\s+doPost\s*\([^)]*\)\s*\{([\s\S]*?)\n\}', code_gs)
dopost_cases = []
if dopost_match:
    dopost_body = dopost_match.group(1)
    dopost_cases = re.findall(r"case\s+['\"]([^'\"]+)['\"]", dopost_body)

print(f"doPost action switch cases in Code.gs ({len(dopost_cases)}): {dopost_cases}")

# Inspect each HTML file for google.script.run calls
# Pattern for google.script.run function call:
# google.script.run
#   .withSuccessHandler(...)
#   .withFailureHandler(...)
#   .functionName(...)

rpc_pattern = re.compile(r'google\.script\.run(?:\s*\.[a-zA-Z0-9_$]+\([\s\S]*?\))*\s*\.([a-zA-Z0-9_$]+)\s*\(')

all_rpcs_called = {}

for hf in html_files:
    path = os.path.join(workspace_dir, hf)
    with open(path, "r", encoding="utf-8") as f:
        html_text = f.read()
    
    # We will search for all occurrences of google.script.run in html_text
    # To accurately extract the target function name:
    # Look at any line or expression containing google.script.run
    rpcs_found = []
    # Let's find all instances of google.script.run
    matches = re.finditer(r'google\.script\.run', html_text)
    for m in matches:
        start_pos = m.start()
        snippet = html_text[start_pos:start_pos+300]
        # Match chain of methods .with... until actual function call
        # Example: google.script.run.withSuccessHandler(fn).withFailureHandler(fn).MY_SERVER_FUNC(args)
        # Let's clean out withSuccessHandler(...) and withFailureHandler(...) and withUserObject(...)
        cleaned = snippet
        # remove withSuccessHandler(...)
        # We can find method calls like .withSuccessHandler( ... )
        # A simpler way: split by '.'
        # Find method calls following google.script.run
        tokens = re.findall(r'\.([a-zA-Z0-9_$]+)\s*\(', snippet)
        # tokens could be ['withSuccessHandler', 'P1_VERIFY_ACCESS']
        target_fn = None
        for tok in tokens:
            if tok not in ['withSuccessHandler', 'withFailureHandler', 'withUserObject']:
                target_fn = tok
                break
        if target_fn:
            rpcs_found.append(target_fn)
        else:
            # Maybe google.script.run without handlers: google.script.run.myFunc(...)
            pass
            
    all_rpcs_called[hf] = sorted(list(set(rpcs_found)))

print("\n--- RPC FUNCTION CALLS PER HTML FILE ---")
all_found_rpcs = set()
for hf, rpcs in all_rpcs_called.items():
    print(f"\n{hf}:")
    for r in rpcs:
        exists = r in gs_functions
        print(f"  - {r} -> {'EXISTS in Code.gs' if exists else 'MISSING IN Code.gs !!!'}")
        all_found_rpcs.add(r)

missing_in_gs = all_found_rpcs - gs_functions
print(f"\nSummary: Total RPCs invoked across frontend: {len(all_found_rpcs)}")
if missing_in_gs:
    print(f"CRITICAL ERROR: RPC functions missing in Code.gs: {missing_in_gs}")
else:
    print("SUCCESS: All RPC functions invoked by frontend exist in Code.gs!")

