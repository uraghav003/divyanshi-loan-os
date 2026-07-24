import os
import re
import json
from html.parser import HTMLParser

WORKSPACE_ROOT = r"C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os"
HTML_FILES = ["index.html", "smart_form.html", "calling.html", "voice.html"]
CODE_GS_PATH = os.path.join(WORKSPACE_ROOT, "Code.gs")
APPSSCRIPT_JSON_PATH = os.path.join(WORKSPACE_ROOT, "appsscript.json")

# Self-closing HTML tags
SELF_CLOSING_TAGS = {
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr', '!doctype'
}

class HTMLStructureValidator(HTMLParser):
    def __init__(self, filename):
        super().__init__()
        self.filename = filename
        self.tag_stack = []
        self.errors = []
        self.element_ids = set()
        self.duplicate_ids = set()

    def handle_starttag(self, tag, attrs):
        tag_lower = tag.lower()
        attr_dict = dict(attrs)
        if 'id' in attr_dict:
            elem_id = attr_dict['id']
            if elem_id in self.element_ids:
                self.duplicate_ids.add(elem_id)
            else:
                self.element_ids.add(elem_id)

        if tag_lower not in SELF_CLOSING_TAGS:
            self.tag_stack.append((tag_lower, self.getpos()))

    def handle_endtag(self, tag):
        tag_lower = tag.lower()
        if tag_lower in SELF_CLOSING_TAGS:
            return

        if not self.tag_stack:
            self.errors.append(f"Line {self.getpos()[0]}: Unexpected closing tag </{tag_lower}> with empty stack")
            return

        # Check stack matching
        last_tag, last_pos = self.tag_stack[-1]
        if last_tag == tag_lower:
            self.tag_stack.pop()
        else:
            # Look up stack for matching tag
            matching_idx = None
            for i in range(len(self.tag_stack) - 1, -1, -1):
                if self.tag_stack[i][0] == tag_lower:
                    matching_idx = i
                    break
            if matching_idx is not None:
                unclosed = [t[0] for t in self.tag_stack[matching_idx + 1:]]
                self.errors.append(f"Line {self.getpos()[0]}: Closing tag </{tag_lower}> closes start tag from line {self.tag_stack[matching_idx][1][0]}, but leaves unclosed tags: {unclosed}")
                self.tag_stack = self.tag_stack[:matching_idx]
            else:
                self.errors.append(f"Line {self.getpos()[0]}: Mismatched closing tag </{tag_lower}> (expected </{last_tag}> from line {last_pos[0]})")

def check_brace_balance(content, filename):
    stack = []
    lines = content.splitlines()
    in_string = None
    escape = False
    errors = []

    for line_idx, line in enumerate(lines, 1):
        i = 0
        while i < len(line):
            char = line[i]
            # Simple string tracking (ignoring comments for brace check)
            if in_string:
                if escape:
                    escape = False
                elif char == '\\':
                    escape = True
                elif char == in_string:
                    in_string = None
            else:
                if char in ('"', "'", '`'):
                    # check line comment
                    if line[i:i+2] == '//':
                        break
                    in_string = char
                elif line[i:i+2] == '/*':
                    # Skip block comment until */
                    end_idx = line.find('*/', i+2)
                    if end_idx != -1:
                        i = end_idx + 1
                    else:
                        break
                elif char in '{[(':
                    stack.append((char, line_idx))
                elif char in '}]NodeType':
                    if char in '}]':
                        matching = {'}': '{', ']': '[', ')': '('}[char]
                        if not stack:
                            errors.append(f"{filename}:{line_idx}: Unmatched closing brace '{char}'")
                        elif stack[-1][0] != matching:
                            errors.append(f"{filename}:{line_idx}: Mismatched closing brace '{char}' (expected matching for '{stack[-1][0]}' from line {stack[-1][1]})")
                            # pop until matching or empty
                            found = False
                            for s_idx in range(len(stack)-1, -1, -1):
                                if stack[s_idx][0] == matching:
                                    stack = stack[:s_idx]
                                    found = True
                                    break
                            if not found and stack:
                                stack.pop()
                        else:
                            stack.pop()
            i += 1
    if stack:
        errors.append(f"{filename}: Unclosed delimiters remaining at end of file: {[s[0] + ' (line ' + str(s[1]) + ')' for s in stack[:10]]}")
    return errors

