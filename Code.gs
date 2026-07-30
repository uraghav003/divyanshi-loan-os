// ═══════════════════════════════════════════════════════════════
//  BULBHUL — CODE.GS  |  UNIFIED PRODUCTION  |  v12.2-AUTO
//  Divyanshi Capital Pvt Ltd
//  Rewritten: 2026-07-27 — Premium LEAD_ID + Avatar + Full Auto + Safe Agents
//  ALL_EMPLOYEES = SINGLE SOURCE OF TRUTH
//  Owner: upendra.raghav@divyanshicapital.com
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
//  BULBHUL — CODE.GS (FINAL POLISHED)
//  Divyanshi Capital Pvt Ltd
//  Version: 12.1-FAST (Polished Production)
//  ALL_EMPLOYEES = SINGLE SOURCE OF TRUTH
//  Flow: Master File → Personal File → Dashboard → All Features
//  Compatible with: V9.3.0-FAST + V12.0 upgrades
//  Audit Date: 2026-07-26
//  Changes: PIN field support, P1_VERIFY_ACCESS enhanced, 
//           DC_BUILD_EMP_MAP_ PIN extraction, consistent error handling
// ═══════════════════════════════════════════════════════════════

const DC_CFG = {
  PROPS: PropertiesService.getScriptProperties(),
  MASTER_SS_ID: "1Mk9AzGdKK07WZCKV6lZgtlM4JWy2sdESQwh70r0UicU",
  COMPANY: {
    NAME: "Divyanshi Capital Pvt Ltd",
    MD_EMAIL: "upendra.raghav@divyanshicapital.com",
    FOUNDER_EMAIL: "NARENDRARAGHAV@DIVYANSHICAPITAL.COM",
    HR_EMAIL: "khushboo.divyanshicapital@gmail.com",
    ACCOUNTS_EMAIL: "accounts@divyanshicapital.com",
    SUPPORT_EMAIL: "support@divyanshicapital.com"
  },
  BULBHUL: { WA_NUMBER: "9718861305", NAME: "Bulbhul - AI Banker" },
  SHEETS: {
    ALL_EMPLOYEES: "ALL_EMPLOYEES",
    COMMON_ENTRY: "COMMON_ENTRY",
    SMART_LOG: "SMART_LOG",
    SOURCE_NAME: "SOURCE_NAME",
    MASTER_DATA: "MASTER_DATA",
    MIS_LOG: "MIS_LOG",
    ATTENDANCE: "ATTENDANCE_LOG",
    ACCOUNTS_LOG: "ACCOUNTS_LOG",
    RAW_INBOX: "RAW_INBOX",
    MIS_REPORT: "MIS_FINAL_REPORT",
    HR_APPROVAL: "HR_MD_APPROVAL",
    LOAN_BANK_MAP: "Loan_Bank_Map",
    ERR: "ERR",
    PERSONAL_DIR: "PERSONAL_FILES_DIR",
    AVATAR_LOG: "AVATAR_ACTIVITY_LOG"
  },
  ATTENDANCE: { PRESENT: 5, HALF_DAY: 3 },
  MIS: { GMAIL_LABEL: "MIS-Incoming", SYNC_INTERVAL: 15, REPORT_HOUR: 19 },
  EMP_COLS: ["EMP_CODE", "EMPLOYEES_NAME", "ROLE", "DEPARTMENT", "EMPLOYEE_EMAIL_ID", "MOBILE", "WHATSAPP", "TG_CHAT_ID", "WHATSAPP_VERIFIED", "PERSONAL_FILE_ID"]
};

// ─── MASTER SPREADSHEET ACCESS ──────────────────────────────
function DC_GET_SS_() {
  const p = PropertiesService.getScriptProperties();
  if (DC_CFG.MASTER_SS_ID && DC_CFG.MASTER_SS_ID.length > 10) {
    try { const s = SpreadsheetApp.openById(DC_CFG.MASTER_SS_ID); p.setProperty("MASTER_FILE_ID", DC_CFG.MASTER_SS_ID); return s; } catch (e) {}
  }
  try { const a = SpreadsheetApp.getActiveSpreadsheet(); if (a && a.getId()) { p.setProperty("MASTER_FILE_ID", a.getId()); return a; } } catch (e) {}
  const ids = [p.getProperty("MASTER_FILE_ID"), p.getProperty("P1_MASTER_FILE_ID")].filter(Boolean);
  for (const id of ids) { try { const s = SpreadsheetApp.openById(id); p.setProperty("MASTER_FILE_ID", id); return s; } catch (e) {} }
  throw new Error("Cannot open Master Sheet. Set MASTER_SS_ID in Code.gs");
}

// ─── HELPERS ────────────────────────────────────────────────────
const DC_NORM_ = v => {
  const a = { "EMPLOYEES_NAME": "EMPLOYEES_NAME", "EMPLOYEE_EMAIL_ID": "EMPLOYEE_EMAIL", "EMPLOYEE_CODE": "EMP_CODE", "PHONE": "CLIENT_MOBILE", "MOBILE": "CLIENT_MOBILE", "PRODUCT": "LOAN_TYPE", "BANK": "PREFERRED_BANK", "LOAN_AMOUNT": "REQUIRED_LOAN_AMOUNT", "COMMENT": "REMARKS", "CIBIL": "CIBIL_SCORE", "CITY": "CITY_LOCATION", "COMPANY": "COMPANY_NAME" };
  const k = String(v || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  return a[k] || k;
};
const DC_CLEAN = v => String(v || "").trim();
const DC_CLEAN_MOBILE = v => String(v || "").replace(/\D/g, "").slice(-10);
const DC_CLEAN_EMAIL = v => String(v || "").trim().toLowerCase();
const SHEET_ = n => DC_GET_SS_().getSheetByName(n);
const GET_OR_CREATE_ = n => { const s = DC_GET_SS_(); return s.getSheetByName(n) || s.insertSheet(n); };
const P1_OPEN_SS_ = id => { for (let i = 1; i <= 5; i++) { try { return SpreadsheetApp.openById(id); } catch (e) { if (i < 5) Utilities.sleep(1500 * i); } } throw new Error("Cannot open: " + id); };
const P1_EXEC_URL_ = () => { let u = PropertiesService.getScriptProperties().getProperty("P1_EXEC_URL"); if (!u) try { u = ScriptApp.getService().getUrl(); } catch (e) {} return u || "https://script.google.com/macros/s/DEPLOY/exec"; };
const LOG_ERR_ = (f, c, m) => { try { const s = GET_OR_CREATE_("ERR"); P1_ENSURE_HEADERS_(s, ["TIMESTAMP", "FUNCTION", "CODE", "MESSAGE"]); s.appendRow([new Date(), f || "", c || "", m || ""]); DC_SEND_TG_("🚨 ERR: " + f + "\n" + m); } catch (e) {} };

function P1_ENSURE_HEADERS_(s, h) {
  if (!s) throw new Error("Sheet missing");
  if (s.getLastRow() === 0) s.appendRow(h);
  let c = s.getRange(1, 1, 1, Math.max(s.getLastColumn(), 1)).getValues()[0].map(String),
    n = c.map(DC_NORM_);
  h.forEach(x => { if (n.indexOf(DC_NORM_(x)) === -1) { c.push(x);
      n.push(DC_NORM_(x));
      s.getRange(1, c.length).setValue(x); } });
  s.setFrozenRows(1);
  s.getRange(1, 1, 1, s.getLastColumn()).setBackground("#0b5394").setFontColor("#fff").setFontWeight("bold");
  return s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map(String);
}

function P1_VAL_(o, h) { const n = DC_NORM_(h); if (o[h] !== undefined) return o[h]; if (o[n] !== undefined) return o[n]; for (const k of Object.keys(o)) if (DC_NORM_(k) === n) return o[k]; return ""; }
function P1_ROW_(h, o) { return h.map(x => P1_VAL_(o, x)); }

function UPSERT_(s, kH, o, h) {
  const aH = P1_ENSURE_HEADERS_(s, h),
    nH = aH.map(DC_NORM_),
    kI = nH.indexOf(DC_NORM_(kH)),
    kV = String(P1_VAL_(o, kH) || "").trim();
  if (kI === -1 || !kV) { s.appendRow(P1_ROW_(aH, o)); return s.getLastRow(); }
  const lr = s.getLastRow();
  if (lr >= 2) {
    const v = s.getRange(2, kI + 1, lr - 1, 1).getValues();
    for (let i = 0; i < v.length; i++) {
      if (String(v[i][0] || "").trim() === kV) {
        const e = s.getRange(i + 2, 1, 1, aH.length).getValues()[0],
          r = P1_ROW_(aH, o),
          t = nH.indexOf("TIMESTAMP");
        if (t > -1 && e[t]) r[t] = e[t];
        s.getRange(i + 2, 1, 1, aH.length).setValues([r]);
        return i + 2;
      }
    }
  }
  s.appendRow(P1_ROW_(aH, o));
  return s.getLastRow();
}

// ─── EMPLOYEE CACHE — SINGLE SOURCE OF TRUTH ───────────────────
let DC_EMP_CACHE = null;

function DC_BUILD_EMP_MAP_() {
  if (DC_EMP_CACHE) return DC_EMP_CACHE;
  const s = SHEET_("ALL_EMPLOYEES");
  if (!s || s.getLastRow() < 2) return {};
  const d = s.getDataRange().getValues(),
    h = d[0].map(DC_NORM_),
    out = {};
  for (let i = 1; i < d.length; i++) {
    const r = d[i],
      o = {};
    h.forEach((k, idx) => o[k] = r[idx]);
    const code = DC_CLEAN(o.EMP_CODE).toUpperCase();
    if (!code) continue;
    o.EMP_CODE = code;
    o.NAME = o.EMPLOYEES_NAME || o.NAME || code;
    o.MOBILE = DC_CLEAN_MOBILE(o.MOBILE || o.PHONE || "");
    o.WHATSAPP = DC_CLEAN_MOBILE(o.WHATSAPP || o.WHATSAPP_NUMBER || o.MOBILE || "");
    o.EMAIL = DC_CLEAN_EMAIL(o.EMPLOYEE_EMAIL_ID || o.EMPLOYEE_EMAIL || o.EMAIL || "");
    o.TG_CHAT_ID = String(o.TG_CHAT_ID || "").trim();
    o.WHATSAPP_VERIFIED = String(o.WHATSAPP_VERIFIED || "NO").toUpperCase();
    o.MANAGER_EMAIL = DC_CLEAN_EMAIL(o.MANAGER_EMAIL_ID || o.MANAGER_EMAIL || "");
    o.PERSONAL_FILE_ID = String(o.PERSONAL_FILE_ID || o.FILE_ID || "").trim();
    o.DASHBOARD_ACCESS = String(o.DASHBOARD_ACCESS || o.ROLE || "STAFF").toUpperCase();
    o.DEPARTMENT = String(o.DEPARTMENT || "").trim();
    o.ROLE = String(o.ROLE || "").trim();
    o.PIN = String(o.PIN || "").trim();
    // Auto-generate avatar
    o.P1_AVATAR_URL = o.P1_AVATAR_URL || `https://ui-avatars.com/api/?name=${encodeURIComponent(o.NAME)}&background=d4af37&color=0a2540&size=160`;
    if (out[code]) { const ex = out[code];
      Object.keys(o).forEach(k => { if ((ex[k] === "" || ex[k] === undefined) && o[k] !== "" && o[k] !== undefined) ex[k] = o[k]; }); } else out[code] = o;
  }
  // Build all URL links
  const base = P1_EXEC_URL_();
  Object.keys(out).forEach(code => {
    const e = encodeURIComponent(code),
      emp = out[code];
    const f = (u, l) => `=HYPERLINK("${String(u).replace(/"/g, '""')}","${l}")`;
    emp.P1_WEBSITE_URL = f(base + "?page=home&emp=" + e, "🌐 Website");
    emp.P1_SMART_FORM_URL = f(base + "?page=form&emp=" + e, "📝 Form");
    emp.P1_DIGITAL_CARD_URL = f(base + "?page=card&emp=" + e, "💼 Card");
    emp.P1_DASHBOARD_URL = f(base + "?page=dashboard&emp=" + e, "📊 Dash");
    emp.P1_CALLING_URL = f(base + "?page=calling&emp=" + e, "📞 Calling");
    emp.P1_VOICE_URL = f(base + "?page=voice&emp=" + e, "🎙️ Voice");
    emp.P1_QR_TEXT = base + "?page=card&emp=" + e;
    if (emp.PERSONAL_FILE_ID) emp.P1_PERSONAL_FILE_URL = f(`https://docs.google.com/spreadsheets/d/${emp.PERSONAL_FILE_ID}/edit`, "📁 File");
    emp.P1_SYNC_STATUS = "CONNECTED";
    emp.P1_LAST_SYNC_AT = new Date();
  });
  DC_EMP_CACHE = out;
  // Write back to sheet
  SYNC_EMPLOYEE_LINKS_TO_SHEET_();
  return out;
}

function SYNC_EMPLOYEE_LINKS_TO_SHEET_() {
  const s = SHEET_("ALL_EMPLOYEES");
  if (!s) return;
  const d = s.getDataRange().getValues();
  if (!d.length) return;
  const h = d[0].map(DC_NORM_);
  const map = {
    "P1_WEBSITE_URL": "P1_WEBSITE_URL",
    "P1_SMART_FORM_URL": "P1_SMART_FORM_URL",
    "P1_DIGITAL_CARD_URL": "P1_DIGITAL_CARD_URL",
    "P1_DASHBOARD_URL": "P1_DASHBOARD_URL",
    "P1_CALLING_URL": "P1_CALLING_URL",
    "P1_VOICE_URL": "P1_VOICE_URL",
    "P1_AVATAR_URL": "P1_AVATAR_URL",
    "P1_PERSONAL_FILE_URL": "P1_PERSONAL_FILE_URL",
    "P1_QR_TEXT": "P1_QR_TEXT",
    "P1_SYNC_STATUS": "P1_SYNC_STATUS",
    "P1_LAST_SYNC_AT": "P1_LAST_SYNC_AT"
  };
  const idx = {};
  Object.keys(map).forEach(k => { idx[k] = h.indexOf(DC_NORM_(k)); });
  const cIdx = h.indexOf("EMP_CODE");
  if (cIdx === -1) return;
  for (let i = 1; i < d.length; i++) {
    const code = String(d[i][cIdx] || "").trim().toUpperCase();
    if (!code) continue;
    const emp = DC_EMP_CACHE ? DC_EMP_CACHE[code] : null;
    if (!emp) continue;
    Object.keys(map).forEach(k => {
      if (idx[k] > -1 && emp[k] !== undefined) {
        s.getRange(i + 1, idx[k] + 1).setValue(emp[k]);
      }
    });
  }
}

function FIND_EMP_(q) {
  const m = DC_BUILD_EMP_MAP_(),
    k = String(q || "").trim().toUpperCase();
  if (!k) return null;
  if (m[k]) return m[k];
  const c = k.toLowerCase();
  for (const key of Object.keys(m)) {
    const e = m[key];
    if (DC_CLEAN_EMAIL(e.EMAIL) === c || String(e.NAME || "").toLowerCase() === c || (k.replace(/\D/g, "") && DC_CLEAN_MOBILE(e.MOBILE).includes(k.replace(/\D/g, "")))) return e;
  }
  return null;
}

// ─── AUTO-SYNC EMPLOYEE ROW ON EDIT ────────────────────────────
function SYNC_EMPLOYEE_ROW_(s, row, code) {
  try {
    const emp = FIND_EMP_(code);
    if (!emp) return;
    const h = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map(DC_NORM_);
    const base = P1_EXEC_URL_(),
      e = encodeURIComponent(code);
    const f = (u, l) => `=HYPERLINK("${String(u).replace(/"/g, '""')}","${l}")`;
    const map = {
      "P1_WEBSITE_URL": f(base + "?page=home&emp=" + e, "🌐 Website"),
      "P1_SMART_FORM_URL": f(base + "?page=form&emp=" + e, "📝 Form"),
      "P1_DIGITAL_CARD_URL": f(base + "?page=card&emp=" + e, "💼 Card"),
      "P1_DASHBOARD_URL": f(base + "?page=dashboard&emp=" + e, "📊 Dash"),
      "P1_CALLING_URL": f(base + "?page=calling&emp=" + e, "📞 Calling"),
      "P1_VOICE_URL": f(base + "?page=voice&emp=" + e, "🎙️ Voice"),
      "P1_AVATAR_URL": emp.P1_AVATAR_URL || `https://ui-avatars.com/api/?name=${encodeURIComponent(emp.NAME||code)}&background=d4af37&color=0a2540&size=160`,
      "P1_PERSONAL_FILE_URL": emp.PERSONAL_FILE_ID ? f(`https://docs.google.com/spreadsheets/d/${emp.PERSONAL_FILE_ID}/edit`, "📁 File") : "",
      "P1_QR_TEXT": base + "?page=card&emp=" + e,
      "P1_SYNC_STATUS": "CONNECTED",
      "P1_LAST_SYNC_AT": new Date()
    };
    Object.keys(map).forEach(k => { const idx = h.indexOf(DC_NORM_(k)); if (idx > -1) s.getRange(row, idx + 1).setValue(map[k]); });
    DC_EMP_CACHE = null;
  } catch (e) { LOG_ERR_("SYNC_EMP_ROW", code, e.message); }
}

// ─── SOURCE ROUTING ─────────────────────────────────────────────
function GET_ROUTING_() {
  try {
    const s = SHEET_("SOURCE_NAME");
    if (!s || s.getLastRow() < 2) return {};
    const d = s.getDataRange().getValues(),
      h = d[0].map(DC_NORM_),
      iN = h.indexOf("SOURCE_NAME"),
      iF = h.indexOf("DATA_FLOW");
    if (iN === -1 || iF === -1) return {};
    const m = {};
    for (let r = 1; r < d.length; r++) { const n = String(d[r][iN] || "").trim().toUpperCase(); if (n) m[n] = String(d[r][iF] || "SALES").trim().toUpperCase(); }
    return m;
  } catch (e) { return {}; }
}

// ─── PRODUCTS & TAT ─────────────────────────────────────────────
function GET_PRODUCTS_() {
  try {
    const s = SHEET_("Loan_Bank_Map");
    if (!s || s.getLastRow() < 2) return [{ code: "PL", name: "Personal Loan", icon: "💳", tat: 3, roi: 10.5, banks: [] }, { code: "BL", name: "Business Loan", icon: "🏢", tat: 7, roi: 16, banks: [] }, { code: "HL", name: "Home Loan", icon: "🏠", tat: 15, roi: 8.5, banks: [] }];
    const d = s.getDataRange().getValues(),
      h = d[0].map(DC_NORM_),
      iT = h.indexOf("LOAN_TYPE"),
      iB = h.indexOf("BANK"),
      iS = h.indexOf("STATUS"),
      iR = h.indexOf("ROI_START") > -1 ? h.indexOf("ROI_START") : h.indexOf("ROI"),
      iTa = h.indexOf("TAT_DAYS");
    if (iT === -1) return [];
    const out = {};
    for (let r = 1; r < d.length; r++) {
      const t = String(d[r][iT] || "").trim();
      if (!t) continue;
      const st = iS > -1 ? String(d[r][iS] || "ACTIVE").toUpperCase() : "ACTIVE";
      if (!["ACTIVE", "YES", "LIVE", ""].includes(st)) continue;
      const k = t.toUpperCase(),
        b = iB > -1 ? String(d[r][iB] || "").trim() : "",
        roi = iR > -1 && d[r][iR] !== "" ? Number(d[r][iR]) || 10.5 : 10.5,
        tat = iTa > -1 && d[r][iTa] !== "" ? Number(d[r][iTa]) || 7 : 7;
      if (!out[k]) out[k] = { code: k.replace(/[^A-Z0-9]/g, "").slice(0, 4), name: t, icon: GET_ICON_(t), tat, roi, banks: [] };
      if (b) out[k].banks.push(b);
      out[k].roi = Math.min(out[k].roi, roi);
      out[k].tat = Math.min(out[k].tat, tat);
    }
    return Object.keys(out).map(k => { out[k].banks = [...new Set(out[k].banks)]; return out[k]; });
  } catch (e) { return []; }
}

function GET_ICON_(t) { const s = String(t || "").toLowerCase(); if (s.includes("personal")) return "💳"; if (s.includes("business")) return "🏢"; if (s.includes("home")) return "🏠"; if (s.includes("property") || s.includes("lap")) return "🏦"; if (s.includes("auto")) return "🚗"; return "💼"; }

function GET_TAT_(t) { const k = String(t || "").trim().toUpperCase(),
    p = GET_PRODUCTS_().find(x => String(x.name).toUpperCase() === k || String(x.code).toUpperCase() === k); return p ? p.tat : 7; }

function COMPUTE_TAT_(l) { const d = GET_TAT_(l.LOAN_TYPE); return { TAT_DAYS: d, TAT_DEADLINE: new Date(Date.now() + d * 86400000), TAT_STATUS: "ACTIVE" }; }

function UPDATE_TAT_(s, row, h, st) {
  const nH = h.map(DC_NORM_),
    tI = nH.indexOf("TAT_STATUS"),
    dI = nH.indexOf("TAT_DEADLINE"),
    cs = String(st || "").toUpperCase();
  let ts = "ACTIVE";
  if (["REJECT", "REJECTED", "NOT INTERESTED", "WRONG NUMBER"].includes(cs)) ts = "STOPPED";
  else if (["DISBURSE", "DISBURSED"].includes(cs)) ts = "COMPLETED";
  else if (dI > -1) { const d = new Date(s.getRange(row, dI + 1).getValue() || 0); if (!isNaN(d) && d < new Date()) ts = "BREACHED"; }
  if (tI > -1) s.getRange(row, tI + 1).setValue(ts);
  const r = s.getRange(row, 1, 1, h.length);
  if (ts === "STOPPED") r.setBackground("#f4cccc");
  else if (ts === "COMPLETED") r.setBackground("#d9ead3");
  else if (ts === "BREACHED") r.setBackground("#ff9999");
  else if (["APPROVED", "SANCTION"].includes(cs)) r.setBackground("#fff2cc");
  else r.setBackground("#d9eaf7");
}

// ─── MASTER DATA ACCESS ─────────────────────────────────────────
function GET_MASTER_ALL_() {
  const s = SHEET_("MASTER_DATA");
  if (!s || s.getLastRow() < 2) return [];
  const d = s.getDataRange().getValues(),
    h = d[0].map(DC_NORM_);
  return d.slice(1).map(r => { const o = {}; h.forEach((k, i) => { o[k] = r[i];
      o[k.toLowerCase()] = r[i]; }); return o; });
}

function GET_MY_CASES_(code) {
  const e = FIND_EMP_(code);
  if (!e || !e.PERSONAL_FILE_ID) return [];
  try {
    const ss = P1_OPEN_SS_(e.PERSONAL_FILE_ID),
      s = ss.getSheetByName("MY_CASES");
    if (!s || s.getLastRow() < 2) return [];
    const d = s.getDataRange().getValues(),
      h = d[0].map(DC_NORM_);
    return d.slice(1).map(r => { const o = {}; h.forEach((k, i) => { o[k] = r[i];
        o[k.toLowerCase()] = r[i]; }); return o; }).filter(r => r.LEAD_ID || r.lead_id);
  } catch (e) { return []; }
}

function GET_TEAM_DATA_(code) {
  const e = FIND_EMP_(code);
  if (!e) return [];
  const dept = String(e.DEPARTMENT || "").trim();
  if (!dept) return [];
  const all = GET_MASTER_ALL_(),
    m = DC_BUILD_EMP_MAP_();
  const teamCodes = Object.keys(m).filter(c => String(m[c].DEPARTMENT || "") === dept);
  return all.filter(r => teamCodes.includes(String(r.EMP_CODE || r.emp_code || "").toUpperCase()));
}

// ─── ATTENDANCE ─────────────────────────────────────────────────
function RECORD_TASK_(code) {
  try {
    if (!code) return;
    const e = FIND_EMP_(code);
    if (!e) return;
    const role = String(e.DASHBOARD_ACCESS || e.ROLE || "").toUpperCase();
    if (!role.includes("SALES MEMBER") && role !== "STAFF") return;
    const today = new Date(),
      key = Utilities.formatDate(today, "Asia/Kolkata", "yyyy-MM-dd"),
      s = GET_OR_CREATE_("ATTENDANCE_LOG");
    P1_ENSURE_HEADERS_(s, ["DATE", "EMP_CODE", "SALES_NAME", "TASK_COUNT", "ATTENDANCE_STATUS", "LAST_UPDATED"]);
    const d = s.getDataRange().getValues(),
      h = d[0].map(DC_NORM_),
      iD = h.indexOf("DATE"),
      iC = h.indexOf("EMP_CODE"),
      iCt = h.indexOf("TASK_COUNT"),
      iSt = h.indexOf("ATTENDANCE_STATUS"),
      iU = h.indexOf("LAST_UPDATED");
    for (let i = 1; i < d.length; i++) {
      if (Utilities.formatDate(new Date(d[i][iD] || 0), "Asia/Kolkata", "yyyy-MM-dd") === key && String(d[i][iC] || "").trim().toUpperCase() === code) {
        const nc = Number(d[i][iCt] || 0) + 1;
        s.getRange(i + 1, iCt + 1).setValue(nc);
        s.getRange(i + 1, iSt + 1).setValue(nc >= 5 ? "PRESENT" : nc >= 3 ? "HALF_DAY" : "ABSENT");
        s.getRange(i + 1, iU + 1).setValue(new Date());
        return;
      }
    }
    s.appendRow([today, code, e.NAME || "", 1, "ABSENT", new Date()]);
  } catch (e) { LOG_ERR_("RECORD_TASK", code, e.message); }
}

function MANAGER_CHECKIN_(code, half) {
  try {
    if (!code) return { success: false, errorMessage: "EMP_CODE missing" };
    const e = FIND_EMP_(code);
    if (!e) return { success: false, errorMessage: "Not found" };
    const role = String(e.DASHBOARD_ACCESS || e.ROLE || "").toUpperCase();
    if (!role.includes("MANAGER")) return { success: false, errorMessage: "Not a manager" };
    const now = new Date(),
      hour = now.getHours(),
      min = now.getMinutes(),
      key = Utilities.formatDate(now, "Asia/Kolkata", "yyyy-MM-dd");
    let valid = false;
    if (half === 1 && hour === 10 && min <= 15) valid = true;
    if (half === 2 && hour === 14 && min <= 15) valid = true;
    if (!valid) return { success: false, errorMessage: "Window: 10:00-10:15 or 14:00-14:15" };
    const s = GET_OR_CREATE_("ATTENDANCE_LOG");
    P1_ENSURE_HEADERS_(s, ["DATE", "EMP_CODE", "SALES_NAME", "TASK_COUNT", "ATTENDANCE_STATUS", "HALF1_CHECKIN", "HALF2_CHECKIN", "LAST_UPDATED"]);
    const d = s.getDataRange().getValues(),
      h = d[0].map(DC_NORM_),
      iD = h.indexOf("DATE"),
      iC = h.indexOf("EMP_CODE"),
      iH1 = h.indexOf("HALF1_CHECKIN"),
      iH2 = h.indexOf("HALF2_CHECKIN"),
      iSt = h.indexOf("ATTENDANCE_STATUS"),
      iU = h.indexOf("LAST_UPDATED");
    for (let i = 1; i < d.length; i++) {
      if (Utilities.formatDate(new Date(d[i][iD] || 0), "Asia/Kolkata", "yyyy-MM-dd") === key && String(d[i][iC] || "").trim().toUpperCase() === code) {
        if (half === 1) s.getRange(i + 1, iH1 + 1).setValue(now);
        else s.getRange(i + 1, iH2 + 1).setValue(now);
        const h1 = iH1 > -1 ? s.getRange(i + 1, iH1 + 1).getValue() : "";
        const h2 = iH2 > -1 ? s.getRange(i + 1, iH2 + 1).getValue() : "";
        const att = h1 && h2 ? "PRESENT" : (h1 || h2 ? "HALF_DAY" : "ABSENT");
        s.getRange(i + 1, iSt + 1).setValue(att);
        s.getRange(i + 1, iU + 1).setValue(now);
        return { success: true, attendanceStatus: att };
      }
    }
    const row = [now, code, e.NAME || "", 0, "HALF_DAY", "", "", now];
    if (half === 1) row[5] = now;
    else row[6] = now;
    s.appendRow(row);
    return { success: true, attendanceStatus: "HALF_DAY" };
  } catch (e) { LOG_ERR_("MANAGER_CHECKIN", code, e.message); return { success: false, errorMessage: e.message }; }
}

// ─── NOTIFICATIONS ──────────────────────────────────────────────
function DC_SEND_TG_(t) {
  try {
    const token = DC_CFG.PROPS.getProperty("TG_TOKEN");
    if (!token) return false;
    const ids = ["FOUNDER_TG_CHAT_ID", "MD_TG_CHAT_ID", "ACCOUNTS_TG_CHAT_ID", "HR_TG_CHAT_ID"].map(k => String(DC_CFG.PROPS.getProperty(k) || "").trim()).filter(Boolean);
    let sent = 0;
    ids.forEach(id => { try { UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/sendMessage", { method: "post", contentType: "application/json", muteHttpExceptions: true, payload: JSON.stringify({ chat_id: id, text: String(t || "").slice(0, 4096) }) });
        sent++; } catch (e) {} });
    return sent > 0;
  } catch (e) { return false; }
}

function DC_SEND_WA_(to, t) {
  try {
    const token = DC_CFG.PROPS.getProperty("META_WA_TOKEN"),
      phone = DC_CFG.PROPS.getProperty("META_WA_PHONE_ID");
    if (!token || !phone || !to) return false;
    UrlFetchApp.fetch("https://graph.facebook.com/v20.0/" + phone + "/messages", { method: "post", headers: { Authorization: "Bearer " + token }, contentType: "application/json", muteHttpExceptions: true, payload: JSON.stringify({ messaging_product: "whatsapp", to: String(to).replace(/\D/g, ""), type: "text", text: { body: String(t || "").slice(0, 4096) } }) });
    return true;
  } catch (e) { return false; }
}

function SEND_SMART_MAIL_(l) {
  try {
    l = l || {};
    const ai = l.AI_ADVICE || "Bulbhul advice unavailable.",
      e = l.EMP_CODE ? FIND_EMP_(l.EMP_CODE) : null,
      email = e ? e.EMAIL : null,
      isAssigned = !!e;
    const sub = (isAssigned ? "[NEW LEAD]" : "[UNASSIGNED LEAD]") + " " + (l.LEAD_ID || "") + " - " + (l.CLIENT_NAME || "") + " (" + (l.LOAN_TYPE || "Loan") + ")";
    const body = "Hello " + (e ? e.NAME : "Team") + ",\n\n" + (isAssigned ? "New lead assigned." : "New unassigned lead captured.") + "\n\nLead ID:" + (l.LEAD_ID || "N/A") + "\nClient:" + (l.CLIENT_NAME || "N/A") + " | Mobile:" + (l.CLIENT_MOBILE || "N/A") + "\nLoan:" + (l.LOAN_TYPE || "N/A") + " | ₹" + (l.REQUIRED_LOAN_AMOUNT || "N/A") + "\nBank:" + (l.PREFERRED_BANK || "N/A") + "\nTAT:" + (l.TAT_DAYS || "N/A") + "d\nRemarks:" + (l.REMARKS || "No remarks") + "\n\n--- BULBHUL AI ---\n" + ai + "\n\n- Divyanshi Capital CRM";
    const tg = (isAssigned ? "🆕 *New Lead*" : "⚠️ *Unassigned Lead*") + "\n*ID:*" + (l.LEAD_ID || "") + "\n*Client:*" + (l.CLIENT_NAME || "") + "\n*Loan:*" + (l.LOAN_TYPE || "") + " | ₹" + (l.REQUIRED_LOAN_AMOUNT || "") + "\n*Owner:*" + (e ? e.NAME + " (" + l.EMP_CODE + ")" : l.EMP_CODE || "Unassigned") + "\n*TAT:*" + (l.TAT_DAYS || "") + "d\n\n*Bulbhul:*\n" + ai;
    DC_SEND_TG_(tg);
    if (MailApp.getRemainingDailyQuota() > 0) {
      const to = email || DC_CFG.COMPANY.MD_EMAIL;
      const mgr = e && e.MANAGER_EMAIL ? e.MANAGER_EMAIL : DC_CFG.COMPANY.HR_EMAIL;
      const cc = [mgr, DC_CFG.COMPANY.FOUNDER_EMAIL, DC_CFG.COMPANY.MD_EMAIL].filter(x => x && x.toLowerCase() !== to.toLowerCase()).join(",");
      try { GmailApp.sendEmail(to, sub, body, { cc, name: DC_CFG.COMPANY.NAME }); } catch (mailErr) { LOG_ERR_("SEND_MAIL", l.LEAD_ID || "", mailErr.message); }
    }
    if (e && e.WHATSAPP && e.WHATSAPP_VERIFIED === "YES") DC_SEND_WA_(e.WHATSAPP, sub + "\n\n" + ai);
  } catch (e) { LOG_ERR_("SEND_SMART_MAIL", l.LEAD_ID || "", e.message); }
}

// ─── GMAIL MIS PIPELINE ─────────────────────────────────────────
function PARSE_MAIL_(subject, body) {
  const p = {};
  String(body || "").split(/\r?\n/).forEach(l => { const m = l.match(/^([A-Za-z0-9_ ]+?)\s*[:\-=]\s*(.+)$/); if (m) p[DC_NORM_(m[1].trim())] = m[2].trim(); });
  try { const j = body.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/); if (j) { const o = JSON.parse(j[0]);
      Object.keys(o).forEach(k => p[DC_NORM_(k)] = o[k]); } } catch (_) {}
  let name = p["CLIENT_NAME"] || p["FULL_NAME"] || p["NAME"] || "",
    mobile = DC_CLEAN_MOBILE(p["CLIENT_MOBILE"] || p["MOBILE"] || p["PHONE"] || ""),
    bank = p["PREFERRED_BANK"] || p["BANK"] || "",
    loan = p["LOAN_TYPE"] || p["PRODUCT"] || "",
    amt = p["REQUIRED_LOAN_AMOUNT"] || p["AMOUNT"] || "",
    status = p["CASE_STATUS"] || p["STATUS"] || "",
    remarks = p["REMARKS"] || p["REMARK"] || "",
    lead = p["LEAD_ID"] || p["CASE_ID"] || "",
    emp = (p["EMP_CODE"] || p["EMPLOYEE_CODE"] || "").toUpperCase();
  if (!name && subject) {
    const s = String(subject).replace(/^Re:\s*/i, "").replace(/^Fwd:\s*/i, "").trim(),
      t = s.split(/={2,}|-{2,}|\|{2,}|\/{2,}/).map(x => x.trim()).filter(Boolean);
    if (t.length) {
      let ni = 0;
      const pf = ["FILE FOR LOGIN", "FILE FOR", "NEW LOGIN", "LOGIN", "CASE FOR", "LEAD FOR"];
      if (t.length > 1 && pf.some(x => t[0].toUpperCase().includes(x))) ni = 1;
      name = t[ni];
      t.forEach((x, idx) => {
        if (idx === ni) return;
        const u = x.toUpperCase();
        if (/[A-Z]+[0-9]+|[0-9]+[A-Z]+/.test(u) && u.length >= 6) lead = x;
        if (u.includes("LOGIN") || u.includes("DONE")) status = "LOGIN_DONE";
        else if (u.includes("REJECT")) status = "REJECTED";
        else if (u.includes("DISBURSE")) status = "DISBURSED";
        else if (u.includes("APPROVED")) status = "APPROVED";
        const banks = ["ICICI", "HDFC", "AXIS", "SBI", "BOB", "BAJAJ", "TATA", "CHOLA", "PIRAMAL", "IDFC"];
        banks.forEach(b => { if (u.includes(b)) bank = b; });
        if (u.includes("PL") || u.includes("PERSONAL")) loan = "Personal Loan";
        else if (u.includes("BL") || u.includes("BUSINESS")) loan = "Business Loan";
        else if (u.includes("HL") || u.includes("HOME")) loan = "Home Loan";
        else if (u.includes("LAP") || u.includes("PROPERTY")) loan = "Loan Against Property";
        const am = u.match(/(?:REQ|AMT)?\s*([0-9.,]+)\s*(LAC|LAKH|CR|L|K)?/i);
        if (am) { let v = parseFloat(am[1].replace(/,/g, ""));
          const un = String(am[2] || "").toUpperCase(); if (un.startsWith("LA") || un === "L") v *= 100000;
          else if (un.startsWith("CR")) v *= 10000000;
          else if (un === "K") v *= 1000; if (v > 0) amt = String(v); }
      });
    }
  }
  return { LEAD_ID: lead, CLIENT_NAME: name, CLIENT_MOBILE: mobile, PREFERRED_BANK: bank, LOAN_TYPE: loan, REQUIRED_LOAN_AMOUNT: amt, CASE_STATUS: status || "OPEN", REMARKS: remarks, SOURCE_NAME: "MIS-Incoming", EMP_CODE: emp };
}

