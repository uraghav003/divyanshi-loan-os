import os
import re
import sys
import json
import subprocess
from html.parser import HTMLParser

# Ensure UTF-8 output encoding for Windows terminal
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

WORKSPACE_ROOT = r"C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os"
CODE_GS_PATH = os.path.join(WORKSPACE_ROOT, "Code.gs")
APPSSCRIPT_JSON_PATH = os.path.join(WORKSPACE_ROOT, "appsscript.json")
HTML_FILES = ["index.html", "smart_form.html", "calling.html", "voice.html"]
REPORT_DIR = os.path.join(WORKSPACE_ROOT, ".agents", "challenger_m4_re")

# Void HTML tags that don't need closing tags
VOID_TAGS = {
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 
    'link', 'meta', 'param', 'source', 'track', 'wbr', '!doctype'
}

class TagBalanceParser(HTMLParser):
    def __init__(self, filename):
        super().__init__()
        self.filename = filename
        self.stack = []
        self.errors = []
        self.scripts = []
        self.styles = []
        self.in_script = False
        self.in_style = False
        self.current_script = []
        self.current_style = []
        self.script_start_line = 0
        self.style_start_line = 0

    def handle_starttag(self, tag, attrs):
        tag_lower = tag.lower()
        if tag_lower in VOID_TAGS:
            return
        self.stack.append((tag_lower, self.getpos()))
        if tag_lower == 'script':
            self.in_script = True
            self.script_start_line = self.getpos()[0]
            self.current_script = []
        elif tag_lower == 'style':
            self.in_style = True
            self.style_start_line = self.getpos()[0]
            self.current_style = []

    def handle_endtag(self, tag):
        tag_lower = tag.lower()
        if tag_lower in VOID_TAGS:
            return
        if tag_lower == 'script':
            self.in_script = False
            self.scripts.append((self.script_start_line, "".join(self.current_script)))
        elif tag_lower == 'style':
            self.in_style = False
            self.styles.append((self.style_start_line, "".join(self.current_style)))

        if not self.stack:
            self.errors.append(f"Unexpected closing tag </{tag}> at line {self.getpos()[0]}")
            return
        
        top_tag, top_pos = self.stack[-1]
        if top_tag == tag_lower:
            self.stack.pop()
        else:
            # Search stack for matching start tag
            found = False
            for i in range(len(self.stack)-1, -1, -1):
                if self.stack[i][0] == tag_lower:
                    unclosed = [f"<{t[0]}> (line {t[1][0]})" for t in self.stack[i+1:]]
                    self.errors.append(f"Tag </{tag}> at line {self.getpos()[0]} closed <{tag}> at line {self.stack[i][1][0]}, leaving unclosed: {', '.join(unclosed)}")
                    self.stack = self.stack[:i]
                    found = True
                    break
            if not found:
                self.errors.append(f"Mismatched closing tag </{tag}> at line {self.getpos()[0]} (expected </{top_tag}> for <{top_tag}> at line {top_pos[0]})")

    def handle_data(self, data):
        if self.in_script:
            self.current_script.append(data)
        elif self.in_style:
            self.current_style.append(data)

def check_js_syntax_with_node(js_code, label):
    """Uses Node.js to check JS syntax validity."""
    clean_label = re.sub(r'[^a-zA-Z0-9_]', '_', label)
    temp_file = os.path.join(REPORT_DIR, f"temp_check_{clean_label}.js")
    with open(temp_file, "w", encoding="utf-8") as f:
        f.write(js_code)
    
    cmd = ["node", "-c", temp_file]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if os.path.exists(temp_file):
        try:
            os.remove(temp_file)
        except Exception:
            pass
    
    if res.returncode != 0:
        return False, res.stderr.strip()
    return True, ""

