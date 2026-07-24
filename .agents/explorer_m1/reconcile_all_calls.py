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

# Extract all case 'action' handlers in doPost
dopost_actions = set(re.findall(r"case\s+['\"]([^'\"]+)['\"]", code_gs_content))

print(f"Total functions defined in Code.gs: {len(code_gs_funcs)}")
print(f"doPost actions in Code.gs: {dopost_actions}")

html_files = ['index.html', 'smart_form.html', 'calling.html', 'voice.html']

for fn in html_files:
    fp = os.path.join(dir_path, fn)
    with open(fp, 'r', encoding='utf-8') as f:
        content = f.read()
    
    print(f"\n==================================================")
    print(f"HTML FILE: {fn}")
    print(f"==================================================")
    
    # Extract google.script.run function invocations
    # Look for .FUNCTION_NAME(
    # Ignore withSuccessHandler, withFailureHandler, withUserObject
    gs_calls = re.findall(r'google\.script\.run(?:\s*\.[\s\S]*?)*?\.([A-Za-z0-9_]+)\s*\(', content)
    
    # Better regex: find all .NAME( after google.script.run up to semicolon or next statement
    raw_blocks = content.split('google.script.run')
    file_gs_funcs = set()
    for block in raw_blocks[1:]:
        # look at first 300 chars
        sub = block[:300]
        # find method names called on the chain
        methods = re.findall(r'\.([A-Za-z0-9_]+)\s*\(', sub)
        for m in methods:
            if m not in ('withSuccessHandler', 'withFailureHandler', 'withUserObject'):
                file_gs_funcs.add(m)
    
    print(f"google.script.run functions invoked in {fn}: {file_gs_funcs}")
    for func in file_gs_funcs:
        exists_in_gs = func in code_gs_funcs
        print(f"  - {func}: {'EXISTS in Code.gs' if exists_in_gs else '❌ MISSING in Code.gs'}")

