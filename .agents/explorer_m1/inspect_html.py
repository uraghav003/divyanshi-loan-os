import re
import os
import sys

# Ensure stdout handles UTF-8
sys.stdout.reconfigure(encoding='utf-8')

dir_path = r'C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os\.agents\explorer_m1'
files = ['index.html', 'smart_form.html', 'calling.html', 'voice.html']

for fn in files:
    fp = os.path.join(dir_path, fn)
    with open(fp, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    lines = content.splitlines()
    print(f'=== {fn} ===')
    print(f'Total lines: {len(lines)}, Total chars: {len(content)}')
    print(f'Starts with: {lines[0] if lines else ""}')
    print(f'Ends with (last 5 lines):')
    for l in lines[-5:]:
        print('  ', l)
    
    # Check google.script.run
    gs_calls = re.findall(r'google\.script\.run[^\n;]+', content)
    print(f'google.script.run count: {len(gs_calls)}')
    for g in gs_calls[:20]:
        print('  GS:', g)
    
    # Check fetch calls
    fetch_calls = re.findall(r'fetch\([^\n]+', content)
    print(f'fetch count: {len(fetch_calls)}')
    for ft in fetch_calls[:20]:
        print('  FETCH:', ft)

    # Check action parameters in fetch or payload
    actions = re.findall(r'["\']?action["\']?\s*:\s*["\']([^"\']+)["\']', content)
    print(f'Actions found: {set(actions)}')
    print()
