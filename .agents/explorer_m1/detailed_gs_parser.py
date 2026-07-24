import sys
import os
import re

sys.stdout.reconfigure(encoding='utf-8')
dir_path = r'C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os\.agents\explorer_m1'

def find_gs_calls(filename):
    fp = os.path.join(dir_path, filename)
    with open(fp, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    print(f"\n================ {filename} Detailed GS Calls ================")
    pos = 0
    calls = []
    while True:
        idx = content.find('google.script.run', pos)
        if idx == -1:
            break
        # Grab snippet of next 300 chars
        snippet = content[idx:idx+300]
        # find the function call at the end of the chain
        # e.g. .P1_VERIFY_ACCESS(
        # Remove withSuccessHandler(...) / withFailureHandler(...)
        # We can find all .IDENTIFIER( in the snippet
        func_calls = re.findall(r'\.([A-Za-z0-9_]+)\s*\(', snippet)
        # Filter out withSuccessHandler, withFailureHandler, withUserObject
        actual = [f for f in func_calls if f not in ('withSuccessHandler', 'withFailureHandler', 'withUserObject')]
        
        # Also print first line of snippet
        first_line = snippet.splitlines()[0]
        print(f"Index {idx}: Line: {first_line[:80]} | Target function(s): {actual}")
        calls.append((idx, actual, snippet[:150]))
        pos = idx + len('google.script.run')
    return calls

for fn in ['index.html', 'smart_form.html', 'calling.html', 'voice.html']:
    find_gs_calls(fn)
