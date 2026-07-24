import sys
import os
import re

sys.stdout.reconfigure(encoding='utf-8')
dir_path = r'C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os\.agents\explorer_m1'

def inspect_after(fn, indices):
    fp = os.path.join(dir_path, fn)
    with open(fp, 'r', encoding='utf-8') as f:
        content = f.read()
    print(f"\n================ {fn} ENDPOINTS AFTER HANDLERS ================")
    for idx in indices:
        snippet = content[idx:idx+600]
        # find the end of .withSuccessHandler / .withFailureHandler chain
        # print first 300 chars after google.script.run
        print(f"--- Index {idx} ---")
        print(snippet)

inspect_after('index.html', [40165, 44565, 45897, 47490, 50552])
inspect_after('smart_form.html', [56006])
inspect_after('calling.html', [40758, 49815, 54651])
inspect_after('voice.html', [6728, 7009])
