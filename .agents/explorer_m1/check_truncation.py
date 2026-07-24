import os

dir_path = r'C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os\.agents\explorer_m1'

for fn in ['index.html', 'smart_form.html', 'calling.html', 'voice.html']:
    fp = os.path.join(dir_path, fn)
    with open(fp, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    print(f"================ {fn} ================")
    if ".section { padding: 5" in content:
        idx = content.find(".section { padding: 5")
        print(f"[{fn}] FOUND '.section {{ padding: 5' at char index {idx}")
        print("Surrounding text:")
        print(content[max(0, idx-100):min(len(content), idx+200)])
    else:
        print(f"[{fn}] NOT found '.section {{ padding: 5'")
        
    if '<option value="' in content and 'entry_type' in content:
        idx = content.find('entry_type')
        print(f"[{fn}] FOUND 'entry_type' at char index {idx}")
        print("Surrounding text:")
        print(content[max(0, idx-50):min(len(content), idx+300)])
    else:
        print(f"[{fn}] NOT found 'entry_type'")
        
    if '.ai-metric-label{font-siz' in content:
        idx = content.find('.ai-metric-label{font-siz')
        print(f"[{fn}] FOUND '.ai-metric-label{{font-siz' at char index {idx}")
        print("Surrounding text:")
        print(content[max(0, idx-100):min(len(content), idx+200)])
    else:
        print(f"[{fn}] NOT found '.ai-metric-label{{font-siz'")
