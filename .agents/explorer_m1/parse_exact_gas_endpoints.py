import sys
import os
import re

sys.stdout.reconfigure(encoding='utf-8')
dir_path = r'C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os\.agents\explorer_m1'
code_gs_path = r'C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os\Code.gs'

with open(code_gs_path, 'r', encoding='utf-8') as f:
    code_gs_content = f.read()

# Extract all function names defined in Code.gs
code_gs_funcs = set(re.findall(r'function\s+([A-Za-z0-9_]+)\s*\(', code_gs_content))

html_files = ['index.html', 'smart_form.html', 'calling.html', 'voice.html']

for fn in html_files:
    fp = os.path.join(dir_path, fn)
    with open(fp, 'r', encoding='utf-8') as f:
        content = f.read()
    
    print(f"\n==================================================")
    print(f"HTML FILE: {fn}")
    print(f"==================================================")
    
    # Split by google.script.run
    blocks = content.split('google.script.run')
    gas_endpoints = set()
    for i, b in enumerate(blocks[1:], 1):
        # find the actual method call on google.script.run
        # It may have .withSuccessHandler(...) or .withFailureHandler(...) before the function
        # Let's clean out withSuccessHandler(function...){...} and withFailureHandler(function...){...}
        # A simple state-based or token scanner
        snippet = b[:500]
        # Remove nested callback bodies: find .withSuccessHandler(...) and replace
        # Let's print the line containing google.script.run call
        lines = [l.strip() for l in snippet.splitlines() if l.strip()]
        full_stmt = ""
        for line in lines:
            full_stmt += " " + line
            if ';' in line or '}' in line and not line.startswith('.with'):
                break
        
        # Extract uppercase / P1_ / backend method names
        # Standard GAS backend functions in this app start with P1_ or UPPERCASE or camelCase function names
        # Let's regex match .([A-Z0-9_]+|[A-Za-z0-9_]+)\(
        found = re.findall(r'\.([A-Za-z0-9_]+)\s*\(', snippet)
        # filter out handlers and JS builtins
        builtins = {'withSuccessHandler', 'withFailureHandler', 'withUserObject', 'getElementById', 'trim', 'split', 'round', 'floor', 'max', 'min', 'then', 'catch', 'isArray', 'isFinite', 'error', 'log', 'replace', 'get'}
        endpoints = [f for f in found if f not in builtins]
        print(f"Call #{i}: Statement: {full_stmt[:120]}")
        print(f"        Detected GAS Endpoint(s): {endpoints}")
        for ep in endpoints:
            gas_endpoints.add(ep)
            
    print(f"\nSummary of GAS Endpoints in {fn}: {gas_endpoints}")
    for ep in gas_endpoints:
        status = "✅ DEFINED in Code.gs" if ep in code_gs_funcs else "❌ MISSING in Code.gs"
        print(f"  * {ep}: {status}")
