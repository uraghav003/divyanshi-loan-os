import re
import json
import os
import sys

WORKSPACE_ROOT = r"C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os"

def run_checks():
    results = {}
    print("=== STARTING MILESTONE 4 QUALITY REVIEW CHECKS ===\n")

    # 1. HTML files inspection
    html_files = ["index.html", "smart_form.html", "calling.html", "voice.html"]

    print("--- Checking HTML Closing Tags ---")
    for html_file in html_files:
        path = os.path.join(WORKSPACE_ROOT, html_file)
        if not os.path.exists(path):
            print(f"FAIL: {html_file} does not exist.")
            continue
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()

        closing_tags = re.findall(r"</html>", content, re.IGNORECASE)
        trimmed_content = content.rstrip()
        ends_with_html = trimmed_content.lower().endswith("</html>")

        print(f"[{html_file}] count(</html>) = {len(closing_tags)}, ends_with(</html>) = {ends_with_html}")
        results[f"{html_file}_closing_tag_count"] = len(closing_tags)
        results[f"{html_file}_ends_with_html"] = ends_with_html

    # Check 1a: index.html CSS & closing tag
    print("\n--- Checking index.html Specific Requirements ---")
    index_path = os.path.join(WORKSPACE_ROOT, "index.html")
    with open(index_path, "r", encoding="utf-8") as f:
        index_content = f.read()

    has_primary = "--primary: #C9A84C" in index_content or "--primary:#C9A84C" in index_content or "--primary: #c9a84c" in index_content
    has_bg = "--bg: #0B1F3A" in index_content or "--bg:#0B1F3A" in index_content or "--bg: #0b1f3a" in index_content

    # Regex for .section padding rule
    section_padding_match = re.search(r"\.section\s*\{[^}]*padding\s*:[^}]*\}", index_content, re.IGNORECASE | re.DOTALL)

    print(f"index.html has --primary: #C9A84C: {has_primary}")
    print(f"index.html has --bg: #0B1F3A: {has_bg}")
    print(f"index.html has .section {{ padding: ... }}: {bool(section_padding_match)}")
    if section_padding_match:
        print(f"  Matched .section rule snippet: {section_padding_match.group(0)[:100]}")

    results["index_has_primary"] = has_primary
    results["index_has_bg"] = has_bg
    results["index_has_section_padding"] = bool(section_padding_match)

    # Check 1b: smart_form.html requirements
    print("\n--- Checking smart_form.html Specific Requirements ---")
    smart_form_path = os.path.join(WORKSPACE_ROOT, "smart_form.html")
    with open(smart_form_path, "r", encoding="utf-8") as f:
        smart_form_content = f.read()

    has_form_close = "</form>" in smart_form_content.lower()
    has_html_close = "</html>" in smart_form_content.lower()

    # Find entry_type select and count option elements
    # entry_type select could be <select ... id="entry_type" ...> or name="entry_type"
    entry_type_select_match = re.search(r"<select[^>]*?(?:id|name)=[\"']entry_type[\"'][^>]*?>(.*?)</select>", smart_form_content, re.IGNORECASE | re.DOTALL)
    option_count = 0
    if entry_type_select_match:
        select_inner = entry_type_select_match.group(1)
        options = re.findall(r"<option[^>]*>", select_inner, re.IGNORECASE)
        option_count = len(options)
        print(f"Found entry_type select with {option_count} option elements.")
    else:
        print("WARNING: Could not find <select id/name='entry_type'> directly via strict regex, attempting wider search...")
        # Fallback search for any select containing entry_type or options inside entry_type block
        m = re.search(r"entry_type[\s\S]*?</select>", smart_form_content, re.IGNORECASE)
        if m:
            options = re.findall(r"<option", m.group(0), re.IGNORECASE)
            option_count = len(options)
            print(f"Fallback search found {option_count} options in entry_type block.")

    print(f"smart_form.html has </form>: {has_form_close}")
    print(f"smart_form.html has </html>: {has_html_close}")
    print(f"smart_form.html entry_type option count >= 3: {option_count >= 3} (count: {option_count})")

    results["smart_form_has_form_close"] = has_form_close
    results["smart_form_has_html_close"] = has_html_close
    results["smart_form_entry_type_options"] = option_count

    # Check 1c: calling.html requirements
    print("\n--- Checking calling.html Specific Requirements ---")
    calling_path = os.path.join(WORKSPACE_ROOT, "calling.html")
    with open(calling_path, "r", encoding="utf-8") as f:
        calling_content = f.read()

    ai_metric_match = re.search(r"\.ai-metric-label\s*\{[^}]*\}", calling_content, re.DOTALL)
    print(f"calling.html has complete .ai-metric-label CSS rule: {bool(ai_metric_match)}")
    if ai_metric_match:
        print(f"  Matched snippet: {ai_metric_match.group(0)}")

    results["calling_has_ai_metric_label_rule"] = bool(ai_metric_match)

    # 2. Code.gs Verification
    print("\n--- Checking Code.gs Functions and Logic ---")
    codegs_path = os.path.join(WORKSPACE_ROOT, "Code.gs")
    with open(codegs_path, "r", encoding="utf-8") as f:
        codegs_content = f.read()

    # Top level functions
    # function name(...)
    top_level_functions = set(re.findall(r"^\s*function\s+([A-Za-z0-9_$]+)\s*\(", codegs_content, re.MULTILINE))
    print(f"Total top-level functions defined in Code.gs: {len(top_level_functions)}")

    target_named_funcs = [
        "MIS_15MIN_FULL_SYNC_",
        "APPLY_DASHBOARD_PROTECTION_",
        "DASHBOARD_SYNC_TRIGGER_ENGINE",
        "GET_TAT_BY_PRODUCT_"
    ]

    for fn in target_named_funcs:
        exists = fn in top_level_functions
        print(f"Function '{fn}' exists: {exists}")
        results[f"func_{fn}_exists"] = exists

    # Inspect GET_TAT_BY_PRODUCT_ closing brace
    get_tat_match = re.search(r"function\s+GET_TAT_BY_PRODUCT_\s*\([^)]*\)\s*\{", codegs_content)
    if get_tat_match:
        start_idx = get_tat_match.start()
        # Find matching closing brace
        brace_count = 0
        found_closing = False
        func_body = ""
        for i in range(start_idx, len(codegs_content)):
            char = codegs_content[i]
            func_body += char
            if char == '{':
                brace_count += 1
            elif char == '}':
                brace_count -= 1
                if brace_count == 0:
                    found_closing = True
                    break
        print(f"GET_TAT_BY_PRODUCT_ function has valid matching closing brace: {found_closing}")
        results["GET_TAT_BY_PRODUCT_has_closing_brace"] = found_closing
    else:
        print("FAIL: GET_TAT_BY_PRODUCT_ function definition not found.")
        results["GET_TAT_BY_PRODUCT_has_closing_brace"] = False

    # Check doGet mapping
    print("\n--- Checking doGet Routing in Code.gs ---")
    doget_match = re.search(r"function\s+doGet\s*\([^)]*\)\s*\{[\s\S]*?\n\}", codegs_content)
    if doget_match:
        doget_code = doget_match.group(0)
        print("doGet code snippet:\n" + doget_code)

        has_page_form = ("form" in doget_code) and ("smart_form" in doget_code)
        has_page_calling = ("calling" in doget_code)
        has_page_voice = ("voice" in doget_code)
        has_default_index = ("index" in doget_code)

        print(f"doGet maps page=form -> smart_form: {has_page_form}")
        print(f"doGet maps page=calling -> calling: {has_page_calling}")
        print(f"doGet maps page=voice -> voice: {has_page_voice}")
        print(f"doGet maps default -> index: {has_default_index}")

        results["doGet_form_mapping"] = has_page_form
        results["doGet_calling_mapping"] = has_page_calling
        results["doGet_voice_mapping"] = has_page_voice
        results["doGet_default_mapping"] = has_default_index
    else:
        print("FAIL: doGet function definition not found!")

    # 3. Check google.script.run calls in HTML files
    print("\n--- Checking google.script.run Calls Across HTML Files ---")
    script_run_calls = set()

    # Pattern matching google.script.run.[with...]*functionName(...)
    # Common usages:
    # google.script.run.withSuccessHandler(...).withFailureHandler(...).myFunction(...)
    # google.script.run.myFunction(...)
    # Let's extract method calls chained after google.script.run
    pattern = r"google\.script\.run(?:\.[a-zA-Z0-9_$]+\s*\([^)]*\))*\.([a-zA-Z0-9_$]+)\s*\("

    html_contents = {}
    for html_file in html_files:
        path = os.path.join(WORKSPACE_ROOT, html_file)
        with open(path, "r", encoding="utf-8") as f:
            c = f.read()
            html_contents[html_file] = c
            matches = re.findall(pattern, c)
            for m in matches:
                # exclude helper builder methods if matched accidentally
                if m not in ["withSuccessHandler", "withFailureHandler", "withUserObject"]:
                    script_run_calls.add((m, html_file))

    print(f"Total unique google.script.run backend calls found in HTML: {len(script_run_calls)}")
    missing_funcs = []
    for fn_name, source_file in sorted(script_run_calls):
        in_gs = fn_name in top_level_functions
        print(f"  [{source_file}] google.script.run call to '{fn_name}': {'FOUND in Code.gs' if in_gs else 'MISSING in Code.gs'}")
        if not in_gs:
            missing_funcs.append((fn_name, source_file))

    results["missing_google_script_run_functions"] = missing_funcs

    # 4. Check appsscript.json OAuth scopes
    print("\n--- Checking appsscript.json OAuth Scopes ---")
    appsscript_path = os.path.join(WORKSPACE_ROOT, "appsscript.json")
    if os.path.exists(appsscript_path):
        with open(appsscript_path, "r", encoding="utf-8") as f:
            appsscript_data = json.load(f)
        oauth_scopes = appsscript_data.get("oauthScopes", [])
        print(f"OAuth Scopes listed ({len(oauth_scopes)}):")
        for scope in oauth_scopes:
            print(f"  - {scope}")
        results["oauth_scopes"] = oauth_scopes
    else:
        print("FAIL: appsscript.json does not exist!")

    print("\n=== CHECKS COMPLETED ===")
    return results

if __name__ == "__main__":
    run_checks()