function CHECK_DEDUP_(lead, mobile, bank, name) {
  try {
    const s = SHEET_("COMMON_ENTRY");
    if (!s || s.getLastRow() < 2) return { found: false };
    const d = s.getDataRange().getValues(),
      h = d[0].map(DC_NORM_),
      li = h.indexOf("LEAD_ID"),
      mo = h.indexOf("CLIENT_MOBILE"),
      nm = h.indexOf("CLIENT_NAME"),
      rm = h.indexOf("REMARKS");
    const cm = DC_CLEAN_MOBILE(mobile || ""),
      cl = String(lead || "").trim().toUpperCase(),
      cn = String(name || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    for (let i = 1; i < d.length; i++) {
      const rl = li > -1 ? String(d[i][li] || "").trim().toUpperCase() : "",
        rm2 = mo > -1 ? DC_CLEAN_MOBILE(d[i][mo]) : "",
        rn = nm > -1 ? String(d[i][nm] || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
      if ((cm && rm2 === cm) || (cl && rl === cl) || (cn && rn && (rn.includes(cn) || cn.includes(rn)))) return { found: true, row: i + 1 };
    }
    return { found: false };
  } catch (e) { return { found: false }; }
}

function PROCESS_MIS_MAIL_(mail) {
  try {
    const sub = String(mail.subject || "").toUpperCase(),
      body = String(mail.body || "").toUpperCase();
    const exclude = ["SECURITY ALERT", "GOOGLE ACCOUNT", "SIGN-IN", "VERIFICATION", "OTP", "PASSWORD RESET", "ACCESS GRANTED"];
    if (exclude.some(x => sub.includes(x) || body.includes(x))) { const rs = GET_OR_CREATE_("RAW_INBOX"),
        rh = P1_ENSURE_HEADERS_(rs, ["RECEIVED_AT", "GMAIL_MSG_ID", "FROM_EMAIL", "SUBJECT", "PROCESS_STATUS", "DEDUP_ACTION", "PROCESSED_AT"]);
      rs.appendRow(P1_ROW_(rh, { RECEIVED_AT: mail.receivedAt, GMAIL_MSG_ID: mail.msgId, FROM_EMAIL: mail.from, SUBJECT: mail.subject, PROCESS_STATUS: "SKIPPED_SYSTEM_ALERT", DEDUP_ACTION: "NONE", PROCESSED_AT: new Date() })); return; }
    const p = PARSE_MAIL_(mail.subject, mail.body),
      cn = String(p.CLIENT_NAME || "").toUpperCase();
    const sys = ["GITHUB", "SECURITY", "GOOGLE", "OAUTH", "SIGN-IN", "VERIFICATION", "OTP", "NOREPLY", "MAILER-DAEMON"];
    if (!cn || sys.some(x => cn.includes(x)) || (!p.CLIENT_MOBILE && !p.PREFERRED_BANK && !p.REQUIRED_LOAN_AMOUNT && !(p.LEAD_ID && !p.LEAD_ID.startsWith("L0000_")))) { const rs = GET_OR_CREATE_("RAW_INBOX"),
        rh = P1_ENSURE_HEADERS_(rs, ["RECEIVED_AT", "GMAIL_MSG_ID", "FROM_EMAIL", "SUBJECT", "PROCESS_STATUS", "DEDUP_ACTION", "PROCESSED_AT"]);
      rs.appendRow(P1_ROW_(rh, { RECEIVED_AT: mail.receivedAt, GMAIL_MSG_ID: mail.msgId, FROM_EMAIL: mail.from, SUBJECT: mail.subject, PROCESS_STATUS: "SKIPPED_INVALID", DEDUP_ACTION: "NONE", PROCESSED_AT: new Date() })); return; }
    const rs = GET_OR_CREATE_("RAW_INBOX"),
      rh = P1_ENSURE_HEADERS_(rs, ["RECEIVED_AT", "GMAIL_MSG_ID", "FROM_EMAIL", "SUBJECT", "LEAD_ID", "CLIENT_NAME", "CLIENT_MOBILE", "PREFERRED_BANK", "LOAN_TYPE", "REQUIRED_LOAN_AMOUNT", "CASE_STATUS", "REMARKS", "SOURCE_NAME", "EMP_CODE", "PROCESS_STATUS", "DEDUP_ACTION", "PROCESSED_AT"]);
    rs.appendRow(P1_ROW_(rh, { RECEIVED_AT: mail.receivedAt, GMAIL_MSG_ID: mail.msgId, FROM_EMAIL: mail.from, SUBJECT: mail.subject, LEAD_ID: p.LEAD_ID, CLIENT_NAME: p.CLIENT_NAME, CLIENT_MOBILE: p.CLIENT_MOBILE, PREFERRED_BANK: p.PREFERRED_BANK, LOAN_TYPE: p.LOAN_TYPE, REQUIRED_LOAN_AMOUNT: p.REQUIRED_LOAN_AMOUNT, CASE_STATUS: p.CASE_STATUS, REMARKS: p.REMARKS, SOURCE_NAME: "MIS-Incoming", EMP_CODE: p.EMP_CODE, PROCESS_STATUS: "PENDING", DEDUP_ACTION: "PENDING", PROCESSED_AT: new Date() }));
    const rowNum = rs.getLastRow(),
      psIdx = rh.indexOf("PROCESS_STATUS"),
      daIdx = rh.indexOf("DEDUP_ACTION");
    const dedup = CHECK_DEDUP_(p.LEAD_ID, p.CLIENT_MOBILE, p.PREFERRED_BANK, p.CLIENT_NAME);
    let ps = "",
      da = "";
    if (dedup.found) {
      const cs = SHEET_("COMMON_ENTRY"),
        ch = cs.getRange(1, 1, 1, cs.getLastColumn()).getValues()[0].map(DC_NORM_);
      const li = ch.indexOf("LEAD_ID"),
        mo = ch.indexOf("CLIENT_MOBILE"),
        nm = ch.indexOf("CLIENT_NAME"),
        bk = ch.indexOf("PREFERRED_BANK"),
        ln = ch.indexOf("LOAN_TYPE"),
        am = ch.indexOf("REQUIRED_LOAN_AMOUNT"),
        rm = ch.indexOf("REMARKS"),
        st = ch.indexOf("CASE_CATEGORY");
      if (st > -1 && p.CASE_STATUS) cs.getRange(dedup.row, st + 1).setValue(p.CASE_STATUS);
      if (li > -1 && p.LEAD_ID) { const c = String(cs.getRange(dedup.row, li + 1).getValue()).trim(); if (!c || c.startsWith("L0000_")) cs.getRange(dedup.row, li + 1).setValue(p.LEAD_ID); }
      if (mo > -1 && p.CLIENT_MOBILE) { const c = String(cs.getRange(dedup.row, mo + 1).getValue()).replace(/\D/g, ""); if (!c || c === "0000000000") cs.getRange(dedup.row, mo + 1).setValue(p.CLIENT_MOBILE); }
      if (nm > -1 && p.CLIENT_NAME) { const c = String(cs.getRange(dedup.row, nm + 1).getValue()).trim(); if (!c) cs.getRange(dedup.row, nm + 1).setValue(p.CLIENT_NAME); }
      if (bk > -1 && p.PREFERRED_BANK) { const c = String(cs.getRange(dedup.row, bk + 1).getValue()).trim(); if (!c) cs.getRange(dedup.row, bk + 1).setValue(p.PREFERRED_BANK); }
      if (ln > -1 && p.LOAN_TYPE) { const c = String(cs.getRange(dedup.row, ln + 1).getValue()).trim(); if (!c) cs.getRange(dedup.row, ln + 1).setValue(p.LOAN_TYPE); }
      if (am > -1 && p.REQUIRED_LOAN_AMOUNT) { const c = String(cs.getRange(dedup.row, am + 1).getValue()).trim(); if (!c || c === "0") cs.getRange(dedup.row, am + 1).setValue(p.REQUIRED_LOAN_AMOUNT); }
      if (rm > -1) { const o = String(cs.getRange(dedup.row, rm + 1).getValue() || "").trim();
        cs.getRange(dedup.row, rm + 1).setValue(o ? o + " | [MIS: " + mail.subject + "]" : "[MIS: " + mail.subject + "]"); }
      // Update MASTER_DATA
      const ms = SHEET_("MASTER_DATA");
      if (ms && ms.getLastRow() >= 2) {
        const mh = ms.getRange(1, 1, 1, ms.getLastColumn()).getValues()[0].map(DC_NORM_),
          ml = mh.indexOf("LEAD_ID"),
          mm = mh.indexOf("CLIENT_MOBILE"),
          mn = mh.indexOf("CLIENT_NAME"),
          mb = mh.indexOf("PREFERRED_BANK"),
          mt = mh.indexOf("LOAN_TYPE"),
          ma = mh.indexOf("REQUIRED_LOAN_AMOUNT"),
          mc = mh.indexOf("CASE_CATEGORY"),
          mr = mh.indexOf("REMARKS");
        let match = -1;
        const vals = ms.getDataRange().getValues(),
          cn = String(p.CLIENT_NAME || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
        for (let r = 1; r < vals.length; r++) {
          const rl = ml > -1 ? String(vals[r][ml] || "").trim().toUpperCase() : "",
            rm2 = mm > -1 ? DC_CLEAN_MOBILE(vals[r][mm]) : "",
            rn = mn > -1 ? String(vals[r][mn] || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
          if ((p.LEAD_ID && rl === p.LEAD_ID.toUpperCase()) || (p.CLIENT_MOBILE && rm2 === p.CLIENT_MOBILE) || (cn && rn && (rn.includes(cn) || cn.includes(rn)))) { match = r + 1; break; }
        }
        if (match > -1) {
          if (mc > -1 && p.CASE_STATUS) ms.getRange(match, mc + 1).setValue(p.CASE_STATUS);
          if (ml > -1 && p.LEAD_ID) { const c = String(ms.getRange(match, ml + 1).getValue()).trim(); if (!c || c.startsWith("L0000_")) ms.getRange(match, ml + 1).setValue(p.LEAD_ID); }
          if (mm > -1 && p.CLIENT_MOBILE) { const c = String(ms.getRange(match, mm + 1).getValue()).replace(/\D/g, ""); if (!c || c === "0000000000") ms.getRange(match, mm + 1).setValue(p.CLIENT_MOBILE); }
          if (mn > -1 && p.CLIENT_NAME) { const c = String(ms.getRange(match, mn + 1).getValue()).trim(); if (!c) ms.getRange(match, mn + 1).setValue(p.CLIENT_NAME); }
          if (mb > -1 && p.PREFERRED_BANK) { const c = String(ms.getRange(match, mb + 1).getValue()).trim(); if (!c) ms.getRange(match, mb + 1).setValue(p.PREFERRED_BANK); }
          if (mt > -1 && p.LOAN_TYPE) { const c = String(ms.getRange(match, mt + 1).getValue()).trim(); if (!c) ms.getRange(match, mt + 1).setValue(p.LOAN_TYPE); }
          if (ma > -1 && p.REQUIRED_LOAN_AMOUNT) { const c = String(ms.getRange(match, ma + 1).getValue()).trim(); if (!c || c === "0") ms.getRange(match, ma + 1).setValue(p.REQUIRED_LOAN_AMOUNT); }
          if (mr > -1) { const o = String(ms.getRange(match, mr + 1).getValue() || "").trim();
            ms.getRange(match, mr + 1).setValue(o ? o + " | [MIS: " + mail.subject + "]" : "[MIS: " + mail.subject + "]"); }
          UPDATE_TAT_(ms, match, mh, p.CASE_STATUS || "OPEN");
          // Sync to Personal File
          const empIdx = mh.indexOf("EMP_CODE");
          if (empIdx > -1) {
            const empCode = String(ms.getRange(match, empIdx + 1).getValue()).trim().toUpperCase();
            if (empCode) {
              const emp = FIND_EMP_(empCode);
              if (emp && emp.PERSONAL_FILE_ID) {
                try {
                  const pss = P1_OPEN_SS_(emp.PERSONAL_FILE_ID);
                  const mySh = pss.getSheetByName("MY_CASES");
                  if (mySh && mySh.getLastRow() >= 2) {
                    const mcH = mySh.getRange(1, 1, 1, mySh.getLastColumn()).getValues()[0].map(DC_NORM_);
                    const mcL = mcH.indexOf("LEAD_ID"),
                      mcC = mcH.indexOf("CASE_CATEGORY"),
                      mcR = mcH.indexOf("REMARKS");
                    const mcV = mySh.getDataRange().getValues();
                    for (let mr2 = 1; mr2 < mcV.length; mr2++) {
                      if (mcL > -1 && String(mcV[mr2][mcL]).trim().toUpperCase() === String(vals[match - 1][ml]).trim().toUpperCase()) {
                        if (mcC > -1 && p.CASE_STATUS) mySh.getRange(mr2 + 1, mcC + 1).setValue(p.CASE_STATUS);
                        if (mcR > -1) { const o = String(mySh.getRange(mr2 + 1, mcR + 1).getValue() || "").trim();
                          mySh.getRange(mr2 + 1, mcR + 1).setValue(o ? o + " | [MIS: " + mail.subject + "]" : "[MIS: " + mail.subject + "]"); }
                        UPDATE_TAT_(mySh, mr2 + 1, mcH.map(h => String(h)), p.CASE_STATUS || "OPEN");
                        break;
                      }
                    }
                  }
                } catch (pe) { LOG_ERR_("MIS_PERSONAL_FILE", emp.PERSONAL_FILE_ID, pe.message); }
              }
            }
          }
        }
      }
      ps = "DEDUP_UPDATED";
      da = "MATCH_ROW_" + dedup.row;
    } else {
      const res = DC_PROCESS_LEAD_({ EMP_CODE: p.EMP_CODE || "", CLIENT_NAME: p.CLIENT_NAME, CLIENT_MOBILE: p.CLIENT_MOBILE, LOAN_TYPE: p.LOAN_TYPE, REQUIRED_LOAN_AMOUNT: p.REQUIRED_LOAN_AMOUNT, PREFERRED_BANK: p.PREFERRED_BANK, CASE_STATUS: p.CASE_STATUS || "OPEN", REMARKS: p.REMARKS + " | [MIS: " + mail.subject + "]", SOURCE_TYPE: "EMAIL_MIS", SOURCE_NAME: "MIS-Incoming", LEAD_ID: p.LEAD_ID || "" });
      ps = res.success ? "PROCESSED_" + res.leadId : "FAILED";
      da = "NEW_LEAD";
    }
    if (psIdx > -1) rs.getRange(rowNum, psIdx + 1).setValue(ps);
    if (daIdx > -1) rs.getRange(rowNum, daIdx + 1).setValue(da);
  } catch (e) { LOG_ERR_("PROCESS_MIS_MAIL", mail.msgId || "", e.message); }
}

function FETCH_MIS_() {
  try {
    const label = GmailApp.getUserLabelByName(DC_CFG.MIS.GMAIL_LABEL);
    if (!label) { LOG_ERR_("FETCH_MIS", "", "Label '" + DC_CFG.MIS.GMAIL_LABEL + "' missing"); return; }
    const processed = new Set(),
      rs = SHEET_("RAW_INBOX");
    if (rs && rs.getLastRow() >= 2) { const h = rs.getRange(1, 1, 1, rs.getLastColumn()).getValues()[0].map(DC_NORM_),
        idx = h.indexOf("GMAIL_MSG_ID"); if (idx > -1) { const v = rs.getRange(2, idx + 1, rs.getLastRow() - 1, 1).getValues();
        v.forEach(r => { if (r[0]) processed.add(String(r[0]).trim()); }); } }
    let start = 0,
      fetched = 0;
    while (true) {
      const t = label.getThreads(start, 100);
      if (!t || !t.length) break;
      t.forEach(th => { th.getMessages().forEach(msg => { const id = msg.getId(); if (processed.has(id)) return;
          PROCESS_MIS_MAIL_({ msgId: id, from: msg.getFrom(), subject: msg.getSubject(), body: msg.getPlainBody(), receivedAt: msg.getDate() });
          processed.add(id); }); });
      fetched += t.length;
      if (t.length < 100) break;
      start += 100;
      if (fetched > 500) break;
    }
  } catch (e) { LOG_ERR_("FETCH_MIS", "", e.message); }
}

// ─── MAIN LEAD PIPELINE ─────────────────────────────────────────
function MAP_TO_MASTER_(l) {
  const o = {};
  Object.keys(l).forEach(k => o[k] = l[k]);
  o.TIMESTAMP = o.TIMESTAMP || new Date();
  o.EMPLOYEE_EMAIL = o.EMPLOYEE_EMAIL || o.EMAIL_ID || o.MANAGER_EMAIL || "";
  o.CLIENT_NAME = o.CLIENT_NAME || o.FULL_NAME || "";
  o.CLIENT_MOBILE = o.CLIENT_MOBILE || o.MOBILE || "";
  o.REMARKS = o.REMARKS || o.CASE_REMARK || "";
  o.CASE_CATEGORY = o.CASE_CATEGORY || o.CASE_STATUS || o.STATUS || "NEW_LEAD";
  return o;
}

function DC_PROCESS_LEAD_(l) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { success: false, errorMessage: "Busy" };
  try {
    l = l || {};
    const mobile = DC_CLEAN_MOBILE(l.CLIENT_MOBILE || l.mobile || "");
    l.CLIENT_MOBILE = mobile;
    if (!l.LEAD_ID || String(l.LEAD_ID).startsWith("L") || String(l.LEAD_ID).length < 10) {
      const empForId = FIND_EMP_(l.EMP_CODE);
      l.LEAD_ID = P1_GENERATE_LEAD_ID_(mobile, l.SOURCE_TYPE || "WEB", empForId);
    }

    // Auto-resolve EMP_CODE via ALL_EMPLOYEES
    let emp = null;
    if (l.EMP_CODE) emp = FIND_EMP_(l.EMP_CODE);
    if (!emp && l.EMPLOYEE_EMAIL) emp = FIND_EMP_(l.EMPLOYEE_EMAIL);
    if (!emp && mobile) {
      const all = DC_BUILD_EMP_MAP_();
      for (const k of Object.keys(all)) {
        if (DC_CLEAN_MOBILE(all[k].MOBILE) === mobile || DC_CLEAN_MOBILE(all[k].WHATSAPP) === mobile) { emp = all[k]; break; }
      }
    }
    if (!emp) {
      const mgr = DC_CLEAN_EMAIL(l.MANAGER_EMAIL || l.MANAGER_EMAIL_ID || "");
      if (mgr) { const temp = FIND_EMP_(mgr); if (temp) { emp = temp;
          l.CASE_STATUS = "WITH_MANAGER_PENDING_ASSIGNMENT"; } }
    }
    l.EMP_CODE = emp && emp.EMP_CODE ? emp.EMP_CODE : "";
    l.SALES_NAME = emp && emp.NAME ? emp.NAME : "";
    l.MANAGER_EMAIL = emp && emp.MANAGER_EMAIL ? emp.MANAGER_EMAIL : DC_CFG.COMPANY.SUPPORT_EMAIL;

    // TAT
    const tat = COMPUTE_TAT_(l);
    l.TAT_DAYS = tat.TAT_DAYS;
    l.TAT_DEADLINE = tat.TAT_DEADLINE;
    l.TAT_STATUS = tat.TAT_STATUS;

    // Routing
    const routing = GET_ROUTING_();
    l.DATA_FLOW = routing[String(l.SOURCE_NAME || "").toUpperCase()] || "SALES";

    // AI Advice
    let ai = "";
    try {
      let ctx = "[LIVE PRODUCTS]:\n";
      const prods = GET_PRODUCTS_();
      prods.forEach(p => { ctx += `- ${p.name}: ROI ${p.roi}%, TAT ${p.tat}d. Banks: ${(p.banks||[]).join(",")||"Partners"}\n`; });
      const sys = "You are BULBHUL. Analyze lead and provide credit advice: 1) CIBIL req (650+), 2) Matching banks, 3) Red flags, 4) Next steps. Bulleted, concise.";
      ai = GET_AI_(ctx + "\n\nLead:\n" + JSON.stringify(l, null, 2), sys);
    } catch (e) { ai = "Bulbhul advice unavailable."; }
    l.AI_ADVICE = ai;
    if (ai) { const flat = String(ai).replace(/\r?\n/g, " | ").slice(0, 500);
      l.REMARKS = l.REMARKS ? (l.REMARKS + " | [AI]: " + flat) : "[AI]: " + flat; }

    // ─── STAGE 1: COMMON_ENTRY ──────────────────────────────
    const ce = GET_OR_CREATE_("COMMON_ENTRY");
    const ceH = P1_ENSURE_HEADERS_(ce, GET_MASTER_HEADERS_());
    l.TIMESTAMP = new Date();
    l.PROCESS_STATUS = "CAPTURED";
    ce.appendRow(P1_ROW_(ceH, l));

    // ─── STAGE 2: SMART_LOG ──────────────────────────────────
    const sl = GET_OR_CREATE_("SMART_LOG");
    const slH = P1_ENSURE_HEADERS_(sl, ["TS", "SOURCE_TYPE", "SOURCE_NAME", "DATA_FLOW", "LEAD_ID", "CLIENT_NAME", "CLIENT_MOBILE", "BANK", "STATUS", "EMP_CODE", "REMARKS", "TAT_STATUS"]);
    sl.appendRow(P1_ROW_(slH, { TS: new Date(), SOURCE_TYPE: l.SOURCE_TYPE || "", SOURCE_NAME: l.SOURCE_NAME || "", DATA_FLOW: l.DATA_FLOW, LEAD_ID: l.LEAD_ID, CLIENT_NAME: l.CLIENT_NAME || "", CLIENT_MOBILE: l.CLIENT_MOBILE || "", BANK: l.PREFERRED_BANK || "", STATUS: "ROUTED", EMP_CODE: l.EMP_CODE || "", REMARKS: l.REMARKS || "", TAT_STATUS: l.TAT_STATUS }));

    // ─── STAGE 3: MASTER_DATA ─────────────────────────────────
    const master = GET_OR_CREATE_("MASTER_DATA");
    const full = MAP_TO_MASTER_(l);
    const row = UPSERT_(master, "LEAD_ID", full, GET_MASTER_HEADERS_());
    const mH = master.getRange(1, 1, 1, master.getLastColumn()).getValues()[0];
    UPDATE_TAT_(master, row, mH, l.CASE_CATEGORY || l.CASE_STATUS || "OPEN");

    // ─── STAGE 4: PERSONAL FILE (MY_CASES + SALES_ACTIVITY) ──
    let pfStatus = "NO_FILE_ID";
    if (emp && emp.PERSONAL_FILE_ID) {
      try {
        const pss = P1_OPEN_SS_(emp.PERSONAL_FILE_ID);
        let my = pss.getSheetByName("MY_CASES") || pss.insertSheet("MY_CASES");
        UPSERT_(my, "LEAD_ID", full, GET_MASTER_HEADERS_());
        LOCK_VIEW_(my, emp.EMP_CODE);

        let sa = pss.getSheetByName("SALES_ACTIVITY") || pss.insertSheet("SALES_ACTIVITY");
        const aH = P1_ENSURE_HEADERS_(sa, ["TIMESTAMP", "LEAD_ID", "CLIENT_NAME", "CLIENT_MOBILE", "LOAN_TYPE", "AMOUNT", "BANK", "STATUS", "REMARKS", "TAT_STATUS"]);
        sa.appendRow(P1_ROW_(aH, { TIMESTAMP: new Date(), LEAD_ID: l.LEAD_ID, CLIENT_NAME: l.CLIENT_NAME || "", CLIENT_MOBILE: l.CLIENT_MOBILE || "", LOAN_TYPE: l.LOAN_TYPE || "", AMOUNT: l.REQUIRED_LOAN_AMOUNT || "", BANK: l.PREFERRED_BANK || "", STATUS: l.CASE_CATEGORY || "OPEN", REMARKS: l.REMARKS || "", TAT_STATUS: l.TAT_STATUS || "ACTIVE" }));
        pfStatus = "SYNCED";

        // ─── STAGE 5: MANAGER SYNC ────────────────────────────
        const mgr = emp.MANAGER_EMAIL;
        if (mgr && mgr !== DC_CFG.COMPANY.SUPPORT_EMAIL) {
          const mgrEmp = FIND_EMP_(mgr);
          if (mgrEmp && mgrEmp.PERSONAL_FILE_ID && mgrEmp.PERSONAL_FILE_ID !== emp.PERSONAL_FILE_ID) {
            try {
              const mps = P1_OPEN_SS_(mgrEmp.PERSONAL_FILE_ID);
              let mMC = mps.getSheetByName("MY_CASES") || mps.insertSheet("MY_CASES");
              UPSERT_(mMC, "LEAD_ID", full, GET_MASTER_HEADERS_());
              let mSA = mps.getSheetByName("SALES_ACTIVITY") || mps.insertSheet("SALES_ACTIVITY");
              const mAH = P1_ENSURE_HEADERS_(mSA, ["TIMESTAMP", "LEAD_ID", "CLIENT_NAME", "CLIENT_MOBILE", "LOAN_TYPE", "AMOUNT", "BANK", "STATUS", "REMARKS", "TAT_STATUS"]);
              mSA.appendRow(P1_ROW_(mAH, { TIMESTAMP: new Date(), LEAD_ID: l.LEAD_ID, CLIENT_NAME: l.CLIENT_NAME || "", CLIENT_MOBILE: l.CLIENT_MOBILE || "", LOAN_TYPE: l.LOAN_TYPE || "", AMOUNT: l.REQUIRED_LOAN_AMOUNT || "", BANK: l.PREFERRED_BANK || "", STATUS: l.CASE_CATEGORY || "OPEN", REMARKS: l.REMARKS + " | Team lead synced", TAT_STATUS: l.TAT_STATUS || "ACTIVE" }));
              pfStatus += " + MGR";
            } catch (mgrErr) { LOG_ERR_("MGR_SYNC", mgrEmp.PERSONAL_FILE_ID, mgrErr.message); }
          }
        }
      } catch (e) { pfStatus = "ERROR:" + e.message;
        LOG_ERR_("PERSONAL_FILE", emp.PERSONAL_FILE_ID, e.message); }
    }

    // ─── STAGE 6: MIS_LOG ─────────────────────────────────────
    const mis = GET_OR_CREATE_("MIS_LOG");
    const misH = P1_ENSURE_HEADERS_(mis, ["TIMESTAMP", "LEAD_ID", "EMP_CODE", "CLIENT_NAME", "CLIENT_MOBILE", "ROUTING_STATUS", "DATA_FLOW", "PERSONAL_FILE_SYNC", "REMARKS"]);
    mis.appendRow(P1_ROW_(misH, { TIMESTAMP: new Date(), LEAD_ID: l.LEAD_ID, EMP_CODE: l.EMP_CODE, CLIENT_NAME: l.CLIENT_NAME || "", CLIENT_MOBILE: l.CLIENT_MOBILE || "", ROUTING_STATUS: "ROUTED", DATA_FLOW: l.DATA_FLOW, PERSONAL_FILE_SYNC: pfStatus, REMARKS: "6-stage pipeline. Source:" + l.SOURCE_NAME }));

    lock.releaseLock();

    // Attendance
    if (l.EMP_CODE) RECORD_TASK_(l.EMP_CODE);

    // Disbursal
    const cs = String(l.CASE_CATEGORY || l.CASE_STATUS || "").toUpperCase();
    if (cs === "DISBURSE" || cs === "DISBURSED") { NOTIFY_ACCOUNTS_(l);
      l.DISBURSAL_NOTIFIED = "YES"; }

    // Notification
    try { SEND_SMART_MAIL_(l); } catch (e) { LOG_ERR_("SEND_MAIL_SAFE", l.LEAD_ID, e.message); }

    return { success: true, leadId: l.LEAD_ID, tatDays: l.TAT_DAYS, dataFlow: l.DATA_FLOW };
  } catch (e) { LOG_ERR_("PROCESS_LEAD", l && l.EMP_CODE || "", e.message); return { success: false, errorMessage: e.message }; } finally { try { lock.releaseLock(); } catch (_) {} }
}

function NOTIFY_ACCOUNTS_(l) {
  try {
    const s = GET_OR_CREATE_("ACCOUNTS_LOG");
    P1_ENSURE_HEADERS_(s, ["TIMESTAMP", "LEAD_ID", "CLIENT_NAME", "CLIENT_MOBILE", "LOAN_TYPE", "REQUIRED_LOAN_AMOUNT", "PREFERRED_BANK", "SALES_NAME", "EMP_CODE", "DISBURSAL_STATUS", "REMARKS"]);
    s.appendRow(P1_ROW_(s, { TIMESTAMP: new Date(), LEAD_ID: l.LEAD_ID || "", CLIENT_NAME: l.CLIENT_NAME || "", CLIENT_MOBILE: l.CLIENT_MOBILE || "", LOAN_TYPE: l.LOAN_TYPE || "", REQUIRED_LOAN_AMOUNT: l.REQUIRED_LOAN_AMOUNT || "", PREFERRED_BANK: l.PREFERRED_BANK || "", SALES_NAME: l.SALES_NAME || "", EMP_CODE: l.EMP_CODE || "", DISBURSAL_STATUS: "PENDING", REMARKS: l.REMARKS || "" }));
    if (MailApp.getRemainingDailyQuota() > 0) {
      MailApp.sendEmail({ to: DC_CFG.COMPANY.ACCOUNTS_EMAIL, cc: DC_CFG.COMPANY.MD_EMAIL + "," + DC_CFG.COMPANY.FOUNDER_EMAIL, subject: "[DISBURSAL] " + l.LEAD_ID + " - " + l.CLIENT_NAME, body: JSON.stringify(l, null, 2), name: DC_CFG.COMPANY.NAME });
    }
    DC_SEND_TG_("💰 [DISBURSAL]\nLead:" + l.LEAD_ID + "\nClient:" + l.CLIENT_NAME + "\n₹" + l.REQUIRED_LOAN_AMOUNT + "\nBank:" + l.PREFERRED_BANK);
  } catch (e) { LOG_ERR_("NOTIFY_ACCOUNTS", l.LEAD_ID || "", e.message); }
}

function LOCK_VIEW_(s, code) {
  const allowed = ["upendra.raghav@divyanshicapital.com", "narendra.94100@gmail.com"];
  let p = s.getProtections(SpreadsheetApp.ProtectionType.SHEET)[0];
  if (!p) p = s.protect();
  p.setDescription("MY_CASES_VIEW_ONLY_" + code);
  p.setWarningOnly(false);
  p.getEditors().forEach(u => { if (!allowed.includes(u.getEmail().toLowerCase())) try { p.removeEditor(u); } catch (_) {} });
  allowed.forEach(e => { try { p.addEditor(e); } catch (_) {} });
  try { if (p.canDomainEdit()) p.setDomainEdit(false); } catch (_) {}
}

// ─── AI ──────────────────────────────────────────────────────────
function GET_AI_(prompt, sys) {
  const d = DC_CFG.PROPS.getProperty("DEEPSEEK_API_KEY"),
    o = DC_CFG.PROPS.getProperty("OPENAI_API_KEY"),
    g = DC_CFG.PROPS.getProperty("GEMINI_API_KEY");
  if (d) { try { const r = UrlFetchApp.fetch("https://api.deepseek.com/v1/chat/completions", { method: "post", muteHttpExceptions: true, headers: { "Authorization": "Bearer " + d, "Content-Type": "application/json" }, payload: JSON.stringify({ model: "deepseek-chat", messages: [{ role: "system", content: sys }, { role: "user", content: prompt }], temperature: 0.3, max_tokens: 800 }) }); if (r.getResponseCode() === 200) { const j = JSON.parse(r.getContentText() || "{}"); if (j.choices && j.choices[0]?.message?.content) return String(j.choices[0].message.content).trim(); } } catch (e) {} }
  if (o) { try { const r = UrlFetchApp.fetch("https://api.openai.com/v1/chat/completions", { method: "post", muteHttpExceptions: true, headers: { "Authorization": "Bearer " + o, "Content-Type": "application/json" }, payload: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "system", content: sys }, { role: "user", content: prompt }], temperature: 0.3 }) }); if (r.getResponseCode() === 200) { const j = JSON.parse(r.getContentText() || "{}"); if (j.choices && j.choices[0]?.message?.content) return String(j.choices[0].message.content).trim(); } } catch (e) {} }
  if (g) { try { const r = UrlFetchApp.fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + g, { method: "post", contentType: "application/json", muteHttpExceptions: true, payload: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "System:\n" + sys + "\n\nContext:\n" + prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 800 } }) }); if (r.getResponseCode() === 200) { const j = JSON.parse(r.getContentText() || "{}"); if (j.candidates?.[0]?.content?.parts?.[0]?.text) return String(j.candidates[0].content.parts[0].text).trim(); } } catch (e) {} }
  return "Namaste! Bulbhul active hai. Loan, bank options, case status ke liye message karein.";
}