def test_appsscript_json():
    print("\n--- [Suite 1] Appsscript.json Audit ---")
    if not os.path.exists(APPSSCRIPT_JSON_PATH):
        print("FAIL: appsscript.json does not exist")
        return False, ["appsscript.json missing"]
    
    with open(APPSSCRIPT_JSON_PATH, "r", encoding="utf-8") as f:
        content = f.read()
    
    try:
        data = json.loads(content)
    except Exception as e:
        print(f"FAIL: appsscript.json is invalid JSON: {e}")
        return False, [f"Invalid JSON: {e}"]

    findings = []
    print(f"PASS: appsscript.json valid JSON.")
    print(f"  - Runtime Version: {data.get('runtimeVersion')}")
    print(f"  - TimeZone: {data.get('timeZone')}")
    print(f"  - WebApp Config: {data.get('webapp')}")
    
    if data.get('runtimeVersion') != "V8":
        findings.append("runtimeVersion is not 'V8'")
    if not data.get('webapp'):
        findings.append("Missing webapp configuration block")
    
    return len(findings) == 0, findings

def test_html_structure_and_tags():
    print("\n--- [Suite 2] HTML Termination & Tag Balancing Audit ---")
    all_ok = True
    results = {}
    
    for fname in HTML_FILES:
        path = os.path.join(WORKSPACE_ROOT, fname)
        if not os.path.exists(path):
            print(f"FAIL: File {fname} missing")
            all_ok = False
            continue
        
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        
        # 1. EOF check
        ends_cleanly = content.strip().endswith("</html>")
        if not ends_cleanly:
            print(f"FAIL: {fname} does not end cleanly with </html>")
            all_ok = False
        else:
            print(f"PASS: {fname} ends with </html>")
        
        # 2. Tag balance check
        parser = TagBalanceParser(fname)
        try:
            parser.feed(content)
            parser.close()
        except Exception as e:
            print(f"FAIL: {fname} HTML parser threw exception: {e}")
            all_ok = False

        if parser.stack:
            unclosed_tags = [f"<{t[0]}> (line {t[1][0]})" for t in parser.stack]
            print(f"FAIL: {fname} has {len(parser.stack)} unclosed tag(s) at EOF: {', '.join(unclosed_tags)}")
            all_ok = False
        
        if parser.errors:
            print(f"FAIL: {fname} has {len(parser.errors)} HTML tag balance error(s):")
            for err in parser.errors:
                print(f"  - {err}")
            all_ok = False
        
        if ends_cleanly and not parser.stack and not parser.errors:
            print(f"PASS: {fname} HTML structure and tag balancing perfectly valid.")
            
        results[fname] = {
            "ends_cleanly": ends_cleanly,
            "unclosed_stack": parser.stack,
            "errors": parser.errors,
            "scripts": parser.scripts,
            "styles": parser.styles
        }
        
    return all_ok, results

def test_js_syntax(html_results):
    print("\n--- [Suite 3] JavaScript Syntax Audit ---")
    all_ok = True
    
    # 1. Code.gs syntax
    with open(CODE_GS_PATH, "r", encoding="utf-8") as f:
        code_gs_content = f.read()
    
    ok, err = check_js_syntax_with_node(code_gs_content, "Code_gs")
    if not ok:
        print(f"FAIL: Code.gs JS syntax error:\n{err}")
        all_ok = False
    else:
        print("PASS: Code.gs JavaScript syntax is valid.")

    # 2. HTML script blocks syntax
    for fname, data in html_results.items():
        scripts = data.get("scripts", [])
        for idx, (start_line, script_content) in enumerate(scripts):
            if not script_content.strip():
                continue
            ok, err = check_js_syntax_with_node(script_content, f"{fname}_script_{idx}")
            if not ok:
                print(f"FAIL: {fname} (script block near line {start_line}) JS syntax error:\n{err}")
                all_ok = False
            else:
                print(f"PASS: {fname} (script block near line {start_line}) JS syntax is valid.")

    return all_ok

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

