import os
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

workspace_dir = r"C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os"
html_files = ["index.html", "smart_form.html", "calling.html", "voice.html"]
gs_file = "Code.gs"

code_gs_path = os.path.join(workspace_dir, gs_file)
with open(code_gs_path, "r", encoding="utf-8") as f:
    code_gs = f.read()

gs_functions = set(re.findall(r'^\s*function\s+([a-zA-Z0-9_$]+)\s*\(', code_gs, re.MULTILINE))

print("=== EXACT LINES CONTAINING google.script.run ===")

for hf in html_files:
    print(f"\n================ FILE: {hf} ================")
    path = os.path.join(workspace_dir, hf)
    with open(path, "r", encoding="utf-8") as f:
        lines = f.readlines()
    
    for i, l in enumerate(lines, 1):
        if "google.script.run" in l:
            print(f"Line {i:4d}: {l.strip()}")
            # Print next 3 lines if part of a chain
            for j in range(1, 4):
                if i-1+j < len(lines):
                    print(f"  +{j}    : {lines[i-1+j].strip()}")

