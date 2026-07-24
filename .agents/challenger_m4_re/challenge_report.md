# Challenge Report — Milestone 4 Re-Verification

**Overall Risk Assessment**: MEDIUM

---

## Executive Summary

An exhaustive empirical verification of Milestone 4 (`Code.gs`, `calling.html`, `index.html`, `smart_form.html`, `voice.html`, `appsscript.json`) was conducted using custom AST parsers, HTML tree parsers, Node.js syntax compilers, and RPC mapping validators.

Key empirical findings:
1. **HTML Termination & Syntax**: All four HTML files (`index.html`, `calling.html`, `smart_form.html`, `voice.html`) cleanly end with `</html>`. However, **`smart_form.html` contains an structural HTML DOM tag nesting defect** where `<form id="smartIntakeForm">` (opened at line 310) is closed with `</form>` at line 548 *after* its parent wrapper `<div class="wrap">` (opened at line 293) is closed at line 546.
2. **RPC Function Mapping (`google.script.run`)**: 100% of all 18 genuine `google.script.run` backend calls across all frontend HTML files correctly map to defined, active functions in `Code.gs`. Zero missing backend function references were found.
3. **Error Handling on RPC Calls**: 16 of 18 RPC calls correctly attach `.withFailureHandler()`. Two RPC calls (`smart_form.html:601` calling `P1_GET_HR_PUBLIC_CONFIG` and `calling.html:573` calling `P1_CALLING_START`) lack `.withFailureHandler()` and could fail silently if network issues occur.
4. **CSS Standardization**: 45 custom CSS properties are defined in `:root` and all 56 CSS variable usages (`var(--...)`) map to valid defined variables.
5. **Anti-Facade & Genuine Code Integrity**: `Code.gs` contains zero forbidden facade data (`LD_1001`, `Rahul Sharma`, etc.). All 5 critical Section 20 backend entry points call genuine data handlers (`GET_MASTER_SNAPSHOT_`, `BULBHUL_CHAT_API_`, `UPSERT_MERGE_BY_KEY_`, `P1_HANDLE_INTAKE_`).
6. **Edge Case Safety**: `LockService` calls in `Code.gs` properly invoke `lock.releaseLock()` inside `finally` blocks. `doGet` and `doPost` entry points enforce top-level `try/catch` error boundaries. `appsscript.json` is 100% valid JSON with V8 runtime enabled.

---

## Challenges

### [Medium] Challenge 1: `smart_form.html` DOM Hierarchy Tag Misalignment

- **Assumption challenged**: All HTML files possess balanced and structurally sound DOM node hierarchies.
- **Attack Scenario**: Browsers encounter `</form>` outside its parent `<div class="wrap">`. In strict DOM parsers or HTML sanitizers (such as Google Apps Script HTML Service sanitization), mismatched parent-child tag closing can lead to unexpected DOM tree restructuring or form input element detachment.
- **Line details**:
  - Line 293: `<div class="wrap">` opened.
  - Line 310: `<form id="smartIntakeForm" onsubmit="return false;">` opened inside `.wrap`.
  - Line 311: `<div class="form-card one-page-mode" id="formCard">` opened inside `<form>`.
  - Line 545: `</div>` (closes `form-card`).
  - Line 546: `</div>` (closes `.wrap` prematurely!).
  - Line 548: `</form>` (closing tag positioned outside `.wrap`).
- **Blast radius**: Low-to-Medium visual or event bubble anomalies in standard browsers, potential sanitization rewrite in GAS HTML Service.
- **Mitigation**: Move `</form>` to line 546 before `</div>` closing `.wrap`, or move `<form>` opening tag inside `.wrap`.

---

### [Low] Challenge 2: RPC Calls Lacking `withFailureHandler`

- **Assumption challenged**: All frontend backend RPC calls handle server/network exceptions gracefully.
- **Attack Scenario**: If `google.script.run.P1_GET_HR_PUBLIC_CONFIG()` (`smart_form.html:601`) or `google.script.run.P1_CALLING_START()` (`calling.html:573`) encounter a network drop or Apps Script timeout, the failure is unhandled and fails silently without user notification.
- **Blast radius**: Low (user UI does not receive error feedback during network outages).
- **Mitigation**: Append `.withFailureHandler(function(err) { console.warn('RPC failed:', err); })` to all RPC calls.

---

## Stress Test Results

| Test Dimension | Test Scenario | Expected Outcome | Actual Outcome | Result |
|---|---|---|---|---|
| **HTML EOF Termination** | Inspect ending tags of all 4 `.html` files | Ends with `</html>` | All 4 files end cleanly with `</html>` | **PASS** |
| **HTML Tag Balance** | HTML Parser tree balance audit | 0 unclosed / misplaced tags | `index.html`, `calling.html`, `voice.html` PASS; `smart_form.html` has 2 nesting errors | **FAIL** |
| **JS Syntax Compile** | Node.js `-c` syntax check on `Code.gs` and HTML `<script>` blocks | 0 syntax errors | 100% syntax valid across all files | **PASS** |
| **RPC Method Mapping** | Extract all `google.script.run` backend calls & check in `Code.gs` | 0 missing functions | 18 RPC calls extracted, 18 mapped (0 missing) | **PASS** |
| **CSS Custom Vars** | Match `var(--...)` usages against `:root` definitions | 0 missing CSS variables | 45 defined, 56 used, 0 undefined | **PASS** |
| **Anti-Facade Check** | Scan `Code.gs` for mock queue data & Section 20 calls | 0 facade data; real backend calls | Zero facade data found; Section 20 calls verified | **PASS** |
| **LockService Safety** | Verify `lock.releaseLock()` placement | Placed inside `finally` blocks | All 3 LockService blocks use `finally` | **PASS** |
| **appsscript.json** | Validate JSON structure & V8 runtime | Valid JSON with V8 runtime | 100% valid JSON with V8 runtime | **PASS** |

---

## Unchallenged Areas

- **Live Google Apps Script Server Execution**: Real-time deployment execution on Google Cloud servers was not executed due to offline/CODE_ONLY environment constraints. Static AST and Node.js compilation was used instead.
