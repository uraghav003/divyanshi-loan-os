import os
import re

WORKSPACE_ROOT = r"C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os"
CODE_GS_PATH = os.path.join(WORKSPACE_ROOT, "Code.gs")
HTML_FILES = ["index.html", "smart_form.html", "calling.html", "voice.html"]

def extract_backend_functions():
    with open(CODE_GS_PATH, "r", encoding="utf-8") as f:
        content = f.read()
    # strip comments
    content = re.sub(r'/\*[\s\S]*?\*/', '', content)
    content = re.sub(r'//.*', '', content)
    
    funcs = set(re.findall(r'function\s+([A-Za-z0-9_$]+)\s*\(', content))
    funcs.update(re.findall(r'(?:var|let|const)\s+([A-Za-z0-9_$]+)\s*=\s*function', content))
    return funcs

def find_matching_paren(text, start_idx):
    """Given text and index of opening '(', return index of matching closing ')'."""
    depth = 0
    in_str = None
    i = start_idx
    while i < len(text):
        c = text[i]
        if in_str:
            if c == in_str and text[i-1] != '\\':
                in_str = None
        else:
            if c in ("'", '"', '`'):
                in_str = c
            elif c == '(':
                depth += 1
            elif c == ')':
                depth -= 1
                if depth == 0:
                    return i
        i += 1
    return -1

def extract_rpc_calls_precise(html_path):
    with open(html_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    rpc_calls = []
    fname = os.path.basename(html_path)
    
    # find all positions of google.script.run
    for m in re.finditer(r'google\s*\.\s*script\s*\.\s*run', content):
        start_pos = m.start()
        line_no = content[:start_pos].count('\n') + 1
        
        curr_pos = m.end()
        chain_methods = []
        has_success = False
        has_failure = False
        target_func = None
        
        while curr_pos < len(content):
            # Skip whitespace and comments
            ws_m = re.match(r'\s*', content[curr_pos:])
            if ws_m:
                curr_pos += ws_m.end()
                
            if curr_pos >= len(content) or content[curr_pos] != '.':
                break # chain ended
                
            # We found a dot '.'
            curr_pos += 1 # skip '.'
            # read method name
            name_m = re.match(r'\s*([A-Za-z0-9_$]+)\s*\(', content[curr_pos:])
            if not name_m:
                break
                
            method_name = name_m.group(1)
            paren_start = curr_pos + name_m.end() - 1 # pos of '('
            paren_end = find_matching_paren(content, paren_start)
            
            if paren_end == -1:
                break # unmatched paren
                
            if method_name == 'withSuccessHandler':
                has_success = True
                chain_methods.append(method_name)
                curr_pos = paren_end + 1
            elif method_name == 'withFailureHandler':
                has_failure = True
                chain_methods.append(method_name)
                curr_pos = paren_end + 1
            elif method_name == 'withUserObject':
                chain_methods.append(method_name)
                curr_pos = paren_end + 1
            else:
                target_func = method_name
                chain_methods.append(method_name)
                break # reached backend RPC call!
                
        if target_func:
            rpc_calls.append({
                "file": fname,
                "line": line_no,
                "func": target_func,
                "chain": ".".join(chain_methods),
                "has_success": has_success,
                "has_failure": has_failure
            })
            
    return rpc_calls

backend_funcs = extract_backend_functions()
print(f"Total backend functions defined in Code.gs: {len(backend_funcs)}")

all_rpc_calls = []
missing_funcs = []

for hfile in HTML_FILES:
    path = os.path.join(WORKSPACE_ROOT, hfile)
    calls = extract_rpc_calls_precise(path)
    print(f"\n--- {hfile} RPC Calls ({len(calls)}) ---")
    for c in calls:
        all_rpc_calls.append(c)
        is_defined = c['func'] in backend_funcs
        status = "OK" if is_defined else "MISSING BACKEND FUNCTION!"
        if not is_defined:
            missing_funcs.append(c)
        err_h = "WithFailure" if c['has_failure'] else "NO_FAILURE_HANDLER"
        succ_h = "WithSuccess" if c['has_success'] else "NO_SUCCESS_HANDLER"
        print(f"  Line {c['line']}: google.script.run...{c['func']}() -> {status} [{succ_h}, {err_h}]")

print(f"\n==================================================")
print(f"Total Genuine RPC calls found: {len(all_rpc_calls)}")
print(f"Missing backend function calls: {len(missing_funcs)}")
print(f"==================================================")