// ─── WEB APP ────────────────────────────────────────────────────
function doGet(e) {
  e = e || {};
  const p = e.parameter || {};
  if (p.apiKey === DC_CFG.PROPS.getProperty("MALLIK_API_KEY")) {
    if (p.action === "getLeads") {
      const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Leads") || SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
      return getLeadsForEmployee(s, p.empCode);
    }
    return jsonResponse({ error: "Invalid" }, 400);
  }
  const page = String(p.page || "home").trim().toLowerCase();
  let emp = String(p.emp || p.emp_code || "").trim().toUpperCase();
  if (!emp) {
    try {
      const email = Session.getActiveUser().getEmail();
      if (email) {
        const m = DC_BUILD_EMP_MAP_();
        for (const c of Object.keys(m)) { if (m[c].EMAIL === email.toLowerCase().trim()) { emp = c; break; } }
      }
    } catch (_) {}
  }
  try {
    const boot = {
      baseUrl: P1_EXEC_URL_(),
      page,
      emp,
      product: String(p.product || "").trim().toUpperCase(),
      products: GET_PRODUCTS_(),
      banks: P1_GET_BANKS_(),
      staff: P1_STAFF_PUBLIC_(emp),
      dashboard: P1_STAFF_DASHBOARD_(emp)
    };
    let html = HtmlService.createHtmlOutputFromFile("index").getContent();
    html = html.split("__P1_BOOT_DATA_JSON__").join(JSON.stringify(boot).replace(/</g, '\\u003c'));
    return HtmlService.createHtmlOutput(html).setTitle("Divyanshi Capital").addMetaTag("viewport", "width=device-width,initial-scale=1").setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) { LOG_ERR_("doGet", "PAGE_RENDER", err.toString()); return HtmlService.createHtmlOutput("<div style='padding:40px'><h2>Load Error</h2><p>" + String(err.message || err) + "</p></div>"); }
}

