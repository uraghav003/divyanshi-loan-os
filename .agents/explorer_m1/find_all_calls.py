import sys
import os
import re

sys.stdout.reconfigure(encoding='utf-8')
dir_path = r'C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os\.agents\explorer_m1'

for fn in ['index.html', 'smart_form.html', 'calling.html', 'voice.html']:
    fp = os.path.join(dir_path, fn)
    with open(fp, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    print(f"\n================ {fn} ================")
    # Extract google.script.run statements
    # Match google.script.run until end of statement or block
    matches = re.findall(r'google\.script\.run[\s\S]*?(?=\;|\n\s*\n|\}\))', content)
    print(f"Count of google.script.run blocks: {len(matches)}")
    for m in matches:
        # Clean up whitespace
        clean_m = " ".join(m.split())
        print(f"  -> {clean_m[:120]}")

    # Extract any fetch or HTTP calls
    fetches = re.findall(r'fetch\([^\)]+\)', content)
    print(f"Fetch calls: {fetches}")
    
    # Extract any postData or action parameters
    actions = re.findall(r'action\s*:\s*[\'"]([^\'"]+)[\'"]', content)
    print(f"Actions in JS objects: {actions}")