def test_rpc_mapping():
    print("\n--- [Suite 4] RPC Function Mapping Audit (google.script.run) ---")
    
    with open(CODE_GS_PATH, "r", encoding="utf-8") as f:
        code_gs = f.read()
    
    code_no_comments = re.sub(r'/\*[\s\S]*?\*/', '', code_gs)
    code_no_comments = re.sub(r'//.*', '', code_no_comments)
    
    backend_funcs = set(re.findall(r'function\s+([A-Za-z0-9_$]+)\s*\(', code_no_comments))
    backend_vars = set(re.findall(r'(?:var|let|const)\s+([A-Za-z0-9_$]+)\s*=\s*function', code_no_comments))
    all_backend_funcs = backend_funcs.union(backend_vars)
    
    print(f"Extracted {len(all_backend_funcs)} top-level backend functions from Code.gs.")

    rpc_calls_found = []
    missing_backend_funcs = []
    unhandled_rpc_calls = []

    for fname in HTML_FILES:
        path = os.path.join(WORKSPACE_ROOT, fname)
        if not os.path.exists(path):
            continue
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
            
        for m in re.finditer(r'google\s*\.\s*script\s*\.\s*run', content):
            start_pos = m.start()
            line_no = content[:start_pos].count('\n') + 1
            
            curr_pos = m.end()
            chain_methods = []
            has_success = False
            has_failure = False
            target_func = None
            
            while curr_pos < len(content):
                ws_m = re.match(r'\s*', content[curr_pos:])
                if ws_m:
                    curr_pos += ws_m.end()
                    
                if curr_pos >= len(content) or content[curr_pos] != '.':
                    break
                    
                curr_pos += 1
                name_m = re.match(r'\s*([A-Za-z0-9_$]+)\s*\(', content[curr_pos:])
                if not name_m:
                    break
                    
                method_name = name_m.group(1)
                paren_start = curr_pos + name_m.end() - 1
                paren_end = find_matching_paren(content, paren_start)
                
                if paren_end == -1:
                    break
                    
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
                    break
                    
            if target_func:
                call_info = {
                    "file": fname,
                    "line": line_no,
                    "func": target_func,
                    "chain": ".".join(chain_methods),
                    "has_success": has_success,
                    "has_failure": has_failure
                }
                rpc_calls_found.append(call_info)
                
                if target_func not in all_backend_funcs:
                    missing_backend_funcs.append((fname, line_no, target_func))
                    print(f"FAIL: {fname}:{line_no} calls google.script.run.{target_func}(), but '{target_func}' is NOT defined in Code.gs!")
                else:
                    print(f"PASS: {fname}:{line_no} -> google.script.run.{target_func}() mapped to Code.gs definition.")

                if not has_failure:
                    unhandled_rpc_calls.append((fname, line_no, target_func))

    print(f"\nTotal RPC calls scanned across HTML files: {len(rpc_calls_found)}")
    print(f"Missing backend function references: {len(missing_backend_funcs)}")
    print(f"RPC calls missing withFailureHandler: {len(unhandled_rpc_calls)}")
    
    if unhandled_rpc_calls:
        print("\nNotice - RPC calls without withFailureHandler:")
        for fname, line_no, func in unhandled_rpc_calls:
            print(f"  - {fname}:{line_no} -> {func}()")

    return len(missing_backend_funcs) == 0, rpc_calls_found, missing_backend_funcs, unhandled_rpc_calls