def analyze_html_file(filepath):
    filename = os.path.basename(filepath)
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    results = {
        'filename': filename,
        'html_open_count': content.count('<html'),
        'html_close_count': content.count('</html>'),
        'parser_errors': [],
        'unclosed_tags_at_eof': [],
        'duplicate_ids': [],
        'css_section': False,
        'css_ai_metric_label': False,
        'css_gold_color': False,
        'css_navy_color': False,
        'google_script_runs': [],
        'dom_ids_found': set(),
        'dom_ids_referenced_in_js': set(),
        'missing_referenced_dom_ids': set()
    }

    # Parser check
    parser = HTMLStructureValidator(filename)
    try:
        parser.feed(content)
        results['parser_errors'] = parser.errors
        results['unclosed_tags_at_eof'] = [t[0] for t in parser.tag_stack]
        results['duplicate_ids'] = list(parser.duplicate_ids)
        results['dom_ids_found'] = parser.element_ids
    except Exception as e:
        results['parser_errors'].append(f"HTML Parser exception: {str(e)}")

    # CSS Check
    styles = re.findall(r'<style[^>]*>(.*?)</style>', content, re.DOTALL | re.IGNORECASE)
    combined_css = "\n".join(styles)
    
    # Check .section
    results['css_section'] = bool(re.search(r'\.section\b', combined_css))
    # Check .ai-metric-label
    results['css_ai_metric_label'] = bool(re.search(r'\.ai-metric-label\b', combined_css))
    # Check colors
    results['css_gold_color'] = bool(re.search(r'#C9A84C\b', combined_css, re.IGNORECASE))
    results['css_navy_color'] = bool(re.search(r'#0B1F3A\b', combined_css, re.IGNORECASE))

    # JS script blocks check
    scripts = re.findall(r'<script[^>]*>(.*?)</script>', content, re.DOTALL | re.IGNORECASE)
    combined_js = "\n".join(scripts)

    # Extract google.script.run calls
    # Pattern to capture method name on google.script.run
    # e.g., google.script.run.withSuccessHandler(...).withFailureHandler(...).myFunctionName(...)
    # or google.script.run.myFunctionName(...)
    # We find all chained calls after google.script.run
    gs_calls = re.findall(r'google\.script\.run\s*(\.(?:[a-zA-Z0-9_]+\s*\([^)]*\)\s*)*\.([a-zA-Z0-9_]+)\s*\()', combined_js)
    # Also simple calls google.script.run.myFunc(...)
    simple_gs_calls = re.findall(r'google\.script\.run\.([a-zA-Z0-9_]+)\s*\(', combined_js)

    called_funcs = set()
    for full_chain, func_name in gs_calls:
        if func_name not in ('withSuccessHandler', 'withFailureHandler', 'withUserObject'):
            called_funcs.add(func_name)
    for func_name in simple_gs_calls:
        if func_name not in ('withSuccessHandler', 'withFailureHandler', 'withUserObject'):
            called_funcs.add(func_name)

    results['google_script_runs'] = sorted(list(called_funcs))

    # DOM IDs referenced in JS
    js_id_refs = set(re.findall(r'document\.getElementById\s*\(\s*[\'"]([^\'"]+)[\'"]\s*\)', combined_js))
    js_jq_refs = set(re.findall(r'\$\s*\(\s*[\'"]#([^\'"]+)[\'"]\s*\)', combined_js))
    all_js_id_refs = js_id_refs.union(js_jq_refs)
    results['dom_ids_referenced_in_js'] = all_js_id_refs

    missing_ids = set()
    for ref_id in all_js_id_refs:
        # Ignore dynamic template literals or JS variables if any passed
        if ref_id not in parser.element_ids:
            missing_ids.add(ref_id)
    results['missing_referenced_dom_ids'] = missing_ids

    return results

