import re
import os

base_dir = r'C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os\.agents\explorer_m1'
html_files = ['index.html', 'smart_form.html', 'calling.html', 'voice.html']

print("=== FETCH ACTIONS IN HTML FILES ===")
all_actions = set()
for fn in html_files:
    path = os.path.join(base_dir, fn)
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    actions = set(re.findall(r'action\s*:\s*[\'"]([^\'"]+)[\'"]', content))
    print(f"{fn}: {sorted(list(actions))}")
    all_actions.update(actions)

print(f"\nTotal unique actions in HTML: {sorted(list(all_actions))}")

code_gs_path = r'C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os\Code.gs'
with open(code_gs_path, 'r', encoding='utf-8') as f:
    gs_content = f.read()

# Extract switch cases in doPost
dopost_cases = set(re.findall(r'case\s+[\'"]([^\'"]+)[\'"]\s*:', gs_content))
print(f"\n=== SWITCH CASES IN doPost(e) ({len(dopost_cases)}) ===")
print(sorted(list(dopost_cases)))

missing_actions = all_actions - dopost_cases
print(f"\nMissing actions in doPost(e): {sorted(list(missing_actions))}")