function doPost(e) {
  try {
    const raw = e.postData && e.postData.contents ? String(e.postData.contents) : "";
    if (!raw) return ContentService.createTextOutput(JSON.stringify({ ok: false, err: "No data" })).setMimeType(ContentService.MimeType.JSON);
    let body;
    try { body = JSON.parse(raw); } catch (parseErr) { return ContentService.createTextOutput(JSON.stringify({ ok: false, err: "JSON Parse" })).setMimeType(ContentService.MimeType.JSON); }
    if (body.update_id && body.message) {
      if (P1_TG_DUPE_(body.update_id)) return ContentService.createTextOutput("DUPE");
      return ContentService.createTextOutput(P1_TG_HANDLE_(body));
    }
    if (body.apiKey === DC_CFG.PROPS.getProperty("MALLIK_API_KEY")) {
      const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Leads") || SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
      if (body.action === "updateDisposition") return updateLeadDisposition(s, body);
      if (body.action === "addLead") return addNewLead(s, body);
      return jsonResponse({ error: "Invalid" }, 400);
    }
    const action = String(body.action || "").trim(),
      payload = body.payload || {};
    if (action === "submit_lead") return ContentService.createTextOutput(JSON.stringify(P1_SMART_FORM_SUBMIT_(payload))).setMimeType(ContentService.MimeType.JSON);
    if (action === "chat") return ContentService.createTextOutput(JSON.stringify({ reply: BULBHUL_CHAT_API_(payload) })).setMimeType(ContentService.MimeType.JSON);
    if (action === "manager_checkin") return ContentService.createTextOutput(JSON.stringify(MANAGER_CHECKIN_(payload.empCode, payload.half || 1))).setMimeType(ContentService.MimeType.JSON);
    if (action === "test_parse") return ContentService.createTextOutput(JSON.stringify(TEST_PARSE_MIS_MAIL_(payload))).setMimeType(ContentService.MimeType.JSON);
    if (action === "trigger_test") return ContentService.createTextOutput(JSON.stringify(TEST_TRIGGER_LEAD_SUBMISSION())).setMimeType(ContentService.MimeType.JSON);
    if (action === "hr_request") return ContentService.createTextOutput(JSON.stringify(P1_HR_REQUEST_HANDLER_(payload))).setMimeType(ContentService.MimeType.JSON);
    if (action === "icard") return ContentService.createTextOutput(JSON.stringify(P1_ICARD_HANDLER_(payload))).setMimeType(ContentService.MimeType.JSON);
    if (action === "bug_report") return ContentService.createTextOutput(JSON.stringify(P1_BUG_REPORT_HANDLER_(payload))).setMimeType(ContentService.MimeType.JSON);
    return ContentService.createTextOutput(JSON.stringify({ ok: false, err: "Unknown" })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) { LOG_ERR_("doPost", "Main", err.message); return ContentService.createTextOutput(JSON.stringify({ ok: false, err: err.message })).setMimeType(ContentService.MimeType.JSON); }
}

// ─── DASHBOARD ──────────────────────────────────────────────────
function P1_STAFF_PUBLIC_(code) {
  try {
    const e = FIND_EMP_(code);
    if (!e) return null;
    const base = P1_EXEC_URL_(),
      enc = encodeURIComponent(code);
    return { ok: true, empCode: code, name: e.NAME || code, role: e.ROLE || "RM", dept: e.DEPARTMENT || "", mobile: e.MOBILE || "", whatsapp: e.WHATSAPP || "", email: e.EMAIL || "", profilePic: e.P1_AVATAR_URL || `https://ui-avatars.com/api/?name=${encodeURIComponent(e.NAME||code)}&background=d4af37&color=0a2540&size=160`, personalFileId: e.PERSONAL_FILE_ID || "", formLink: base + "?page=form&emp=" + enc, dashboardLink: base + "?page=dashboard&emp=" + enc };
  } catch (e) { return null; }
}

function P1_STAFF_DASHBOARD_(code) {
  try {
    const e = FIND_EMP_(code),
      access = e ? String(e.DASHBOARD_ACCESS || e.ROLE || "STAFF").toUpperCase() : "STAFF";
    let data = [];
    if (e && ["MD", "FOUNDER", "ADMIN"].includes(access)) data = GET_MASTER_ALL_();
    else if (e && ["MANAGER", "HR", "ACCOUNTS"].includes(access)) data = GET_TEAM_DATA_(code);
    else if (e) data = GET_MY_CASES_(code);
    else data = GET_MASTER_ALL_().slice(0, 100);
    const sOf = r => String(r.case_category || r.CASE_CATEGORY || "").toUpperCase();
    const stats = {
      total: data.length,
      approved: data.filter(r => ["APPROVED", "DISBURSED"].includes(sOf(r))).length,
      review: data.filter(r => ["OPEN", "INTERESTED", "CALLBACK", "LOGIN"].includes(sOf(r))).length,
      volume: data.reduce((s, r) => s + Number(r.required_loan_amount || r.REQUIRED_LOAN_AMOUNT || 0), 0)
    };
    const cases = data.slice(0, 100).map(r => ({
      leadId: r.lead_id || r.LEAD_ID || "",
      clientName: r.client_name || r.CLIENT_NAME || "",
      mobile: r.client_mobile || r.CLIENT_MOBILE || "",
      loanType: r.loan_type || r.LOAN_TYPE || "",
      amount: r.required_loan_amount || r.REQUIRED_LOAN_AMOUNT || "",
      bank: r.preferred_bank || r.PREFERRED_BANK || "",
      status: r.case_category || r.CASE_CATEGORY || "OPEN",
      tatStatus: r.tat_status || r.TAT_STATUS || "ACTIVE"
    }));
    return { ok: true, staff: { NAME: e ? e.NAME : "Team", DESIGNATION: e ? e.ROLE : "", DEPARTMENT: e ? e.DEPARTMENT : "" }, access, stats, cases };
  } catch (e) { return { ok: true, staff: { NAME: "Team", DESIGNATION: "", DEPARTMENT: "" }, access: "STAFF", stats: { total: 0, approved: 0, review: 0, volume: 0 }, cases: [] }; }
}

function P1_GET_BANKS_() {
  const m = {};
  try {
    const s = SHEET_("Loan_Bank_Map");
    if (!s || s.getLastRow() < 2) return m;
    const d = s.getDataRange().getValues(),
      h = d[0].map(DC_NORM_),
      iT = h.indexOf("LOAN_TYPE"),
      iB = h.indexOf("BANK"),
      iS = h.indexOf("STATUS");
    if (iT === -1 || iB === -1) return m;
    for (let r = 1; r < d.length; r++) {
      const l = String(d[r][iT] || "").trim(),
        b = String(d[r][iB] || "").trim(),
        st = iS > -1 ? String(d[r][iS] || "ACTIVE").toUpperCase() : "ACTIVE";
      if (l && b && ["ACTIVE", "YES", "LIVE", ""].includes(st)) {
        const k = l.toUpperCase();
        if (!m[k]) m[k] = [];
        if (!m[k].includes(b)) m[k].push(b);
      }
    }
  } catch (e) {}
  return m;
}

// ─── TELEGRAM ────────────────────────────────────────────────────
function P1_TG_DUPE_(id) { const p = PropertiesService.getScriptProperties(); const last = Number(p.getProperty("P1_TG_LAST_UPDATE_ID") || 0),
    now = Number(id); if (now <= last) return true;
  p.setProperty("P1_TG_LAST_UPDATE_ID", String(now)); return false; }

function P1_TG_CHAT_TO_EMP_(id) { const p = PropertiesService.getScriptProperties(); const m = {}; m[p.getProperty("FOUNDER_TG_CHAT_ID")] = "FOUNDER";
  m[p.getProperty("MD_TG_CHAT_ID")] = "MD";
  m[p.getProperty("ACCOUNTS_TG_CHAT_ID")] = "ACCOUNTS";
  m[p.getProperty("HR_TG_CHAT_ID")] = "HR"; return m[String(id)] || ""; }

function P1_TG_HANDLE_(b) {
  const msg = b.message;
  if (!msg || !msg.chat) return "OK";
  const chatId = msg.chat.id,
    user = msg.from && msg.from.first_name ? msg.from.first_name : "User",
    text = String(msg.text || "").trim();
  if (text) {
    try { const s = GET_OR_CREATE_("AVATAR_ACTIVITY_LOG");
      P1_ENSURE_HEADERS_(s, ["TIMESTAMP", "CHAT_ID", "USER", "ACTION", "DETAILS", "CHANNEL", "EMP_CODE", "MOBILE"]);
      s.appendRow([new Date(), String(chatId), user, "TG_MESSAGE", text.slice(0, 500), "TELEGRAM", "", ""]); } catch (e) {}
    if (/^\/core\s+/i.test(text)) { const r = text.replace(/^\/core\s+/i, "").trim().toUpperCase(); const map = { FOUNDER: "FOUNDER_TG_CHAT_ID", MD: "MD_TG_CHAT_ID", ACCOUNTS: "ACCOUNTS_TG_CHAT_ID", HR: "HR_TG_CHAT_ID" }; if (!map[r]) { DC_SEND_TG_MESSAGE_(chatId, "Use: /core MD|FOUNDER|ACCOUNTS|HR"); return "OK"; }
      PropertiesService.getScriptProperties().setProperty(map[r], String(chatId));
      DC_SEND_TG_MESSAGE_(chatId, "✅ Registered: " + r); return "OK"; }
    if (text === "/start" || text === "/help") { DC_SEND_TG_MESSAGE_(chatId, "Namaste! Bulbhul AI active.\n/core MD|FOUNDER|ACCOUNTS|HR\n/campaign <msg>"); return "OK"; }
    if (/^\/campaign\s+/i.test(text)) { DC_SEND_TG_MESSAGE_(chatId, DC_TG_BROADCAST_(text.replace(/^\/campaign\s+/i, "").trim())); return "OK"; }
    try { const emp = P1_TG_CHAT_TO_EMP_(chatId); const reply = BULBHUL_CHAT_API_({ message: text, empCode: emp, source: "TELEGRAM" });
      DC_SEND_TG_MESSAGE_(chatId, String(reply || "Ji?").slice(0, 4000)); } catch (e) { LOG_ERR_("TG_AI", chatId, e.message); }
    return "OK";
  }
  // Document/Photo upload
  let fid = "",
    mime = "",
    fname = "";
  if (msg.document) { fid = msg.document.file_id;
    mime = msg.document.mime_type;
    fname = msg.document.file_name || "doc"; } else if (msg.photo && msg.photo.length) { const p = msg.photo[msg.photo.length - 1];
    fid = p.file_id;
    mime = "image/jpeg";
    fname = "photo.jpg"; }
  if (fid) {
    DC_SEND_TG_MESSAGE_(chatId, "⏳ Analyzing...");
    try {
      const token = PropertiesService.getScriptProperties().getProperty("TG_TOKEN");
      if (!token) throw new Error("No token");
      const fr = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/getFile?file_id=" + fid);
      const fj = JSON.parse(fr.getContentText());
      if (!fj.ok || !fj.result?.file_path) throw new Error("File path fail");
      const url = "https://api.telegram.org/file/bot" + token + "/" + fj.result.file_path;
      const resp = UrlFetchApp.fetch(url);
      const blob = resp.getBlob().setName(fname);
      const analysis = ANALYZE_DOC_(blob);
      DC_SEND_TG_MESSAGE_(chatId, "📊 *BULBHUL — ANALYSIS*\n\n" + analysis);
    } catch (err) { DC_SEND_TG_MESSAGE_(chatId, "❌ Analysis failed: " + err.message); }
    return "OK";
  }
  return "OK";
}

function DC_SEND_TG_MESSAGE_(id, t) {
  try {
    const token = DC_CFG.PROPS.getProperty("TG_TOKEN");
    if (!token || !id) return false;
    UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/sendMessage", { method: "post", contentType: "application/json", muteHttpExceptions: true, payload: JSON.stringify({ chat_id: id, text: String(t || "").slice(0, 4096) }) });
    return true;
  } catch (e) { return false; }
}

function DC_TG_BROADCAST_(m) {
  m = String(m || "").trim();
  if (!m) return "EMPTY";
  const ids = [];
  try {
    const s = SHEET_("AVATAR_ACTIVITY_LOG");
    if (s && s.getLastRow() >= 2) {
      const d = s.getDataRange().getValues();
      for (let i = 1; i < d.length; i++) {
        const id = String(d[i][1] || "").trim();
        if (id && String(d[i][3] || "").toUpperCase().indexOf("TG_CONTACT_") === 0) ids.push(id);
      }
    }
  } catch (e) {}
  let sent = 0;
  ids.forEach(id => { if (DC_SEND_TG_MESSAGE_(id, m)) sent++; });
  return "BROADCAST sent=" + sent;
}

function ANALYZE_DOC_(blob) {
  const g = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  if (!g) throw new Error("No Gemini key");
  const b64 = Utilities.base64Encode(blob.getBytes()),
    mime = blob.getContentType() || "application/pdf";
  const sys = "You are Bulbhul, Credit Manager. Analyze bank statement and provide: 1) Bounces/returns, 2) Salary/credit patterns, 3) Avg balance, 4) Red flags, 5) Credit decision.";
  const payload = { contents: [{ parts: [{ text: "Analyze this document: " }, { inlineData: { mimeType: mime, data: b64 } }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 1200 } };
  const r = UrlFetchApp.fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + g, { method: "post", contentType: "application/json", muteHttpExceptions: true, payload: JSON.stringify(payload) });
  if (r.getResponseCode() === 200) {
    const j = JSON.parse(r.getContentText() || "{}");
    if (j.candidates?.[0]?.content?.parts?.[0]?.text) return String(j.candidates[0].content.parts[0].text).trim();
  }
  throw new Error("Analysis failed");
}

// ─── MOBILE APP API ─────────────────────────────────────────────
function getLeadsForEmployee(s, code) {
  const d = s.getDataRange().getValues();
  if (d.length <= 1) return jsonResponse([]);
  const h = d[0].map(String),
    idx = h.indexOf("empCode");
  if (idx === -1) return jsonResponse({ error: "empCode missing" }, 500);
  const r = [];
  for (let i = 1; i < d.length; i++) {
    const row = d[i];
    if (!code || String(row[idx]).trim() === code) {
      const o = {};
      h.forEach((k, j) => { if (k) o[k] = row[j]; });
      r.push(o);
    }
  }
  return jsonResponse(r);
}

function updateLeadDisposition(s, req) {
  const d = s.getDataRange().getValues(),
    h = d[0].map(String),
    idx = h.indexOf("leadId");
  if (idx === -1) return jsonResponse({ error: "leadId missing" }, 500);
  let row = -1;
  for (let i = 1; i < d.length; i++) { if (String(d[i][idx]).trim() === String(req.leadId).trim()) { row = i + 1; break; } }
  if (row === -1) return jsonResponse({ error: "Lead not found" }, 404);
  const set = (n, v) => { const c = h.indexOf(n); if (c !== -1) s.getRange(row, c + 1).setValue(v); };
  set("callStatus", "CALLED");
  set("disposition", sanitizeInput_(req.disposition));
  set("remarks", sanitizeInput_(req.remarks));
  set("nextFollowupDate", sanitizeInput_(req.nextFollowupDate));
  set("followupStatus", req.nextFollowupDate ? "SCHEDULED" : "NONE");
  set("caseStatus", sanitizeInput_(req.caseStatus));
  return jsonResponse({ success: true });
}

function addNewLead(s, req) {
  const d = s.getDataRange().getValues(),
    h = d[0].map(String);
  const r = new Array(h.length).fill("");
  h.forEach((k, i) => {
    if (k === "leadId") r[i] = "L" + Math.floor(1000 + Math.random() * 9000);
    else if (k === "callStatus") r[i] = "PENDING";
    else if (k === "disposition") r[i] = "NONE";
    else if (k === "followupStatus") r[i] = "NONE";
    else if (req.lead && req.lead[k] !== undefined) r[i] = sanitizeInput_(req.lead[k]);
  });
  s.appendRow(r);
  return jsonResponse({ success: true, leadId: r[h.indexOf("leadId")] });
}

function jsonResponse(o, s = 200) {
  const b = Array.isArray(o) ? o : Object.assign({ ok: s < 400, httpStatus: s }, o);
  return ContentService.createTextOutput(JSON.stringify(b)).setMimeType(ContentService.MimeType.JSON);
}

function sanitizeInput_(v) { if (typeof v !== "string") return v; const t = v.trim(); if (t.length > 0 && ["=", "+", "-", "@"].indexOf(t.charAt(0)) !== -1) return "'" + t; return t; }

// ─── BULBHUL CHAT API ──────────────────────────────────────────
function BULBHUL_CHAT_API_(d) {
  // Auto-repair hook: clear cache if stale
  if (!DC_EMP_CACHE) DC_BUILD_EMP_MAP_();
  d = d || {};
  const msg = String(d.message || "").trim();
  const emp = d.empCode ? FIND_EMP_(d.empCode) : null;
  const role = emp ? String(emp.ROLE || "").toUpperCase() : "";
  let sys = "You are BULBHUL. Reply in user language. Short, actionable.";
  if (role.includes("MD")) sys = "You are BULBHUL for MD. Strategic, data-first.";
  else if (role.includes("FOUNDER")) sys = "You are BULBHUL for Founder. P&L, system health.";
  else if (role.includes("MANAGER")) sys = "You are BULBHUL for Sales Manager. Team pipeline, targets.";
  else if (role.includes("SALES")) sys = "You are BULBHUL for Sales. Convert leads: bank fitment, CIBIL, doc checklist.";
  else if (role.includes("HR")) sys = "You are BULBHUL for HR. Hiring, attendance, onboarding.";
  let ctx = emp ? "\n[SENDER]: " + emp.NAME + " | Role: " + emp.ROLE + " | EMP: " + emp.EMP_CODE : "\n[SENDER]: Visitor";
  try {
    const p = GET_PRODUCTS_();
    if (p.length) { ctx += "\n[LIVE PRODUCTS]:\n";
      p.forEach(x => { ctx += `- ${x.name}: ROI ${x.roi}%, TAT ${x.tat}d. Banks: ${(x.banks||[]).join(",")||"Partners"}\n`; }); }
  } catch (e) {}
  try {
    const ph = msg.match(/\b[6-9]\d{9}\b/),
      lh = msg.match(/\bL\d{4}_\d+\b/i);
    if (ph || lh) {
      const q = lh ? lh[0].toUpperCase() : ph[0];
      const found = (GET_MASTER_ALL_() || []).find(x => String(x.lead_id || x.LEAD_ID || "").toUpperCase() === q || String(x.client_mobile || x.CLIENT_MOBILE || "").replace(/\D/g, "").slice(-10) === q.slice(-10));
      ctx += found ? "\n[CASE]: " + found.lead_id + " | " + found.client_name + " | " + found.case_category : "\n[CASE]: Not found";
    }
  } catch (e) {}
  const final = ctx + "\n\n[USER]: " + msg;
  let reply = GET_AI_(final, sys);
  // Auto-commands
  const uRe = /\[\[UPDATE_LEAD:\s*([^,\]]+),\s*([^,\]]+),\s*([^\]]+)\]\]/i;
  const lRe = /\[\[LOOKUP_LEAD:\s*([^\]]+)\]\]/i;
  const rRe = /\[\[ADD_REMARK:\s*([^,\]]+),\s*([^\]]+)\]\]/i;
  const pRe = /\[\[PROVISION_EMPLOYEE:\s*([^\]]+)\]\]/i;
  const fRe = /\[\[FOLLOWUP_PUSH:\s*([^,\]]+),\s*([^\]]+)\]\]/i;
  const cRe = /\[\[MANAGER_CHECKIN:\s*([^,\]]+),\s*([^\]]+)\]\]/i;
  let log = "",
    m;
  if ((m = reply.match(uRe))) { const res = MLA_UPDATE_MINI_STATUS({ mobile: m[1].trim(), status: m[2].trim().toUpperCase(), remarks: m[3].trim() });
    log += res.success ? "\n✅ Updated " + m[1].trim() : "\n❌ " + res.errorMessage; }
  if ((m = reply.match(lRe))) { const q = m[1].trim(); const c = (GET_MASTER_ALL_() || []).find(x => String(x.lead_id || "").toUpperCase() === q.toUpperCase() || String(x.client_mobile || "").replace(/\D/g, "").slice(-10) === q.slice(-10));
    log += c ? "\n🔍 " + c.lead_id + " | " + c.client_name + " | " + c.case_category : "\n🔍 Not found"; }
  if ((m = reply.match(rRe))) { try { const s = SHEET_("MASTER_DATA"); if (s && s.getLastRow() >= 2) { const h = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map(DC_NORM_);
        UPDATE_REMARKS_IN_SHEET_(s, h.indexOf("LEAD_ID"), m[1].trim(), h.indexOf("REMARKS"), m[2].trim());
        log += "\n📝 Remark added"; } } catch (e) { log += "\n❌ Remark error"; } }
  if ((m = reply.match(pRe))) { const code = m[1].trim().toUpperCase(); const e = FIND_EMP_(code);
    log += e ? (DC_PROVISION_NEW_EMPLOYEE(e) ? "\n✅ Provisioned " + code : "\n❌ Provision failed") : "\n❌ Not found"; }
  if ((m = reply.match(fRe))) { DC_SEND_WA_(m[1].trim(), "📩 [Follow-up]\n" + m[2].trim());
    log += "\n📨 Follow-up pushed"; }
  if ((m = reply.match(cRe))) { const res = MANAGER_CHECKIN_(m[1].trim().toUpperCase(), Number(m[2].trim()) || 1);
    log += res.success ? "\n✅ Check-in: " + res.attendanceStatus : "\n❌ Check-in failed: " + res.errorMessage; }
  if (log) { reply = reply.replace(uRe, "🔄[Done]").replace(lRe, "🔍[Done]").replace(rRe, "📝[Done]").replace(pRe, "📁[Done]").replace(fRe, "📨[Done]").replace(cRe, "🏢[Done]") + "\n\n" + log; }
  return reply;
}

