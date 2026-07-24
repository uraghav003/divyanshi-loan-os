import sys
import os

sys.stdout.reconfigure(encoding='utf-8')
dir_path = r'C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os\.agents\explorer_m1'

for fn in ['index.html', 'smart_form.html', 'calling.html', 'voice.html']:
    fp = os.path.join(dir_path, fn)
    with open(fp, 'r', encoding='utf-8') as f:
        content = f.read()
    
    print(f"\n==================================================")
    print(f"FILE: {fn}")
    print(f"==================================================")
    pos = 0
    idx_num = 0
    while True:
        idx = content.find('google.script.run', pos)
        if idx == -1:
            break
        idx_num += 1
        sub = content[idx:idx+600]
        # find the end of statement (next semicolon or call)
        print(f"\n--- Call #{idx_num} in {fn} (index {idx}) ---")
        print(sub)
        pos = idx + len('google.script.run')