def test_css_variables(html_results):
    print("\n--- [Suite 5] CSS Variable & Standardization Audit ---")
    defined_vars = set()
    used_vars = set()
    
    root_var_pattern = re.compile(r'--([a-zA-Z0-9_-]+)\s*:\s*([^;}]+)')
    var_usage_pattern = re.compile(r'var\(\s*--([a-zA-Z0-9_-]+)\s*(?:,[^)]+)?\)')
    
    for fname, data in html_results.items():
        styles = data.get("styles", [])
        for start_line, style_content in styles:
            root_blocks = re.findall(r':root\s*\{([^}]+)\}', style_content)
            for rb in root_blocks:
                for var_name, var_val in root_var_pattern.findall(rb):
                    defined_vars.add(var_name)
            
            for var_name in var_usage_pattern.findall(style_content):
                used_vars.add((fname, var_name))

    for fname in HTML_FILES:
        path = os.path.join(WORKSPACE_ROOT, fname)
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        for var_name in var_usage_pattern.findall(content):
            used_vars.add((fname, var_name))

    print(f"Defined CSS custom variables count: {len(defined_vars)}")
    print(f"Unique CSS variable usages count: {len(used_vars)}")

    undefined_vars = []
    for fname, var_name in used_vars:
        if var_name not in defined_vars:
            undefined_vars.append((fname, var_name))
            print(f"FAIL: {fname} uses var(--{var_name}), but --{var_name} is NOT defined in any :root block!")

    if not undefined_vars:
        print("PASS: All referenced CSS variables are defined in :root standard theme.")
        
    return len(undefined_vars) == 0, defined_vars, undefined_vars

def test_genuine_code_and_anti_facade():
    print("\n--- [Suite 6] Genuine Code Presence & Anti-Facade Audit ---")
    with open(CODE_GS_PATH, "r", encoding="utf-8") as f:
        code_gs = f.read()
        
    forbidden_terms = ['LD_1001', 'Rahul Sharma', 'LD_1002', 'Priya Singh', 'LD_1003', 'Amit Verma']
    facade_found = False
    for term in forbidden_terms:
        if term in code_gs:
            print(f"FAIL: Found forbidden facade term '{term}' in Code.gs")
            facade_found = True
            
    if not facade_found:
        print("PASS: Zero occurrences of forbidden mock queue data ('LD_1001', 'Rahul Sharma', etc.) in Code.gs.")

    required_calls_section20 = [
        ('GET_MASTER_SNAPSHOT_', 'P1_GET_CALLING_QUEUE'),
        ('BULBHUL_CHAT_API_', 'P1_CALLING_AI_REMARK'),
        ('UPSERT_MERGE_BY_KEY_', 'P1_UPDATE_CALLING_CASE'),
        ('P1_HANDLE_INTAKE_', 'P1_SAVE_CALC_LEAD'),
        ('UPSERT_MERGE_BY_KEY_', 'MLA_UPDATE_MINI_STATUS')
    ]
    sec20_ok = True
    for fn, caller in required_calls_section20:
        if fn not in code_gs:
            print(f"FAIL: Missing genuine call to '{fn}' in Code.gs ({caller})")
            sec20_ok = False
        else:
            print(f"PASS: Verified genuine call to '{fn}' in Code.gs ({caller}).")

    stubs_found = []
    stub_pattern = re.compile(r'\b(TODO|FIXME|STUB|PLACEHOLDER|NOT_IMPLEMENTED)\b', re.IGNORECASE)
    
    files_to_check = [CODE_GS_PATH] + [os.path.join(WORKSPACE_ROOT, f) for f in HTML_FILES]
    for path in files_to_check:
        fname = os.path.basename(path)
        with open(path, "r", encoding="utf-8") as f:
            lines = f.readlines()
        for idx, line in enumerate(lines, 1):
            m = stub_pattern.search(line)
            if m:
                safe_line = line.strip()[:80].encode('ascii', 'replace').decode('ascii')
                stubs_found.append((fname, idx, line.strip()))

    return (not facade_found) and sec20_ok, stubs_found