function MLA_UPDATE_MINI_STATUS(d) {
  try {
    d = d || {};
    const mobile = DC_CLEAN_MOBILE(d.mobile || d.CLIENT_MOBILE || "");
    if (!mobile) return { success: false, errorMessage: "Mobile required" };
    const s = SHEET_("MASTER_DATA");
    if (!s) return { success: false, errorMessage: "MASTER_DATA missing" };
    const h = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map(DC_NORM_),
      mi = h.indexOf("CLIENT_MOBILE"),
      si = h.indexOf("CASE_STATUS"),
      ri = h.indexOf("REMARKS");
    if (mi === -1) return { success: false, errorMessage: "CLIENT_MOBILE missing" };
    const lr = s.getLastRow();
    if (lr < 2) return { success: false, errorMessage: "No records" };
    const v = s.getRange(2, mi + 1, lr - 1, 1).getValues();
    for (let i = 0; i < v.length; i++) {
      if (DC_CLEAN_MOBILE(v[i][0]) === mobile) {
        const r = i + 2;
        if (si > -1) s.getRange(r, si + 1).setValue(d.status || "OPEN");
        if (ri > -1) s.getRange(r, ri + 1).setValue(d.remarks || "");
        return { success: true, updatedRow: r };
      }
    }
    return DC_PROCESS_LEAD_({ CLIENT_MOBILE: mobile, CASE_STATUS: d.status || "OPEN", REMARKS: d.remarks || "", EMP_CODE: d.agent || "", SOURCE_TYPE: "MINI_CALLING", SOURCE_NAME: "P1_Calling_Desk" });
  } catch (e) { return { success: false, errorMessage: e.message }; }
}

function UPDATE_REMARKS_IN_SHEET_(s, idx, match, rmIdx, newR) {
  try {
    if (!s || s.getLastRow() < 2 || idx === -1 || rmIdx === -1) return;
    const v = s.getRange(2, idx + 1, s.getLastRow() - 1, 1).getValues();
    for (let i = 0; i < v.length; i++) {
      if (String(v[i][0] || "").trim().toUpperCase() === String(match || "").toUpperCase()) {
        const o = String(s.getRange(i + 2, rmIdx + 1).getValue() || "").trim();
        s.getRange(i + 2, rmIdx + 1).setValue(o ? o + " | " + newR : newR);
        break;
      }
    }
  } catch (e) {}
}

// ─── PROVISIONING ──────────────────────────────────────────────
function DC_PROVISION_NEW_EMPLOYEE(e) {
  try {
    const props = PropertiesService.getScriptProperties();
    const template = props.getProperty("TEMPLATE_PERSONAL_FILE_ID") || props.getProperty("SARI_COMMON_KNOWLEDGE_FILE_ID");
    const parent = props.getProperty("ONBOARDING_DRIVE_FOLDER_ID") || props.getProperty("SARI_FOLDER_ID");
    if (!template || !parent) throw new Error("Missing template/parent");
    const code = String(e.EMP_CODE || "").trim().toUpperCase();
    const name = String(e.EMPLOYEES_NAME || e.EMPLOYEE_NAME || "").trim();
    if (!code || !name) throw new Error("Missing EMP_CODE or NAME");
    const folder = DriveApp.getFolderById(parent).createFolder(code + " - " + name);
    const fileId = DriveApp.getFileById(template).makeCopy(code + " - " + name, folder).getId();
    const s = GET_OR_CREATE_("ALL_EMPLOYEES");
    const h = P1_ENSURE_HEADERS_(s, ["EMP_CODE", "EMPLOYEES_NAME", "MOBILE", "EMPLOYEE_EMAIL_ID", "DEPARTMENT", "ROLE", "PERSONAL_FILE_ID", "ACTIVE_STATUS", "TG_CHAT_ID", "WHATSAPP_VERIFIED"]);
    s.appendRow(P1_ROW_(h, { EMP_CODE: code, EMPLOYEES_NAME: name, MOBILE: e.MOBILE || "", EMPLOYEE_EMAIL_ID: e.EMPLOYEE_EMAIL || e.EMPLOYEE_EMAIL_ID || "", DEPARTMENT: e.DEPARTMENT || "", ROLE: e.ROLE || "", PERSONAL_FILE_ID: fileId, ACTIVE_STATUS: "ACTIVE", TG_CHAT_ID: e.TG_CHAT_ID || "", WHATSAPP_VERIFIED: e.WHATSAPP_VERIFIED || "NO" }));
    DC_EMP_CACHE = null;
    SYNC_EMPLOYEE_LINKS_TO_SHEET_();
    DC_SEND_WELCOME_(e, { EMP_CODE: code, EMPLOYEES_NAME: name, PERSONAL_FILE_ID: fileId, ROLE: e.ROLE || "", DEPARTMENT: e.DEPARTMENT || "" }, folder.getUrl());
    return true;
  } catch (err) { LOG_ERR_("PROVISION", e.EMPLOYEES_NAME || "", err.message); return false; }
}

function DC_SEND_WELCOME_(e, reg, folder) {
  try {
    const to = e.EMPLOYEE_EMAIL || e.EMPLOYEE_EMAIL_ID || "";
    if (!to) return;
    const base = P1_EXEC_URL_(),
      enc = encodeURIComponent(reg.EMP_CODE);
    const body = `<div style="background:#06112C;color:#fff;padding:30px;font-family:sans-serif"><div style="background:linear-gradient(135deg,#d4af37,#fcd34d);padding:30px;text-align:center;color:#06112C"><h1>WELCOME</h1></div><p>Hi <strong>${reg.EMPLOYEES_NAME}</strong>,</p><p>I'm Bulbhul, your AI Avatar.</p><p><strong>Code:</strong> ${reg.EMP_CODE} | <strong>Role:</strong> ${reg.ROLE}</p><a href="${base}?page=dashboard&emp=${enc}" style="display:block;background:#d4af37;color:#06112C;padding:12px;text-align:center;text-decoration:none">📊 Dashboard</a><a href="${folder}" style="color:#d4af37">📁 Upload documents</a></div>`;
    MailApp.sendEmail({ to, subject: "Welcome to Divyanshi Capital! - " + reg.EMP_CODE, htmlBody: body, name: "Bulbhul AI" });
    const cc = [DC_CFG.COMPANY.MD_EMAIL, DC_CFG.COMPANY.FOUNDER_EMAIL, DC_CFG.COMPANY.HR_EMAIL].filter(Boolean).join(",");
    MailApp.sendEmail({ to: e.MANAGER_EMAIL || DC_CFG.COMPANY.HR_EMAIL, cc, subject: "[ONBOARDING] " + reg.EMPLOYEES_NAME + " (" + reg.EMP_CODE + ")", body: "Provisioned:\n" + JSON.stringify(reg, null, 2), name: "Bulbhul AI" });
  } catch (e) { LOG_ERR_("WELCOME_EMAIL", reg.EMP_CODE, e.message); }
}

// ─── TRIGGERS ────────────────────────────────────────────────────
function MIS_15MIN_FULL_SYNC_() {
  const m = DC_BUILD_EMP_MAP_();
  const all = GET_MASTER_ALL_();
  Object.keys(m).forEach(code => {
    const cases = all.filter(r => String(r.EMP_CODE || r.emp_code || "").toUpperCase() === code);
    if (!cases.length) return;
    SYNC_MY_CASES_AND_ACTIVITY_(code, cases);
  });
}

function SYNC_MY_CASES_AND_ACTIVITY_(code, cases) {
  const e = FIND_EMP_(code);
  if (!e || !e.PERSONAL_FILE_ID) return;
  try {
    const ss = P1_OPEN_SS_(e.PERSONAL_FILE_ID);
    const mH = GET_MASTER_HEADERS_();
    let my = ss.getSheetByName("MY_CASES") || ss.insertSheet("MY_CASES");
    my.clearContents();
    my.clearFormats();
    P1_ENSURE_HEADERS_(my, mH);
    if (cases.length) {
      const rows = cases.map(c => P1_ROW_(mH, c));
      my.getRange(2, 1, rows.length, mH.length).setValues(rows);
    }
    LOCK_VIEW_(my, code);
    let sa = ss.getSheetByName("SALES_ACTIVITY") || ss.insertSheet("SALES_ACTIVITY");
    const aH = P1_ENSURE_HEADERS_(sa, ["TIMESTAMP", "LEAD_ID", "CLIENT_NAME", "CLIENT_MOBILE", "LOAN_TYPE", "AMOUNT", "BANK", "STATUS", "REMARKS", "TAT_STATUS"]);
    const existing = new Set();
    if (sa.getLastRow() >= 2) {
      const nA = aH.map(DC_NORM_),
        li = nA.indexOf("LEAD_ID");
      if (li > -1) sa.getRange(2, li + 1, sa.getLastRow() - 1, 1).getValues().forEach(r => { if (r[0]) existing.add(String(r[0]).trim()); });
    }
    cases.forEach(c => {
      const lid = String(c.LEAD_ID || c.lead_id || "").trim();
      if (existing.has(lid)) return;
      sa.appendRow(P1_ROW_(aH, { TIMESTAMP: new Date(), LEAD_ID: lid, CLIENT_NAME: c.CLIENT_NAME || c.client_name || "", CLIENT_MOBILE: c.CLIENT_MOBILE || c.client_mobile || "", LOAN_TYPE: c.LOAN_TYPE || c.loan_type || "", AMOUNT: c.REQUIRED_LOAN_AMOUNT || c.required_loan_amount || "", BANK: c.PREFERRED_BANK || c.preferred_bank || "", STATUS: c.CASE_CATEGORY || c.case_category || "OPEN", REMARKS: c.REMARKS || c.remarks || "", TAT_STATUS: c.TAT_STATUS || c.tat_status || "ACTIVE" }));
      existing.add(lid);
    });
  } catch (e) { LOG_ERR_("SYNC_MY_CASES", code, e.message); }
}

function MIS_PIPELINE_RUN_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) return;
  try { FETCH_MIS_();
    MIS_15MIN_FULL_SYNC_();
    PropertiesService.getScriptProperties().setProperty("MIS_LAST_RUN", new Date().toISOString()); } catch (e) { LOG_ERR_("MIS_RUN", "", e.message); } finally { try { lock.releaseLock(); } catch (_) {} }
}

function MIS_EVENING_REPORT_() {
  try {
    const today = Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd");
    const all = GET_MASTER_ALL_();
    const todayCases = all.filter(c => {
      const ts = c.TIMESTAMP || c.timestamp;
      return ts && Utilities.formatDate(new Date(ts), "Asia/Kolkata", "yyyy-MM-dd") === today;
    });
    const st = {},
      em = {},
      bk = {},
      ln = {};
    let total = 0;
    todayCases.forEach(c => {
      const s = String(c.CASE_CATEGORY || c.case_category || "OPEN").toUpperCase();
      const e = String(c.EMP_CODE || c.emp_code || "UNASSIGNED").toUpperCase();
      const b = String(c.PREFERRED_BANK || c.preferred_bank || "OTHER").toUpperCase();
      const l = String(c.LOAN_TYPE || c.loan_type || "OTHER").toUpperCase();
      const a = Number(c.REQUIRED_LOAN_AMOUNT || c.required_loan_amount || 0);
      st[s] = (st[s] || 0) + 1;
      em[e] = (em[e] || 0) + 1;
      bk[b] = (bk[b] || 0) + 1;
      ln[l] = (ln[l] || 0) + 1;
      total += a;
    });
    let tg = "📊 *DAILY MIS — " + today + "*\nLeads:*" + todayCases.length + "* | ₹" + total.toLocaleString("en-IN") + "\n\n*STATUS:*\n";
    Object.entries(st).sort((a, b) => b[1] - a[1]).forEach(([s, c]) => { tg += "• " + s + ": " + c + "\n"; });
    DC_SEND_TG_(tg);
    if (MailApp.getRemainingDailyQuota() > 0) {
      MailApp.sendEmail({ to: DC_CFG.COMPANY.MD_EMAIL, cc: DC_CFG.COMPANY.FOUNDER_EMAIL + "," + DC_CFG.COMPANY.HR_EMAIL, subject: "[DAILY MIS] Divyanshi Capital — " + today, body: tg.replace(/\*/g, "").replace(/_/g, ""), name: "Bulbhul AI" });
    }
  } catch (e) { LOG_ERR_("MIS_EVENING", "", e.message); }
}

function ATTENDANCE_EOD_REPORT_() {
  try {
    const s = SHEET_("ATTENDANCE_LOG");
    if (!s || s.getLastRow() < 2) return;
    const today = Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd");
    const d = s.getDataRange().getValues(),
      h = d[0].map(DC_NORM_),
      iD = h.indexOf("DATE"),
      iC = h.indexOf("EMP_CODE"),
      iN = h.indexOf("SALES_NAME"),
      iSt = h.indexOf("ATTENDANCE_STATUS");
    let rep = "📋 *ATTENDANCE — " + today + "*\n\n",
      p = 0,
      hd = 0,
      a = 0;
    for (let i = 1; i < d.length; i++) {
      if (Utilities.formatDate(new Date(d[i][iD] || 0), "Asia/Kolkata", "yyyy-MM-dd") !== today) continue;
      const st = String(d[i][iSt] || "ABSENT").toUpperCase();
      rep += "• " + String(d[i][iN] || d[i][iC] || "") + ": " + st + "\n";
      if (st === "PRESENT") p++;
      else if (st === "HALF_DAY") hd++;
      else a++;
    }
    rep += "\n✅ Present:" + p + " | 🟡 Half:" + hd + " | ❌ Absent:" + a;
    DC_SEND_TG_(rep);
  } catch (e) { LOG_ERR_("ATTENDANCE_EOD", "", e.message); }
}

