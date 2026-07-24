import sys
import os

sys.stdout.reconfigure(encoding='utf-8')
dir_path = r'C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os\.agents\explorer_m1'

def inspect_file(fn):
    fp = os.path.join(dir_path, fn)
    with open(fp, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    lines = content.splitlines()
    print(f"==================================================")
    print(f"FILE: {fn} (Lines: {len(lines)}, Bytes: {len(content)})")
    print(f"==================================================")
    
    # Check closing tags
    has_html_end = any('</html>' in l for l in lines[-10:])
    has_body_end = any('</body>' in l for l in lines[-10:])
    has_script_end = any('</script>' in l for l in lines[-10:])
    print(f"Closing tags present: </html>: {has_html_end}, </body>: {has_body_end}, </script>: {has_script_end}")
    
    # Search for google.script.run functions
    import re
    gs_calls = re.findall(r'google\.script\.run(?:\.with\w+\([^)]*\))*\.([A-Za-z0-9_]+)\(', content)
    print(f"google.script.run endpoint calls: {set(gs_calls)}")
    
    # Search for any fetch / post / REST calls
    fetches = re.findall(r'fetch\([^\n)]+', content)
    print(f"Fetch calls: {fetches}")
    
    # Return content for specific checks
    return content, lines

index_content, index_lines = inspect_file('index.html')
smart_content, smart_lines = inspect_file('smart_form.html')
calling_content, calling_lines = inspect_file('calling.html')
voice_content, voice_lines = inspect_file('voice.html')
