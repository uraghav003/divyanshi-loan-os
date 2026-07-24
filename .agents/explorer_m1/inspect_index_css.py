import sys
sys.stdout.reconfigure(encoding='utf-8')

with open(r'C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os\.agents\explorer_m1\index.html', 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

print("--- Lines 50 to 180 of index.html ---")
for i, l in enumerate(lines[49:180], 50):
    print(f"{i}: {l.rstrip()}")