// ─── FORM & EDIT TRIGGERS ──────────────────────────────────────
function P1_FORM_SUBMIT(e) {
  try {
    if (!e) return;
    const sh = e.range ? e.range.getSheet() : null;
    const item = e.response ? e.response.getItemResponses() : [];
    const lead = { SOURCE_TYPE: "Google Form", SOURCE_NAME: "Intake Form" };
    if (item.length) {
      item.forEach(r => {
        const t = r.getItem().getTitle(),
          k = DC_NORM_(t),
          v = r.getResponse();
        if (t.toUpperCase().includes("FILE") || t.toUpperCase().includes("UPLOAD")) lead[k] = Array.isArray(v) ? v.map(id => "https://drive.google.com/open?id=" + id).join(", ") : (v ? "https://drive.google.com/open?id=" + v : "");
        else lead[k] = v;
      });
    } else if (e.namedValues) { Object.keys(e.namedValues).forEach(k => { lead[DC_NORM_(k)] = e.namedValues[k][0]; }); }
    // Onboarding detection
    if ((lead.EMPLOYEES_NAME || lead.EMPLOYEE_EMAIL) && !lead.CLIENT_NAME && !lead.CLIENT_MOBILE) {
      const s = GET_OR_CREATE_("HR_MD_APPROVAL");
      const h = P1_ENSURE_HEADERS_(s, ["TIMESTAMP", "EMPLOYEE_NAME", "EMPLOYEE_EMAIL_ID", "EMPLOYEE_MOBILE", "DEPARTMENT", "ROLE", "CC_EMAIL_IDS", "STATUS", "BRANCH", "MANAGER_NAME", "MANAGER_EMAIL", "MANAGER_MOBILE", "REMARKS_NOTES", "EMP_CODE", "ONBOARD_DONE", "TG_CHAT_ID", "WHATSAPP_VERIFIED"]);
      lead.TIMESTAMP = new Date();
      lead.STATUS = lead.STATUS || "PENDING";
      lead.ONBOARD_DONE = "NO";
      s.appendRow(P1_ROW_(h, lead));
    } else { DC_PROCESS_LEAD_(lead); }
  } catch (e) { LOG_ERR_("FORM_SUBMIT", "", e.message); }
}

function onEdit(e) {
  try {
    if (!e || !e.range) return;
    const s = e.range.getSheet(),
      name = s.getName(),
      row = e.range.getRow(),
      col = e.range.getColumn();

    // ALL_EMPLOYEES: auto-sync links on any edit
    if (name === "ALL_EMPLOYEES") {
      const h = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map(DC_NORM_);
      const cIdx = h.indexOf("EMP_CODE");
      if (cIdx > -1 && row > 1) {
        const code = String(s.getRange(row, cIdx + 1).getValue() || "").trim().toUpperCase();
        if (code) SYNC_EMPLOYEE_ROW_(s, row, code);
      }
      DC_EMP_CACHE = null;
      return;
    }

    // COMMON_ENTRY: auto-correct via ALL_EMPLOYEES
    if (name === "COMMON_ENTRY") { HANDLE_COMMON_ENTRY_EDIT_(s, row, col, e.value); }

    // HR_APPROVAL: auto-provision
    if (name === "HR_MD_APPROVAL") {
      const h = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map(DC_NORM_);
      const st = h.indexOf("STATUS") + 1,
        ec = h.indexOf("EMP_CODE") + 1,
        ob = h.indexOf("ONBOARD_DONE") + 1;
      if (row > 1 && (col === st || col === ec)) {
        const status = String(s.getRange(row, st).getValue() || "").trim().toUpperCase();
        const code = String(s.getRange(row, ec).getValue() || "").trim().toUpperCase();
        const done = ob > 0 ? String(s.getRange(row, ob).getValue() || "").trim().toUpperCase() : "NO";
        if (status === "APPROVED" && code && done !== "YES") {
          const rowData = s.getRange(row, 1, 1, s.getLastColumn()).getValues()[0];
          const emp = {};
          h.forEach((k, i) => emp[k] = rowData[i]);
          if (DC_PROVISION_NEW_EMPLOYEE(emp) && ob > 0) s.getRange(row, ob).setValue("YES");
        }
      }
    }

    // MASTER_DATA: TAT + notifications
    if (name === "MASTER_DATA") {
      const h = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0];
      const nH = h.map(DC_NORM_),
        cs = nH.indexOf("CASE_CATEGORY"),
        ec = nH.indexOf("EMP_CODE");
      if (col - 1 === cs && row > 1) {
        const st = String(s.getRange(row, cs + 1).getValue() || "").toUpperCase();
        UPDATE_TAT_(s, row, h, st);
        if (st === "DISBURSE" || st === "DISBURSED") {
          const rowData = s.getRange(row, 1, 1, h.length).getValues()[0];
          const o = {};
          nH.forEach((k, i) => o[k] = rowData[i]);
          NOTIFY_ACCOUNTS_(o);
        }
        if (ec > -1) {
          const code = String(s.getRange(row, ec + 1).getValue() || "").trim().toUpperCase();
          if (code) RECORD_TASK_(code);
        }
      }
    }
  } catch (e) { LOG_ERR_("onEdit", "", e.message); }
}

function HANDLE_COMMON_ENTRY_EDIT_(s, row, col, val) {
  const h = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map(DC_NORM_);
  const empIdx = h.indexOf("EMP_CODE");
  if (col === empIdx + 1 && val) {
    const emp = FIND_EMP_(String(val).trim().toUpperCase());
    if (emp) {
      const fills = { "SALES_NAME": emp.NAME, "MANAGER_EMAIL": emp.MANAGER_EMAIL || "", "EMPLOYEE_EMAIL_ID": emp.EMPLOYEE_EMAIL || "" };
      Object.keys(fills).forEach(k => { const ci = h.indexOf(DC_NORM_(k)); if (ci >= 0) s.getRange(row, ci + 1).setValue(fills[k]); });
    }
  }
  const rowData = s.getRange(row, 1, 1, s.getLastColumn()).getValues()[0];
  const o = {};
  h.forEach((k, i) => o[k] = rowData[i]);
  let emp = o.EMP_CODE ? FIND_EMP_(o.EMP_CODE) : null;
  if (!emp) {
    const mgr = DC_CLEAN_EMAIL(o.MANAGER_EMAIL || "");
    if (mgr) {
      const temp = FIND_EMP_(mgr);
      if (temp) {
        emp = temp;
        const ci = h.indexOf("EMP_CODE");
        if (ci >= 0) { s.getRange(row, ci + 1).setValue(temp.EMP_CODE);
          o.EMP_CODE = temp.EMP_CODE; }
        const cs = h.indexOf("CASE_STATUS");
        if (cs >= 0) s.getRange(row, cs + 1).setValue("WITH_MANAGER_PENDING_ASSIGNMENT");
      }
    }
  }
  if (!o.CLIENT_MOBILE) return;
  // Sync to MASTER_DATA
  const ms = SHEET_("MASTER_DATA");
  if (ms) { const full = MAP_TO_MASTER_(o);
    UPSERT_(ms, "LEAD_ID", full, GET_MASTER_HEADERS_()); }
  // Personal file sync
  if (emp && emp.PERSONAL_FILE_ID) {
    try {
      const ss = P1_OPEN_SS_(emp.PERSONAL_FILE_ID);
      const full = MAP_TO_MASTER_(o);
      let my = ss.getSheetByName("MY_CASES") || ss.insertSheet("MY_CASES");
      UPSERT_(my, "LEAD_ID", full, GET_MASTER_HEADERS_());
      LOCK_VIEW_(my, emp.EMP_CODE);
    } catch (_) {}
  }
}

function GET_MASTER_HEADERS_() {
  return ["TIMESTAMP", "EMP_CODE", "SALES_NAME", "EMPLOYEE_EMAIL", "CLIENT_MOBILE", "CLIENT_NAME", "COMPANY_NAME", "CITY_LOCATION", "LOAN_TYPE", "CASE_CATEGORY", "CIBIL_SCORE", "REMARKS", "FOLLOWUP_STATUS", "PREFERRED_BANK", "REQUIRED_LOAN_AMOUNT", "DOCS_LINK", "SUBMIT_FOLDER_LINK", "SOURCE_TYPE", "SOURCE_NAME", "SOURCE", "EMPLOYEE_STATUS", "LEAD_ID", "PROCESS_STATUS", "TAT_DAYS", "TAT_DEADLINE", "TAT_STATUS", "DATA_FLOW", "DISBURSAL_NOTIFIED"];
}

// ─── INSTALL ────────────────────────────────────────────────────
function DC_INSTALL_P1_FINAL() {
  const ss = DC_GET_SS_();
  Object.values(DC_CFG.SHEETS).forEach(n => { if (!ss.getSheetByName(n)) ss.insertSheet(n); });
  if (!ss.getSheetByName("AVATAR_ACTIVITY_LOG")) ss.insertSheet("AVATAR_ACTIVITY_LOG");
  P1_ENSURE_HEADERS_(ss.getSheetByName("MASTER_DATA"), GET_MASTER_HEADERS_());
  P1_ENSURE_HEADERS_(ss.getSheetByName("COMMON_ENTRY"), GET_MASTER_HEADERS_());
  P1_ENSURE_HEADERS_(ss.getSheetByName("SMART_LOG"), ["TS", "SOURCE_TYPE", "SOURCE_NAME", "DATA_FLOW", "LEAD_ID", "CLIENT_NAME", "CLIENT_MOBILE", "BANK", "STATUS", "EMP_CODE", "REMARKS", "TAT_STATUS"]);
  P1_ENSURE_HEADERS_(ss.getSheetByName("MIS_LOG"), ["TIMESTAMP", "LEAD_ID", "EMP_CODE", "CLIENT_NAME", "CLIENT_MOBILE", "ROUTING_STATUS", "DATA_FLOW", "PERSONAL_FILE_SYNC", "REMARKS"]);
  P1_ENSURE_HEADERS_(ss.getSheetByName("ATTENDANCE_LOG"), ["DATE", "EMP_CODE", "SALES_NAME", "TASK_COUNT", "ATTENDANCE_STATUS", "HALF1_CHECKIN", "HALF2_CHECKIN", "LAST_UPDATED"]);
  P1_ENSURE_HEADERS_(ss.getSheetByName("ACCOUNTS_LOG"), ["TIMESTAMP", "LEAD_ID", "CLIENT_NAME", "CLIENT_MOBILE", "LOAN_TYPE", "REQUIRED_LOAN_AMOUNT", "PREFERRED_BANK", "SALES_NAME", "EMP_CODE", "DISBURSAL_STATUS", "REMARKS"]);
  P1_ENSURE_HEADERS_(ss.getSheetByName("RAW_INBOX"), ["RECEIVED_AT", "GMAIL_MSG_ID", "FROM_EMAIL", "SUBJECT", "LEAD_ID", "CLIENT_NAME", "CLIENT_MOBILE", "PREFERRED_BANK", "LOAN_TYPE", "REQUIRED_LOAN_AMOUNT", "CASE_STATUS", "REMARKS", "SOURCE_NAME", "EMP_CODE", "PROCESS_STATUS", "DEDUP_ACTION", "PROCESSED_AT"]);
  P1_ENSURE_HEADERS_(ss.getSheetByName("ERR"), ["TIMESTAMP", "FUNCTION", "CODE", "MESSAGE"]);
  P1_ENSURE_HEADERS_(ss.getSheetByName("SOURCE_NAME"), ["SOURCE_NAME", "DATA_FLOW"]);
  P1_ENSURE_HEADERS_(ss.getSheetByName("Loan_Bank_Map"), ["LOAN_TYPE", "BANK", "STATUS", "ROI_START", "MIN_CIBIL", "MIN_INCOME", "MAX_LOAN_AMOUNT", "DOCUMENTS_REQUIRED", "POLICY_REMARKS", "TAT_DAYS"]);
  const sn = ss.getSheetByName("SOURCE_NAME");
  if (sn && sn.getLastRow() <= 1) {
    sn.getRange(2, 1, 17, 2).setValues([
      ["Sales Team", "SALES"],
      ["Manual Calling", "SALES"],
      ["AI Auto Calling", "SALES"],
      ["WhatsApp", "SALES"],
      ["Website", "SALES"],
      ["DSA", "LOGIN DEPARTMENT"],
      ["Referral", "SALES"],
      ["Walk-in", "SALES"],
      ["Instagram", "SALES"],
      ["Facebook", "SALES"],
      ["LinkedIn", "SALES"],
      ["Email Campaign", "SALES"],
      ["Bank Referral", "SALES"],
      ["MIS UPDATE", "REPORT"],
      ["ONBOARD/INTERVIEWE/BANKAR", "HR"],
      ["SEND TO LOGIN/COMPLETED", "LOGIN DEPARTMENT"],
      ["Other", "ANY"]
    ]);
  }
  ScriptApp.getProjectTriggers().forEach(t => {
    if (["MIS_PIPELINE_RUN_", "MIS_EVENING_REPORT_", "ATTENDANCE_EOD_REPORT_", "P1_FORM_SUBMIT", "onEdit"].includes(t.getHandlerFunction())) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("MIS_PIPELINE_RUN_").timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger("MIS_EVENING_REPORT_").timeBased().atHour(14).everyDays(1).create();
  ScriptApp.newTrigger("ATTENDANCE_EOD_REPORT_").timeBased().atHour(14).nearMinute(30).everyDays(1).create();
  try { ScriptApp.newTrigger("P1_FORM_SUBMIT").forSpreadsheet(ss).onFormSubmit().create(); } catch (e) {}
  try { ScriptApp.newTrigger("onEdit").forSpreadsheet(ss).onEdit().create(); } catch (e) {}
  DC_SYNC_ALL_EMPLOYEES();
  return "✅ INSTALL COMPLETE";
}

function DC_SYNC_ALL_EMPLOYEES() {
  const s = SHEET_("ALL_EMPLOYEES");
  if (!s || s.getLastRow() < 2) return;
  const d = s.getDataRange().getValues();
  for (let i = 1; i < d.length; i++) {
    const h = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map(DC_NORM_);
    const cIdx = h.indexOf("EMP_CODE");
    if (cIdx > -1) {
      const code = String(d[i][cIdx] || "").trim().toUpperCase();
      if (code) SYNC_EMPLOYEE_ROW_(s, i + 1, code);
    }
  }
}

function DC_SETUP_TRIGGERS() { DC_INSTALL_P1_FINAL(); }

function RUN_MIS_PIPELINE_NOW() { MIS_PIPELINE_RUN_(); }

function RUN_MIS_EVENING_REPORT() { MIS_EVENING_REPORT_(); }

function P1_SMART_FORM_SUBMIT_(p) {
  try {
    p = p || {};
    return DC_PROCESS_LEAD_({
      EMP_CODE: String(p.emp_code || p.EMP_CODE || "").trim().toUpperCase(),
      CLIENT_NAME: String(p.client_name || p.CLIENT_NAME || "").trim(),
      CLIENT_MOBILE: DC_CLEAN_MOBILE(p.client_mobile || p.CLIENT_MOBILE || p.mobile || ""),
      CLIENT_EMAIL: DC_CLEAN_EMAIL(p.client_email || p.CLIENT_EMAIL || p.email || ""),
      CITY_LOCATION: String(p.city_location || p.CITY_LOCATION || "").trim(),
      LOAN_TYPE: String(p.loan_type || p.LOAN_TYPE || "").trim(),
      REQUIRED_LOAN_AMOUNT: String(p.required_loan_amount || p.REQUIRED_LOAN_AMOUNT || "").trim(),
      PREFERRED_BANK: String(p.preferred_bank || p.PREFERRED_BANK || "").trim(),
      COMPANY_NAME: String(p.company_name || p.COMPANY_NAME || "").trim(),
      REMARKS: String(p.remarks || p.REMARKS || "").trim(),
      CASE_STATUS: "OPEN",
      SOURCE_TYPE: "WEB_APP",
      SOURCE_NAME: p.source_name || "P1_SMART_DUNIYA",
      FILES: p.files || []
    });
  } catch (e) { LOG_ERR_("SMART_FORM", "", e.message); return { success: false, errorMessage: e.message }; }
}

// ─── SETUP & HEALTH ─────────────────────────────────────────────
function SETUP_STANDALONE_() {
  Logger.log("SETUP START");
  if (!DC_CFG.MASTER_SS_ID || DC_CFG.MASTER_SS_ID.length < 20) throw new Error("MASTER_SS_ID missing");
  const p = PropertiesService.getScriptProperties();
  p.setProperties({ "MASTER_FILE_ID": DC_CFG.MASTER_SS_ID, "P1_MASTER_FILE_ID": DC_CFG.MASTER_SS_ID, "SPREADSHEET_ID": DC_CFG.MASTER_SS_ID });
  Logger.log("✅ Setup done. Run DC_INSTALL_P1_FINAL() next.");
}

function HEALTH_CHECK_() {
  Logger.log("HEALTH CHECK");
  let p = 0,
    f = 0;
  const check = (l, t) => { try { t();
      Logger.log("✅ " + l);
      p++; } catch (e) { Logger.log("❌ " + l + ": " + e.message);
      f++; } };
  check("MASTER_SS_ID", () => { if (!DC_CFG.MASTER_SS_ID || DC_CFG.MASTER_SS_ID.length < 20) throw new Error("Invalid"); });
  check("Spreadsheet", () => { DC_GET_SS_(); });
  check("ALL_EMPLOYEES", () => { const s = SHEET_("ALL_EMPLOYEES"); if (!s || s.getLastRow() < 2) throw new Error("No data"); });
  Logger.log("RESULT: " + p + " PASS, " + f + " FAIL");
}

// ─── MENU ────────────────────────────────────────────────────────
function onOpen() {
  try {
    const ui = SpreadsheetApp.getUi();
    if (ui) ui.createMenu("🤖 BULBHUL")
      .addItem("▶ Run MIS Now", "RUN_MIS_PIPELINE_NOW")
      .addItem("📊 Evening Report", "RUN_MIS_EVENING_REPORT")
      .addSeparator()
      .addItem("⚙️ Install Triggers", "DC_SETUP_TRIGGERS")
      .addItem("🌐 Open Web App", "OPEN_WEB_APP_URL_")
      .addToUi();
  } catch (e) {}
}

function OPEN_WEB_APP_URL_() {
  const html = '<div style="padding:20px;text-align:center"><a href="' + P1_EXEC_URL_() + '" target="_blank" style="padding:10px 20px;background:#1a73e8;color:#fff;text-decoration:none;border-radius:4px">🌐 Open Dashboard</a></div>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(400).setHeight(150), "Bulbhul Web App");
}

// ─── WRAPPERS ────────────────────────────────────────────────────
function P1_GET_OR_CREATE_SHEET_(n) { return GET_OR_CREATE_(n); }
function GET_ACTIVE_LOAN_PRODUCTS() { return GET_PRODUCTS_(); }
function P1_GET_BANK_OPTIONS_MAP() { return P1_GET_BANKS_(); }
function BULBHUL_CHAT_API(d) { return BULBHUL_CHAT_API_(d); }
function DC_TG_BROADCAST(m) { return DC_TG_BROADCAST_(m); }
function P1_SET_TG_WEBHOOK_RUN() { const token = DC_CFG.PROPS.getProperty("TG_TOKEN"),
    url = P1_EXEC_URL_(); if (!token) return "SKIPPED";
  UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/deleteWebhook", { method: "post", contentType: "application/json", muteHttpExceptions: true, payload: JSON.stringify({ drop_pending_updates: true }) });
  Utilities.sleep(1000);
  const r = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/setWebhook", { method: "post", contentType: "application/json", muteHttpExceptions: true, payload: JSON.stringify({ url, drop_pending_updates: true, allowed_updates: ["message"] }) });
  return r.getContentText(); }

function P1_VERIFY_ACCESS(code, pin) {
  try {
    code = String(code || "").trim().toUpperCase();
    pin = String(pin || "").trim();
    if (!code) return { ok: false, errorMessage: "Code required" };
    const e = FIND_EMP_(code);
    if (!e) return { ok: false, errorMessage: "Not found" };
    const _tok = function() {
      const t = Utilities.base64Encode(code + '_' + Date.now()).replace(/[^A-Za-z0-9]/g, '').slice(0, 24);
      return { ok: true, accessToken: t };
    };
    const stored = DC_CFG.PROPS.getProperty("PIN_" + code) || DC_CFG.PROPS.getProperty("DEFAULT_PIN") || "";
    if (stored && pin === stored) return _tok();
    if (e.PIN && String(e.PIN).trim() === pin) return _tok();
    const mobile = String(e.MOBILE || "").replace(/\D/g, "");
    if (mobile && mobile.slice(-4) === pin) return _tok();
    return { ok: false, errorMessage: "Invalid PIN" };
  } catch (e) { return { ok: false, errorMessage: e.message }; }
}

function MANAGER_CHECKIN_API(d) { return MANAGER_CHECKIN_(d.empCode, d.half || 1); }

function processVoiceCommand(phone) {
  try {
    phone = String(phone || "").trim();
    if (!phone) return { success: false, errorMessage: "No phone" };
    DC_SEND_TG_("📞 [VOICE CALL] to " + phone);
    return { success: true, message: "Call initiated" };
  } catch (e) { return { success: false, errorMessage: e.message }; }
}

function TEST_PARSE_MIS_MAIL_(payload) {
  try {
    const mail = { subject: payload.subject || "", body: payload.body || "", receivedAt: new Date(), msgId: "test_msg_" + Date.now(), from: payload.from || "test@example.com" };
    const parsed = PARSE_MAIL_(mail.subject, mail.body);
    const cn = String(parsed.CLIENT_NAME || "").toUpperCase();
    const sys = ["GITHUB", "SECURITY", "GOOGLE", "OAUTH", "SIGN-IN", "VERIFICATION", "OTP", "NOREPLY", "MAILER-DAEMON"];
    return { parsed, isSystem: sys.some(x => cn.includes(x)), hasDetails: !!(parsed.CLIENT_MOBILE || parsed.PREFERRED_BANK || parsed.REQUIRED_LOAN_AMOUNT || (parsed.LEAD_ID && !parsed.LEAD_ID.startsWith("L0000_"))) };
  } catch (e) { return { error: e.message }; }
}

function TEST_TRIGGER_LEAD_SUBMISSION() {
  Logger.log("🚀 Starting pipeline test...");
  let testEmpCode = "DC017";
  try {
    const ss = DC_GET_SS_();
    const empSh = ss.getSheetByName("ALL_EMPLOYEES");
    if (empSh && empSh.getLastRow() >= 2) {
      const data = empSh.getRange(2, 1, 1, 2).getValues();
      if (data && data[0] && data[0][0]) { testEmpCode = String(data[0][0]).trim();
        Logger.log("Found active test Employee Code: " + testEmpCode); }
    }
  } catch (e) { Logger.log("Could not read ALL_EMPLOYEES, using default: " + e.message); }
  const res = P1_SMART_FORM_SUBMIT_({ emp_code: testEmpCode, client_name: "TEST SYSTEM PIPELINE RUN", client_mobile: "9876543210", required_loan_amount: "5000000", preferred_bank: "HDFC", loan_type: "Personal Loan", remarks: "Manual pipeline test." });
  Logger.log("✅ Pipeline test completed!");
  Logger.log("Result: " + JSON.stringify(res, null, 2));
  return res;
}

// ═══════════════════════════════════════════════════════════════


// ── Aliases for compatibility ──────────────────────────────────
function FIND_EMPLOYEE_FULL_(q) { return FIND_EMP_(q); }
function GET_MASTER_DATA_ALL_() { return (typeof GET_MASTER_ALL_ === 'function') ? GET_MASTER_ALL_() : []; }
function GET_MASTER_SNAPSHOT_() { return GET_MASTER_DATA_ALL_(); }


// ═══════════════════════════════════════════════════════════════
//  PREMIUM LEAD_ID — YY/MM/###/EMPNAME  (e.g. 26/07/001/UPENDRA)
// ═══════════════════════════════════════════════════════════════
function P1_GENERATE_LEAD_ID_(mobile, srcType, emp) {
  try {
    const now = new Date();
    const yy = Utilities.formatDate(now, 'Asia/Kolkata', 'yy');
    const mm = Utilities.formatDate(now, 'Asia/Kolkata', 'MM');
    let name = 'STAFF';
    if (emp && typeof emp === 'object') {
      name = String(emp.NAME || emp.EMPLOYEES_NAME || emp.EMP_CODE || 'STAFF')
        .split(' ')[0].toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8) || 'STAFF';
    } else if (typeof emp === 'string' && emp) {
      const found = FIND_EMP_(emp);
      if (found) {
        name = String(found.NAME || found.EMPLOYEES_NAME || emp)
          .split(' ')[0].toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8) || 'STAFF';
      } else {
        name = String(emp).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'STAFF';
      }
    }
    const seqKey = 'LEAD_SEQ_' + yy + mm;
    const props = PropertiesService.getScriptProperties();
    const lock = LockService.getScriptLock();
    let seq = 1;
    if (lock.tryLock(8000)) {
      try {
        seq = Number(props.getProperty(seqKey) || 0) + 1;
        props.setProperty(seqKey, String(seq));
      } finally { try { lock.releaseLock(); } catch (_) {} }
    } else {
      seq = Number(props.getProperty(seqKey) || 0) + 1;
      props.setProperty(seqKey, String(seq));
    }
    return yy + '/' + mm + '/' + String(seq).padStart(3, '0') + '/' + name;
  } catch (e) {
    try { LOG_ERR_('P1_GENERATE_LEAD_ID_', '', e.message); } catch (_) {}
    return '26/07/ERR/' + Date.now().toString().slice(-5);
  }
}
function P1_GENERATE_LEAD_ID(mobile, srcType, emp) {
  return P1_GENERATE_LEAD_ID_(mobile, srcType, emp);
}
function GENERATE_PREMIUM_LEAD_ID_(mobile, srcType, empCodeOrObj) {
  let emp = null;
  if (empCodeOrObj && typeof empCodeOrObj === 'object') emp = empCodeOrObj;
  else if (empCodeOrObj) emp = FIND_EMP_(empCodeOrObj);
  return P1_GENERATE_LEAD_ID_(mobile, srcType, emp);
}


