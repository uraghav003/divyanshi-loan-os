import os
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

workspace_dir = r"C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os"
html_files = ["index.html", "smart_form.html", "calling.html", "voice.html"]
gs_file = "Code.gs"

code_gs_path = os.path.join(workspace_dir, gs_file)
with open(code_gs_path, "r", encoding="utf-8") as f:
    code_gs = f.read()

gs_functions = set(re.findall(r'^\s*function\s+([a-zA-Z0-9_$]+)\s*\(', code_gs, re.MULTILINE))

print("=== EXACT SERVER METHOD EXTRACTOR FOR google.script.run ===")

rpc_by_file = {}

for hf in html_files:
    print(f"\n================ FILE: {hf} ================")
    path = os.path.join(workspace_dir, hf)
    with open(path, "r", encoding="utf-8") as f:
        html_text = f.read()
    
    # Split html into blocks starting with google.script.run
    # Find all occurrences of google.script.run up to semicolon or closing parenthesis of call
    # e.g., google.script.run.withSuccessHandler(...).myFunc(...)
    matches = re.finditer(r'google\.script\.run[\s\S]*?\.(P1_[A-Z0-9_]+|BULBHUL_[A-Z0-9_]+|[a-zA-Z0-9_$]+)\s*\(', html_text)
    
    found_methods = []
    for m in matches:
        full_statement = m.group(0)
        method_name = m.group(1)
        # Check if method_name is handler setter like withSuccessHandler or withFailureHandler
        if method_name in ['withSuccessHandler', 'withFailureHandler', 'withUserObject']:
            # Search further after withSuccessHandler(...)
            rest = html_text[m.end():m.end()+500]
            # Match next .METHOD_NAME(
            next_m = re.search(r'\.(P1_[A-Z0-9_]+|BULBHUL_[A-Z0-9_]+|[a-zA-Z0-9_$]+)\s*\(', rest)
            if next_m:
                mn2 = next_m.group(1)
                if mn2 not in ['withSuccessHandler', 'withFailureHandler', 'withUserObject']:
                    method_name = mn2
        
        found_methods.append((method_name, m.start()))
        
    # Deduplicate while keeping order
    unique_methods = []
    for fn, pos in found_methods:
        if fn not in ['withSuccessHandler', 'withFailureHandler', 'withUserObject']:
            unique_methods.append(fn)
            
    rpc_by_file[hf] = unique_methods
    print(f"Server RPC methods invoked in {hf}: {unique_methods}")
    for m in unique_methods:
        exists = m in gs_functions
        status = "EXISTS" if exists else ">>> MISSING <<<"
        print(f"  [{status}] {m}")

print("\n================ TOTAL RPC SUMMARY ================")
all_called = set()
for hf, ms in rpc_by_file.items():
    all_called.update(ms)

print(f"Total distinct RPC functions called from frontends: {len(all_called)}")
missing = all_called - gs_functions
if missing:
    print(f"CRITICAL FINDING: Missing functions in Code.gs: {missing}")
else:
    print("ALL RPC FUNCTIONS ARE PRESENT IN Code.gs!")

