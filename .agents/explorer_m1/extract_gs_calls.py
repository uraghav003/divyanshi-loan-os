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
    # Search for google.script.run and trace to function invocation
    # e.g. google.script.run.withSuccessHandler(...).P1_SOMETHING(args)
    pattern = r'google\.script\.run(?:[\s\n]*\.[\s\n]*with\w+Handler\([^\)]*\))*[\s\n]*\.[\s\n]*([A-Za-z0-9_]+)\s*\('
    matches = re.findall(pattern, content)
    print(f"Functions called via google.script.run: {matches}")
    
    # Also find fetch / api calls or POST calls to external or Apps Script URL
    # Look for fetch, XMLHttpRequest, $.ajax, or action parameters
    fetch_matches = re.findall(r'fetch\s*\(\s*([^,\)]+)', content)
    print(f"Fetch targets: {fetch_matches}")
    
    # Check for api endpoint strings or action parameters in payload
    actions = re.findall(r'["\']?action["\']?\s*:\s*["\']([^"\']+)["\']', content)
    print(f"Actions in JS objects/strings: {set(actions)}")