def analyze_code_gs(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    required_functions = [
        'GET_TAT_BY_PRODUCT_',
        'MIS_15MIN_FULL_SYNC_',
        'APPLY_DASHBOARD_PROTECTION_',
        'DASHBOARD_SYNC_TRIGGER_ENGINE',
        'doGet',
        'doPost'
    ]

    # Find all function declarations
    # GAS syntax: function funcName(...) or function funcName (...)
    func_declarations = re.findall(r'^\s*function\s+([a-zA-Z0-9_]+)\s*\(', content, re.MULTILINE)

    func_set = set(func_declarations)
    missing_required = [fn for fn in required_functions if fn not in func_set]

    # Duplicate functions
    func_counts = {}
    for fn in func_declarations:
        func_counts[fn] = func_counts.get(fn, 0) + 1
    duplicates = [fn for fn, count in func_counts.items() if count > 1]

    # Brace balance check
    brace_errors = check_brace_balance(content, "Code.gs")

    return {
        'total_functions': len(func_declarations),
        'unique_functions': len(func_set),
        'declared_functions': sorted(list(func_set)),
        'required_functions_found': {fn: (fn in func_set) for fn in required_functions},
        'missing_required_functions': missing_required,
        'duplicate_functions': duplicates,
        'brace_errors': brace_errors
    }

def analyze_appsscript_json(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        raw_text = f.read()

    try:
        data = json.loads(raw_text)
        valid_json = True
        json_error = None
    except Exception as e:
        data = None
        valid_json = False
        json_error = str(e)

    time_zone = data.get('timeZone') if data else None
    exception_logging = data.get('exceptionLogging') if data else None
    runtime_version = data.get('runtimeVersion') if data else None
    webapp = data.get('webapp') if data else None

    return {
        'valid_json': valid_json,
        'json_error': json_error,
        'timeZone': time_zone,
        'exceptionLogging': exception_logging,
        'runtimeVersion': runtime_version,
        'webapp': webapp
    }

def main():
    print("=" * 60)
    print("EMPIRICAL VERIFICATION HARNESS - MILESTONE 4")
    print("=" * 60)

    # 1. Analyze Code.gs
    print("\n--- ANALYZING Code.gs ---")
    gas_results = analyze_code_gs(CODE_GS_PATH)
    print(f"Total function declarations: {gas_results['total_functions']}")
    print(f"Unique function declarations: {gas_results['unique_functions']}")
    print("Required Functions Check:")
    for fn, found in gas_results['required_functions_found'].items():
        status = "PASS" if found else "FAIL"
        print(f"  [{status}] {fn}")
    if gas_results['duplicate_functions']:
        print(f"WARNING: Duplicate function declarations: {gas_results['duplicate_functions']}")
    if gas_results['brace_errors']:
        print(f"Brace/Delimiter Errors: {len(gas_results['brace_errors'])}")
        for err in gas_results['brace_errors'][:5]:
            print(f"  {err}")

    # 2. Analyze appsscript.json
    print("\n--- ANALYZING appsscript.json ---")
    app_results = analyze_appsscript_json(APPSSCRIPT_JSON_PATH)
    print(f"Valid JSON: {app_results['valid_json']}")
    print(f"Time Zone: {app_results['timeZone']}")
    print(f"Exception Logging: {app_results['exceptionLogging']}")
    print(f"Runtime Version: {app_results['runtimeVersion']}")
    print(f"Webapp Access: {app_results['webapp']}")

    # 3. Analyze HTML Files
    print("\n--- ANALYZING HTML FILES ---")
    all_html_results = []
    all_called_gs_funcs = set()

    for html_file in HTML_FILES:
        filepath = os.path.join(WORKSPACE_ROOT, html_file)
        res = analyze_html_file(filepath)
        all_html_results.append(res)
        all_called_gs_funcs.update(res['google_script_runs'])

        print(f"\nFile: {html_file}")
        print(f"  <html> tags: {res['html_open_count']} open, {res['html_close_count']} close")
        print(f"  Parser errors: {len(res['parser_errors'])}")
        for err in res['parser_errors']:
            print(f"    - {err}")
        print(f"  Unclosed tags at EOF: {res['unclosed_tags_at_eof']}")
        print(f"  Duplicate element IDs: {res['duplicate_ids']}")
        print(f"  CSS Checks:")
        print(f"    - .section present: {res['css_section']}")
        print(f"    - .ai-metric-label present: {res['css_ai_metric_label']}")
        print(f"    - Color #C9A84C (Gold) present: {res['css_gold_color']}")
        print(f"    - Color #0B1F3A (Navy) present: {res['css_navy_color']}")
        print(f"  google.script.run functions called ({len(res['google_script_runs'])}): {res['google_script_runs']}")
        if res['missing_referenced_dom_ids']:
            print(f"  Missing referenced DOM IDs in JS: {sorted(list(res['missing_referenced_dom_ids']))}")

    # 4. Coverage Analysis: google.script.run calls vs Code.gs declarations
    print("\n--- FUNCTION COVERAGE ANALYSIS (google.script.run -> Code.gs) ---")
    declared_set = set(gas_results['declared_functions'])
    unresolved_calls = {}

    for res in all_html_results:
        missing_for_file = []
        for fn in res['google_script_runs']:
            if fn not in declared_set:
                missing_for_file.append(fn)
        if missing_for_file:
            unresolved_calls[res['filename']] = missing_for_file

    print(f"Total unique google.script.run functions called across HTML: {len(all_called_gs_funcs)}")
    if unresolved_calls:
        print("CRITICAL FINDING: The following google.script.run calls have NO matching function in Code.gs:")
        for fn_name, missing in unresolved_calls.items():
            print(f"  {fn_name}: {missing}")
    else:
        print("PASS: Every google.script.run function called in HTML exists in Code.gs!")

    # Summary Report Data Structure export
    summary = {
        'code_gs': gas_results,
        'appsscript_json': app_results,
        'html_files': all_html_results,
        'unresolved_gs_calls': unresolved_calls,
        'all_called_gs_funcs': sorted(list(all_called_gs_funcs))
    }

    report_path = os.path.join(WORKSPACE_ROOT, ".agents", "challenger_m4", "empirical_test_results.json")
    with open(report_path, "w", encoding="utf-8") as f:
        # Convert sets to lists for json output
        def default_serializer(obj):
            if isinstance(obj, set):
                return list(obj)
            return str(obj)
        json.dump(summary, f, indent=2, default=default_serializer)
    print(f"\nEmpirical test raw results saved to {report_path}")

if __name__ == "__main__":
    main()
