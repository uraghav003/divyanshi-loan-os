import sys
sys.stdout.reconfigure(encoding='utf-8')

with open(r'C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os\.agents\explorer_m1\index.html', 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

print(f"Total lines in index.html: {len(lines)}")
print("--- Lines 1 to 50 ---")
for i, l in enumerate(lines[:50], 1):
    print(f"{i}: {l.rstrip()}")

print("\n--- Lines 150 to 220 ---")
for i, l in enumerate(lines[149:220], 150):
    print(f"{i}: {l.rstrip()}")

print("\n--- Lines 400 to 450 ---")
for i, l in enumerate(lines[399:450], 400):
    print(f"{i}: {l.rstrip()}")

print("\n--- Last 50 lines ---")
for i, l in enumerate(lines[-50:], len(lines)-49):
    print(f"{i}: {l.rstrip()}")
