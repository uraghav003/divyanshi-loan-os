import sys
import os

sys.stdout.reconfigure(encoding='utf-8')
dir_path = r'C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os\.agents\explorer_m1'

for fn in ['index.html', 'smart_form.html', 'calling.html', 'voice.html']:
    fp = os.path.join(dir_path, fn)
    with open(fp, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    print(f"\n==================================================")
    print(f"FILE: {fn}")
    print(f"==================================================")
    pos = 0
    count = 0
    while True:
        idx = content.find('google.script.run', pos)
        if idx == -1:
            break
        count += 1
        print(f"\n--- {fn} Match #{count} at index {idx} ---")
        snippet = content[max(0, idx-50):min(len(content), idx+400)]
        print(snippet)
        pos = idx + len('google.script.run')