// ═══════════════════════════════════════════════════════════════
//  SAFE AGENTS + FULL AUTO MODE
// ═══════════════════════════════════════════════════════════════
function AGENT_RUN_(key, fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    try { if (typeof LOG_AGENT_RUN_ === 'function') LOG_AGENT_RUN_(key, 'SKIPPED', 'lock busy'); } catch (_) {}
    return;
  }
  try {
    const result = (typeof fn === 'function') ? fn() : '';
    try { if (typeof LOG_AGENT_RUN_ === 'function') LOG_AGENT_RUN_(key, 'OK', String(result || '').slice(0, 200)); } catch (_) {}
    return result;
  } catch (err) {
    try {
      if (typeof LOG_AGENT_RUN_ === 'function') LOG_AGENT_RUN_(key, 'FAILED', err.message);
      LOG_ERR_('AGENT_' + key, 'RUN_FAIL', err.message);
    } catch (_) {}
  } finally { try { lock.releaseLock(); } catch (_) {} }
}
function LOG_AGENT_RUN_(key, status, details) {
  try {
    const sh = GET_OR_CREATE_('AGENT_RUN_LOG');
    P1_ENSURE_HEADERS_(sh, ['TIMESTAMP', 'AGENT', 'STATUS', 'DETAILS']);
    sh.appendRow([new Date(), key, status, String(details || '').slice(0, 500)]);
  } catch (_) {}
}
function _AUTO_SAFE_(label, fn) {
  try { return { ok: true, result: fn() }; }
  catch (e) { try { LOG_ERR_(label, e.name || 'Error', e.message); } catch (_) {} return { ok: false, err: e.message }; }
}
function SYNC_ROLE_DASHBOARDS_ENGINE() {
  try {
    if (typeof MIS_15MIN_FULL_SYNC_ === 'function') MIS_15MIN_FULL_SYNC_();
    if (typeof SYNC_MASTER_CONTROL_CENTER_ === 'function') try { SYNC_MASTER_CONTROL_CENTER_(); } catch (_) {}
    return 'OK';
  } catch (e) { LOG_ERR_('SYNC_ROLE_DASHBOARDS_ENGINE', '', e.message); return 'ERR'; }
}
function SYNC_ROLE_DASHBOARDS_AND_LOCK_ENGINE_() { return SYNC_ROLE_DASHBOARDS_ENGINE(); }
function AGENT_DASHBOARD_SYNC() {
  _AUTO_SAFE_('AGENT_DASHBOARD_SYNC', function () {
    AGENT_RUN_('DASHBOARD_SYNC', function () { return SYNC_ROLE_DASHBOARDS_ENGINE(); });
  });
}
function MASTER_CONTROL_TRIGGER_1H_() {
  _AUTO_SAFE_('MASTER_CONTROL_TRIGGER_1H_', function () {
    if (typeof SYNC_MASTER_CONTROL_CENTER_ === 'function') SYNC_MASTER_CONTROL_CENTER_();
  });
}
function MIS_TRIGGER_15MIN_() {
  _AUTO_SAFE_('MIS_TRIGGER_15MIN_', function () {
    try { if (typeof SELF_HEAL_TRIGGERS_ === 'function') SELF_HEAL_TRIGGERS_(); } catch (_) {}
    if (typeof MIS_15MIN_FULL_SYNC_ === 'function') MIS_15MIN_FULL_SYNC_();
    else if (typeof MIS_PIPELINE_RUN_ === 'function') MIS_PIPELINE_RUN_();
  });
}
function DASHBOARD_SYNC_TRIGGER_ENGINE() {
  _AUTO_SAFE_('DASHBOARD_SYNC_TRIGGER_ENGINE', function () {
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty('DASHBOARD_SYNC_PENDING') !== 'YES') return;
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(12000)) return;
    try {
      SYNC_ROLE_DASHBOARDS_ENGINE();
      props.setProperty('DASHBOARD_SYNC_PENDING', 'NO');
    } finally { try { lock.releaseLock(); } catch (_) {} }
  });
}
function AGENT_LEAD_FOLLOWUP() {
  _AUTO_SAFE_('AGENT_LEAD_FOLLOWUP', function () {
    AGENT_RUN_('LEAD_FOLLOWUP', function () {
      const all = GET_MASTER_DATA_ALL_() || [];
      const cutoff = Date.now() - 24 * 3600 * 1000;
      const stale = all.filter(function (r) {
        const st = String(r.CASE_CATEGORY || r.case_category || '').toUpperCase();
        const ts = new Date(r.TIMESTAMP || r.timestamp || 0).getTime();
        return ['OPEN','INTERESTED','CALLBACK','LOGIN','PROCESS','NEW LEAD','NEW'].indexOf(st) > -1 && ts && ts < cutoff;
      });
      if (!stale.length) return '0';
      if (typeof DC_SEND_TG_ === 'function') {
        DC_SEND_TG_('⏰ ' + stale.length + ' lead(s) untouched 24h+\n' +
          stale.slice(0, 10).map(function (r) {
            return '- ' + (r.CLIENT_NAME || '?') + ' | ' + (r.LOAN_TYPE || '?') + ' | ' + (r.EMP_CODE || '?');
          }).join('\n'));
      }
      return String(stale.length);
    });
  });
}
function INSTALL_FULL_AUTO_MODE() {
  const out = [];
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return 'LOCK_BUSY';
  try {
    const managed = {
      MIS_TRIGGER_15MIN_:1, MASTER_CONTROL_TRIGGER_1H_:1, DASHBOARD_SYNC_TRIGGER_ENGINE:1,
      AGENT_DASHBOARD_SYNC:1, AGENT_LEAD_FOLLOWUP:1, AGENT_TAT_BREACH:1,
      AVATAR_SCHEDULED_CHECK_:1, BULBHUL_MASTER_AGENT_:1,
      MIS_EVENING_REPORT_:1, ATTENDANCE_EOD_REPORT_:1, DC_TG_DAILY_REPORT_:1
    };
    ScriptApp.getProjectTriggers().forEach(function (t) {
      if (managed[t.getHandlerFunction()]) try { ScriptApp.deleteTrigger(t); } catch (_) {}
    });
    function add(fn, b) {
      try { b(ScriptApp.newTrigger(fn).timeBased()).create(); out.push(fn); }
      catch (e) { out.push(fn + ' SKIP'); }
    }
    add('MIS_TRIGGER_15MIN_', function (b) { return b.everyMinutes(15); });
    add('MASTER_CONTROL_TRIGGER_1H_', function (b) { return b.everyHours(1); });
    add('DASHBOARD_SYNC_TRIGGER_ENGINE', function (b) { return b.everyMinutes(30); });
    add('AGENT_DASHBOARD_SYNC', function (b) { return b.everyMinutes(5); });
    add('AGENT_LEAD_FOLLOWUP', function (b) { return b.everyHours(1); });
    add('AVATAR_SCHEDULED_CHECK_', function (b) { return b.everyHours(1); });
    add('BULBHUL_MASTER_AGENT_', function (b) { return b.atHour(18).everyDays(1); });
    add('MIS_EVENING_REPORT_', function (b) { return b.atHour(19).everyDays(1); });
    add('ATTENDANCE_EOD_REPORT_', function (b) { return b.atHour(20).everyDays(1); });
    PropertiesService.getScriptProperties()
      .setProperty('FULL_AUTO_MODE', 'ON')
      .setProperty('FULL_AUTO_INSTALLED_AT', new Date().toISOString());
    const msg = '✅ FULL AUTO MODE ON\n' + out.join('\n');
    Logger.log(msg);
    try { if (typeof DC_SEND_TG_ === 'function') DC_SEND_TG_('🤖 AUTOMODE ON\n' + out.join('\n')); } catch (_) {}
    return msg;
  } finally { try { lock.releaseLock(); } catch (_) {} }
}
function AUTO_MODE_STATUS() {
  const p = PropertiesService.getScriptProperties();
  const triggers = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  const s = 'FULL_AUTO_MODE: ' + (p.getProperty('FULL_AUTO_MODE') || 'OFF') +
    '\nInstalled: ' + (p.getProperty('FULL_AUTO_INSTALLED_AT') || 'never') +
    '\nTriggers: ' + triggers.join(', ');
  Logger.log(s);
  return s;
}


// ═══════════════════════════════════════════════════════════════
//  BULBHUL — AVATAR AGENT SYSTEM (Integrated)
//  Master: Bulbhul = Brain | Avatars = Per-Employee Virtual Buddies
// ═══════════════════════════════════════════════════════════════

const SKILL_LIBRARY_ = {
  SALES: {
    title: "Sales Representative Skills",
    skills: [
      "Lead Qualification: BANT (Budget, Authority, Need, Timeline)",
      "CIBIL Requirements: 650+ for PL, 700+ for HL, 750+ for BL",
      "Bank Fitment: Match client profile to bank eligibility",
      "Document Checklist: PAN, Aadhaar, Salary Slip (3 months), Bank Statement (6 months), ITR (2 years)",
      "Follow-up Cadence: Day 0 (call), Day 1 (WhatsApp), Day 3 (call), Day 7 (email), Day 14 (final call)",
      "Product Knowledge: PL (10.5-18%, 3-7 days), BL (12-20%, 7-15 days), HL (8.5-10.5%, 15-30 days), LAP (9-12%, 15-25 days)",
      "Compliance: KYC mandatory before login, NOC check for existing loans, FOIR < 50%"
    ],
    dailyTargets: { calls: 15, leads: 5, logins: 2, followups: 10 },
    kpi: ["callConversionRate", "loginToDisbursalRatio", "avgTicketSize", "followupCompliance"]
  },
  "SALES MANAGER": {
    title: "Sales Manager Skills",
    skills: [
      "Team Pipeline Review: Daily huddle at 10:00 AM, Weekly review on Friday",
      "Lead Distribution: Round-robin for new leads, Skill-based for complex cases",
      "Performance Coaching: Shadow calls, Mock pitches, Feedback sessions",
      "Escalation Handling: TAT breach → reassign | Client complaint → direct call"
    ],
    dailyTargets: { teamCalls: 100, teamLeads: 30, teamLogins: 10, teamDisbursals: 5 },
    kpi: ["teamConversionRate", "teamProductivity", "attritionRate", "revenuePerEmployee"]
  },
  "LOGIN DEPARTMENT": {
    title: "Login / Operations Skills",
    skills: [
      "File Preparation: Complete document checklist, Bank-specific format",
      "CIBIL Pull: Soft pull first, Hard pull after client consent",
      "TAT Monitoring: Track each stage, Escalate delays",
      "Disbursal Coordination: PDC/ECS setup, Agreement signing"
    ],
    dailyTargets: { filesLogged: 10, cibilPulled: 15, verificationsDone: 8, disbursalsProcessed: 3 },
    kpi: ["fileToSanctionRate", "tatCompliance", "rejectionRate", "disbursalAccuracy"]
  },
  HR: {
    title: "HR Skills",
    skills: ["Recruitment", "Onboarding", "Attendance Management", "Payroll", "Performance Review", "Exit Process"],
    dailyTargets: { interviewsScheduled: 3, onboardingsCompleted: 1, attendanceVerified: 100, queriesResolved: 10 },
    kpi: ["timeToHire", "retentionRate", "attendanceCompliance", "employeeSatisfaction"]
  },
  ACCOUNTS: {
    title: "Accounts Skills",
    skills: ["Disbursal Verification", "Commission Calculation", "Invoice Generation", "Reconciliation", "Payout Processing"],
    dailyTargets: { disbursalsVerified: 10, invoicesGenerated: 8, reconciliationsDone: 1, payoutsProcessed: 5 },
    kpi: ["disbursalAccuracy", "commissionErrorRate", "reconciliationTimeliness", "auditCompliance"]
  },
  MD: {
    title: "Managing Director Skills",
    skills: ["Strategic Planning", "P&L Management", "Bank Relations", "Risk Management", "Team Leadership"],
    dailyTargets: { decisionsMade: 5, reviewsCompleted: 3, meetingsAttended: 4, strategyNotes: 2 },
    kpi: ["revenueGrowth", "profitMargin", "npRatio", "teamRetention"]
  },
  FOUNDER: {
    title: "Founder Skills",
    skills: ["Vision & Mission", "Capital Management", "Governance", "Brand Building", "Network Building"],
    dailyTargets: { strategicCalls: 3, investorUpdates: 1, boardPrep: 1, visionNotes: 2 },
    kpi: ["companyValuation", "marketShare", "brandRecall", "strategicMilestones"]
  },
  ADMIN: {
    title: "Admin Skills",
    skills: ["System Management", "Data Security", "Vendor Management", "Infrastructure"],
    dailyTargets: { ticketsResolved: 10, backupsVerified: 1, accessReviews: 5, vendorCalls: 2 },
    kpi: ["systemUptime", "ticketResolutionTime", "securityIncidents", "costOptimization"]
  },
  STAFF: {
    title: "General Staff Skills",
    skills: ["Data Entry", "Communication", "Time Management", "Learning"],
    dailyTargets: { entriesCompleted: 50, errorsZero: 1, learningMinutes: 15 },
    kpi: ["accuracyRate", "productivity", "learningIndex", "attendancePunctuality"]
  }
};

function BULBHUL_MASTER_CHECKS_() {
  const checks = {};
  const allEmps = DC_BUILD_EMP_MAP_();
  checks.personalFileAccess = Object.keys(allEmps).map(function (code) {
    const emp = allEmps[code];
    let accessible = false;
    try { if (emp.PERSONAL_FILE_ID) { P1_OPEN_SS_(emp.PERSONAL_FILE_ID); accessible = true; } } catch (e) {}
    return { code: code, accessible: accessible, fileId: emp.PERSONAL_FILE_ID || "MISSING" };
  });
  checks.brokenFiles = checks.personalFileAccess.filter(function (x) { return !x.accessible && x.fileId !== "MISSING"; });
  checks.missingFiles = checks.personalFileAccess.filter(function (x) { return x.fileId === "MISSING"; });
  const master = (typeof GET_MASTER_ALL_ === 'function') ? GET_MASTER_ALL_() : [];
  checks.totalLeads = master.length;
  checks.breachedTAT = master.filter(function (r) { return String(r.TAT_STATUS || r.tat_status || "").toUpperCase() === "BREACHED"; }).length;
  checks.pendingDisbursal = master.filter(function (r) {
    return ["DISBURSE", "DISBURSED"].indexOf(String(r.CASE_CATEGORY || r.case_category || "").toUpperCase()) > -1 && !(r.DISBURSAL_NOTIFIED || r.disbursal_notified);
  }).length;
  checks.unassignedLeads = master.filter(function (r) { return !String(r.EMP_CODE || r.emp_code || "").trim(); }).length;
  checks.scriptProps = DC_CFG.PROPS.getProperties();
  checks.missingProps = ["TG_TOKEN", "META_WA_TOKEN", "META_WA_PHONE_ID", "DEEPSEEK_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"].filter(function (k) { return !checks.scriptProps[k]; });
  return checks;
}

function BULBHUL_GENERATE_ALERTS_(avatarReports, masterChecks) {
  const alerts = [];
  if (masterChecks.breachedTAT > 0) alerts.push("🚨 " + masterChecks.breachedTAT + " TAT breaches detected");
  if (masterChecks.unassignedLeads > 0) alerts.push("⚠️ " + masterChecks.unassignedLeads + " unassigned leads pending");
  if (masterChecks.brokenFiles && masterChecks.brokenFiles.length > 0) alerts.push("🔧 " + masterChecks.brokenFiles.length + " personal files inaccessible");
  if (masterChecks.missingProps && masterChecks.missingProps.length > 0) alerts.push("🔑 Missing API keys: " + masterChecks.missingProps.join(", "));
  (avatarReports || []).forEach(function (r) {
    if (r.tatBreaches > 0) alerts.push("⏰ " + r.name + " (" + r.code + ") has " + r.tatBreaches + " breached cases");
    if (r.missingFollowups > 0) alerts.push("📞 " + r.name + " (" + r.code + ") missing " + r.missingFollowups + " follow-ups");
    if (r.attendanceToday === "ABSENT") alerts.push("🏠 " + r.name + " (" + r.code + ") absent today");
  });
  return alerts;
}

