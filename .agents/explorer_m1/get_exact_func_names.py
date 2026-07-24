import sys
import os

sys.stdout.reconfigure(encoding='utf-8')
dir_path = r'C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os\.agents\explorer_m1'

def inspect_exact(fn, indices):
    fp = os.path.join(dir_path, fn)
    with open(fp, 'r', encoding='utf-8') as f:
        content = f.read()
    print(f"\n================ {fn} EXACT FUNCTION NAMES ================")
    for idx in indices:
        snippet = content[idx:idx+250]
        print(f"--- Index {idx} ---")
        print(snippet)

inspect_exact('index.html', [40165, 44565, 45897, 47490, 50552])
inspect_exact('smart_form.html', [56006])
inspect_exact('calling.html', [40758, 49815, 54651])
inspect_exact('voice.html', [6728, 7009])
