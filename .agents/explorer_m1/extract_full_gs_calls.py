import sys
import os

sys.stdout.reconfigure(encoding='utf-8')
dir_path = r'C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os\.agents\explorer_m1'

for fn in ['index.html', 'smart_form.html', 'calling.html', 'voice.html']:
    fp = os.path.join(dir_path, fn)
    with open(fp, 'r', encoding='utf-8') as f:
        content = f.read()
    
    print(f"\n==================================================")
    print(f"FULL EXPLICIT GS CALLS IN: {fn}")
    print(f"==================================================")
    pos = 0
    while True:
        idx = content.find('google.script.run', pos)
        if idx == -1:
            break
        # Grab surrounding snippet from idx to end of statement
        sub = content[idx:idx+400]
        print(f"\n--- Index {idx} ---")
        print(sub[:300])
        pos = idx + len('google.script.run')