function AVATAR_AGENT_(code) {
  const emp = FIND_EMP_(code);
  if (!emp) return { isActive: false, inactiveReason: "EMPLOYEE_NOT_FOUND" };
  if (!emp.PERSONAL_FILE_ID) return { isActive: false, inactiveReason: "NO_PERSONAL_FILE" };
  let ss;
  try { ss = P1_OPEN_SS_(emp.PERSONAL_FILE_ID); } catch (e) {
    return { isActive: false, inactiveReason: "FILE_INACCESSIBLE: " + e.message };
  }
  const roleKey = String(emp.ROLE || "STAFF").toUpperCase().trim();
  const deptKey = String(emp.DEPARTMENT || "").toUpperCase().trim();
  const skills = SKILL_LIBRARY_[roleKey] || SKILL_LIBRARY_[deptKey] || SKILL_LIBRARY_["STAFF"];
  const myCases = ss.getSheetByName("MY_CASES");
  const salesActivity = ss.getSheetByName("SALES_ACTIVITY");
  const hasData = (myCases && myCases.getLastRow() >= 2) || (salesActivity && salesActivity.getLastRow() >= 2);
  if (!hasData) return { isActive: false, inactiveReason: "NO_DATA_IN_PERSONAL_FILE" };

  const avatar = {
    isActive: true,
    code: code,
    name: emp.NAME,
    role: emp.ROLE,
    department: emp.DEPARTMENT,
    skills: skills,
    personalFileId: emp.PERSONAL_FILE_ID,
    runIntelligence: function () {
      const intel = {
        code: this.code, name: this.name, timestamp: new Date(),
        myCasesCount: 0, salesActivityCount: 0, tatBreaches: 0, missingFollowups: 0,
        todayTasks: 0, attendanceToday: "UNKNOWN", targetProgress: {}, knowledgeNudge: "",
        actionItems: [], pushMessage: ""
      };
      if (myCases && myCases.getLastRow() >= 2) {
        const mcData = myCases.getDataRange().getValues();
        const mcH = mcData[0].map(DC_NORM_);
        intel.myCasesCount = mcData.length - 1;
        mcData.slice(1).forEach(function (r) {
          const o = {}; mcH.forEach(function (k, i) { o[k] = r[i]; });
          if (String(o.TAT_STATUS || o.tat_status || "").toUpperCase() === "BREACHED") intel.tatBreaches++;
          const status = String(o.CASE_CATEGORY || o.case_category || "").toUpperCase();
          if (["OPEN", "INTERESTED", "CALLBACK"].indexOf(status) > -1) intel.missingFollowups++;
        });
      }
      if (salesActivity && salesActivity.getLastRow() >= 2) {
        const saData = salesActivity.getDataRange().getValues();
        intel.salesActivityCount = saData.length - 1;
        const today = Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd");
        saData.slice(1).forEach(function (r) {
          if (r[0] && Utilities.formatDate(new Date(r[0]), "Asia/Kolkata", "yyyy-MM-dd") === today) intel.todayTasks++;
        });
      }
      try {
        const attLog = SHEET_("ATTENDANCE_LOG");
        if (attLog && attLog.getLastRow() >= 2) {
          const attData = attLog.getDataRange().getValues();
          const attH = attData[0].map(DC_NORM_);
          const iD = attH.indexOf("DATE"), iC = attH.indexOf("EMP_CODE"), iS = attH.indexOf("ATTENDANCE_STATUS");
          const today = Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd");
          for (let i = 1; i < attData.length; i++) {
            if (Utilities.formatDate(new Date(attData[i][iD] || 0), "Asia/Kolkata", "yyyy-MM-dd") === today &&
                String(attData[i][iC] || "").trim().toUpperCase() === code) {
              intel.attendanceToday = String(attData[i][iS] || "ABSENT").toUpperCase();
              break;
            }
          }
        }
      } catch (_) {}
      if (this.skills && this.skills.skills && this.skills.skills.length) {
        intel.knowledgeNudge = this.skills.skills[Math.floor(Math.random() * this.skills.skills.length)];
      }
      if (intel.tatBreaches > 0) intel.actionItems.push("URGENT: " + intel.tatBreaches + " TAT breached cases");
      if (intel.missingFollowups > 0) intel.actionItems.push("FOLLOW-UP: " + intel.missingFollowups + " leads need follow-up");
      if (intel.attendanceToday === "ABSENT") intel.actionItems.push("ATTENDANCE: marked absent today");
      intel.pushMessage = this.buildPushMessage_(intel);
      this.pushToEmployee_(intel.pushMessage, emp);
      return intel;
    },
    buildPushMessage_: function (intel) {
      let msg = "👋 *Hi " + this.name + "! Your Avatar here.*\n\n";
      msg += "📊 *Today:* Cases " + intel.myCasesCount + " | Tasks " + intel.todayTasks + " | Att " + intel.attendanceToday + "\n\n";
      if (intel.actionItems.length) msg += "✅ *Actions:*\n" + intel.actionItems.map(function (x) { return "• " + x; }).join("\n") + "\n\n";
      if (intel.knowledgeNudge) msg += "💡 *Tip:* " + intel.knowledgeNudge + "\n\n";
      msg += "_Powered by Bulbhul AI_";
      return msg;
    },
    pushToEmployee_: function (message, employee) {
      try {
        if (employee.WHATSAPP && String(employee.WHATSAPP_VERIFIED || "").toUpperCase() === "YES") DC_SEND_WA_(employee.WHATSAPP, message);
        if (employee.TG_CHAT_ID) DC_SEND_TG_MESSAGE_(employee.TG_CHAT_ID, message);
        const log = GET_OR_CREATE_("AVATAR_ACTIVITY_LOG");
        P1_ENSURE_HEADERS_(log, ["TIMESTAMP", "CHAT_ID", "USER", "ACTION", "DETAILS", "CHANNEL", "EMP_CODE", "MOBILE"]);
        log.appendRow([new Date(), employee.TG_CHAT_ID || "", employee.NAME, "AVATAR_PUSH", String(message).slice(0, 500), "AVATAR", code, employee.WHATSAPP || ""]);
      } catch (_) {}
    }
  };
  return avatar;
}

function BULBHUL_MASTER_AGENT_() {
  const now = new Date();
  const allEmps = DC_BUILD_EMP_MAP_();
  const activeAvatars = [], inactiveAvatars = [], reports = [];
  Object.keys(allEmps).forEach(function (code) {
    const emp = allEmps[code];
    const avatar = AVATAR_AGENT_(code);
    if (avatar.isActive) {
      activeAvatars.push(avatar);
      const intel = avatar.runIntelligence();
      reports.push({ code: code, name: emp.NAME, role: emp.ROLE, dept: emp.DEPARTMENT, myCasesCount: intel.myCasesCount, todayTasks: intel.todayTasks, tatBreaches: intel.tatBreaches, missingFollowups: intel.missingFollowups, attendanceToday: intel.attendanceToday });
    } else {
      inactiveAvatars.push({ code: code, name: emp.NAME, reason: avatar.inactiveReason });
    }
  });
  const masterChecks = BULBHUL_MASTER_CHECKS_();
  const reportData = {
    timestamp: now, activeCount: activeAvatars.length, inactiveCount: inactiveAvatars.length,
    avatars: reports, master: masterChecks, alerts: BULBHUL_GENERATE_ALERTS_(reports, masterChecks)
  };
  try {
    const log = GET_OR_CREATE_("AVATAR_ACTIVITY_LOG");
    P1_ENSURE_HEADERS_(log, ["TIMESTAMP", "AVATAR_COUNT", "ACTIVE_COUNT", "INACTIVE_COUNT", "ALERTS", "MASTER_STATUS"]);
    log.appendRow([now, activeAvatars.length + inactiveAvatars.length, activeAvatars.length, inactiveAvatars.length, JSON.stringify(reportData.alerts.slice(0, 5)), "MASTER_SCAN_COMPLETE"]);
  } catch (_) {}
  if (now.getHours() >= 18) {
    try { EVENING_AVATAR_REPORT_(reportData); } catch (e) { LOG_ERR_("EVENING_AVATAR_REPORT_", "", e.message); }
  }
  return reportData;
}

function EVENING_AVATAR_REPORT_(reportData) {
  const today = Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd");
  let tgMsg = "📊 *EVENING AVATAR REPORT — " + today + "*\n\n";
  tgMsg += "👥 Active: " + reportData.activeCount + " | Inactive: " + reportData.inactiveCount + "\n";
  tgMsg += "📁 Leads: " + reportData.master.totalLeads + " | TAT breaches: " + reportData.master.breachedTAT + "\n";
  tgMsg += "💰 Pending disbursal: " + reportData.master.pendingDisbursal + " | Unassigned: " + reportData.master.unassignedLeads + "\n\n";
  if (reportData.alerts && reportData.alerts.length) tgMsg += "🚨 *Alerts:*\n" + reportData.alerts.slice(0, 10).join("\n") + "\n\n";
  tgMsg += "_Bulbhul Master Agent_";
  try { DC_SEND_TG_(tgMsg); } catch (_) {}
  try {
    if (MailApp.getRemainingDailyQuota() > 0) {
      MailApp.sendEmail({
        to: DC_CFG.COMPANY.MD_EMAIL, cc: DC_CFG.COMPANY.FOUNDER_EMAIL,
        subject: "[EVENING REPORT] Avatar System — " + today,
        body: tgMsg.replace(/\*/g, ""), name: "Bulbhul Master Agent"
      });
    }
  } catch (_) {}
  return { sent: true };
}

function AVATAR_KNOWLEDGE_PUSH_(code, topic) {
  const emp = FIND_EMP_(code);
  if (!emp) return { success: false, error: "Not found" };
  const roleKey = String(emp.ROLE || "STAFF").toUpperCase().trim();
  const skills = SKILL_LIBRARY_[roleKey] || SKILL_LIBRARY_["STAFF"];
  let msg = "📚 *Knowledge for " + emp.NAME + "*\nRole: " + skills.title + "\n\n";
  msg += "💡 *Skills:*\n" + skills.skills.slice(0, 6).map(function (s) { return "• " + s; }).join("\n") + "\n";
  try {
    if (emp.WHATSAPP && String(emp.WHATSAPP_VERIFIED || "").toUpperCase() === "YES") DC_SEND_WA_(emp.WHATSAPP, msg);
    if (emp.TG_CHAT_ID) DC_SEND_TG_MESSAGE_(emp.TG_CHAT_ID, msg);
  } catch (_) {}
  return { success: true };
}

function AVATAR_SCHEDULED_CHECK_() { return BULBHUL_MASTER_AGENT_(); }
function AVATAR_ON_DEMAND_(code) {
  const avatar = AVATAR_AGENT_(code);
  if (!avatar.isActive) return { active: false, reason: avatar.inactiveReason };
  return { active: true, intelligence: avatar.runIntelligence() };
}
function BULBHUL_COMMAND_AVATAR_(targetCode, command, params) {
  params = params || {};
  const avatar = AVATAR_AGENT_(targetCode);
  if (!avatar.isActive) return { success: false, error: avatar.inactiveReason };
  const cmd = String(command || "").toUpperCase();
  if (cmd === "PUSH") return { executed: true, intel: avatar.runIntelligence() };
  if (cmd === "KNOWLEDGE") return { executed: true, knowledge: AVATAR_KNOWLEDGE_PUSH_(targetCode, params.topic || "") };
  return { executed: false, error: "Unknown command" };
}
function INSTALL_AVATAR_SYSTEM_() {
  const ss = DC_GET_SS_();
  if (!ss.getSheetByName("AVATAR_ACTIVITY_LOG")) ss.insertSheet("AVATAR_ACTIVITY_LOG");
  P1_ENSURE_HEADERS_(ss.getSheetByName("AVATAR_ACTIVITY_LOG"), ["TIMESTAMP", "CHAT_ID", "USER", "ACTION", "DETAILS", "CHANNEL", "EMP_CODE", "MOBILE"]);
  if (!ss.getSheetByName("MIS_FINAL_REPORT")) ss.insertSheet("MIS_FINAL_REPORT");
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "AVATAR_SCHEDULED_CHECK_" || t.getHandlerFunction() === "BULBHUL_MASTER_AGENT_") {
      try { ScriptApp.deleteTrigger(t); } catch (_) {}
    }
  });
  ScriptApp.newTrigger("AVATAR_SCHEDULED_CHECK_").timeBased().everyHours(1).create();
  ScriptApp.newTrigger("BULBHUL_MASTER_AGENT_").timeBased().atHour(18).everyDays(1).create();
  return "✅ AVATAR SYSTEM INSTALLED";
}
function BULBHUL_MASTER_AGENT() { return BULBHUL_MASTER_AGENT_(); }
function AVATAR_AGENT(code) { return AVATAR_AGENT_(code); }
function AVATAR_KNOWLEDGE_PUSH(code, topic) { return AVATAR_KNOWLEDGE_PUSH_(code, topic); }
function AVATAR_SCHEDULED_CHECK() { return AVATAR_SCHEDULED_CHECK_(); }
function AVATAR_ON_DEMAND(code) { return AVATAR_ON_DEMAND_(code); }
function BULBHUL_COMMAND_AVATAR(targetCode, command, params) { return BULBHUL_COMMAND_AVATAR_(targetCode, command, params || {}); }
function INSTALL_AVATAR_SYSTEM() { return INSTALL_AVATAR_SYSTEM_(); }

// ═══════════════════════════════════════════════════════════════
//  REMAINING FEATURE FUNCTIONS — v12.2-AUTO ADDENDUM
// ═══════════════════════════════════════════════════════════════

// ─── ACCESS CHECK ────────────────────────────────────────────────
function P1_HAS_MASTER_ACCESS_(code) {
  try {
    const e = FIND_EMP_(code);
    if (!e) return false;
    const r = String(e.ROLE || "").toUpperCase();
    return r.includes("MD") || r.includes("FOUNDER") || r.includes("CFAO") || r.includes("ADMIN");
  } catch (_) { return false; }
}
function P1_HAS_MASTER_ACCESS(code) { return P1_HAS_MASTER_ACCESS_(code); }

// ─── ROLE-BASED SYSTEM PROMPT ────────────────────────────────────
function BULBHUL_GET_SYSTEM_PROMPT_(code) {
  try {
    const e = FIND_EMP_(code);
    const role = e ? String(e.ROLE || "").toUpperCase() : "";
    const name = e ? (e.NAME || code) : "User";
    if (role.includes("MD"))       return "You are BULBHUL, AI banker for MD " + name + " of Divyanshi Capital. Strategic, data-first. Full system access.";
    if (role.includes("FOUNDER"))  return "You are BULBHUL for Founder " + name + ". P&L, system health, governance.";
    if (role.includes("CFAO") || role.includes("ACCOUNTS")) return "You are BULBHUL for Accounts " + name + ". Disbursals, payout, ledger.";
    if (role.includes("MANAGER"))  return "You are BULBHUL for Sales Manager " + name + ". Team pipeline, targets, TAT breach alerts.";
    if (role.includes("HR"))       return "You are BULBHUL for HR " + name + ". Hiring, attendance, approvals, onboarding.";
    if (role.includes("SALES") || role.includes("RM")) return "You are BULBHUL for RM " + name + ". Convert leads: bank fitment, CIBIL, doc checklist.";
    return "You are BULBHUL, AI banker of Divyanshi Capital. Help " + name + " with loans and finance. Short, actionable replies in user language.";
  } catch (_) { return "You are BULBHUL. Reply in user language. Short, actionable."; }
}
function BULBHUL_GET_SYSTEM_PROMPT(code) { return BULBHUL_GET_SYSTEM_PROMPT_(code); }

// ─── HR REQUEST HANDLER ──────────────────────────────────────────
function P1_HR_REQUEST_HANDLER_(payload) {
  try {
    payload = payload || {};
    const s = GET_OR_CREATE_(DC_CFG.SHEETS.HR_APPROVAL);
    P1_ENSURE_HEADERS_(s, ["TIMESTAMP", "EMP_CODE", "EMP_NAME", "REQUEST_TYPE", "DETAILS", "STATUS", "APPROVED_BY"]);
    const e = FIND_EMP_(String(payload.empCode || "").trim().toUpperCase());
    s.appendRow([new Date(), payload.empCode || "", e ? (e.NAME || "") : "", payload.requestType || "GENERAL", payload.details || "", "PENDING", ""]);
    DC_SEND_TG_("📋 HR REQUEST\nEmp: " + (payload.empCode || "?") + " | " + (payload.requestType || "GENERAL") + "\n" + (payload.details || ""));
    return { ok: true, message: "HR request submitted. Pending approval." };
  } catch (err) { LOG_ERR_("P1_HR_REQUEST_HANDLER_", "HR", err.message); return { ok: false, err: err.message }; }
}

// ─── ICARD HANDLER ───────────────────────────────────────────────
function P1_ICARD_HANDLER_(payload) {
  try {
    payload = payload || {};
    const code = String(payload.empCode || "").trim().toUpperCase();
    if (!code) return { ok: false, err: "empCode required" };
    const e = FIND_EMP_(code);
    if (!e) return { ok: false, err: "Employee not found: " + code };
    const base = P1_EXEC_URL_();
    return {
      ok: true,
      icard: {
        empCode: code,
        name: e.NAME || "",
        role: e.ROLE || "",
        department: e.DEPARTMENT || "",
        email: e.EMAIL || "",
        mobile: e.MOBILE || "",
        whatsapp: e.WHATSAPP || "",
        avatarUrl: e.P1_AVATAR_URL || ("https://ui-avatars.com/api/?name=" + encodeURIComponent(e.NAME || code) + "&background=d4af37&color=0a2540&size=200"),
        company: DC_CFG.COMPANY.NAME,
        hasMasterAccess: P1_HAS_MASTER_ACCESS_(code),
        profileUrl: base + "?page=dashboard&emp=" + encodeURIComponent(code),
        formUrl: base + "?page=form&emp=" + encodeURIComponent(code)
      }
    };
  } catch (err) { return { ok: false, err: err.message }; }
}

/**
 * MALLIK TRIGGER STABILISER v2 – 2026-07-30
 * Latest safe technique: collect → delete (never mutate while iterating)
 * Full error handling + LockService + ERR logging
 * RUN: Select CLEAN_HIGH_ERROR_TRIGGERS_ → Run
 */
function SAFE_WRAPPER_(fnName, fn) {
  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(10000)) {
      console.warn('[SAFE] skipped (busy): ' + fnName);
      return { skipped: true, reason: 'busy' };
    }
    const result = fn();
    return { ok: true, result: result };
  } catch (e) {
    const msg = e.message || String(e);
    console.error('[SAFE] ' + fnName + ' → ' + msg);
    try { LOG_ERR_('SAFE_WRAPPER_', fnName, msg); } catch (_) {}
    return { ok: false, error: msg };
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function CLEAN_HIGH_ERROR_TRIGGERS_() {
  const BAD = new Set([
    'AGENT_DASHBOARD_SYNC',
    'MIS_TRIGGER_15MIN_',
    'DASHBOARD_SYNC_TRIGGER_ENGINE',
    'SEND_EVENING_MIS_REPORT_',
    'HR_DAILY_ONBOARDING_FOLLOWUP_',
    'DASHBOARD_MASTER_EDIT_WATCHER'
  ]);

  const result = {
    found: 0,
    deleted: 0,
    failed: 0,
    details: [],
    timestamp: new Date().toISOString()
  };

  try {
    // 1. Snapshot all triggers first (safe)
    const allTriggers = ScriptApp.getProjectTriggers() || [];
    if (!allTriggers.length) {
      return 'CLEANED 0 – no triggers found.';
    }

    // 2. Collect only the bad ones (never delete while iterating)
    const toDelete = allTriggers.filter(function(t) {
      try {
        return BAD.has(t.getHandlerFunction());
      } catch (_) {
        return false;
      }
    });

    result.found = toDelete.length;

    // 3. Delete one by one with individual try-catch
    toDelete.forEach(function(t) {
      let name = 'UNKNOWN';
      try {
        name = t.getHandlerFunction();
        ScriptApp.deleteTrigger(t);
        result.deleted++;
        result.details.push('✓ ' + name);
        console.log('[CLEAN] deleted → ' + name);
      } catch (err) {
        result.failed++;
        const msg = err.message || String(err);
        result.details.push('✗ ' + name + ' | ' + msg);
        console.error('[CLEAN] failed → ' + name + ': ' + msg);
        try { LOG_ERR_('CLEAN_HIGH_ERROR_TRIGGERS_', name, msg); } catch (_) {}
      }
    });

  } catch (fatal) {
    const msg = fatal.message || String(fatal);
    console.error('[CLEAN] FATAL: ' + msg);
    try { LOG_ERR_('CLEAN_HIGH_ERROR_TRIGGERS_', 'FATAL', msg); } catch (_) {}
    return 'CLEAN FAILED: ' + msg;
  }

  const summary = 'CLEANED ' + result.deleted + '/' + result.found +
                  (result.failed ? ' (' + result.failed + ' failed)' : '') +
                  ' high-error triggers. P1 untouched.';

  console.log('[CLEAN] ' + summary);
  if (result.details.length) {
    console.log(result.details.join('\n'));
  }

  // Optional: store last clean result for audit
  try {
    PropertiesService.getScriptProperties()
      .setProperty('LAST_TRIGGER_CLEAN', JSON.stringify(result));
  } catch (_) {}

  return summary;
}