def test_edge_cases_and_resilience():
    print("\n--- [Suite 7] Edge Cases & Stress Resilience Audit ---")
    findings = []
    
    with open(CODE_GS_PATH, "r", encoding="utf-8") as f:
        code_gs = f.read()

    lock_matches = re.finditer(r'LockService\.getScriptLock\(\)', code_gs)
    for m in lock_matches:
        line_no = code_gs[:m.start()].count('\n') + 1
        snippet = code_gs[m.start():m.start()+2000]
        if 'lock.releaseLock()' in snippet:
            if 'finally' in snippet and snippet.find('finally') < snippet.find('lock.releaseLock()'):
                print(f"PASS: LockService around line {line_no} uses releaseLock() in finally block.")
            else:
                print(f"WARNING: LockService around line {line_no} calls releaseLock() outside or without explicit 'finally' block.")
                findings.append(f"LockService at line {line_no} may leak lock on uncaught exception (missing finally block).")
        else:
            print(f"FAIL: LockService around line {line_no} does not appear to call releaseLock()!")
            findings.append(f"LockService at line {line_no} missing releaseLock().")

    json_parse_matches = re.finditer(r'JSON\.parse\s*\(([^)]+)\)', code_gs)
    unsafe_json_parses = []
    for m in json_parse_matches:
        line_no = code_gs[:m.start()].count('\n') + 1
        arg = m.group(1).strip()
        prev_lines = code_gs[:m.start()].split('\n')[-5:]
        has_try = any('try' in l for l in prev_lines)
        if not has_try:
            unsafe_json_parses.append((line_no, arg))
            
    json_parse_pattern = r'JSON\.parse'
    print(f"JSON.parse occurrences in Code.gs: {len(list(re.finditer(json_parse_pattern, code_gs)))}")

    for handler in ['doGet', 'doPost']:
        match = re.search(r'function\s+' + handler + r'\s*\([^)]*\)\s*\{', code_gs)
        if match:
            start_pos = match.start()
            snippet = code_gs[start_pos:start_pos+300]
            if 'try' in snippet:
                print(f"PASS: {handler} begins with top-level try block.")
            else:
                print(f"WARNING: {handler} does not begin with top-level try block.")
                findings.append(f"{handler} missing top-level try-catch error boundary.")

    return len(findings) == 0, findings

def main():
    print("==================================================")
    print("  EMPIRICAL CHALLENGER VERIFICATION SUITE - M4")
    print("==================================================")
    
    t1_ok, t1_findings = test_appsscript_json()
    t2_ok, html_results = test_html_structure_and_tags()
    t3_ok = test_js_syntax(html_results)
    t4_ok, rpc_calls, missing_funcs, unhandled_rpc = test_rpc_mapping()
    t5_ok, defined_vars, undefined_vars = test_css_variables(html_results)
    t6_ok, stubs = test_genuine_code_and_anti_facade()
    t7_ok, stress_findings = test_edge_cases_and_resilience()

    print("\n==================================================")
    print("  SUMMARY OF EMPIRICAL VERIFICATION RESULTS")
    print("==================================================")
    print(f"1. appsscript.json Audit: {'PASS' if t1_ok else 'FAIL'}")
    print(f"2. HTML Structure & Tag Balance Audit: {'PASS' if t2_ok else 'FAIL'}")
    print(f"3. JavaScript Syntax Audit: {'PASS' if t3_ok else 'FAIL'}")
    print(f"4. RPC Function Mapping Audit: {'PASS' if t4_ok else 'FAIL'} ({len(missing_funcs)} missing backend funcs)")
    print(f"5. CSS Variables Audit: {'PASS' if t5_ok else 'FAIL'} ({len(undefined_vars)} undefined vars)")
    print(f"6. Anti-Facade & Genuine Code Audit: {'PASS' if t6_ok else 'FAIL'}")
    print(f"7. Edge Cases & Resilience Audit: {'PASS' if t7_ok else 'WARNINGS/ISSUES'}")
    
    overall_pass = t1_ok and t2_ok and t3_ok and t4_ok and t5_ok and t6_ok
    print(f"\nOVERALL RE-VERIFICATION STATUS: {'PASS' if overall_pass else 'FAIL'}")

if __name__ == "__main__":
    main()
