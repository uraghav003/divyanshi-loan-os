// @ts-nocheck
/******************************************************************
 * DIVYANSHI CAPITAL PVT LTD
 * Code.gs — BULBHUL V2 PRODUCTION MASTER
 * VERSION : V9.3.0-FAST
 * ARCHITECT: Mallik System (DC002) / BULBHUL AI
 *
 * PERFORMANCE LAYER:
 *  ① In-memory cache  — DC_EMP_CACHE_, HEADER_CACHE_, ROUTING_CACHE_
 *  ② ScriptCache      — EMP_MAP (10m), SOURCE_MAP (6h), PRODUCTS (1h),
 *                        BANKS (1h), AI_CTX per empCode (10m),
 *                        MASTER_SNAP (3m)
 *  ③ Batch writes     — UPSERT_BATCH_ helper
 *  ④ Deferred sync    — personal-file writes outside lock; onEdit lightweight
 *
 * DATA FLOW:
 *  Form/API/Gmail → COMMON_ENTRY → SMART_LOG → MASTER_DATA
 *  → Personal File MY_CASES (view-only, locked) → Notifications
 *  → ACCOUNTS_LOG on DISBURSE → Attendance counter
 *
 * AI : DeepSeek → OpenAI → Gemini → fallback
 * MALLIK_API_KEY ,Master SS: 1Mk9AzGdKK07WZCKV6lZgtlM4JWy2sdESQwh70r0UicU
 ******************************************************************/

/* ================================================================
   SECTION 01 — GLOBALS + SCHEMAS
   ================================================================ */

const MASTER_SS_ID = '1Mk9AzGdKK07WZCKV6lZgtlM4JWy2sdESQwh70r0UicU';

// ── In-memory caches (survive for one execution) ──
let DC_EMP_CACHE_     = null;   // employee map
let ROUTING_CACHE_    = null;   // source → data_flow map
let PRODUCTS_CACHE_   = null;   // loan products
let BANKS_CACHE_      = null;   // bank options
const HEADER_CACHE_   = {};     // sheetName → headers array

// ── ScriptCache reference ──
const SC_ = CacheService.getScriptCache();

// ── Generic cache helper ──
function CACHED_GET_(key, ttlSeconds, fn) {
  const hit = SC_.get(key);
  if (hit) { try { return JSON.parse(hit); } catch (_) {} }
  const val = fn();
  try { SC_.put(key, JSON.stringify(val), ttlSeconds); } catch (_) {}
  return val;
}

// ── Invalidate all caches ──
function INVALIDATE_ALL_CACHES_() {
  DC_EMP_CACHE_ = null; ROUTING_CACHE_ = null;
  PRODUCTS_CACHE_ = null; BANKS_CACHE_ = null;
  Object.keys(HEADER_CACHE_).forEach(k => delete HEADER_CACHE_[k]);
  const keys = ['EMP_MAP_V3','SRC_ROUTING_V1','LOAN_PRODUCTS_V1','BANK_OPTIONS_V1','MASTER_SNAP_V1'];
  SC_.removeAll(keys);
}

const P1_TAB_MAP = {
  MASTER_DATA:    () => ['TIMESTAMP','EMP_CODE','SALES_NAME','EMPLOYEE_EMAIL',
    'CLIENT_MOBILE','CLIENT_NAME','COMPANY_NAME','CITY_LOCATION','LOAN_TYPE',
    'CASE_CATEGORY','CIBIL_SCORE','REMARKS','FOLLOWUP_STATUS','PREFERRED_BANK',
    'REQUIRED_LOAN_AMOUNT','DOCS_LINK','SUBMIT_FOLDER_LINK','SOURCE_TYPE',
    'SOURCE_NAME','DATA_FLOW','INTAKE_STAGE','ROUTE_STAGE','PROCESS_STAGE',
    'LOGIN_STAGE','LEAD_ID','TAT_DAYS','TAT_DEADLINE','TAT_STATUS',
    'ELIGIBILITY_STATUS','ELIGIBLE_AMOUNT','MANAGER_EMAIL',
    'ASSIGNED_COORDINATOR','DISBURSAL_NOTIFIED','LAST_UPDATED'],
  COMMON_ENTRY:   () => ['TIMESTAMP','CLIENT_NAME','CLIENT_MOBILE','CLIENT_EMAIL',
    'CITY_LOCATION','PAN_NO','EMPLOYMENT_TYPE','COMPANY_NAME','MONTHLY_INCOME',
    'EXISTING_EMI','AGE','CIBIL_SCORE','LOAN_TYPE','PREFERRED_BANK',
    'REQUIRED_LOAN_AMOUNT','DOCS_LINK','TASK_CATEGORY','CASE_CATEGORY',
    'REMARKS','EMP_CODE','SALES_NAME','MANAGER_EMAIL','SOURCE_TYPE',
    'SOURCE_NAME','DATA_FLOW','LEAD_ID','INTAKE_STAGE','ROUTE_STAGE',
    'PROCESS_STAGE','LOGIN_STAGE'],
  ALL_EMPLOYEES:  () => ['BRAND_NAME','BRANCH','EMP_CODE','EMPLOYEES_NAME','ROLE',
    'DEPARTMENT','LOAN_TYPE','BANK','TARGET','EMPLOYEE_EMAIL_ID','ALT_EMAIL',
    'MOBILE','PASSWORD','HR_APPROVAL','MD_APPROVAL','MANAGER_NAME',
    'MANAGER_EMAIL_ID','REGION','REPORTING_HEAD','ESCALATION_L1',
    'APPROVAL_STATUS','REMARKS','PERSONAL_FILE_ID','ACCESS_LEVEL',
    'JOINING_DATE','ACTIVE_STATUS','CREATED_AT','UPDATED_AT','SYSTEM_KEY',
    'LOGIN_ACCESS','WHATSAPP_VERIFIED','STAFF_URL','P1_WEBSITE_URL',
    'P1_SMART_FORM_URL','P1_DIGITAL_CARD_URL','P1_DASHBOARD_URL',
    'P1_CALLING_URL','P1_VOICE_URL','P1_QR_TEXT','P1_AVATAR_URL',
    'P1_PERSONAL_FILE_URL','P1_SYNC_STATUS','P1_LAST_SYNC_AT',
    'TELEGRAM_CHAT_ID','TELEGRAM_USERNAME','TELEGRAM_STATUS'],
  SMART_LOG:      () => ['TIMESTAMP','SOURCE_TYPE','SOURCE_NAME','DATA_FLOW',
    'LEAD_ID','CLIENT_NAME','CLIENT_MOBILE','PREFERRED_BANK','CASE_CATEGORY',
    'EMP_CODE','SALES_NAME','MANAGER_EMAIL','REMARKS','TAT_STATUS'],
  SOURCE_NAME:    () => ['SOURCE_NAME','DATA_FLOW','ACTIVE'],
  MIS_LOG:        () => ['TIMESTAMP','LEAD_ID','EMP_CODE','CLIENT_NAME',
    'CLIENT_MOBILE','ROUTING_STATUS','DATA_FLOW','PERSONAL_FILE_SYNC','REMARKS'],
  ATTENDANCE_LOG: () => ['DATE','LOG_KEY','EMP_CODE','EMP_NAME','DEPARTMENT',
    'ROLE','CALLS_TODAY','FIRST_PUNCH','ATTENDANCE_STATUS','LAST_UPDATED'],
  ACCOUNTS_LOG:   () => ['TIMESTAMP','LEAD_ID','CLIENT_NAME','CLIENT_MOBILE',
    'LOAN_TYPE','REQUIRED_LOAN_AMOUNT','PREFERRED_BANK','SALES_NAME',
    'EMP_CODE','DISBURSAL_STATUS','REMARKS'],
  HR_MD_APPROVAL: () => ['TIMESTAMP','EMPLOYEES_NAME','EMPLOYEE_EMAIL_ID',
    'MOBILE','DEPARTMENT','ROLE','EMP_CODE','MANAGER_NAME','MANAGER_EMAIL_ID',
    'STATUS','ONBOARD_DONE','REMARKS'],
  Loan_Bank_Map:  () => ['LOAN_TYPE','BANK','STATUS','ROI_START','MIN_CIBIL',
    'MIN_INCOME','MAX_LOAN_AMOUNT','DOCUMENTS_REQUIRED','POLICY_REMARKS','TAT_DAYS'],
  RAW_INBOX:      () => ['RECEIVED_AT','GMAIL_MSG_ID','FROM_EMAIL','SUBJECT',
    'LEAD_ID','CLIENT_NAME','CLIENT_MOBILE','PREFERRED_BANK','LOAN_TYPE',
    'REQUIRED_LOAN_AMOUNT','CASE_STATUS','REMARKS','SOURCE_NAME','EMP_CODE',
    'PROCESS_STATUS','DEDUP_ACTION','PROCESSED_AT'],
  ERR:            () => ['TIMESTAMP','FUNCTION','CODE','MESSAGE']
};

const DC_CFG = {
  get DEEPSEEK_KEY()     { return String(PropertiesService.getScriptProperties().getProperty('DEEPSEEK_API_KEY')||'').trim(); },
  get OPENAI_KEY()       { return String(PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY')||'').trim(); },
  get GEMINI_KEY()       { return String(PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY')||'').trim(); },
  get TG_TOKEN()         { return String(PropertiesService.getScriptProperties().getProperty('TG_TOKEN')||'').trim(); },
  get META_WA_TOKEN()    { return String(PropertiesService.getScriptProperties().getProperty('META_WA_TOKEN')||'').trim(); },
  get META_WA_PHONE_ID() { return String(PropertiesService.getScriptProperties().getProperty('META_WA_PHONE_ID')||'').trim(); },
  get API_KEY()          { return String(PropertiesService.getScriptProperties().getProperty('MALLIK_API_KEY')||'').trim(); },

  COMPANY: {
    NAME:           'Divyanshi Capital Pvt Ltd',
    MD_EMAIL:       'upendra.raghav@divyanshicapital.com',
    FOUNDER_EMAIL:  'narendraraghav@divyanshicapital.com',
    HR_EMAIL:       'khushboo.divyanshicapital@gmail.com',
    ACCOUNTS_EMAIL: 'accounts@divyanshicapital.com',
    SUPPORT_EMAIL:  'support@divyanshicapital.com'
  }
};

/* ================================================================
   SECTION 02 — NORMALIZERS + HELPERS
   ================================================================ */

const HEADER_ALIAS_ = {
  'EMPOLYEES_NAME':'EMPLOYEES_NAME','EMPLOYEE_NAME':'EMPLOYEES_NAME',
  'STAFF_NAME':'EMPLOYEES_NAME','EMPLOYEE_EMAIL_ID':'EMPLOYEE_EMAIL',
  'OFFICIAL_EMAIL':'EMPLOYEE_EMAIL','EMAIL_ID':'EMPLOYEE_EMAIL',
  'EMPLOYEE_CODE':'EMP_CODE','EMPLOYEE_ID':'EMP_CODE',
  'FILE_ID':'PERSONAL_FILE_ID','MANAGER_EMAIL_ID':'MANAGER_EMAIL',
  'PHONE':'CLIENT_MOBILE','CUSTOMER_NAME':'CLIENT_NAME','FULL_NAME':'CLIENT_NAME',
  'PRODUCT':'LOAN_TYPE','BANK':'PREFERRED_BANK','BANK_NAME':'PREFERRED_BANK',
  'AMOUNT':'REQUIRED_LOAN_AMOUNT','LOAN_AMOUNT':'REQUIRED_LOAN_AMOUNT',
  'COMMENT':'REMARKS','REMARK':'REMARKS','STATUS':'CASE_CATEGORY',
  'CASE_STATUS':'CASE_CATEGORY','CIBIL':'CIBIL_SCORE','CREDIT_SCORE':'CIBIL_SCORE',
  'CITY':'CITY_LOCATION','COMPANY':'COMPANY_NAME','DESIGNATION':'ROLE',
  'DEPT':'DEPARTMENT','WHATSAPP_NO':'WHATSAPP_VERIFIED','WHATSAPP':'WHATSAPP_VERIFIED'
};

const DC_NORM_CACHE_ = {};
function DC_NORM_(v) {
  if (!v) return '';
  if (DC_NORM_CACHE_[v]) return DC_NORM_CACHE_[v];
  const key = String(v).trim().toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'');
  const result = HEADER_ALIAS_[key] || key;
  DC_NORM_CACHE_[v] = result;
  return result;
}

function DC_CLEAN_MOBILE_(v) { return String(v||'').replace(/\D/g,'').slice(-10); }
function DC_CLEAN_EMAIL_(v)  { return String(v||'').trim().toLowerCase(); }
function SAFE_TXT_(v)        { return String(v||'').trim(); }

/* ================================================================
   SECTION 03 — SPREADSHEET ACCESS
   ================================================================ */

let SS_INSTANCE_ = null;
function DC_GET_SS_() {
  if (SS_INSTANCE_) { try { SS_INSTANCE_.getId(); return SS_INSTANCE_; } catch(_){ SS_INSTANCE_=null; } }
  if (MASTER_SS_ID && MASTER_SS_ID.length > 20) {
    try {
      SS_INSTANCE_ = SpreadsheetApp.openById(MASTER_SS_ID);
      PropertiesService.getScriptProperties().setProperty('MASTER_FILE_ID', MASTER_SS_ID);
      return SS_INSTANCE_;
    } catch(_){}
  }
  try { const a = SpreadsheetApp.getActiveSpreadsheet(); if (a) { SS_INSTANCE_=a; return a; } } catch(_){}
  const id = PropertiesService.getScriptProperties().getProperty('MASTER_FILE_ID')||'';
  if (id) { SS_INSTANCE_ = SpreadsheetApp.openById(id); return SS_INSTANCE_; }
  throw new Error('Cannot open Master Sheet. Set MASTER_SS_ID in Code.gs');
}

const SHEET_CACHE_ = {};
function SHEET_(name) {
  if (SHEET_CACHE_[name]) { try { SHEET_CACHE_[name].getName(); return SHEET_CACHE_[name]; } catch(_){ delete SHEET_CACHE_[name]; } }
  try { const sh = DC_GET_SS_().getSheetByName(name); SHEET_CACHE_[name] = sh; return sh; } catch(_){ return null; }
}

function GET_OR_CREATE_(name) {
  const sh = SHEET_(name);
  if (sh) return sh;
  const newSh = DC_GET_SS_().insertSheet(name);
  SHEET_CACHE_[name] = newSh;
  return newSh;
}

function P1_GET_OR_CREATE_SHEET_(name) { return GET_OR_CREATE_(name); }

function P1_OPEN_SS_SAFE_(fileId) {
  for (let i = 1; i <= 2; i++) {   // reduced to 2 retries (was 3)
    try { return SpreadsheetApp.openById(fileId); }
    catch (e) { if (i < 2) Utilities.sleep(1000); else throw e; }
  }
}

function P1_GET_EXEC_URL_() {
  const p = PropertiesService.getScriptProperties();
  let url = p.getProperty('P1_EXEC_URL') || p.getProperty('MAIN_SERVER_EXEC_URL') || '';
  if (!url) { try { url = ScriptApp.getService().getUrl(); } catch(_){} }
  // Never hand out a /dev URL — only the script owner/editors can open it,
  // so every generated employee link (website, form, card, calling, voice)
  // would silently fail for regular staff. Always normalize to /exec.
  url = String(url || '').replace(/\/dev(\?|$)/, '/exec$1');
  return url || '';
}

/* ================================================================
   SECTION 04 — HEADER MANAGEMENT (cached)
   ================================================================ */

function P1_ENSURE_HEADERS_(sh, headers) {
  if (!sh) throw new Error('P1_ENSURE_HEADERS_: sheet is null');
  const name = sh.getParent().getId() + ':' + sh.getSheetId();

  // ① In-memory hit — fastest path
  if (HEADER_CACHE_[name] && HEADER_CACHE_[name].length >= headers.length) {
    return HEADER_CACHE_[name];
  }

  // ② New sheet — write headers and return
  if (sh.getLastRow() === 0) {
    sh.appendRow(headers);
    styleHeaderRow_(sh, headers.length);
    sh.setFrozenRows(1);
    HEADER_CACHE_[name] = headers.slice();
    return HEADER_CACHE_[name];
  }

  // ③ Existing sheet — check and add missing columns in one batch
  const lc      = Math.max(sh.getLastColumn(), 1);
  const current = sh.getRange(1, 1, 1, lc).getValues()[0].map(h => String(h||'').trim());
  const norm    = current.map(DC_NORM_);
  const toAdd   = [];

  headers.forEach(h => {
    if (norm.indexOf(DC_NORM_(h)) === -1) { current.push(h); norm.push(DC_NORM_(h)); toAdd.push(h); }
  });

  if (toAdd.length) {
    const startCol = lc + 1;
    sh.getRange(1, startCol, 1, toAdd.length).setValues([toAdd]);
  }
  sh.setFrozenRows(1);
  styleHeaderRow_(sh, sh.getLastColumn());

  HEADER_CACHE_[name] = current;
  return current;
}

function styleHeaderRow_(sh, lc) {
  if (lc < 1) return;
  sh.getRange(1, 1, 1, lc).setBackground('#0b5394').setFontColor('#ffffff').setFontWeight('bold');
}

function P1_VAL_(obj, header) {
  const n = DC_NORM_(header);
  for (const k of Object.keys(obj)) { if (DC_NORM_(k) === n) return obj[k]; }
  return '';
}

function P1_BUILD_ROW_(headers, obj) { return headers.map(h => P1_VAL_(obj, h)); }

function UPSERT_BY_KEY_(sh, keyHeader, rowObj, headers) {
  const aH   = P1_ENSURE_HEADERS_(sh, headers);
  const nH   = aH.map(DC_NORM_);
  const kIdx = nH.indexOf(DC_NORM_(keyHeader));
  const kVal = String(P1_VAL_(rowObj, keyHeader)||'').trim();
  const row  = P1_BUILD_ROW_(aH, rowObj);
  if (kIdx === -1 || !kVal) { sh.appendRow(row); return sh.getLastRow(); }
  const lr   = sh.getLastRow();
  if (lr >= 2) {
    const vals = sh.getRange(2, kIdx+1, lr-1, 1).getValues();
    for (let i = 0; i < vals.length; i++) {
      if (String(vals[i][0]||'').trim() === kVal) {
        sh.getRange(i+2, 1, 1, aH.length).setValues([row]); return i+2;
      }
    }
  }
  sh.appendRow(row); return sh.getLastRow();
}

/* ================================================================
   SECTION 05 — ERROR LOGGING
   ================================================================ */

function LOG_ERR_(func, code, msg) {
  try {
    const sh = GET_OR_CREATE_('ERR');
    P1_ENSURE_HEADERS_(sh, P1_TAB_MAP.ERR());
    sh.appendRow([new Date(), func||'', code||'', String(msg||'').slice(0,1000)]);
  } catch(_){}
}

/* ================================================================
   SECTION 06 — EMPLOYEE ENGINE (ScriptCache + in-memory)
   ================================================================ */

function DC_BUILD_EMP_MAP_(forceRefresh) {
  if (!forceRefresh) {
    if (DC_EMP_CACHE_) return DC_EMP_CACHE_;
    const cached = SC_.get('EMP_MAP_V3');
    if (cached) { try { DC_EMP_CACHE_ = JSON.parse(cached); return DC_EMP_CACHE_; } catch(_){} }
  }

  const sh = SHEET_('ALL_EMPLOYEES');
  if (!sh || sh.getLastRow() < 2) { DC_EMP_CACHE_ = {}; return {}; }
  const data    = sh.getDataRange().getValues();
  const headers = data[0].map(DC_NORM_);
  const out     = {};

  for (let i = 1; i < data.length; i++) {
    const row = data[i], obj = {};
    headers.forEach((k, idx) => { obj[k] = row[idx]; });
    const empCode = String(obj['EMP_CODE']||'').trim().toUpperCase();
    if (!empCode) continue;
    obj.EMP_CODE         = empCode;
    obj.SYSTEM_KEY       = String(obj['SYSTEM_KEY']||empCode).trim().toUpperCase();
    obj.NAME             = String(obj['EMPLOYEES_NAME']||obj['EMPLOYEE_NAME']||'').trim();
    obj.MOBILE           = DC_CLEAN_MOBILE_(obj['MOBILE']||obj['PHONE']||'');
    obj.WHATSAPP         = DC_CLEAN_MOBILE_(obj['WHATSAPP_VERIFIED']||obj['WHATSAPP_NO']||obj['MOBILE']||'');
    obj.EMAIL            = DC_CLEAN_EMAIL_(obj['EMPLOYEE_EMAIL']||obj['EMPLOYEE_EMAIL_ID']||'');
    obj.MANAGER_EMAIL    = DC_CLEAN_EMAIL_(obj['MANAGER_EMAIL']||obj['MANAGER_EMAIL_ID']||'');
    obj.MANAGER_EMAIL_ID = obj.MANAGER_EMAIL;
    obj.REPORTING_HEAD   = String(obj['REPORTING_HEAD']||'').trim();
    obj.ROLE             = String(obj['ROLE']||'').trim();
    obj.DEPARTMENT       = String(obj['DEPARTMENT']||'').trim().toUpperCase();
    obj.LOAN_TYPE        = String(obj['LOAN_TYPE']||'').trim().toUpperCase();
    obj.BANK = String(obj['PREFERRED_BANK']||obj['BANK']||'').trim().toUpperCase();
    obj.PERSONAL_FILE_ID = String(obj['PERSONAL_FILE_ID']||obj['FILE_ID']||'').trim();
    obj.ACTIVE_STATUS    = String(obj['ACTIVE_STATUS']||'YES').toUpperCase();
    obj.DASHBOARD_ACCESS = String(obj['ACCESS_LEVEL']||obj['ROLE']||'STAFF').toUpperCase();
    obj.PROFILE_PIC      = obj['P1_AVATAR_URL']||'';
    obj.TG_CHAT_ID       = String(obj['TELEGRAM_CHAT_ID']||'').trim();
    obj.ROW_NUM          = i+1;
    if (obj.ACTIVE_STATUS==='NO'||obj.ACTIVE_STATUS==='INACTIVE') continue;
    if (out[empCode]) {
      const ex = out[empCode];
      Object.keys(obj).forEach(k => { if((ex[k]===''||ex[k]===null||ex[k]===undefined)&&obj[k]) ex[k]=obj[k]; });
    } else { out[empCode] = obj; }
  }

  try { SC_.put('EMP_MAP_V3', JSON.stringify(out), 600); } catch(_){}
  DC_EMP_CACHE_ = out;
  return out;
}

function CLEAR_EMP_CACHE_() {
  DC_EMP_CACHE_ = null;
  SC_.remove('EMP_MAP_V3');
}

function FIND_EMPLOYEE_FULL_(query) {
  const map = DC_BUILD_EMP_MAP_();
  const q   = String(query||'').trim().toUpperCase();
  if (!q) return null;
  if (map[q]) return map[q];
  const ql = q.toLowerCase();
  for (const code of Object.keys(map)) {
    const e = map[code];
    if (e.EMAIL === ql) return e;
    if (String(e.NAME||'').toUpperCase() === q) return e;
    if (e.MOBILE && e.MOBILE === DC_CLEAN_MOBILE_(q)) return e;
    if (e.TG_CHAT_ID && e.TG_CHAT_ID === q) return e;
  }
  return null;
}

/* ================================================================
   SECTION 07 — SOURCE ROUTING (ScriptCache 6h)
   ================================================================ */

function GET_SOURCE_ROUTING_MAP_() {
  if (ROUTING_CACHE_) return ROUTING_CACHE_;
  ROUTING_CACHE_ = CACHED_GET_('SRC_ROUTING_V1', 21600, () => {
    try {
      const sh = SHEET_('SOURCE_NAME');
      if (!sh || sh.getLastRow() < 2) return DEFAULT_ROUTING_MAP_();
      const data = sh.getDataRange().getValues();
      const h    = data[0].map(DC_NORM_);
      const iN   = h.indexOf('SOURCE_NAME'), iF = h.indexOf('DATA_FLOW');
      if (iN===-1||iF===-1) return DEFAULT_ROUTING_MAP_();
      const map = Object.assign({}, DEFAULT_ROUTING_MAP_());
      for (let r=1; r<data.length; r++) {
        const n = String(data[r][iN]||'').trim().toUpperCase();
        const f = String(data[r][iF]||'SALES').trim().toUpperCase();
        if (n) map[n] = f;
      }
      return map;
    } catch(e){ LOG_ERR_('GET_SOURCE_ROUTING_MAP','',e.message); return DEFAULT_ROUTING_MAP_(); }
  });
  return ROUTING_CACHE_;
}

function DEFAULT_ROUTING_MAP_() {
  return {
    'SALES TEAM':'SALES','MANUAL CALLING':'SALES','AI AUTO CALLING':'SALES',
    'WHATSAPP':'SALES','WEBSITE':'SALES','REFERRAL':'SALES','WALK-IN':'SALES',
    'INSTAGRAM':'SALES','FACEBOOK':'SALES','LINKEDIN':'SALES',
    'EMAIL CAMPAIGN':'SALES','BANK REFERRAL':'SALES','GODIAL AUTO CALLING':'SALES',
    'P1_SMART_FORM':'SALES','WEB_APP':'SALES','GOOGLE_FORM':'SALES',
    'DSA':'LOGIN DEPARTMENT','SEND TO LOGIN':'LOGIN DEPARTMENT',
    'COMPLETED':'LOGIN DEPARTMENT','LOGIN DONE':'LOGIN DEPARTMENT',
    'MIS-INCOMING':'REPORT','MIS UPDATE':'REPORT',
    'ONBOARD':'HR','INTERVIEW':'HR'
  };
}

/* ================================================================
   SECTION 08 — AI MEMORY (ScriptCache 10min per empCode)
   ================================================================ */

function BUILD_AI_CONTEXT_(empCode) {
  const cKey = 'AI_CTX_' + (String(empCode||'ANON').toUpperCase().slice(0,10));
  return CACHED_GET_(cKey, 600, () => {
    let ctx = '';
    try {
      const map = DC_BUILD_EMP_MAP_();
      const emp = empCode ? map[String(empCode).trim().toUpperCase()] : null;
      if (emp) {
        ctx += '[SENDER]\n';
        ctx += `Name:${emp.NAME} | Code:${emp.EMP_CODE} | Role:${emp.ROLE}\n`;
        ctx += `Dept:${emp.DEPARTMENT} | Mgr:${emp.MANAGER_EMAIL}\n\n`;
      }
      const codes = Object.keys(map).slice(0,20);
      if (codes.length) {
        ctx += '[TEAM]\n';
        codes.forEach(c=>{ const e=map[c]; ctx+=`${e.EMP_CODE}:${e.NAME}(${e.ROLE||'RM'}) Mgr:${e.MANAGER_EMAIL}\n`; });
        ctx += '\n';
      }
      const products = GET_ACTIVE_LOAN_PRODUCTS_();
      if (products.length) {
        ctx += '[PRODUCTS]\n';
        products.forEach(p => { ctx+=`${p.name}(${p.code}):ROI${p.roi}% TAT${p.tat}d Banks:${(p.banks||[]).slice(0,5).join(',')}\n`; });
        ctx += '\n';
      }
      const routing = GET_SOURCE_ROUTING_MAP_();
      ctx += '[ROUTING]\n';
      Object.entries(routing).slice(0,12).forEach(([s,f])=>{ ctx+=`${s}→${f}\n`; });
      ctx += `\n[GOV] MD:${DC_CFG.COMPANY.MD_EMAIL} Founder:${DC_CFG.COMPANY.FOUNDER_EMAIL}\nMoney/HR=MD+Founder approval only.`;
    } catch(e){ ctx += '[CTX ERR:'+e.message+']\n'; }
    return ctx.slice(0, 3000);
  });
}

/* ================================================================
   SECTION 09 — AI BRAIN (DeepSeek → OpenAI → Gemini → fallback)
   ================================================================ */

function MULTI_BRAIN_REPLY_(prompt, systemContent) {
  const opts = (key, url, body) => ({
    method:'post', muteHttpExceptions:true,
    headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'},
    payload:JSON.stringify(body)
  });
  const dKey=DC_CFG.DEEPSEEK_KEY, oKey=DC_CFG.OPENAI_KEY, gKey=DC_CFG.GEMINI_KEY;
  const msgs = [{ role:'system', content:systemContent },{ role:'user', content:prompt }];

  if (dKey) {
    try {
      const res = UrlFetchApp.fetch('https://api.deepseek.com/v1/chat/completions', opts(dKey,'',{model:'deepseek-chat',messages:msgs,temperature:0.3,max_tokens:900}));
      if (res.getResponseCode()===200) { const j=JSON.parse(res.getContentText()||'{}'); if(j.choices?.[0]?.message?.content) return String(j.choices[0].message.content).trim(); }
    } catch(e){ LOG_ERR_('AI_DS','',e.message); }
  }
  if (oKey) {
    try {
      const res = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', opts(oKey,'',{model:'gpt-4o-mini',messages:msgs,temperature:0.3,max_tokens:900}));
      if (res.getResponseCode()===200) { const j=JSON.parse(res.getContentText()||'{}'); if(j.choices?.[0]?.message?.content) return String(j.choices[0].message.content).trim(); }
    } catch(e){ LOG_ERR_('AI_OAI','',e.message); }
  }
  if (gKey) {
    try {
      const res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key='+gKey, {method:'post',contentType:'application/json',muteHttpExceptions:true,payload:JSON.stringify({contents:[{role:'user',parts:[{text:'System:\n'+systemContent+'\n\nUser:\n'+prompt}]}],generationConfig:{temperature:0.3,maxOutputTokens:900}})});
      if (res.getResponseCode()===200) { const j=JSON.parse(res.getContentText()||'{}'); if(j.candidates?.[0]?.content?.parts?.[0]?.text) return String(j.candidates[0].content.parts[0].text).trim(); }
    } catch(e){ LOG_ERR_('AI_GEM','',e.message); }
  }
  return 'Namaste! Bulbhul active hai. Loan, bank options, case status ke liye message karein.';
}

/* ================================================================
   SECTION 10 — BULBHUL AVATAR BRAIN + AUTO-COMMANDS
   ================================================================ */

const BULBHUL_ROLE_PROMPTS_ = {
  'MD'           :'You are BULBHUL for MD Upendra Singh Raghav (DC002). Full portfolio. Strategic data-first.',
  'FOUNDER'      :'You are BULBHUL for Founder Narendra (DC001). P&L, key accounts, system health.',
  'SALES MEMBER' :'You are BULBHUL for Sales RM. Lead conversion: bank fitment, CIBIL tips, doc checklist.',
  'SALES MANAGER':'You are BULBHUL for Sales Manager. Team pipeline, follow-ups, disbursal targets.',
  'COORDINATOR'  :'You are BULBHUL for Login Coordinator. Bank login, TAT gaps, doc status.',
  'ACCOUNTS'     :'You are BULBHUL for Accounts (Sachin DC037). Disbursals, PF/PDD, payments.',
  'HR'           :'You are BULBHUL for HR Head Khushboo (DC013). Hiring, attendance, onboarding.'
};

/* Employee-card personas: the bot reflects the employee's real role/department,
   but stays advisory and never exposes internal records or makes decisions. */
function P1_EMPLOYEE_PERSONA_(emp) {
  const role=String((emp&&emp.ROLE)||'').toUpperCase();
  const dept=String((emp&&emp.DEPARTMENT)||'').toUpperCase();
  const label=String((emp&&emp.NAME)||'Divyanshi Capital');
  if(role.includes('HR')||dept.includes('HR')||dept.includes('HUMAN RESOURCE')) return {
    title:label+'\'s Hiring Assistant',
    greeting:'Namaste! Main Bulbhul hoon, '+label+' ke HR desk se. Jobs, hiring process, interview preparation aur application steps ke baare mein poochiye.',
    instruction:'You support prospective candidates for HR and hiring. Explain available hiring/application steps only from approved knowledge, suggest a formal application or HR follow-up, and never promise selection, salary, an interview, or a joining date. Never disclose employee or candidate information.'
  };
  if(role.includes('ACCOUNT')||dept.includes('ACCOUNT')||dept.includes('FINANCE')) return {
    title:label+'\'s Accounts Assistant',
    greeting:'Namaste! Main Bulbhul hoon, '+label+' ke Accounts desk se. Disbursement process, receipts aur general payment guidance ke baare mein poochiye.',
    instruction:'You support general accounts and disbursement-process questions. Do not confirm payments, balances, settlements, or account details. Never request banking credentials, OTPs, PINs, card details, or payment screenshots.'
  };
  if(role.includes('LOGIN')||role.includes('OPERATION')||dept.includes('LOGIN')||dept.includes('OPERATION')) return {
    title:label+'\'s Processing Assistant',
    greeting:'Namaste! Main Bulbhul hoon, '+label+' ke loan-processing desk se. Documents, bank-login process aur next steps ke baare mein poochiye.',
    instruction:'You support general loan-processing, documents, and bank-login preparation questions. Do not reveal or infer an application status, bank decision, case data, or TAT promise. Direct case-specific requests to the assigned team member.'
  };
  if(role.includes('MD')||role.includes('FOUNDER')||role.includes('DIRECTOR')||dept.includes('MANAGEMENT')) return {
    title:label+'\'s Executive Assistant',
    greeting:'Namaste! Main Bulbhul hoon, '+label+' ke digital executive assistant ke roop mein. Divyanshi Capital, partnerships aur our lending vision ke baare mein poochiye.',
    instruction:'You support public company, partnership, and leadership questions. Keep answers factual and professional. Do not disclose internal strategy, employee data, financials, or confidential operational information.'
  };
  return {
    title:label+'\'s Loan Assistant',
    greeting:'Namaste! Main Bulbhul hoon, '+label+' ke saath Divyanshi Capital se. Loan options, documents aur application ke next step ke baare mein poochiye.',
    instruction:'You support prospective borrowers. Explain general loan options, documents, eligibility preparation, and the application process. Never guarantee approval, invent rates, or make a credit decision. For a personal assessment, direct visitors to the employee application link.'
  };
}

const BULBHUL_SYS_BASE_ =
  '# BULBHUL V2 | Divyanshi Capital Pvt Ltd\n' +
  'Products: PL(3d) BL(7d) HL(15d) LAP(15d) AUTO(5d)\n' +
  'Governance: MD+HR approve money/hiring/salary. BULBHUL proposes only.\n\n' +
  'AUTO-COMMANDS (embed when action needed):\n' +
  '[[UPDATE_LEAD: id, status, remark]]\n' +
  '[[LOOKUP_LEAD: id_or_mobile]]\n' +
  '[[ADD_REMARK: id, remark]]\n' +
  '[[FOLLOWUP_PUSH: mobile, msg]]\n' +
  '[[MANAGER_CHECKIN: emp_code, 1_or_2]]\n\n' +
  'Reply short, direct, Hinglish.';

function BULBHUL_CHAT_API_(data) {
  data = data||{};
  const rawMsg = String(data.message||'').trim().slice(0,1000);
  const empCode=String(data.empCode||'').trim().toUpperCase();
  if(!empCode || !P1_VALIDATE_ACCESS_(empCode,data.accessToken)) return 'Your staff session has expired. Please sign in again.';
  const emp    = FIND_EMPLOYEE_FULL_(empCode);
  if(!emp) return 'Your staff account is unavailable.';
  if(data.leadId && !P1_CASE_FOR_EMPLOYEE_(empCode,data.leadId)) return 'That case is not assigned to your account.';
  const role   = emp ? String(emp.ROLE||'').toUpperCase() : '';
  let rolePrompt = BULBHUL_ROLE_PROMPTS_['SALES MEMBER'];
  for (const k of Object.keys(BULBHUL_ROLE_PROMPTS_)) { if(role.includes(k)){rolePrompt=BULBHUL_ROLE_PROMPTS_[k];break;} }
  if(emp) rolePrompt += '\n\nEmployee persona: '+P1_EMPLOYEE_PERSONA_(emp).instruction;
  const sysPrompt = BULBHUL_SYS_BASE_ + '\n\n[LIVE CONTEXT]\n' + BUILD_AI_CONTEXT_(data.empCode) + '\n\n' + rolePrompt;

  let extraCtx = '';
  try {
    const mM = rawMsg.match(/\b[6-9]\d{9}\b/), lM = rawMsg.match(/\bL\d{4,}_\d+\b/i);
    if (mM||lM) {
      const q = lM ? lM[0].toUpperCase() : mM[0];
      const found = GET_MASTER_SNAPSHOT_().find(c => String(c.LEAD_ID||'').toUpperCase()===q || DC_CLEAN_MOBILE_(String(c.CLIENT_MOBILE||''))===DC_CLEAN_MOBILE_(q));
      extraCtx = found
        ? `\n[CASE] ID:${found.LEAD_ID}|Client:${found.CLIENT_NAME}|Loan:${found.LOAN_TYPE}|Bank:${found.PREFERRED_BANK}|Status:${found.CASE_CATEGORY}|TAT:${found.TAT_STATUS}|Owner:${found.EMP_CODE}`
        : `\n[CASE] Not found: "${q}"`;
    }
  } catch(_){}

  const fullPrompt = (emp?`[SENDER] ${emp.NAME}(${emp.EMP_CODE})|${emp.ROLE}\n`:'[SENDER] Visitor\n') + extraCtx + '\n\n[USER]: ' + rawMsg;
  let reply = MULTI_BRAIN_REPLY_(fullPrompt, sysPrompt);
  // Assistant replies are advisory only. CRM writes and outbound messages require
  // an explicit, separately authorised workflow rather than model-generated commands.
  return String(reply||'Assistant is unavailable. Please retry.');

  // Execute embedded commands
  let log='';
  const R={
    U:/\[\[UPDATE_LEAD:\s*([^,\]]+),\s*([^,\]]+),\s*([^\]]+)\]\]/i,
    L:/\[\[LOOKUP_LEAD:\s*([^\]]+)\]\]/i,
    R:/\[\[ADD_REMARK:\s*([^,\]]+),\s*([^\]]+)\]\]/i,
    F:/\[\[FOLLOWUP_PUSH:\s*([^,\]]+),\s*([^\]]+)\]\]/i,
    C:/\[\[MANAGER_CHECKIN:\s*([^,\]]+),\s*([^\]]+)\]\]/i
  };
  let m;
  if((m=reply.match(R.U))){const r=UPDATE_LEAD_STATUS_(m[1].trim(),m[2].trim(),m[3].trim());log+=r.ok?`\n✅ ${m[1].trim()}→${m[2].trim()}`:`\n❌ ${r.err}`;}
  if((m=reply.match(R.L))){const c=GET_MASTER_SNAPSHOT_().find(x=>String(x.LEAD_ID||'').toUpperCase()===m[1].trim().toUpperCase()||DC_CLEAN_MOBILE_(String(x.CLIENT_MOBILE||''))===DC_CLEAN_MOBILE_(m[1].trim()));log+=c?`\n🔍 ${c.LEAD_ID}|${c.CLIENT_NAME}|${c.CASE_CATEGORY}|TAT:${c.TAT_STATUS}`:`\n🔍 Not found`;}
  if((m=reply.match(R.R))){UPDATE_LEAD_STATUS_(m[1].trim(),null,m[2].trim());log+=`\n📝 Remark→${m[1].trim()}`;}
  if((m=reply.match(R.F))){DC_SEND_WA_(m[1].trim(),'📩 [Divyanshi Capital]\n'+m[2].trim());log+=`\n📨 FUP→${m[1].trim()}`;}
  if((m=reply.match(R.C))){const r=MANAGER_SELFIE_CHECKIN_(m[1].trim().toUpperCase(),Number(m[2].trim())||1);log+=r.ok?`\n✅ Checkin:${r.status}`:`\n❌ ${r.err}`;}
  if(log) reply=reply.replace(R.U,'🔄').replace(R.L,'🔍').replace(R.R,'📝').replace(R.F,'📨').replace(R.C,'🏢')+'\n'+log;
  return reply;
}

// ── Master data snapshot (ScriptCache 3min) ──
function GET_MASTER_SNAPSHOT_() {
  return CACHED_GET_('MASTER_SNAP_V1', 180, () => {
    const sh = SHEET_('MASTER_DATA');
    if (!sh||sh.getLastRow()<2) return [];
    const data=sh.getDataRange().getValues();
    const h=data[0].map(DC_NORM_);
    return data.slice(1).map(r=>{ const o={}; h.forEach((k,i)=>{o[k]=r[i];}); return o; });
  });
}

/* ================================================================
   SECTION 11 — PRODUCTS + TAT (ScriptCache 1h)
   ================================================================ */

function DEFAULT_PRODUCTS_() {
  return [{code:'PL',name:'Personal Loan',icon:'💳',tat:3,roi:10.5},
          {code:'BL',name:'Business Loan',icon:'🏢',tat:7,roi:16},
          {code:'HL',name:'Home Loan',icon:'🏠',tat:15,roi:8.5},
          {code:'LAP',name:'Loan Against Property',icon:'🏦',tat:15,roi:10.5},
          {code:'AUTO',name:'Auto Loan',icon:'🚗',tat:5,roi:9.5}];
}

function GET_PRODUCT_ICON_(t){
  t=String(t||'').toLowerCase();
  if(t.includes('personal'))return'💳'; if(t.includes('business'))return'🏢';
  if(t.includes('home'))return'🏠'; if(t.includes('property')||t.includes('lap'))return'🏦';
  if(t.includes('auto')||t.includes('car'))return'🚗'; return'💼';
}

function GET_ACTIVE_LOAN_PRODUCTS_() {
  if (PRODUCTS_CACHE_) return PRODUCTS_CACHE_;
  PRODUCTS_CACHE_ = CACHED_GET_('LOAN_PRODUCTS_V1', 3600, () => {
    try {
      const sh=SHEET_('Loan_Bank_Map'); if(!sh||sh.getLastRow()<2) return DEFAULT_PRODUCTS_();
      const data=sh.getDataRange().getValues(); const h=data[0].map(DC_NORM_);
      const iT=h.indexOf('LOAN_TYPE'), iB=h.indexOf('PREFERRED_BANK')!==-1?h.indexOf('PREFERRED_BANK'):h.indexOf('BANK');
      const iS=h.indexOf('CASE_CATEGORY'), iROI=h.indexOf('ROI_START')!==-1?h.indexOf('ROI_START'):h.indexOf('ROI'), iTat=h.indexOf('TAT_DAYS');
      if(iT===-1) return DEFAULT_PRODUCTS_();
      const out={};
      for(let r=1;r<data.length;r++){
        const type=String(data[r][iT]||'').trim(); if(!type)continue;
        const status=iS>-1?String(data[r][iS]||'ACTIVE').toUpperCase():'ACTIVE';
        if(!['ACTIVE','YES','LIVE',''].includes(status))continue;
        const key=type.toUpperCase(), bank=iB>-1?String(data[r][iB]||'').trim():'';
        const roi=Number(iROI>-1?data[r][iROI]:'')||10.5, tat=Number(iTat>-1?data[r][iTat]:'')||7;
        if(!out[key]) out[key]={code:key.replace(/[^A-Z0-9]/g,'').slice(0,4),name:type,icon:GET_PRODUCT_ICON_(type),tat,roi,banks:[]};
        if(bank) out[key].banks.push(bank);
        out[key].roi=Math.min(Number(out[key].roi),roi); out[key].tat=Math.min(Number(out[key].tat),tat);
      }
      const p=Object.keys(out).map(k=>{out[k].bankCount=[...new Set(out[k].banks)].length;return out[k];});
      return p.length?p:DEFAULT_PRODUCTS_();
    } catch(e){ LOG_ERR_('GET_ACTIVE_LOAN_PRODUCTS','',e.message); return DEFAULT_PRODUCTS_(); }
  });
  return PRODUCTS_CACHE_;
}

function P1_GET_BANK_OPTIONS_MAP_() {
  if (BANKS_CACHE_) return BANKS_CACHE_;
  BANKS_CACHE_ = CACHED_GET_('BANK_OPTIONS_V1', 3600, () => {
    const out={};
    try {
      const sh=SHEET_('Loan_Bank_Map'); if(!sh||sh.getLastRow()<2)return out;
      const data=sh.getDataRange().getValues(); const h=data[0].map(DC_NORM_);
      const iT=h.indexOf('LOAN_TYPE'), iB=h.indexOf('PREFERRED_BANK')!==-1?h.indexOf('PREFERRED_BANK'):h.indexOf('BANK'), iS=h.indexOf('CASE_CATEGORY');
      if(iT===-1||iB===-1)return out;
      for(let r=1;r<data.length;r++){
        const loan=String(data[r][iT]||'').trim(), bank=String(data[r][iB]||'').trim();
        const status=iS>-1?String(data[r][iS]||'ACTIVE').toUpperCase():'ACTIVE';
        if(!loan||!bank||!['ACTIVE','YES','LIVE',''].includes(status))continue;
        const key=loan.toUpperCase(); if(!out[key])out[key]=[]; if(!out[key].includes(bank))out[key].push(bank);
      }
    } catch(e){ LOG_ERR_('P1_GET_BANK_OPTIONS_MAP','',e.message); }
    return out;
  });
  return BANKS_CACHE_;
}

function GET_TAT_BY_PRODUCT_(loanType) {
  const key=String(loanType||'').trim().toUpperCase();
  const p=GET_ACTIVE_LOAN_PRODUCTS_().find(x=>x.name.toUpperCase()===key||x.code===key);
  return p?p.tat:7;
}

function COMPUTE_TAT_(loanType) {
  const tat=GET_TAT_BY_PRODUCT_(loanType);
  return {TAT_DAYS:tat, TAT_DEADLINE:new Date(Date.now()+tat*86400000), TAT_STATUS:'ACTIVE'};
}

/* ================================================================
   SECTION 12 — MAIN LEAD PIPELINE (6 stages)
   ================================================================ */

function P1_SMART_FORM_SUBMIT_(p) {
  try {
    p=p||{};
    const entryType=String(p.entry_type||'SALES_LEAD').trim().toUpperCase();
    const isPeople=['NEW_STAFF_ENTRY','INTERVIEW_ENTRY'].includes(entryType);
    const mobile=DC_CLEAN_MOBILE_(p.client_mobile||p.CLIENT_MOBILE||p.mobile||'');
    const clientName=String(p.client_name||p.CLIENT_NAME||p.full_name||'').trim();
    const loanType=String(p.loan_type||p.LOAN_TYPE||'').trim();
    if(clientName.length<2 || !/^[6-9]\d{9}$/.test(mobile)) return {ok:false,err:'Enter a valid name and 10-digit Indian mobile number.'};
    if(isPeople ? !p.candidate_consent : !p.data_consent) return {ok:false,err:'Privacy consent is required.'};
    if(!isPeople && (!loanType || !String(p.employment_type||'').trim() || Number(p.required_loan_amount||p.amount||0)<1000)) return {ok:false,err:'Loan type, employment type and amount of at least INR 1,000 are required.'};
    const configuredVersion=String(PropertiesService.getScriptProperties().getProperty('CONSENT_VERSION')||'').trim();
    const configuredPrivacy=String(PropertiesService.getScriptProperties().getProperty('PRIVACY_URL')||'').trim();
    if(!configuredVersion || !configuredPrivacy || String(p.consent_version||'')!==configuredVersion) return {ok:false,err:'Consent configuration is unavailable. Please contact support.'};
    const referredEmp=String(p.emp_code||p.EMP_CODE||'').trim().toUpperCase();
    const employee=referredEmp?FIND_EMPLOYEE_FULL_(referredEmp):null;
    if(!isPeople && !employee) return {ok:false,err:'This referral link is not assigned to an active employee.'};
    const result=DC_PROCESS_LEAD_({
      EMP_CODE:employee?employee.EMP_CODE:'',
      MANAGER_EMAIL:employee?employee.MANAGER_EMAIL||'':'',
      CLIENT_NAME:clientName,
      CLIENT_MOBILE:mobile,
      CLIENT_EMAIL:DC_CLEAN_EMAIL_(p.client_email||p.CLIENT_EMAIL||p.email||''),
      CITY_LOCATION:String(p.city_location||p.CITY_LOCATION||'').trim(),
      PAN_NO:String(p.pan_no||p.PAN_NO||'').toUpperCase().trim(),
      EMPLOYMENT_TYPE:String(p.employment_type||p.EMPLOYMENT_TYPE||'').trim(),
      COMPANY_NAME:String(p.company_name||p.COMPANY_NAME||'').trim(),
      MONTHLY_INCOME:p.monthly_income||p.MONTHLY_INCOME||'',
      EXISTING_EMI:p.existing_emi||p.EXISTING_EMI||'0',
      AGE:p.age||p.AGE||'',
      CIBIL_SCORE:p.cibil_score||p.CIBIL_SCORE||p.credit_score||'',
      LOAN_TYPE:loanType,
      PREFERRED_BANK:String(p.preferred_bank||p.PREFERRED_BANK||'').trim(),
      REQUIRED_LOAN_AMOUNT:String(p.required_loan_amount||p.REQUIRED_LOAN_AMOUNT||p.amount||'').trim(),
      DOCS_LINK:p.docs_link||p.DOCS_LINK||'',
      TASK_CATEGORY:p.task_category||p.TASK_CATEGORY||'NEW_LEAD',
      CASE_CATEGORY:p.case_category||p.CASE_CATEGORY||p.case_status||'OPEN',
      REMARKS:String(p.remarks||p.REMARKS||'').trim(),
      SOURCE_TYPE:p.source_type||p.SOURCE_TYPE||'WEB_APP',
      SOURCE_NAME:p.source_name||p.SOURCE_NAME||'P1_SMART_FORM',
      CONSENT_VERSION:configuredVersion,
      CONSENT_AT:new Date(),
      CONSENT_SOURCE:'WEB_APP',
      PRIVACY_NOTICE_URL:configuredPrivacy,
      SELECTED_DOCUMENTS:Array.isArray(p.selected_documents)?p.selected_documents.join(', ').slice(0,2000):''
    });
    if(!result||!result.ok) return result;
    const files=Array.isArray(p.files)?p.files:[];
    if(files.length){
      const upload=P1_STORE_PUBLIC_FILES_(p, result.leadId||result.lid||'', files);
      if(!upload.ok) return {ok:false,err:upload.err||'Documents were not saved; no submission was confirmed.'};
      result.docsLink=upload.folderUrl;
    }
    return result;
  } catch(e){ LOG_ERR_('P1_SMART_FORM_SUBMIT','',e.message); return {ok:false,err:e.message}; }
}

function P1_SMART_FORM_SUBMIT(p){ return P1_SMART_FORM_SUBMIT_(p); }

function DC_PROCESS_LEAD_(lead) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return {ok:false,err:'System busy. Retry in 30s.'};
  try {
    lead=lead||{};
    lead.CLIENT_MOBILE=DC_CLEAN_MOBILE_(lead.CLIENT_MOBILE||lead.MOBILE||'');
    if (!lead.CLIENT_MOBILE&&!lead.CLIENT_NAME) return {ok:false,err:'CLIENT_MOBILE or CLIENT_NAME required'};
    lead.LEAD_ID=lead.LEAD_ID||('L'+(lead.CLIENT_MOBILE?lead.CLIENT_MOBILE.slice(-4):'0000')+'_'+Date.now());

    // Stage 1: Route
    lead.DATA_FLOW    = GET_SOURCE_ROUTING_MAP_()[String(lead.SOURCE_NAME||'').toUpperCase()]||'SALES';
    lead.INTAKE_STAGE ='CAPTURED'; lead.ROUTE_STAGE='ROUTED';
    lead.PROCESS_STAGE='PROCESSING'; lead.LOGIN_STAGE='PENDING';

    // Stage 2: Employee
    let emp=lead.EMP_CODE?FIND_EMPLOYEE_FULL_(lead.EMP_CODE):null;
    if (!emp&&lead.MANAGER_EMAIL) emp=FIND_EMPLOYEE_FULL_(lead.MANAGER_EMAIL);
    if (emp){ lead.EMP_CODE=emp.EMP_CODE; lead.SALES_NAME=lead.SALES_NAME||emp.NAME; lead.MANAGER_EMAIL=lead.MANAGER_EMAIL||emp.MANAGER_EMAIL||DC_CFG.COMPANY.SUPPORT_EMAIL; lead.EMPLOYEE_EMAIL=emp.EMAIL; }

    // Stage 3: TAT
    const tat=COMPUTE_TAT_(lead.LOAN_TYPE);
    lead.TAT_DAYS=tat.TAT_DAYS; lead.TAT_DEADLINE=tat.TAT_DEADLINE; lead.TAT_STATUS=tat.TAT_STATUS;

    // Stage 4: AI credit analysis
    let aiAdvice='';
    try {
      let ctx = "[LIVE PRODUCTS]:\n";
      const aiPrompt='[LEAD]\n'+JSON.stringify({name:lead.CLIENT_NAME,mobile:lead.CLIENT_MOBILE,loan:lead.LOAN_TYPE,bank:lead.PREFERRED_BANK,amount:lead.REQUIRED_LOAN_AMOUNT,income:lead.MONTHLY_INCOME,cibil:lead.CIBIL_SCORE,emi:lead.EXISTING_EMI,emp:lead.EMP_CODE,remarks:lead.REMARKS},null,2)+'\n\n[CTX]\n'+BUILD_AI_CONTEXT_(lead.EMP_CODE);
      const aiSys=BULBHUL_SYS_BASE_+'\n\nTask: Credit analysis. 4 sections:\n#### CIBIL Requirements:\n#### Matching Banks:\n#### Red Flags:\n#### Next Steps:';
      aiAdvice=MULTI_BRAIN_REPLY_(aiPrompt,aiSys);
      lead.AI_ADVICE=aiAdvice;
    } catch(ae){ aiAdvice='Bulbhul advice unavailable.'; lead.AI_ADVICE=aiAdvice; }

    const now = new Date();
    lead.TIMESTAMP    = lead.TIMESTAMP || now;
    lead.LAST_UPDATED = now;

    // Stage 5: Write COMMON_ENTRY + SMART_LOG + MASTER_DATA in batch
    const ceSh=GET_OR_CREATE_('COMMON_ENTRY');
    const ceH =P1_ENSURE_HEADERS_(ceSh,P1_TAB_MAP.COMMON_ENTRY());
    ceSh.appendRow(P1_BUILD_ROW_(ceH,lead));

    const slSh=GET_OR_CREATE_('SMART_LOG');
    const slH =P1_ENSURE_HEADERS_(slSh,P1_TAB_MAP.SMART_LOG());
    slSh.appendRow(P1_BUILD_ROW_(slH,{TIMESTAMP:now,SOURCE_TYPE:lead.SOURCE_TYPE||'',SOURCE_NAME:lead.SOURCE_NAME||'',DATA_FLOW:lead.DATA_FLOW,LEAD_ID:lead.LEAD_ID,CLIENT_NAME:lead.CLIENT_NAME||'',CLIENT_MOBILE:lead.CLIENT_MOBILE,PREFERRED_BANK:lead.PREFERRED_BANK||'',CASE_CATEGORY:lead.CASE_CATEGORY||'OPEN',EMP_CODE:lead.EMP_CODE||'',SALES_NAME:lead.SALES_NAME||'',MANAGER_EMAIL:lead.MANAGER_EMAIL||'',REMARKS:String(lead.REMARKS||'').slice(0,200),TAT_STATUS:'ACTIVE'}));

    const masterSh =GET_OR_CREATE_('MASTER_DATA');
    const masterH  =P1_ENSURE_HEADERS_(masterSh,P1_TAB_MAP.MASTER_DATA());
    const rowNum   =UPSERT_BY_KEY_(masterSh,'LEAD_ID',lead,P1_TAB_MAP.MASTER_DATA());
    APPLY_TAT_COLOUR_(masterSh,rowNum,lead.CASE_CATEGORY||lead.CASE_STATUS||'OPEN');

    // Stage 6: MIS_LOG
    const misSh=GET_OR_CREATE_('MIS_LOG');
    const misH =P1_ENSURE_HEADERS_(misSh,P1_TAB_MAP.MIS_LOG());
    misSh.appendRow(P1_BUILD_ROW_(misH,{TIMESTAMP:now,LEAD_ID:lead.LEAD_ID,EMP_CODE:lead.EMP_CODE||'',CLIENT_NAME:lead.CLIENT_NAME||'',CLIENT_MOBILE:lead.CLIENT_MOBILE,ROUTING_STATUS:'ROUTED',DATA_FLOW:lead.DATA_FLOW,PERSONAL_FILE_SYNC:'QUEUED',REMARKS:'6-stage|'+lead.SOURCE_NAME}));

    // Invalidate snapshot cache
    SC_.remove('MASTER_SNAP_V1');

    lock.releaseLock();

    // ── Post-pipeline (outside lock, non-blocking) ──
    let pfStatus='QUEUED';
    if (emp && emp.PERSONAL_FILE_ID && emp.PERSONAL_FILE_ID.length>15) {
      try { pfStatus=SYNC_PERSONAL_FILE_FAST_(emp,lead,rowNum)?'SYNCED':'ERR'; }
      catch(pe){ pfStatus='ERR'; LOG_ERR_('PF_SYNC',emp.PERSONAL_FILE_ID,pe.message); }
    }
    try { RECORD_TASK_FOR_ATTENDANCE_(lead.EMP_CODE); }  catch(_){}
    const cs=String(lead.CASE_CATEGORY||'').toUpperCase();
    if (cs==='DISBURSE'||cs==='DISBURSED') { try{NOTIFY_ACCOUNTS_ON_DISBURSE_(lead);}catch(_){} }
    try { SEND_SMART_MAIL_(lead,aiAdvice,emp); }  catch(me){ LOG_ERR_('MAIL',lead.LEAD_ID,me.message); }
    try { SEND_TG_LEAD_ALERT_(lead,emp); }        catch(_){}

    return {ok:true,leadId:lead.LEAD_ID,tatDays:lead.TAT_DAYS,dataFlow:lead.DATA_FLOW,pfStatus};
  } catch(err){
    LOG_ERR_('DC_PROCESS_LEAD',lead.EMP_CODE||'',err.message);
    try{lock.releaseLock();}catch(_){}
    return {ok:false,err:err.message};
  }
}

function SYNC_PERSONAL_FILE_FAST_(emp, lead, masterRowNum) {
  const pss  = P1_OPEN_SS_SAFE_(emp.PERSONAL_FILE_ID);
  const mcSh = pss.getSheetByName('MY_CASES') || pss.insertSheet('MY_CASES');
  P1_ENSURE_HEADERS_(mcSh, P1_TAB_MAP.MASTER_DATA());
  UPSERT_BY_KEY_(mcSh,'LEAD_ID',lead,P1_TAB_MAP.MASTER_DATA());
  LOCK_MY_CASES_(mcSh,emp.EMP_CODE);

  const saSh  = pss.getSheetByName('SALES_ACTIVITY') || pss.insertSheet('SALES_ACTIVITY');
  const saHdr = P1_ENSURE_HEADERS_(saSh,['TIMESTAMP','LEAD_ID','CLIENT_NAME','CLIENT_MOBILE','LOAN_TYPE','AMOUNT','BANK','STATUS','REMARKS','TAT_STATUS']);
  saSh.appendRow(P1_BUILD_ROW_(saHdr,{TIMESTAMP:new Date(),LEAD_ID:lead.LEAD_ID,CLIENT_NAME:lead.CLIENT_NAME||'',CLIENT_MOBILE:lead.CLIENT_MOBILE,LOAN_TYPE:lead.LOAN_TYPE||'',AMOUNT:lead.REQUIRED_LOAN_AMOUNT||'',BANK:lead.PREFERRED_BANK||'',STATUS:lead.CASE_CATEGORY||'OPEN',REMARKS:lead.REMARKS||'',TAT_STATUS:'ACTIVE'}));

  // Manager sync
  if (emp.MANAGER_EMAIL) {
    const mgrEmp=FIND_EMPLOYEE_FULL_(emp.MANAGER_EMAIL);
    if (mgrEmp&&mgrEmp.PERSONAL_FILE_ID&&mgrEmp.PERSONAL_FILE_ID!==emp.PERSONAL_FILE_ID) {
      try {
        const mps=P1_OPEN_SS_SAFE_(mgrEmp.PERSONAL_FILE_ID);
        const mmcSh=mps.getSheetByName('MY_CASES')||mps.insertSheet('MY_CASES');
        P1_ENSURE_HEADERS_(mmcSh,P1_TAB_MAP.MASTER_DATA());
        UPSERT_BY_KEY_(mmcSh,'LEAD_ID',lead,P1_TAB_MAP.MASTER_DATA());
      } catch(_){}
    }
  }
  return true;
}

function UPDATE_LEAD_STATUS_(query,status,remark) {
  try {
    const sh=SHEET_('MASTER_DATA'); if(!sh||sh.getLastRow()<2)return{ok:false,err:'MASTER_DATA not found'};
    const h=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(DC_NORM_);
    const iL=h.indexOf('LEAD_ID'),iM=h.indexOf('CLIENT_MOBILE'),iC=h.indexOf('CASE_CATEGORY'),iR=h.indexOf('REMARKS'),iU=h.indexOf('LAST_UPDATED');
    const q=String(query||'').trim().toUpperCase();
    const vals=sh.getRange(2,1,sh.getLastRow()-1,h.length).getValues();
    for(let i=0;i<vals.length;i++){
      if(String(vals[i][iL]||'').trim().toUpperCase()===q||DC_CLEAN_MOBILE_(vals[i][iM])===DC_CLEAN_MOBILE_(q)){
        const row=i+2;
        if(status&&iC>-1)sh.getRange(row,iC+1).setValue(status);
        if(remark&&iR>-1){const old=String(sh.getRange(row,iR+1).getValue()||'').trim();sh.getRange(row,iR+1).setValue(old?old+' | '+remark:remark);}
        if(iU>-1)sh.getRange(row,iU+1).setValue(new Date());
        APPLY_TAT_COLOUR_(sh,row,status||String(vals[i][iC]||''));
        SC_.remove('MASTER_SNAP_V1');
        return{ok:true,row};
      }
    }
    return{ok:false,err:'Lead not found'};
  } catch(e){ LOG_ERR_('UPDATE_LEAD_STATUS',query,e.message); return{ok:false,err:e.message}; }
}

function APPLY_TAT_COLOUR_(sh,row,cs) {
  try {
    cs=String(cs||'').toUpperCase();
    const lc=sh.getLastColumn();
    const bg=(['REJECT','REJECTED','NOT INTERESTED','WRONG NUMBER'].includes(cs))?'#f4cccc':
             (['DISBURSE','DISBURSED'].includes(cs))?'#d9ead3':
             (['APPROVED','SANCTION'].includes(cs))?'#fff2cc':
             (cs==='TAT_BREACHED')?'#ff9999':'#d9eaf7';
    sh.getRange(row,1,1,lc).setBackground(bg);
  } catch(_){}
}

/* ================================================================
   SECTION 13 — NOTIFICATION TEMPLATES
   ================================================================ */

function GET_MALLIK_CONFIG_() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty('MALLIK_API_KEY') || '';
    if (!raw) return null;

    // Support both plain key and JSON config
    if (raw.trim().startsWith('{')) {
      return JSON.parse(raw);
    }

    // Fallback: treat as MSG91 authkey only
    return {
      msg91_authkey: raw.trim(),
      msg91_sender: 'DIVCAP',
      msg91_route: '4',
      msg91_country: '91'
    };
  } catch (e) {
    return null;
  }
}

function SEND_SMART_MAIL_(lead, aiAdvice, emp) {
  try {
    lead = lead || {};
    if (!emp && lead.EMP_CODE) emp = FIND_EMPLOYEE_FULL_(lead.EMP_CODE);

    // Safe Amount
    let amountDisplay = 'Not Specified';
    const rawAmt = lead.REQUIRED_LOAN_AMOUNT || lead.AMOUNT || '';
    if (rawAmt !== '' && rawAmt != null) {
      const num = Number(String(rawAmt).replace(/[^0-9.]/g, ''));
      if (!isNaN(num) && num > 0) amountDisplay = '₹ ' + num.toLocaleString('en-IN');
    }

    const bank = lead.PREFERRED_BANK || lead.BANK || 'Will Auto Update';
    const tatDays = Number(lead.TAT_DAYS) || (typeof GET_TAT_BY_PRODUCT_ === 'function' ? GET_TAT_BY_PRODUCT_(lead.LOAN_TYPE) : 7);
    const deadline = lead.TAT_DEADLINE ? new Date(lead.TAT_DEADLINE) : new Date(Date.now() + tatDays * 86400000);
    const fmtDeadline = Utilities.formatDate(deadline, 'Asia/Kolkata', 'dd MMM yyyy, hh:mm a');
    const ownerName = emp ? emp.NAME : 'Unassigned';
    const ownerCode = lead.EMP_CODE || '—';
    const aiText = String(aiAdvice || lead.AI_ADVICE || 'Immediate follow-up recommended.');

    // ── 1. EMAIL ──
    if (MailApp.getRemainingDailyQuota() > 0) {
      let aiHtml = aiText
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/#### (.*?)(\n|$)/g, '<h4 style="color:#0d2260;margin:14px 0 6px;font-size:13px;border-bottom:1px solid #dce6f7;padding-bottom:3px;">$1</h4>')
        .replace(/^- (.*?)(\n|$)/gm, '<li style="margin-bottom:5px;line-height:1.55;">$1</li>')
        .replace(/\n/g, '<br>');

      const subject = `[NEW LEAD] ${lead.LEAD_ID || ''} — ${lead.CLIENT_NAME || ''} | ${lead.LOAN_TYPE || 'Loan'} | ${ownerCode}`;

      const htmlBody = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;background:#eef1f5;padding:20px}
.wrap{max-width:620px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 18px rgba(0,0,0,.10);border:1px solid #dde1e8}
.header{background:#0d2260;padding:26px 24px;text-align:center}
.header h1{color:#f5a623;font-size:22px;font-weight:900;letter-spacing:1.5px;margin-bottom:4px}
.header p{color:rgba(255,255,255,.85);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1.5px}
.banner{background:#d4af37;padding:12px 20px;text-align:center;color:#06112c;font-weight:900;font-size:14px;letter-spacing:1.2px;text-transform:uppercase}
.content{padding:26px 24px}.greeting{font-size:15px;color:#222;line-height:1.6;margin-bottom:20px}
table{width:100%;border-collapse:collapse;margin-bottom:22px;font-size:13px}
td{padding:9px 10px;border-bottom:1px solid #f0f2f5;vertical-align:top}
td.label{font-weight:700;color:#5a6a8a;width:32%;text-transform:uppercase;font-size:11px;letter-spacing:.4px}
td.value{color:#111;font-weight:500}
.ai-box{background:#f7f9fc;border-left:4px solid #0d2260;border:1px solid #e0e6f0;border-radius:6px;padding:18px 20px}
.ai-title{font-size:12px;font-weight:900;color:#0d2260;text-transform:uppercase;border-bottom:2px solid #0d2260;padding-bottom:5px;margin-bottom:12px;display:inline-block}
.footer{background:#0d2260;text-align:center;padding:13px;font-size:11px;color:rgba(255,255,255,.75)}
</style></head><body>
<div class="wrap">
<div class="header"><h1>DIVYANSHI CAPITAL</h1><p>Bulbhul AI — Lead Notification</p></div>
<div class="banner">⚡⚡⚡⚡ NEW LEAD ASSIGNED</div>
<div class="content">
<p class="greeting">Hello <strong>${ownerName}</strong>, ek naya lead assign hua hai. Immediately follow up karo.</p>
<table>
<tr><td class="label">Lead ID</td><td class="value"><strong>${lead.LEAD_ID || 'N/A'}</strong></td></tr>
<tr><td class="label">Client</td><td class="value"><strong>${lead.CLIENT_NAME || 'N/A'}</strong></td></tr>
<tr><td class="label">Mobile</td><td class="value">${lead.CLIENT_MOBILE || 'N/A'}</td></tr>
<tr><td class="label">Loan Type</td><td class="value">${lead.LOAN_TYPE || 'N/A'}</td></tr>
<tr><td class="label">Amount</td><td class="value"><strong>${amountDisplay}</strong></td></tr>
<tr><td class="label">Bank</td><td class="value">${bank}</td></tr>
<tr><td class="label">TAT</td><td class="value">${tatDays} days</td></tr>
<tr><td class="label">Deadline</td><td class="value"><strong style="color:#c0392b">${fmtDeadline}</strong></td></tr>
<tr><td class="label">Data Flow</td><td class="value">${lead.DATA_FLOW || 'SALES'}</td></tr>
<tr><td class="label">Owner</td><td class="value">${ownerName} (${ownerCode})</td></tr>
<tr><td class="label">Remarks</td><td class="value" style="color:#555;font-style:italic">${String(lead.REMARKS || 'No remarks.').slice(0,300)}</td></tr>
</table>
<div class="ai-box"><div class="ai-title">⚡ BULBHUL AI — CREDIT ANALYSIS</div>
<div style="font-size:13px;line-height:1.7;color:#2c3e50">${aiHtml}</div></div>
</div>
<div class="footer">Divyanshi Capital Pvt Ltd — Automated by Bulbhul AI — Do not reply</div>
</div></body></html>`;

      const recipients = new Set();
      const addEmail = e => { if (e) { const x = String(e).trim().toLowerCase(); if (x) recipients.add(x); } };
      addEmail(emp ? emp.EMAIL : null);
      addEmail(lead.MANAGER_EMAIL);
      addEmail(DC_CFG.COMPANY.FOUNDER_EMAIL);
      addEmail(DC_CFG.COMPANY.MD_EMAIL);

      const arr = [...recipients];
      if (arr.length) {
        GmailApp.sendEmail(arr[0], subject, 'New lead notification', {
          htmlBody: htmlBody,
          cc: arr.slice(1).join(',') || '',
          name: 'Bulbhul — DC AI Engine'
        });
      }
    }

    // ── 2. TELEGRAM ──
    try {
      const tgMsg = `🆕 *NEW LEAD ASSIGNED*\n━━━━━━━━━━━━━━━━━━━━\n🪪 *Lead ID:* ${lead.LEAD_ID || 'N/A'}\n👤 *Client:* ${lead.CLIENT_NAME || 'N/A'}\n📱 *Mobile:* ${lead.CLIENT_MOBILE || 'N/A'}\n💳 *Loan:* ${lead.LOAN_TYPE || 'N/A'}\n💰 *Amount:* ${amountDisplay}\n🏦 *Bank:* ${bank}\n⏱ *TAT:* ${tatDays} days\n⚠ *Deadline:* ${fmtDeadline}\n👔 *Owner:* ${ownerName} (${ownerCode})\n📋 *Remarks:* ${String(lead.REMARKS || 'No remarks').slice(0,120)}\n━━━━━━━━━━━━━━━━━━━━\n🤖 *Bulbhul AI:*\n${aiText.slice(0,350)}`;
      if (typeof DC_SEND_TG_ === 'function') DC_SEND_TG_(tgMsg);
    } catch (e) { LOG_ERR_('NOTIFY_TG', lead.LEAD_ID || '', e.message); }

    // ── 3. WHATSAPP ──
    try {
      if (emp && emp.WHATSAPP && String(emp.WHATSAPP_VERIFIED || '').toUpperCase() === 'YES') {
        const waMsg = `*NEW LEAD ASSIGNED*\n━━━━━━━━━━━━━━\n*Lead ID:* ${lead.LEAD_ID || 'N/A'}\n*Client:* ${lead.CLIENT_NAME || 'N/A'}\n*Mobile:* ${lead.CLIENT_MOBILE || 'N/A'}\n*Loan:* ${lead.LOAN_TYPE || 'N/A'}\n*Amount:* ${amountDisplay}\n*Bank:* ${bank}\n*TAT:* ${tatDays} days\n*Deadline:* ${fmtDeadline}\n*Owner:* ${ownerName} (${ownerCode})\n━━━━━━━━━━━━━━\n*Bulbhul:* ${aiText.slice(0,200)}`;
        if (typeof DC_SEND_WA_ === 'function') DC_SEND_WA_(emp.WHATSAPP, waMsg);
      }
    } catch (e) { LOG_ERR_('NOTIFY_WA', lead.LEAD_ID || '', e.message); }

    // ── 4. SMS + RCS (Single Key) ──
    const cfg = GET_MALLIK_CONFIG_();
    if (cfg && emp && emp.MOBILE) {
      const phone = String(emp.MOBILE).replace(/\D/g, '').slice(-10);

      // SMS
      try {
        DC_SEND_SMS_SINGLE_(phone, `NEW LEAD: ${lead.CLIENT_NAME || 'Client'} | ${lead.LOAN_TYPE || 'Loan'} | ${amountDisplay} | ${bank} | ID:${lead.LEAD_ID || ''} | Owner:${ownerName} - Bulbhul`, cfg);
      } catch (e) { LOG_ERR_('NOTIFY_SMS', lead.LEAD_ID || '', e.message); }

      // RCS
      try {
        DC_SEND_RCS_SINGLE_(phone, {
          leadId: lead.LEAD_ID || '',
          client: lead.CLIENT_NAME || '',
          mobile: lead.CLIENT_MOBILE || '',
          loanType: lead.LOAN_TYPE || '',
          amount: amountDisplay,
          bank: bank,
          tat: tatDays + ' days',
          deadline: fmtDeadline,
          owner: ownerName + ' (' + ownerCode + ')',
          ai: aiText.slice(0, 180)
        }, cfg);
      } catch (e) { LOG_ERR_('NOTIFY_RCS', lead.LEAD_ID || '', e.message); }
    }

    return true;
  } catch (e) {
    LOG_ERR_('SEND_SMART_MAIL', (lead && lead.LEAD_ID) || '', e.message);
    return false;
  }
}

function DC_SEND_SMS_SINGLE_(mobile, message, cfg) {
  try {
    if (!cfg || !cfg.msg91_authkey) return false;
    let phone = String(mobile || '').replace(/\D/g, '');
    if (phone.length === 10) phone = (cfg.msg91_country || '91') + phone;

    const url = 'https://control.msg91.com/api/sendhttp.php'
      + '?authkey=' + encodeURIComponent(cfg.msg91_authkey)
      + '&mobiles=' + encodeURIComponent(phone)
      + '&message=' + encodeURIComponent(String(message).slice(0, 300))
      + '&sender=' + encodeURIComponent(cfg.msg91_sender || 'DIVCAP')
      + '&route=' + encodeURIComponent(cfg.msg91_route || '4')
      + '&country=' + encodeURIComponent(cfg.msg91_country || '91');

    const res = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true });
    return res.getResponseCode() === 200;
  } catch (e) {
    return false;
  }
}

function DC_SEND_RCS_SINGLE_(mobile, data, cfg) {
  try {
    if (!cfg || !cfg.msg91_authkey) return false;
    let phone = String(mobile || '').replace(/\D/g, '');
    if (phone.length === 10) phone = '91' + phone;

    const payload = {
      recipients: [{ mobiles: phone }],
      message: {
        type: 'text',
        text: `🆕 NEW LEAD\nLead: ${data.leadId}\nClient: ${data.client}\nLoan: ${data.loanType}\nAmount: ${data.amount}\nBank: ${data.bank}\nOwner: ${data.owner}\n\n${data.ai}`
      }
    };

    const res = UrlFetchApp.fetch('https://api.msg91.com/api/v5/rcs/', {
      method: 'post',
      contentType: 'application/json',
      headers: { authkey: cfg.msg91_authkey },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    return res.getResponseCode() >= 200 && res.getResponseCode() < 300;
  } catch (e) {
    return false;
  }
}
/* ================================================================
   SECTION 14 — MESSAGING SERVICES
   ================================================================ */

function DC_GET_CORE_TG_IDS_() {
  const p=PropertiesService.getScriptProperties();
  return ['FOUNDER_TG_CHAT_ID','MD_TG_CHAT_ID','ACCOUNTS_TG_CHAT_ID','HR_TG_CHAT_ID'].map(k=>String(p.getProperty(k)||'').trim()).filter(Boolean);
}

function DC_SEND_TG_MESSAGE_(chatId,text) {
  try {
    const token=DC_CFG.TG_TOKEN; if(!token||!chatId)return false;
    UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/sendMessage',{method:'post',contentType:'application/json',muteHttpExceptions:true,payload:JSON.stringify({chat_id:chatId,text:String(text||'').slice(0,4096),parse_mode:'Markdown'})});
    return true;
  } catch(e){ LOG_ERR_('TG_SEND',chatId,e.message); return false; }
}

function DC_SEND_TG_(text) { const ids=DC_GET_CORE_TG_IDS_(); return ids.some(id=>DC_SEND_TG_MESSAGE_(id,text)); }

function DC_SEND_WA_(to,text) {
  try {
    const token=DC_CFG.META_WA_TOKEN, phoneId=DC_CFG.META_WA_PHONE_ID; if(!token||!phoneId||!to)return false;
    UrlFetchApp.fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`,{method:'post',headers:{Authorization:'Bearer '+token},contentType:'application/json',muteHttpExceptions:true,payload:JSON.stringify({messaging_product:'whatsapp',to:String(to).replace(/\D/g,''),type:'text',text:{body:String(text||'').slice(0,4096)}})});
    return true;
  } catch(e){ LOG_ERR_('WA_SEND',to,e.message); return false; }
}

/* ================================================================
   SECTION 15 — ATTENDANCE ENGINE
   ================================================================ */

function RECORD_TASK_FOR_ATTENDANCE_(empCode) {
  try {
    if(!empCode)return; const emp=FIND_EMPLOYEE_FULL_(empCode); if(!emp)return;
    const tz='Asia/Kolkata',today=Utilities.formatDate(new Date(),tz,'yyyy-MM-dd'),logKey=today+'_'+empCode;
    const sh=GET_OR_CREATE_('ATTENDANCE_LOG'); P1_ENSURE_HEADERS_(sh,P1_TAB_MAP.ATTENDANCE_LOG());
    const data=sh.getDataRange().getValues(); const h=data[0].map(DC_NORM_);
    const iK=h.indexOf('LOG_KEY'),iCt=h.indexOf('CALLS_TODAY'),iSt=h.indexOf('ATTENDANCE_STATUS'),iUp=h.indexOf('LAST_UPDATED');
    for(let i=1;i<data.length;i++){
      if(String(data[i][iK]||'').trim()===logKey){
        const nc=Number(data[i][iCt]||0)+1;
        if(iCt>-1)sh.getRange(i+1,iCt+1).setValue(nc);
        if(iSt>-1)sh.getRange(i+1,iSt+1).setValue(nc>=5?'PRESENT':nc>=3?'HALF_DAY':'ABSENT');
        if(iUp>-1)sh.getRange(i+1,iUp+1).setValue(new Date());
        return;
      }
    }
    const aH=P1_ENSURE_HEADERS_(sh,P1_TAB_MAP.ATTENDANCE_LOG());
    sh.appendRow(P1_BUILD_ROW_(aH,{DATE:today,LOG_KEY:logKey,EMP_CODE:empCode,EMP_NAME:emp.NAME,DEPARTMENT:emp.DEPARTMENT,ROLE:emp.ROLE,CALLS_TODAY:1,FIRST_PUNCH:Utilities.formatDate(new Date(),tz,'HH:mm'),ATTENDANCE_STATUS:'ABSENT',LAST_UPDATED:new Date()}));
  } catch(e){ LOG_ERR_('RECORD_TASK_ATTENDANCE',empCode,e.message); }
}

function MANAGER_SELFIE_CHECKIN_(empCode,half) {
  try {
    if(!empCode)return{ok:false,err:'EMP_CODE missing'};
    const emp=FIND_EMPLOYEE_FULL_(empCode); if(!emp)return{ok:false,err:'Employee not found'};
    if(!String(emp.ROLE||'').toUpperCase().includes('MANAGER'))return{ok:false,err:'Not a manager'};
    const now=new Date(),hour=now.getHours(),min=now.getMinutes();
    const tz='Asia/Kolkata',today=Utilities.formatDate(now,tz,'yyyy-MM-dd');
    if(half===1&&!(hour===10&&min<=15))return{ok:false,err:'Window 1: 10:00–10:15 only'};
    if(half===2&&!(hour===14&&min<=15))return{ok:false,err:'Window 2: 14:00–14:15 only'};
    const logKey=today+'_'+empCode;
    const sh=GET_OR_CREATE_('ATTENDANCE_LOG');
    P1_ENSURE_HEADERS_(sh,P1_TAB_MAP.ATTENDANCE_LOG().concat(['HALF1_CHECKIN','HALF2_CHECKIN']));
    const data=sh.getDataRange().getValues(); const h=data[0].map(DC_NORM_);
    const iK=h.indexOf('LOG_KEY'),iH1=h.indexOf('HALF1_CHECKIN'),iH2=h.indexOf('HALF2_CHECKIN'),iSt=h.indexOf('ATTENDANCE_STATUS');
    for(let i=1;i<data.length;i++){
      if(String(data[i][iK]||'').trim()===logKey){
        if(half===1&&iH1>-1)sh.getRange(i+1,iH1+1).setValue(now);
        if(half===2&&iH2>-1)sh.getRange(i+1,iH2+1).setValue(now);
        const h1v=iH1>-1?sh.getRange(i+1,iH1+1).getValue():'';
        const h2v=iH2>-1?sh.getRange(i+1,iH2+1).getValue():'';
        const st=h1v&&h2v?'PRESENT':(h1v||h2v?'HALF_DAY':'ABSENT');
        if(iSt>-1)sh.getRange(i+1,iSt+1).setValue(st);
        return{ok:true,status:st};
      }
    }
    const aH=P1_ENSURE_HEADERS_(sh,P1_TAB_MAP.ATTENDANCE_LOG().concat(['HALF1_CHECKIN','HALF2_CHECKIN']));
    sh.appendRow(P1_BUILD_ROW_(aH,{DATE:today,LOG_KEY:logKey,EMP_CODE:empCode,EMP_NAME:emp.NAME,DEPARTMENT:emp.DEPARTMENT,ROLE:emp.ROLE,CALLS_TODAY:0,FIRST_PUNCH:'',ATTENDANCE_STATUS:'HALF_DAY',LAST_UPDATED:new Date(),HALF1_CHECKIN:half===1?now:'',HALF2_CHECKIN:half===2?now:''}));
    return{ok:true,status:'HALF_DAY'};
  } catch(e){ LOG_ERR_('MANAGER_SELFIE_CHECKIN',empCode,e.message); return{ok:false,err:e.message}; }
}

/* ================================================================
   SECTION 16 — PERSONAL FILE LOCK + 15-MIN SYNC
   ================================================================ */

function LOCK_MY_CASES_(sh,empCode) {
  try {
    const allowed=[DC_CFG.COMPANY.MD_EMAIL,DC_CFG.COMPANY.FOUNDER_EMAIL];
    let p=sh.getProtections(SpreadsheetApp.ProtectionType.SHEET)[0];
    if(!p)p=sh.protect();
    p.setDescription('MY_CASES_VIEW_ONLY_'+empCode); p.setWarningOnly(false);
    p.getEditors().forEach(u=>{if(!allowed.includes(u.getEmail().toLowerCase())){try{p.removeEditor(u);}catch(_){}}});
    allowed.forEach(e=>{try{p.addEditor(e);}catch(_){}});
  } catch(_){}
}

function MIS_15MIN_FULL_SYNC_() {
  try {
    const empMap=DC_BUILD_EMP_MAP_(), allData=GET_MASTER_SNAPSHOT_();
    Object.keys(empMap).forEach(code=>{
      const emp=empMap[code]; if(!emp.PERSONAL_FILE_ID||emp.PERSONAL_FILE_ID.length<15)return;
      const cases=allData.filter(r=>String(r.EMP_CODE||'').toUpperCase()===code);
      if(!cases.length)return;
      try {
        const pss=P1_OPEN_SS_SAFE_(emp.PERSONAL_FILE_ID);
        const mcSh=pss.getSheetByName('MY_CASES')||pss.insertSheet('MY_CASES');
        mcSh.clearContents(); mcSh.clearFormats();
        const aH=P1_ENSURE_HEADERS_(mcSh,P1_TAB_MAP.MASTER_DATA());
        mcSh.getRange(2,1,cases.length,aH.length).setValues(cases.map(c=>P1_BUILD_ROW_(aH,c)));
        LOCK_MY_CASES_(mcSh,code);
      } catch(pe){ LOG_ERR_('15MIN_SYNC',code,pe.message); }
    });
    Logger.log('✅ 15-min full sync done');
  } catch(e){ LOG_ERR_('MIS_15MIN_FULL_SYNC','',e.message); }
}

/* ================================================================
   SECTION 17 — GMAIL MIS PIPELINE
   ================================================================ */

function FETCH_AND_PROCESS_MIS_MAILS_() {
  try {
    const label=GmailApp.getUserLabelByName('MIS-Incoming'); if(!label){Logger.log('⚠ Label "MIS-Incoming" not found');return;}
    const processed=new Set();
    try {
      const sh=SHEET_('RAW_INBOX'); if(sh&&sh.getLastRow()>=2){ const h=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(DC_NORM_); const idx=h.indexOf('GMAIL_MSG_ID'); if(idx>-1)sh.getRange(2,idx+1,sh.getLastRow()-1,1).getValues().forEach(r=>{if(r[0])processed.add(String(r[0]).trim());}); }
    } catch(_){}
    let total=0;
    const threads=label.getThreads(0,50);
    threads.forEach(thread=>thread.getMessages().forEach(msg=>{
      const id=msg.getId(); if(processed.has(id))return;
      try {
        const parsed=PARSE_MIS_MAIL_BODY_(msg.getSubject(),msg.getPlainBody());
        const rawSh=GET_OR_CREATE_('RAW_INBOX');
        rawSh.appendRow(P1_BUILD_ROW_(P1_ENSURE_HEADERS_(rawSh,P1_TAB_MAP.RAW_INBOX()),{RECEIVED_AT:msg.getDate(),GMAIL_MSG_ID:id,FROM_EMAIL:msg.getFrom(),SUBJECT:msg.getSubject(),LEAD_ID:parsed.LEAD_ID,CLIENT_NAME:parsed.CLIENT_NAME,CLIENT_MOBILE:parsed.CLIENT_MOBILE,PREFERRED_BANK:parsed.PREFERRED_BANK,LOAN_TYPE:parsed.LOAN_TYPE,REQUIRED_LOAN_AMOUNT:parsed.REQUIRED_LOAN_AMOUNT,CASE_STATUS:parsed.CASE_STATUS,REMARKS:parsed.REMARKS,SOURCE_NAME:'MIS-Incoming',EMP_CODE:parsed.EMP_CODE,PROCESS_STATUS:'PENDING',DEDUP_ACTION:'PENDING',PROCESSED_AT:new Date()}));
        if(parsed.CLIENT_NAME||parsed.CLIENT_MOBILE) DC_PROCESS_LEAD_(Object.assign(parsed,{SOURCE_TYPE:'EMAIL_MIS',SOURCE_NAME:'MIS-Incoming',REMARKS:(parsed.REMARKS||'')+' | [MIS:'+msg.getSubject()+']'}));
        processed.add(id); total++;
      } catch(me){ LOG_ERR_('PROCESS_MIS_MAIL',id,me.message); }
    }));
    Logger.log('✅ MIS: '+total+' new emails');
  } catch(e){ LOG_ERR_('FETCH_AND_PROCESS_MIS_MAILS','',e.message); }
}

function PARSE_MIS_MAIL_BODY_(subject,body) {
  const parsed={};
  String(body||'').split(/\r?\n/).forEach(line=>{const m=line.match(/^([A-Za-z0-9_ ]+?)\s*[:=\-]\s*(.+)$/);if(m)parsed[DC_NORM_(m[1].trim())]=m[2].trim();});
  return {LEAD_ID:parsed['LEAD_ID']||parsed['CASE_ID']||'',CLIENT_NAME:parsed['CLIENT_NAME']||parsed['FULL_NAME']||parsed['NAME']||'',CLIENT_MOBILE:DC_CLEAN_MOBILE_(parsed['CLIENT_MOBILE']||parsed['MOBILE']||''),PREFERRED_BANK:parsed['PREFERRED_BANK']||parsed['BANK']||'',LOAN_TYPE:parsed['LOAN_TYPE']||parsed['PRODUCT']||'',REQUIRED_LOAN_AMOUNT:parsed['REQUIRED_LOAN_AMOUNT']||parsed['AMOUNT']||'',CASE_STATUS:parsed['CASE_STATUS']||parsed['STATUS']||'OPEN',REMARKS:parsed['REMARKS']||parsed['REMARK']||'',EMP_CODE:String(parsed['EMP_CODE']||'').toUpperCase()};
}

/* ================================================================
   SECTION 18 — TELEGRAM BOT HANDLER
   ================================================================ */

function P1_TG_HANDLE_(body) {
  const msg=body.message; if(!msg||!msg.chat)return'OK';
  const chatId=msg.chat.id,text=String(msg.text||'').trim(); if(!text)return'OK';
  if(text==='/start'||text==='/help'){DC_SEND_TG_MESSAGE_(chatId,'Namaste! 🙏 Bulbhul V2 active hai.\n\n/core MD|FOUNDER|ACCOUNTS|HR — Register\n/checkin1 or /checkin2 — Manager attendance\n\nOr type karo, I\'ll help!');return'OK';}
  if(/^\/core\s+/i.test(text)){
    const role=text.replace(/^\/core\s+/i,'').trim().toUpperCase();
    const map={FOUNDER:'FOUNDER_TG_CHAT_ID',MD:'MD_TG_CHAT_ID',ACCOUNTS:'ACCOUNTS_TG_CHAT_ID',HR:'HR_TG_CHAT_ID'};
    if(!map[role]){DC_SEND_TG_MESSAGE_(chatId,'Use: /core MD|FOUNDER|ACCOUNTS|HR');return'OK';}
    PropertiesService.getScriptProperties().setProperty(map[role],String(chatId));
    DC_SEND_TG_MESSAGE_(chatId,'✅ Registered as '+role);return'OK';
  }
  try {
    const isMD=DC_GET_CORE_TG_IDS_().includes(String(chatId));
    const reply=BULBHUL_CHAT_API_({message:text,empCode:isMD?'DC002':'',source:'TELEGRAM'});
    DC_SEND_TG_MESSAGE_(chatId,String(reply||'Ji, bataiye?').slice(0,4000));
  } catch(e){ LOG_ERR_('TG_AI',chatId,e.message); }
  return'OK';
}

function P1_TG_DUPLICATE_(updateId) {
  if(!updateId)return false;
  const p=PropertiesService.getScriptProperties();
  const last=Number(p.getProperty('P1_TG_LAST_UPDATE_ID')||0),now=Number(updateId);
  if(now<=last)return true;
  p.setProperty('P1_TG_LAST_UPDATE_ID',String(now));
  return false;
}

function P1_SET_TG_WEBHOOK_() {
  const token=DC_CFG.TG_TOKEN,url=P1_GET_EXEC_URL_(); if(!token||!url){Logger.log('⚠ TG_TOKEN or exec URL missing');return;}
  UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/deleteWebhook',{method:'post',contentType:'application/json',muteHttpExceptions:true,payload:JSON.stringify({drop_pending_updates:true})});
  Utilities.sleep(1000);
  Logger.log(UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/setWebhook',{method:'post',contentType:'application/json',muteHttpExceptions:true,payload:JSON.stringify({url,allowed_updates:['message'],drop_pending_updates:true})}).getContentText());
}

/* ================================================================
   SECTION 19 — ELIGIBILITY + DASHBOARD
   ================================================================ */

function P1_CHECK_ELIGIBILITY_(data) {
  data=data||{};
  const income=Number(data.MONTHLY_INCOME||data.monthly_income||0),emi=Number(data.EXISTING_EMI||data.existing_emi||0);
  const age=Number(data.AGE||data.age||25),tenure=Number(data.TENURE||data.tenure||36);
  const empType=String(data.EMPLOYMENT_TYPE||data.employment_type||'salaried').toLowerCase();
  const cibil=Number(data.CIBIL_SCORE||data.CREDIT_SCORE||data.cibil_score||700);
  if(income<15000)return{eligible:false,reason:'Min income ₹15,000 required'};
  if(age<18||age>60)return{eligible:false,reason:'Age 18–60 required'};
  const maxFOIR=empType==='salaried'?0.55:0.50,avail=income*maxFOIR-emi;
  if(avail<=0)return{eligible:false,reason:'EMI exceeds FOIR limit',foir:Math.round(emi/income*100)};
  const rate=0.13/12,eligAmt=Math.floor(avail*(1-Math.pow(1+rate,-tenure))/rate),mult=cibil>=760?1.2:cibil>=700?1.0:0.8;
  return{eligible:true,amount:Math.floor(eligAmt*mult),foir:Math.round((emi+avail*0.3)/income*100),maxTenure:tenure,creditBoost:cibil>=760,reason:'Eligible'};
}

function P1_GET_STAFF_DASHBOARD_DATA_(empCode) {
  try {
    empCode=String(empCode||'').trim().toUpperCase();
    const emp=empCode?FIND_EMPLOYEE_FULL_(empCode):null;
    const access=emp?String(emp.DASHBOARD_ACCESS||emp.ROLE||'STAFF').toUpperCase():'STAFF';
    let data=GET_MASTER_SNAPSHOT_();
    if(!['MD','FOUNDER','ADMIN','MANAGING DIRECTOR'].some(r=>access.includes(r))&&!['MANAGER','HR','ACCOUNTS'].some(r=>access.includes(r)))
      data=data.filter(r=>String(r.EMP_CODE||'').toUpperCase()===empCode);
    const sOf=r=>String(r.CASE_CATEGORY||'OPEN').toUpperCase();
    const stats={total:data.length,approved:data.filter(r=>['APPROVED','DISBURSED','DISBURSE'].includes(sOf(r))).length,review:data.filter(r=>['OPEN','INTERESTED','CALLBACK'].includes(sOf(r))).length,volume:data.reduce((s,r)=>s+Number(r.REQUIRED_LOAN_AMOUNT||0),0)};
    const cases=data.slice(0,150).map(r=>({leadId:r.LEAD_ID||'',clientName:r.CLIENT_NAME||'',mobile:r.CLIENT_MOBILE||'',loanType:r.LOAN_TYPE||'',amount:r.REQUIRED_LOAN_AMOUNT||'',bank:r.PREFERRED_BANK||'',status:sOf(r),tatStatus:r.TAT_STATUS||'ACTIVE',empCode:r.EMP_CODE||''}));
    return{ok:true,staff:{NAME:emp?emp.NAME:'Team',DESIGNATION:emp?(emp.ROLE||''):'',DEPARTMENT:emp?(emp.DEPARTMENT||''):''},access,stats,cases,products:GET_ACTIVE_LOAN_PRODUCTS_(),banks:P1_GET_BANK_OPTIONS_MAP_()};
  } catch(e){ LOG_ERR_('P1_GET_STAFF_DASHBOARD_DATA',empCode,e.message); return{ok:false,err:e.message,stats:{total:0,approved:0,review:0,volume:0},cases:[]}; }
}

function P1_GET_STAFF_PUBLIC_DATA_(empCode) {
  try {
    empCode=String(empCode||'').trim().toUpperCase();
    const emp=empCode?FIND_EMPLOYEE_FULL_(empCode):null; if(!emp)return null;
    const base=P1_GET_EXEC_URL_(),e=encodeURIComponent(empCode);
    const avatar=emp.PROFILE_PIC||`https://ui-avatars.com/api/?name=${encodeURIComponent(emp.NAME||empCode)}&background=d4af37&color=0a2540&size=160`;
    const at=encodeURIComponent(P1_MINT_ACCESS_TOKEN_(empCode));
    return{ok:true,empCode,name:emp.NAME,role:emp.ROLE||'RM',dept:emp.DEPARTMENT||'',mobile:emp.MOBILE||'',email:emp.EMAIL||'',profilePic:avatar,formLink:`${base}?page=form&emp=${e}`,dashboardLink:`${base}?page=dashboard&emp=${e}`,cardLink:`${base}?page=card&emp=${e}`,callingLink:`${base}?page=calling&emp=${e}&access_token=${at}`,voiceLink:`${base}?page=voice&emp=${e}&access_token=${at}`};
  } catch(e){ LOG_ERR_('P1_GET_STAFF_PUBLIC_DATA',empCode,e.message); return null; }
}

/* ================================================================
   SECTION 20 — TRIGGERS + ONEDIT
   ================================================================ */

// Lightweight onEdit — heavy ops deferred
function onEdit(e) {
  try {
    if(!e||!e.range)return;
    const sh=e.range.getSheet(),name=sh.getName(),row=e.range.getRow(),col=e.range.getColumn();
    if(row<2)return;

    // ALL_EMPLOYEES: once the core identity fields exist, complete the schema
    // and create this employee's public links automatically.
    if(name==='ALL_EMPLOYEES'){
      try { P1_SYNC_EMPLOYEE_ROW_(sh,row); } catch(e) { LOG_ERR_('onEdit.ALL_EMPLOYEES','',e.message); }
      return;
    }

    // Auto LAST_UPDATED (lightweight — single cell write)
    try {
      const headers=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
      const luIdx=headers.findIndex(h=>{const n=String(h).toUpperCase().trim();return n==='LAST_UPDATED'||n==='LAST SYNC';});
      if(luIdx>-1&&col!==luIdx+1)sh.getRange(row,luIdx+1).setValue(new Date());
    } catch(_){}

    // COMMON_ENTRY: auto-fill emp details only (lightweight)
    if(name==='COMMON_ENTRY'){
      try {
        const h=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(DC_NORM_);
        const iE=h.indexOf('EMP_CODE');
        if(col===iE+1&&e.value){
          const emp=FIND_EMPLOYEE_FULL_(String(e.value).trim().toUpperCase());
          if(emp){
            const fills={SALES_NAME:emp.NAME,MANAGER_EMAIL:emp.MANAGER_EMAIL,EMPLOYEE_EMAIL:emp.EMAIL};
            Object.keys(fills).forEach(k=>{const ci=h.indexOf(DC_NORM_(k));if(ci>=0&&fills[k])sh.getRange(row,ci+1).setValue(fills[k]);});
          }
        }
        // LEAD_ID auto-generate
        const iL=h.indexOf('LEAD_ID');
        if(iL>-1&&!sh.getRange(row,iL+1).getValue()){
          const iM=h.indexOf('CLIENT_MOBILE');
          const mob=iM>-1?DC_CLEAN_MOBILE_(sh.getRange(row,iM+1).getValue()):'0000';
          sh.getRange(row,iL+1).setValue('L'+(mob.slice(-4)||'0000')+'_'+Date.now());
        }
      } catch(_){}
    }

    // MASTER_DATA: status colour + disbursal trigger
    if(name==='MASTER_DATA'){
      try {
        const h=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(DC_NORM_);
        const iC=h.indexOf('CASE_CATEGORY');
        if(col-1===iC){
          const cs=String(sh.getRange(row,iC+1).getValue()||'').toUpperCase();
          APPLY_TAT_COLOUR_(sh,row,cs);
          if(cs==='DISBURSE'||cs==='DISBURSED'){
            const rowData=sh.getRange(row,1,1,h.length).getValues()[0];
            const obj={};h.forEach((k,i)=>{obj[k]=rowData[i];});
            NOTIFY_ACCOUNTS_ON_DISBURSE_(obj);
          }
        }
      } catch(_){}
    }

    // HR_MD_APPROVAL: flag approved staff
    if(name==='HR_MD_APPROVAL'){
      try {
        const h=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(DC_NORM_);
        const iS=h.indexOf('CASE_CATEGORY'),iE=h.indexOf('EMP_CODE'),iO=h.indexOf('ONBOARD_DONE');
        if(col===iS+1){
          const st=String(sh.getRange(row,iS+1).getValue()||'').toUpperCase();
          const ec=String(iE>-1?sh.getRange(row,iE+1).getValue():'').toUpperCase();
          const od=String(iO>-1?sh.getRange(row,iO+1).getValue():'').toUpperCase();
          if(st==='APPROVED'&&ec&&od!=='YES'){
            DC_SEND_TG_(`🟢 Staff APPROVED: ${ec} | ${st}\n→ HR: provision karo.`);
            if(iO>-1)sh.getRange(row,iO+1).setValue('PENDING_PROVISION');
          }
        }
      } catch(_){}
    }
  } catch(err){ LOG_ERR_('onEdit','',err.message); }
}

function P1_FORM_SUBMIT(e) {
  try {
    if(!e)return;
    const nv=e.namedValues||{};
    const lead={};
    Object.keys(nv).forEach(k=>{lead[DC_NORM_(k)]=Array.isArray(nv[k])?nv[k][0]:nv[k];});
    const isStaff=(lead['EMPLOYEES_NAME']||lead['EMP_CODE']||lead['EMPLOYEE_EMAIL'])&&!lead['CLIENT_NAME']&&!lead['CLIENT_MOBILE'];
    if(isStaff){
      const hrSh=GET_OR_CREATE_('HR_MD_APPROVAL');
      hrSh.appendRow(P1_BUILD_ROW_(P1_ENSURE_HEADERS_(hrSh,P1_TAB_MAP.HR_MD_APPROVAL()),Object.assign({TIMESTAMP:new Date(),STATUS:'PENDING',ONBOARD_DONE:'NO'},lead)));
      DC_SEND_TG_(`📝 *New Staff Form*\n${lead.EMPLOYEES_NAME||''} | ${lead.ROLE||''}\n→ Pending HR/MD Approval`);
      return;
    }
    DC_PROCESS_LEAD_(Object.assign(lead,{SOURCE_TYPE:'GOOGLE_FORM',SOURCE_NAME:lead.SOURCE_NAME||'Google Form'}));
  } catch(err){ LOG_ERR_('P1_FORM_SUBMIT','',err.message); }
}

/* ================================================================
   SECTION 21 — SETUP + MIS TRIGGERS
   ================================================================ */
function SETUP_STANDALONE_() {
  Logger.log('═══════════════════════════════');
  Logger.log('  DIVYANSHI CAPITAL — SETUP');
  Logger.log('═══════════════════════════════');

  if (!MASTER_SS_ID || MASTER_SS_ID.length < 20) {
    throw new Error('MASTER_SS_ID missing');
  }

  const props = PropertiesService.getScriptProperties();
  const setupValues = {
    MASTER_FILE_ID: MASTER_SS_ID,
    P1_MASTER_FILE_ID: MASTER_SS_ID
  };

  try {
    const execUrl = ScriptApp.getService().getUrl();
    if (execUrl) {
      setupValues.P1_EXEC_URL = execUrl;
      setupValues.MAIN_SERVER_EXEC_URL = execUrl;
      Logger.log('✅ Exec URL: ' + execUrl);
    }
  } catch (_) {
    Logger.log('⚠ Deploy as Web App first');
  }

  props.setProperties(setupValues);

  let updated = 0;

  // Ensure MALLIK_API_KEY exists in Script Properties.
  // Never overwrite an existing key.
  if (!props.getProperty('MALLIK_API_KEY')) {
    props.setProperty(
      'MALLIK_API_KEY',
      (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '')
    );
    updated++;
  }

  INVALIDATE_ALL_CACHES_();
  Logger.log(`✅ ${updated} propert${updated === 1 ? 'y' : 'ies'} saved. Cache cleared.`);
  return 'SETUP_OK';
}

function DC_INSTALL_P1_FINAL_() {
  const ss=DC_GET_SS_();
  Object.keys(P1_TAB_MAP).forEach(name=>{if(!ss.getSheetByName(name))ss.insertSheet(name);P1_ENSURE_HEADERS_(ss.getSheetByName(name),P1_TAB_MAP[name]());});
  ['AVATAR_ACTIVITY_LOG','NOTIFY_QUEUE'].forEach(n=>{if(!ss.getSheetByName(n))ss.insertSheet(n);});
  const snSh=ss.getSheetByName('SOURCE_NAME');
  if(snSh&&snSh.getLastRow()<=1){
    P1_ENSURE_HEADERS_(snSh,P1_TAB_MAP.SOURCE_NAME());
    snSh.getRange(2,1,17,2).setValues([['Sales Team','SALES'],['Manual Calling','SALES'],['AI Auto Calling','SALES'],['WhatsApp','SALES'],['Website','SALES'],['Referral','SALES'],['Walk-in','SALES'],['Instagram','SALES'],['Facebook','SALES'],['LinkedIn','SALES'],['Email Campaign','SALES'],['Bank Referral','SALES'],['GoDial Auto Calling','SALES'],['DSA','LOGIN DEPARTMENT'],['Send to Login','LOGIN DEPARTMENT'],['MIS-Incoming','REPORT'],['ONBOARD','HR']]);
  }
  // Make ALL_EMPLOYEES self-maintaining before staff links are shared.
  P1_NORMALIZE_ALL_EMPLOYEES_();
  const managed=['MIS_PIPELINE_RUN_','SEND_EVENING_MIS_REPORT_','ATTENDANCE_EOD_REPORT_','onEdit','P1_FORM_SUBMIT'];
  ScriptApp.getProjectTriggers().forEach(t=>{if(managed.includes(t.getHandlerFunction()))ScriptApp.deleteTrigger(t);});
  ScriptApp.newTrigger('MIS_PIPELINE_RUN_').timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger('SEND_EVENING_MIS_REPORT_').timeBased().atHour(19).everyDays(1).create();
  ScriptApp.newTrigger('ATTENDANCE_EOD_REPORT_').timeBased().atHour(20).everyDays(1).create();
  try{ScriptApp.newTrigger('onEdit').forSpreadsheet(ss).onEdit().create();}catch(_){}
  try{ScriptApp.newTrigger('P1_FORM_SUBMIT').forSpreadsheet(ss).onFormSubmit().create();}catch(_){}
  P1_SET_TG_WEBHOOK_();
  Logger.log('✅ DC_INSTALL_P1_FINAL_ complete');
  return'INSTALL_OK';
}

function MIS_PIPELINE_RUN_() {
  const lock=LockService.getScriptLock(); if(!lock.tryLock(60000)){Logger.log('MIS: lock busy.');return;}
  try{FETCH_AND_PROCESS_MIS_MAILS_();MIS_15MIN_FULL_SYNC_();PropertiesService.getScriptProperties().setProperty('MIS_LAST_RUN',new Date().toISOString());Logger.log('✅ MIS done');}
  catch(e){LOG_ERR_('MIS_PIPELINE_RUN','',e.message);}
  finally{try{lock.releaseLock();}catch(_){}}
}

function SEND_EVENING_MIS_REPORT_() {
  try {
    const today=Utilities.formatDate(new Date(),'Asia/Kolkata','yyyy-MM-dd');
    const allCases=GET_MASTER_SNAPSHOT_();
    const todayCases=allCases.filter(c=>{try{return Utilities.formatDate(new Date(c.TIMESTAMP||0),'Asia/Kolkata','yyyy-MM-dd')===today;}catch(_){return false;}});
    const statusCount={},empCount={}; let totalAmt=0;
    todayCases.forEach(c=>{const cs=String(c.CASE_CATEGORY||'OPEN').toUpperCase(),ec=String(c.EMP_CODE||'UNASSIGNED');statusCount[cs]=(statusCount[cs]||0)+1;empCount[ec]=(empCount[ec]||0)+1;totalAmt+=Number(c.REQUIRED_LOAN_AMOUNT||0);});
    const empMap=DC_BUILD_EMP_MAP_();
    let tgMsg=`📊 *DAILY MIS — ${today}*\nLeads: *${todayCases.length}* | ₹${totalAmt.toLocaleString('en-IN')}\n\n*STATUS:*\n`;
    Object.entries(statusCount).sort((a,b)=>b[1]-a[1]).forEach(([s,c])=>{tgMsg+=`• ${s}: ${c}\n`;});
    tgMsg+='\n*TOP PERFORMERS:*\n';
    Object.entries(empCount).sort((a,b)=>b[1]-a[1]).slice(0,5).forEach(([code,cnt])=>{const name=(empMap[code]&&empMap[code].NAME)||code;tgMsg+=`• ${name}(${code}): ${cnt}\n`;});
    DC_SEND_TG_(tgMsg);
    if(MailApp.getRemainingDailyQuota()>0)MailApp.sendEmail({to:DC_CFG.COMPANY.MD_EMAIL,cc:DC_CFG.COMPANY.FOUNDER_EMAIL+','+DC_CFG.COMPANY.HR_EMAIL,subject:'[DAILY MIS] Divyanshi Capital — '+today,body:tgMsg.replace(/\*/g,'').replace(/_/g,''),name:'Bulbhul AI'});
    Logger.log('✅ Evening MIS sent: '+today);
  } catch(e){ LOG_ERR_('SEND_EVENING_MIS_REPORT','',e.message); }
}

function ATTENDANCE_EOD_REPORT_() {
  try {
    const sh=SHEET_('ATTENDANCE_LOG'); if(!sh||sh.getLastRow()<2)return;
    const today=Utilities.formatDate(new Date(),'Asia/Kolkata','yyyy-MM-dd');
    const data=sh.getDataRange().getValues(); const h=data[0].map(DC_NORM_);
    const iDate=h.indexOf('DATE'),iCode=h.indexOf('EMP_CODE'),iName=h.indexOf('EMP_NAME'),iSt=h.indexOf('ATTENDANCE_STATUS');
    let rpt=`📋 *ATTENDANCE — ${today}*\n\n`,p=0,hd=0,ab=0;
    for(let i=1;i<data.length;i++){
      try{if(Utilities.formatDate(new Date(data[i][iDate]||0),'Asia/Kolkata','yyyy-MM-dd')!==today)continue;}catch(_){continue;}
      const st=String(data[i][iSt]||'ABSENT').toUpperCase();
      rpt+=`• ${data[i][iName]||data[i][iCode]}: ${st}\n`;
      if(st==='PRESENT')p++;else if(st==='HALF_DAY')hd++;else ab++;
    }
    DC_SEND_TG_(rpt+`\n✅ Present:${p} | 🟡 Half:${hd} | ❌ Absent:${ab}`);
  } catch(e){ LOG_ERR_('ATTENDANCE_EOD_REPORT','',e.message); }
}

/* ================================================================
   SECTION 22 — WEBAPP (doGet + doPost)
   ================================================================ */

function doGet(e) {
  e=e||{}; const p=e.parameter||{};
  const page=String(p.page||'home').trim().toLowerCase();
  let emp=String(p.emp||p.emp_code||'').trim().toUpperCase();
  if(!emp){try{const email=String(Session.getActiveUser().getEmail()||'').toLowerCase();if(email){const map=DC_BUILD_EMP_MAP_();for(const code of Object.keys(map)){if(map[code].EMAIL===email){emp=code;break;}}}}catch(_){}}
  try {
    const base=P1_GET_EXEC_URL_();
    if(page==='form'||page==='apply')return HtmlService.createHtmlOutputFromFile('smart_form').setTitle('Smart Intake | Divyanshi Capital').addMetaTag('viewport','width=device-width,initial-scale=1').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    if(page==='calling')return HtmlService.createHtmlOutputFromFile('calling').setTitle('Bulbhul Calling | Divyanshi Capital').addMetaTag('viewport','width=device-width,initial-scale=1').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    if(page==='voice')return HtmlService.createHtmlOutputFromFile('voice').setTitle('Bulbhul Voice | Divyanshi Capital').addMetaTag('viewport','width=device-width,initial-scale=1').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    const publicProfile=emp?P1_GET_PUBLIC_CARD_PROFILE_(emp):null;
    // Dashboard data is loaded only after client-side session verification; never embed case data in a public URL response.
    const bootData={baseUrl:base,page,emp,products:GET_ACTIVE_LOAN_PRODUCTS_(),banks:P1_GET_BANK_OPTIONS_MAP_(),staff:publicProfile,avatar:(page==='card'&&emp)?publicProfile:null,dashboard:null,eligibility:page==='elig'&&p.income?P1_CHECK_ELIGIBILITY_({MONTHLY_INCOME:Number(p.income),EXISTING_EMI:Number(p.emi||0),AGE:Number(p.age||28),LOAN_TYPE:p.loan||''}):null};
    let html=HtmlService.createHtmlOutputFromFile('index').getContent();
    html=html.split('__P1_BOOT_DATA_JSON__').join(JSON.stringify(bootData).replace(/</g,'\\u003c'));
    return HtmlService.createHtmlOutput(html).setTitle('Divyanshi Capital — P1 Digital Duniya').addMetaTag('viewport','width=device-width,initial-scale=1,maximum-scale=1').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch(err){ LOG_ERR_('doGet','PAGE_RENDER',err.message); return HtmlService.createHtmlOutput(`<div style="font-family:Arial;padding:40px"><h2 style="color:#dc2626">Load Error</h2><p>${err.message}</p></div>`); }
}

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents ? String(e.postData.contents) : '';
    if (!raw) return jsonResp_({ ok: false, err: 'No post data' });

    let body;
    try { body = JSON.parse(raw); } catch (_) { return jsonResp_({ ok: false, err: 'Invalid JSON' }); }
    if (!body || typeof body !== 'object') return jsonResp_({ ok: false, err: 'Object required' });

    // ── Telegram webhook (no auth needed) ──
    if (body.update_id && body.message) {
      if (P1_TG_DUPLICATE_(body.update_id)) return ContentService.createTextOutput('DUPLICATE');
      return ContentService.createTextOutput(P1_TG_HANDLE_(body));
    }

    const action   = String(body.action || '').trim();
    const savedKey = DC_CFG.API_KEY;
    const rcvdKey  = String(body.apiKey || '').trim();
    let auth = false;
    if (savedKey && rcvdKey && savedKey.length === rcvdKey.length) {
      let d = 0;
      for (let i = 0; i < savedKey.length; i++) d |= savedKey.charCodeAt(i) ^ rcvdKey.charCodeAt(i);
      auth = d === 0;
    }

    // ── Public actions — no auth required ──
    if (action === 'submit_lead')  return jsonResp_(P1_SMART_FORM_SUBMIT_(body.payload || body));
    if (action === 'get_products') return jsonResp_({ ok: true, data: GET_ACTIVE_LOAN_PRODUCTS_() });
    if (action === 'get_banks')    return jsonResp_({ ok: true, data: P1_GET_BANK_OPTIONS_MAP_() });
    if (action === 'health_check') return jsonResp_({ ok: true, ts: new Date().toISOString(), version: 'V9.3.0-FAST' });

    // ── Auth gate ──
    if (!auth) return jsonResp_({ ok: false, err: 'Unauthorized' });

    // ── payload resolved once for all authenticated actions ──
    const payload = (body.payload && typeof body.payload === 'object') ? body.payload : body;

    // ── Authenticated actions ──
    if (action === 'chat')             return jsonResp_({ ok: true, reply: BULBHUL_CHAT_API_(payload) });
    if (action === 'check_elig')       return jsonResp_({ ok: true, result: P1_CHECK_ELIGIBILITY_(payload) });
    if (action === 'manager_checkin')  return jsonResp_(MANAGER_SELFIE_CHECKIN_(payload.empCode, payload.half || 1));
    if (action === 'get_dashboard')    return jsonResp_(P1_GET_STAFF_DASHBOARD_DATA_(payload.empCode));
    if (action === 'update_lead')      return jsonResp_(UPDATE_LEAD_STATUS_(payload.query, payload.status, payload.remark));
    if (action === 'run_mis')          { MIS_PIPELINE_RUN_(); return jsonResp_({ ok: true, msg: 'MIS triggered' }); }
    if (action === 'clear_cache')      { INVALIDATE_ALL_CACHES_(); return jsonResp_({ ok: true, msg: 'All caches cleared' }); }
    if (action === 'get_avatar_profile') return jsonResp_(P1_GET_AVATAR_PROFILE_(payload.empCode));
    if (action === 'generate_post')    return jsonResp_(GENERATE_LOAN_POST_(payload.empCode, payload.loanType, payload.sourceName, payload.customMsg));
    if (action === 'post_facebook')    return jsonResp_(POST_TO_FACEBOOK_(payload.empCode, payload.message, payload.imageUrl));
    if (action === 'post_instagram')   return jsonResp_(POST_TO_INSTAGRAM_(payload.empCode, payload.caption, payload.imageUrl));
    if (action === 'avatar_learn')     { AVATAR_LEARN_(payload.empCode, payload.type, payload.data || {}); return jsonResp_({ ok: true }); }
    if (action === 'voice_notify')     return jsonResp_(GET_VOICE_NOTIFICATION_(payload.event, payload.data));
    if (action === 'verify_emp') return jsonResp_(P1_VERIFY_EMP(payload));

    return jsonResp_({ ok: false, err: 'Unknown action: ' + action });

  } catch (err) {
    LOG_ERR_('doPost', 'MAIN', err.message);
    return jsonResp_({ ok: false, err: 'Request failed' });
  }
}

function jsonResp_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
/* ================================================================
   SECTION 23 — PUBLIC WRAPPERS + MENU
   ================================================================ */

function BULBHUL_CHAT_API(d)          { return BULBHUL_CHAT_API_(d); }
function GET_ACTIVE_LOAN_PRODUCTS()   { return GET_ACTIVE_LOAN_PRODUCTS_(); }
function P1_GET_BANK_OPTIONS_MAP()    { return P1_GET_BANK_OPTIONS_MAP_(); }
function MANAGER_CHECKIN_API(d)       { return MANAGER_SELFIE_CHECKIN_(d.empCode,d.half||1); }
function RUN_MIS_PIPELINE_NOW()       { MIS_PIPELINE_RUN_(); }
function RUN_MIS_EVENING_REPORT()     { SEND_EVENING_MIS_REPORT_(); }
function CLEAR_CACHE_NOW()            { INVALIDATE_ALL_CACHES_(); Logger.log('✅ All caches cleared'); }

function P1_MAP_HTML_LINKS_() {
  const sh = SHEET_('ALL_EMPLOYEES');
  if (!sh) throw new Error('ALL_EMPLOYEES missing');
  return P1_NORMALIZE_ALL_EMPLOYEES_();
}

const P1_EMPLOYEE_CORE_FIELDS_=['EMP_CODE','EMPLOYEES_NAME','ROLE','DEPARTMENT','EMPLOYEE_EMAIL_ID','MOBILE','MANAGER_EMAIL_ID'];
const P1_PASSWORD_CONTROL_COLS_=['PASSWORD_RESET_INPUT','PASSWORD_STATUS','PASSWORD_CHANGED_AT'];

function P1_EMPLOYEE_HEADERS_(){ return P1_TAB_MAP.ALL_EMPLOYEES().concat(AVATAR_SOCIAL_COLS_,P1_PASSWORD_CONTROL_COLS_); }

/* HR/master-only reset control. The entered password is hashed in Script
 * Properties and the sheet cell is immediately cleared; passwords are never
 * retained or displayed in ALL_EMPLOYEES. Protect this column in Sheets. */
function P1_PROCESS_EMPLOYEE_PASSWORD_RESET_(sh,row,headers) {
  const h=headers.map(DC_NORM_), idx=n=>h.indexOf(DC_NORM_(n));
  const code=String(sh.getRange(row,idx('EMP_CODE')+1).getValue()||'').trim().toUpperCase();
  const inputIndex=idx('PASSWORD_RESET_INPUT'), statusIndex=idx('PASSWORD_STATUS'), changedIndex=idx('PASSWORD_CHANGED_AT');
  if(!code||inputIndex<0||statusIndex<0||changedIndex<0)return;
  const inputCell=sh.getRange(row,inputIndex+1), password=String(inputCell.getValue()||'');
  if(!password)return;
  inputCell.clearContent();
  if(password.length<8||password.length>64){sh.getRange(row,statusIndex+1).setValue('RESET_REJECTED: 8–64 characters required');return;}
  const props=PropertiesService.getScriptProperties(),salt=Utilities.getUuid();
  props.setProperties({['PIN_HASH_'+code]:P1_PIN_DIGEST_(code,password,salt),['PIN_SALT_'+code]:salt});
  props.deleteProperty('PIN_'+code); SC_.remove(P1_AUTH_FAILURE_KEY_(code));
  sh.getRange(row,statusIndex+1).setValue('PASSWORD_SET');
  sh.getRange(row,changedIndex+1).setValue(new Date());
}

/* Idempotent schema + per-row employee link provisioning. It never creates a
   Telegram or WhatsApp identity: those require a separately verified channel. */
function P1_SYNC_EMPLOYEE_ROW_(sh,row) {
  const headers=P1_ENSURE_HEADERS_(sh,P1_EMPLOYEE_HEADERS_());
  if(row<2) return {ok:false,err:'Header row'};
  P1_PROCESS_EMPLOYEE_PASSWORD_RESET_(sh,row,headers);
  const h=headers.map(DC_NORM_), idx=n=>h.indexOf(DC_NORM_(n));
  const values=sh.getRange(row,1,1,headers.length).getValues()[0];
  const read=n=>String(values[idx(n)]||'').trim();
  const missing=P1_EMPLOYEE_CORE_FIELDS_.filter(n=>!read(n));
  if(missing.length) return {ok:false,pending:true,missing};
  const code=read('EMP_CODE').toUpperCase(), name=read('EMPLOYEES_NAME')||code, base=P1_GET_EXEC_URL_();
  const write=(n,v)=>{const i=idx(n);if(i>=0)sh.getRange(row,i+1).setValue(v);};
  const formula=(n,url,label)=>{const i=idx(n);if(i>=0)sh.getRange(row,i+1).setFormula(`=HYPERLINK("${url}","${label}")`);};
  const url=page=>`${base}?page=${page}&emp=${encodeURIComponent(code)}`;
  if(!read('BRAND_NAME')) write('BRAND_NAME','Divyanshi Capital');
  if(!read('ACTIVE_STATUS')) write('ACTIVE_STATUS','PENDING_SETUP');
  if(!read('CREATED_AT')) write('CREATED_AT',new Date());
  if(!read('WHATSAPP_VERIFIED')) write('WHATSAPP_VERIFIED','PENDING_VERIFICATION');
  if(!read('TELEGRAM_STATUS')) write('TELEGRAM_STATUS','PENDING_VERIFICATION');
  if(!read('P1_AVATAR_URL')) write('P1_AVATAR_URL',`https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=d4af37&color=0a2540&size=200`);
  if(!base){write('P1_SYNC_STATUS','WEB_APP_URL_REQUIRED');write('UPDATED_AT',new Date());return {ok:false,pending:true,err:'Web App URL missing'};}
  formula('P1_WEBSITE_URL',url('home'),'🌐 Employee Website');
  formula('P1_DIGITAL_CARD_URL',url('card'),'💼 Digital Card');
  formula('P1_SMART_FORM_URL',url('form'),'📝 Apply Link');
  formula('P1_DASHBOARD_URL',url('dashboard'),'🔐 Staff Login');
  write('P1_QR_TEXT',url('card'));
  write('P1_SYNC_STATUS','CONNECTED');write('P1_LAST_SYNC_AT',new Date());write('UPDATED_AT',new Date());
  INVALIDATE_ALL_CACHES_();
  return {ok:true,empCode:code};
}

function P1_NORMALIZE_ALL_EMPLOYEES_() {
  const sh=SHEET_('ALL_EMPLOYEES'); if(!sh)throw new Error('ALL_EMPLOYEES missing');
  P1_ENSURE_HEADERS_(sh,P1_EMPLOYEE_HEADERS_());
  const last=sh.getLastRow(); if(last<2)return 'ALL_EMPLOYEES schema ready; add employee rows to provision links.';
  let updated=0,pending=0;
  for(let row=2;row<=last;row++){const r=P1_SYNC_EMPLOYEE_ROW_(sh,row);if(r.ok)updated++;else if(r.pending)pending++;}
  styleHeaderRow_(sh,sh.getLastColumn());
  Logger.log(`✅ Employee automation: ${updated} connected, ${pending} pending core fields/configuration`);
  return `Employee automation complete: ${updated} connected, ${pending} pending`;
}

function HEALTH_CHECK_() {
  Logger.log('════════════════════════════');
  Logger.log('  BULBHUL V9.3.0-FAST HEALTH');
  Logger.log('════════════════════════════');
  let p=0,f=0;
  function chk(label,fn){try{const r=fn();Logger.log('✅ '+label+(r?': '+r:''));p++;}catch(e){Logger.log('❌ '+label+': '+e.message);f++;}}
  chk('MASTER_SS_ID',()=>{if(!MASTER_SS_ID||MASTER_SS_ID.length<20)throw new Error('Invalid');return MASTER_SS_ID;});
  chk('Sheet open',()=>{const ss=DC_GET_SS_();return ss.getName()+'('+ss.getSheets().length+' tabs)';});
  chk('ALL_EMPLOYEES',()=>{const sh=SHEET_('ALL_EMPLOYEES');if(!sh||sh.getLastRow()<2)throw new Error('Empty');return(sh.getLastRow()-1)+' employees';});
  chk('AI keys',()=>{return[!!DC_CFG.DEEPSEEK_KEY,!!DC_CFG.OPENAI_KEY,!!DC_CFG.GEMINI_KEY].filter(Boolean).length+'/3 set';});
  chk('Exec URL',()=>{const url=P1_GET_EXEC_URL_();if(!url)throw new Error('Not deployed');return url.slice(0,55)+'...';});
  chk('Emp cache',()=>{const m=DC_BUILD_EMP_MAP_();return Object.keys(m).length+' loaded';});
  chk('ScriptCache',()=>{SC_.put('HC_TEST','1',10);const v=SC_.get('HC_TEST');if(v!=='1')throw new Error('Failed');SC_.remove('HC_TEST');return'OK';});
  Logger.log('════════════════════════════');
  Logger.log('  '+p+' PASS | '+f+' FAIL');
  Logger.log(f===0?'  ✅ HEALTHY':'  ❌ Fix above');
  Logger.log('════════════════════════════');
  return{pass:p,fail:f};
}

function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('🤖 BULBHUL AI')
      .addItem('▶ Run MIS Pipeline Now',        'RUN_MIS_PIPELINE_NOW')
      .addItem('📊 Evening MIS Report',          'RUN_MIS_EVENING_REPORT')
      .addSeparator()
      .addItem('🔗 Map All Employee P1 Links',   'P1_MAP_HTML_LINKS_')
      .addItem('👤 Install Avatar Social Schema','INSTALL_AVATAR_SOCIAL_SCHEMA_')
      .addItem('⚙ Full Install (Run Once)',      'DC_INSTALL_P1_FINAL_')
      .addItem('📡 Set Telegram Webhook',        'P1_SET_TG_WEBHOOK_')
      .addSeparator()
      .addItem('🩺 Health Check',                'HEALTH_CHECK_')
      .addItem('🗑 Clear All Caches',            'CLEAR_CACHE_NOW')
      .addSeparator()
      .addItem('🛠 Technical Fixes (Admin)',      'technicalFixes')
      .addToUi();
  } catch(_){}
}

/* ================================================================
   TECHNICAL FIXES — Full admin panel
   ================================================================ */
function technicalFixes() {
  let ui;
  try { ui = SpreadsheetApp.getUi(); } catch(_) {
    Logger.log('⚠ Run this from the Sheet menu, not Script Editor.\nOpen Sheet → 🤖 BULBHUL AI → 🛠 Technical Fixes');
    return;
  }
  const props = PropertiesService.getScriptProperties();

  // ── Option picker ──
  const pick = ui.alert(
    '🛠 BULBHUL Technical Fixes',
    'Choose action:\n\n' +
    '1 → Update Script Properties (MASTER_FILE_ID, API keys, exec URL)\n' +
    '2 → Fix / Provision individual staff (EMP_CODE)\n' +
    '3 → Force re-map ALL employee P1 links\n' +
    '4 → Clear all caches\n' +
    '5 → Run Health Check\n\n' +
    'Click YES for option 1, NO for option 2, CANCEL to show options 3-5 next.',
    ui.ButtonSet.YES_NO_CANCEL
  );

  if (pick === ui.Button.YES) {
    _techFix_ScriptProperties_(ui, props);
  } else if (pick === ui.Button.NO) {
    const empResp = ui.prompt(
      '🛠 Fix Individual Staff',
      'Enter EMP_CODE (e.g. DC010):',
      ui.ButtonSet.OK_CANCEL
    );
    if (empResp.getSelectedButton() === ui.Button.OK) {
      const code = empResp.getResponseText().trim().toUpperCase();
      if (code) {
        const result = fixIndividualStaff(code);
        ui.alert('Result', result, ui.ButtonSet.OK);
      }
    }
  } else if (pick === ui.Button.CANCEL) {
    const pick2 = ui.alert(
      '🛠 More Options',
      '3 → Re-map ALL P1 links\n4 → Clear caches\n5 → Health Check\n\nYES=3  NO=4  CANCEL=5',
      ui.ButtonSet.YES_NO_CANCEL
    );
    if      (pick2 === ui.Button.YES)    { const r=P1_MAP_HTML_LINKS_();   ui.alert('Done', r, ui.ButtonSet.OK); }
    else if (pick2 === ui.Button.NO)     { CLEAR_CACHE_NOW();              ui.toast('Caches cleared','BULBHUL',3); }
    else if (pick2 === ui.Button.CANCEL) { const r=HEALTH_CHECK_();        ui.alert('Health Check', r.pass+' PASS | '+r.fail+' FAIL', ui.ButtonSet.OK); }
  }

  ui.toast('Technical Fixes session complete', 'BULBHUL', 3);
}

function _techFix_ScriptProperties_(ui, props) {
  const keys = [
    'MASTER_FILE_ID','P1_EXEC_URL','MALLIK_API_KEY',
    'DEEPSEEK_API_KEY','OPENAI_API_KEY','GEMINI_API_KEY',
    'TG_TOKEN','META_WA_TOKEN','META_WA_PHONE_ID',
    'MD_TG_CHAT_ID','FOUNDER_TG_CHAT_ID','HR_TG_CHAT_ID','ACCOUNTS_TG_CHAT_ID',
    'TEMPLATE_PERSONAL_FILE_ID','ONBOARDING_DRIVE_FOLDER_ID'
  ];

  const current = keys.map(k => {
    const v = props.getProperty(k)||'';
    const display = v.length > 30 ? v.slice(0,15)+'…'+v.slice(-10) : (v||'NOT SET');
    return `${k}: ${display}`;
  }).join('\n');

  const resp = ui.prompt(
    '🔑 Script Properties — Current State',
    current + '\n\n─────────────────────────────\nFormat: KEY=VALUE (one per line)\nLeave blank to keep existing values.',
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;

  const lines = resp.getResponseText().trim().split('\n');
  let updated = 0;
  lines.forEach(line => {
    const eq = line.indexOf('=');
    if (eq < 1) return;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim();
    if (k && v) { props.setProperty(k, v); updated++; }
  });

  // Auto-detect exec URL if empty
  if (!props.getProperty('P1_EXEC_URL')) {
    try {
      const url = ScriptApp.getService().getUrl();
      if (url) {
        props.setProperty('P1_EXEC_URL', url);
        props.setProperty('MAIN_SERVER_EXEC_URL', url);
        updated++;
      }
    } catch(_){}
  }

  // Always ensure MALLIK_API_KEY exists — never overwrite an existing key.
  if (!props.getProperty('MALLIK_API_KEY')) {
    props.setProperty(
      'MALLIK_API_KEY',
      (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '')
    );
    updated++;
  }

  INVALIDATE_ALL_CACHES_();
  ui.toast(`${updated} propert${updated===1?'y':'ies'} saved. Cache cleared.`, 'BULBHUL', 4);
}

/* ================================================================
   FIX INDIVIDUAL STAFF
   Fully provisions or repairs one employee by EMP_CODE:
   ① Finds row in ALL_EMPLOYEES using DC_NORM_ (no hardcoded column)
   ② If PERSONAL_FILE_ID missing → creates personal file from template
   ③ Writes MY_CASES + SALES_ACTIVITY headers + locks MY_CASES
   ④ Re-maps all P1 link columns for that row
   ⑤ Sets P1_SYNC_STATUS = CONNECTED + highlights row green
   ⑥ Sends welcome TG notification
   Returns status string (shown in UI alert + logged).
   ================================================================ */
function fixIndividualStaff(empCodeOrSheet, empCodeArg) {
  // Accept old signature fixIndividualStaff(sheet, empCode) or new fixIndividualStaff(empCode)
  let empCode;
  if (typeof empCodeOrSheet === 'string') {
    empCode = empCodeOrSheet.trim().toUpperCase();
  } else {
    empCode = String(empCodeArg||'').trim().toUpperCase();
  }
  if (!empCode) return 'ERR: EMP_CODE required';

  const log = [];

  try {
    // ── 1. Find employee ──
    CLEAR_EMP_CACHE_();
    const emp = FIND_EMPLOYEE_FULL_(empCode);
    if (!emp) return `ERR: ${empCode} not found in ALL_EMPLOYEES`;
    log.push(`✅ Found: ${emp.NAME} | ${emp.ROLE} | ${emp.DEPARTMENT}`);

    const sh = SHEET_('ALL_EMPLOYEES');
    if (!sh) return 'ERR: ALL_EMPLOYEES sheet missing';

    // ── 2. Find actual row (DC_NORM_ based, not hardcoded column) ──
    const data    = sh.getDataRange().getValues();
    const headers = data[0].map(DC_NORM_);
    const iCode   = headers.indexOf('EMP_CODE');
    const iFile   = headers.indexOf('PERSONAL_FILE_ID');
    if (iCode === -1) return 'ERR: EMP_CODE column not found';

    let empRowNum = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][iCode]||'').trim().toUpperCase() === empCode) {
        empRowNum = i + 1; break;
      }
    }
    if (empRowNum === -1) return `ERR: ${empCode} row not found in sheet`;
    log.push(`✅ Row: ${empRowNum}`);

    // ── 3. Personal file — create if missing ──
    let fileId = iFile > -1 ? String(data[empRowNum-1][iFile]||'').trim() : '';
    if (!fileId || fileId.length < 15) {
      const props          = PropertiesService.getScriptProperties();
      const templateId     = props.getProperty('TEMPLATE_PERSONAL_FILE_ID')||props.getProperty('SARI_COMMON_KNOWLEDGE_FILE_ID')||'';
      const parentFolderId = props.getProperty('ONBOARDING_DRIVE_FOLDER_ID')||props.getProperty('SARI_FOLDER_ID')||'';
      if (!templateId || !parentFolderId) {
        log.push('⚠ No template/folder IDs — skipping personal file creation.\n  Set TEMPLATE_PERSONAL_FILE_ID + ONBOARDING_DRIVE_FOLDER_ID in Script Properties.');
      } else {
        try {
          const folder = DriveApp.getFolderById(parentFolderId);
          const copy   = DriveApp.getFileById(templateId).makeCopy(`${empCode} - ${emp.NAME}`, folder);
          fileId = copy.getId();
          if (iFile > -1) sh.getRange(empRowNum, iFile + 1).setValue(fileId);
          log.push(`✅ Personal file created: ${fileId}`);
        } catch(fe){ log.push('❌ Personal file creation failed: '+fe.message); }
      }
    } else {
      log.push('✅ Personal file exists: '+fileId.slice(0,20)+'…');
    }

    // ── 4. Write MY_CASES + SALES_ACTIVITY headers + lock ──
    if (fileId && fileId.length > 15) {
      try {
        const pss    = P1_OPEN_SS_SAFE_(fileId);
        const mcSh   = pss.getSheetByName('MY_CASES') || pss.insertSheet('MY_CASES');
        P1_ENSURE_HEADERS_(mcSh, P1_TAB_MAP.MASTER_DATA());
        LOCK_MY_CASES_(mcSh, empCode);
        const saSh   = pss.getSheetByName('SALES_ACTIVITY') || pss.insertSheet('SALES_ACTIVITY');
        P1_ENSURE_HEADERS_(saSh, ['TIMESTAMP','LEAD_ID','CLIENT_NAME','CLIENT_MOBILE','LOAN_TYPE','AMOUNT','BANK','STATUS','REMARKS','TAT_STATUS']);
        const blSh   = pss.getSheetByName('BULBHUL_LEARN') || pss.insertSheet('BULBHUL_LEARN');
        P1_ENSURE_HEADERS_(blSh, ['TIMESTAMP','TYPE','EMP_CODE','SUMMARY','OUTCOME','SCORE','RAW']);
        log.push('✅ MY_CASES, SALES_ACTIVITY, BULBHUL_LEARN headers set + locked');
      } catch(pe){ log.push('❌ Personal file setup failed: '+pe.message); }
    }

    // ── 5. Re-map P1 link columns for this row only ──
    try {
      const base = P1_GET_EXEC_URL_();
      const e    = encodeURIComponent(empCode);
      const name = emp.NAME || empCode;
      const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=d4af37&color=0a2540&size=160`;
      const personalUrl = fileId ? `https://docs.google.com/spreadsheets/d/${fileId}/edit` : '';
      const qrUrl = `${base}?page=card&emp=${e}`;

      function colFor(colName) {
        const idx = headers.indexOf(DC_NORM_(colName));
        if (idx === -1) {
          sh.getRange(1, sh.getLastColumn()+1).setValue(colName);
          headers.push(DC_NORM_(colName));
          return headers.length - 1;
        }
        return idx;
      }

      const cols = {
        P1_WEBSITE_URL    : `=HYPERLINK("${base}?page=home&emp=${e}","🌐 Website")`,
        P1_SMART_FORM_URL : `=HYPERLINK("${base}?page=form&emp=${e}","📝 Form")`,
        P1_DIGITAL_CARD_URL:`=HYPERLINK("${base}?page=card&emp=${e}","🪪 Card")`,
        P1_DASHBOARD_URL  : `=HYPERLINK("${base}?page=dashboard&emp=${e}","📊 Dash")`,
        P1_CALLING_URL    : `=HYPERLINK("${base}?page=calling&emp=${e}","📞 Calling")`,
        P1_VOICE_URL      : `=HYPERLINK("${base}?page=voice&emp=${e}","🎙️ Voice")`,
        P1_AVATAR_URL     : avatar,
        P1_PERSONAL_FILE_URL: personalUrl ? `=HYPERLINK("${personalUrl}","📁 File")` : '',
        P1_QR_TEXT        : qrUrl,
        P1_SYNC_STATUS    : 'CONNECTED',
        P1_LAST_SYNC_AT   : new Date()
      };

      Object.entries(cols).forEach(([colName, val]) => {
        const ci = colFor(colName);
        const cell = sh.getRange(empRowNum, ci + 1);
        if (typeof val === 'string' && val.startsWith('=')) cell.setFormula(val);
        else cell.setValue(val);
      });
      log.push('✅ P1 links mapped');
    } catch(le){ log.push('❌ Link mapping failed: '+le.message); }

    // ── 6. Highlight row green ──
    try {
      sh.getRange(empRowNum, 1, 1, sh.getLastColumn()).setBackground('#d9ead3');
      log.push('✅ Row highlighted green');
    } catch(_){}

    // ── 7. TG notification ──
    try {
      DC_SEND_TG_(`✅ *Staff Provisioned*\n${emp.NAME} (${empCode})\nRole: ${emp.ROLE}\nDept: ${emp.DEPARTMENT}\nFile: ${fileId?'Created/Linked':'Pending'}\nLinks: CONNECTED`);
    } catch(_){}

    CLEAR_EMP_CACHE_();
    const summary = `fixIndividualStaff DONE — ${empCode}\n\n`+log.join('\n');
    Logger.log(summary);
    return summary;

  } catch(err){
    LOG_ERR_('fixIndividualStaff', empCode, err.message);
    return `ERR: ${err.message}\n\n`+log.join('\n');
  }
}

/* ================================================================
   SECTION 24 — BULBHUL AVATAR / HI SYSTEM
   Each employee (HI) gets:
   ① Role-aware personal website with greeting
   ② Campaign-tracked source links (SOURCE_NAME per social platform)
   ③ Voice-format notifications (TTS-ready text)
   ④ Social media post generator + publisher
   ⑤ Interaction learning (stored in personal file BULBHUL_LEARN tab)
   ⑥ Hands-free voice data API
   ================================================================ */

/* ── Schema extension (add to ALL_EMPLOYEES tab via DC_INSTALL_P1_FINAL_) ── */
const AVATAR_SOCIAL_COLS_ = [
  'INSTAGRAM_HANDLE','INSTAGRAM_TOKEN',
  'FACEBOOK_PAGE_ID','FACEBOOK_PAGE_TOKEN',
  'LINKEDIN_HANDLE','LINKEDIN_TOKEN',
  'YOUTUBE_HANDLE','TWITTER_HANDLE',
  'AVATAR_TAGLINE','AVATAR_STYLE','CAMPAIGN_ACTIVE'
];

/* ── Role-based HI greeting (shown on personal website) ── */
const HI_GREETINGS_ = {
  'MD'           : n=>`Namaste! Main ${n} hoon — MD, Divyanshi Capital. Loan, team, aur growth — sab meri zimmedaari hai. Bulbhul AI mera partner hai.`,
  'FOUNDER'      : n=>`Hello! Main ${n} hoon — Founder, Divyanshi Capital. Loan solutions aur fintech innovation meri passion hai.`,
  'SALES MEMBER' : n=>`Hi! Main ${n} hoon — aapka Personal Loan Expert. PL, BL, HL, LAP, Auto — sab ke liye trusted guide hoon. Chalein shuru karte hain!`,
  'SALES MANAGER': n=>`Namaste! Main ${n} hoon — Sales Manager. Meri team ke saath hum aapko best deal dilaate hain.`,
  'COORDINATOR'  : n=>`Hello! Main ${n} hoon — Login Coordinator. Aapki file bank tak pahunchana meri zimmedaari hai.`,
  'ACCOUNTS'     : n=>`Namaste! Main ${n} hoon — Accounts (Sachin). Disbursals, PF, PDD — numbers meri boli hai.`,
  'HR'           : n=>`Hi! Main ${n} hoon — HR Head Khushboo. Team building, onboarding, aur people first.`,
  'DEFAULT'      : n=>`Namaste! Main ${n} hoon — Divyanshi Capital Team. Loan solutions aur financial freedom — yahi mera kaam hai.`
};

function AVATAR_GET_GREETING_(emp) {
  if (!emp) return HI_GREETINGS_['DEFAULT']('Team Member');
  const role = String(emp.ROLE||'').toUpperCase();
  for (const k of Object.keys(HI_GREETINGS_)) {
    if (k !== 'DEFAULT' && role.includes(k)) return HI_GREETINGS_[k](emp.NAME||emp.EMP_CODE);
  }
  return HI_GREETINGS_['DEFAULT'](emp.NAME||emp.EMP_CODE);
}

/* ── Campaign links — every SOURCE_NAME generates a trackable apply link ── */
const SOURCE_ICON_ = {
  'INSTAGRAM':'📸','FACEBOOK':'📘','LINKEDIN':'💼','WHATSAPP':'💬',
  'WEBSITE':'🌐','REFERRAL':'🤝','WALK-IN':'🚶','EMAIL CAMPAIGN':'📧',
  'BANK REFERRAL':'🏦','AI AUTO CALLING':'🤖','GODIAL AUTO CALLING':'📞',
  'YOUTUBE':'▶️','TWITTER':'🐦','DEFAULT':'🔗'
};

function AVATAR_GET_CAMPAIGN_LINKS_(emp) {
  const base     = P1_GET_EXEC_URL_();
  const e        = encodeURIComponent(emp.EMP_CODE);
  const routing  = GET_SOURCE_ROUTING_MAP_();
  const out      = {};
  Object.keys(routing).forEach(src => {
    const slug = src.toLowerCase().replace(/\s+/g,'_');
    out[src] = {
      icon   : SOURCE_ICON_[src] || SOURCE_ICON_['DEFAULT'],
      label  : src,
      flow   : routing[src],
      formUrl: `${base}?page=form&emp=${e}&source=${encodeURIComponent(src)}`,
      qrUrl  : `${base}?page=card&emp=${e}&utm_source=${slug}`,
      shareMsg: `${SOURCE_ICON_[src]||'🔗'} Loan chahiye? Apply karo: ${base}?page=form&emp=${e}&source=${encodeURIComponent(src)}`
    };
  });
  return out;
}

/* ── Voice notification templates (TTS-ready, hands-free) ── */
const VOICE_TPL_ = {
  NEW_LEAD  : d=>`New lead alert. ${d.CLIENT_NAME||'Client'} ne ${d.LOAN_TYPE||'loan'} ke liye apply kiya. Amount: ${Number(d.REQUIRED_LOAN_AMOUNT||0).toLocaleString('en-IN')} rupaye. Bank: ${d.PREFERRED_BANK||'unspecified'}. Lead I D: ${d.LEAD_ID||''}. TAT: ${d.TAT_DAYS||7} din. Please follow up karo.`,
  MAIL_RECV : d=>`Naya mail aaya hai. Sender: ${d.from||'unknown'}. Subject: ${d.subject||'no subject'}. ${d.summary||''}`,
  DISBURSAL : d=>`Disbursal complete! Client: ${d.CLIENT_NAME||''}. Amount: ${Number(d.REQUIRED_LOAN_AMOUNT||0).toLocaleString('en-IN')} rupaye. Bank: ${d.PREFERRED_BANK||''}. Congratulations!`,
  TAT_BREACH: d=>`TAT breach alert! Lead ${d.LEAD_ID||''} ${d.DAYS||0} din se pending hai. Turant action lo.`,
  TARGET    : d=>`Target update: ${d.achieved||0} complete out of ${d.target||0}. ${Number(d.achieved||0)>=Number(d.target||0)?'Target complete! Badhiya kaam kiya!':'Abhi '+((Number(d.target||0)-Number(d.achieved||0)))+' aur chahiye.'}`,
  APPROVAL  : d=>`Lead ${d.LEAD_ID||''} ${d.status||''} ho gaya. Client: ${d.CLIENT_NAME||''}. Bank: ${d.PREFERRED_BANK||''}.`,
  REMINDER  : d=>`Reminder: ${d.message||''}`,
  DEFAULT   : d=>`Notification: ${d.message||JSON.stringify(d).slice(0,120)}`
};

function GET_VOICE_NOTIFICATION_(eventType, data) {
  const tpl = VOICE_TPL_[String(eventType||'').toUpperCase()] || VOICE_TPL_['DEFAULT'];
  return { text: tpl(data||{}), lang:'hi-IN', rate:0.9, pitch:1.0 };
}

/* ── Full Avatar Profile API ── */
function P1_GET_AVATAR_PROFILE_(empCode) {
  try {
    empCode = String(empCode||'').trim().toUpperCase();
    const emp = FIND_EMPLOYEE_FULL_(empCode);
    if (!emp) return {ok:false, err:'Employee not found: '+empCode};

    const base = P1_GET_EXEC_URL_();
    const e    = encodeURIComponent(empCode);

    const greeting   = AVATAR_GET_GREETING_(emp);
    const campaigns  = AVATAR_GET_CAMPAIGN_LINKS_(emp);
    const tagline    = String(emp['AVATAR_TAGLINE']||`${emp.ROLE||'RM'} — Divyanshi Capital`).trim();
    const avatarStyle= String(emp['AVATAR_STYLE']||'professional').toLowerCase();

    const social = {
      instagram : String(emp['INSTAGRAM_HANDLE']||'').trim(),
      facebook  : String(emp['FACEBOOK_PAGE_ID']||'').trim(),
      linkedin  : String(emp['LINKEDIN_HANDLE']||'').trim(),
      youtube   : String(emp['YOUTUBE_HANDLE']||'').trim(),
      twitter   : String(emp['TWITTER_HANDLE']||'').trim(),
      whatsapp  : emp.WHATSAPP ? `https://wa.me/91${emp.WHATSAPP}` : '',
      companyWeb: 'https://www.divyanshicapital.com'
    };

    const myLeads  = GET_MASTER_SNAPSHOT_().filter(r=>String(r.EMP_CODE||'').toUpperCase()===empCode);
    const open     = myLeads.filter(r=>['OPEN','INTERESTED','CALLBACK','LOGIN'].includes(String(r.CASE_CATEGORY||'').toUpperCase())).length;
    const approved = myLeads.filter(r=>['APPROVED','DISBURSED','DISBURSE'].includes(String(r.CASE_CATEGORY||'').toUpperCase())).length;
    const volume   = myLeads.reduce((s,r)=>s+Number(r.REQUIRED_LOAN_AMOUNT||0),0);

    const products = GET_ACTIVE_LOAN_PRODUCTS_().slice(0,5).map(p=>({
      name: p.name, icon: p.icon, tat: p.tat, roi: p.roi,
      applyUrl: `${base}?page=form&emp=${e}&source=social&loan=${encodeURIComponent(p.name)}`,
      postCaption:
        `${p.icon} *${p.name}* | ROI ${p.roi}% se shuru | TAT ${p.tat} din\n` +
        `🏦 Top Banks: ${(p.banks||[]).slice(0,3).join(', ')||'Leading Banks'}\n` +
        `📋 Apply: ${base}?page=form&emp=${e}&source=social\n` +
        `👤 RM: ${emp.NAME} | 📞 ${emp.MOBILE?'91'+emp.MOBILE:''}\n` +
        `#DivyanshiCapital #${String(p.name).replace(/\s+/g,'')} #Loan`
    }));

    // Hands-free voice data for client
    const voiceData = {
      greeting  : `Namaste ${emp.NAME}! Main Bulbhul hoon, aapka AI partner. Aaj ${myLeads.length} total leads hain, ${open} open hain.`,
      newLead   : GET_VOICE_NOTIFICATION_('NEW_LEAD',   {CLIENT_NAME:'sample client',LOAN_TYPE:'Personal Loan',REQUIRED_LOAN_AMOUNT:500000,PREFERRED_BANK:'HDFC',LEAD_ID:'L1234',TAT_DAYS:3}),
      disbursal : GET_VOICE_NOTIFICATION_('DISBURSAL',  {CLIENT_NAME:'sample client',REQUIRED_LOAN_AMOUNT:500000,PREFERRED_BANK:'HDFC'}),
      tatBreach : GET_VOICE_NOTIFICATION_('TAT_BREACH', {LEAD_ID:'L1234',DAYS:5}),
      target    : GET_VOICE_NOTIFICATION_('TARGET',     {achieved:8,target:10})
    };

    return {
      ok:true, empCode, name:emp.NAME, role:emp.ROLE||'RM', dept:emp.DEPARTMENT||'',
      mobile:emp.MOBILE||'', email:emp.EMAIL||'',
      avatar   : emp.PROFILE_PIC||`https://ui-avatars.com/api/?name=${encodeURIComponent(emp.NAME||empCode)}&background=d4af37&color=0a2540&size=160`,
      tagline, avatarStyle, greeting,
      links    : {
        website : `${base}?page=home&emp=${e}`,
        form    : `${base}?page=form&emp=${e}`,
        card    : `${base}?page=card&emp=${e}`,
        dashboard:`${base}?page=dashboard&emp=${e}`,
        calling : `${base}?page=calling&emp=${e}`,
        voice   : `${base}?page=voice&emp=${e}`,
        qr      : `${base}?page=card&emp=${e}`,
        company : 'https://www.divyanshicapital.com'
      },
      social, campaigns, products,
      stats    : {total:myLeads.length, open, approved, volume},
      voiceData
    };
  } catch(err){ LOG_ERR_('P1_GET_AVATAR_PROFILE',empCode,err.message); return {ok:false,err:err.message}; }
}

/* ── Public employee mini-site data. Keep this separate from staff operational data. ── */
function P1_GET_PUBLIC_CARD_PROFILE_(empCode) {
  try {
    empCode=String(empCode||'').trim().toUpperCase();
    const emp=FIND_EMPLOYEE_FULL_(empCode); if(!emp)return null;
    const base=P1_GET_EXEC_URL_(), e=encodeURIComponent(empCode);
    const name=String(emp.NAME||empCode).trim(), role=String(emp.ROLE||'Loan Advisor').trim();
    const greeting=String(emp.AVATAR_GREETING||emp.GREETING||`Namaste! Main ${name} hoon — Divyanshi Capital mein aapka dedicated loan advisor.`).trim();
    const tagline=String(emp.AVATAR_TAGLINE||`${role} — Divyanshi Capital`).trim();
    return {
      ok:true, empCode, name, role, dept:String(emp.DEPARTMENT||'').trim(),
      mobile:String(emp.MOBILE||'').trim(), whatsapp:String(emp.WHATSAPP||emp.MOBILE||'').trim(),
      email:String(emp.EMAIL||'').trim(), tgChatId:String(emp.TG_USERNAME||'').replace(/^@/,''),
      profilePic:String(emp.PROFILE_PIC||`https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=d4af37&color=0a2540&size=200`).trim(),
      greeting, tagline, bot:P1_EMPLOYEE_PERSONA_(emp), companyUrl:'https://www.divyanshicapital.com',
      formLink:`${base}?page=form&emp=${e}&source=employee_card`
    };
  } catch(e){ LOG_ERR_('P1_GET_PUBLIC_CARD_PROFILE',empCode,e.message); return null; }
}

/* Public card chat is advisory-only: it never reads CRM, identifies cases, or executes commands. */
function P1_PUBLIC_CARD_CHAT(payload) {
  payload=payload||{};
  const message=String(payload.message||'').trim().slice(0,700);
  const emp=P1_GET_PUBLIC_CARD_PROFILE_(payload.empCode);
  if(!message)return {ok:false,err:'Please enter a question.'};
  const advisor=emp?`${emp.name}, ${emp.role}`:'a Divyanshi Capital team member';
  const persona=emp&&emp.bot?emp.bot:{title:'Divyanshi Capital Assistant',greeting:'Namaste! How can I help?',instruction:'You support general public questions only.'};
  const products=GET_ACTIVE_LOAN_PRODUCTS_().map(p=>p.name).slice(0,8).join(', ');
  const system='You are Bulbhul, the public assistant for '+advisor+' at Divyanshi Capital. '+persona.instruction+' Mirror the visitor\'s language (Hindi, English, or Hinglish), be warm and professional, and keep normal replies under 90 words. Available lending products: '+products+'. Never access case records, request sensitive identity numbers, OTPs, passwords, PINs, card data, or banking credentials. Never take operational actions.';
  return {ok:true,reply:MULTI_BRAIN_REPLY_(message,system)};
}

/* ── Loan post caption generator ── */
function GENERATE_LOAN_POST_(empCode, loanType, sourceName, customMsg) {
  try {
    const emp  = empCode?FIND_EMPLOYEE_FULL_(empCode):null;
    const base = P1_GET_EXEC_URL_();
    const e    = encodeURIComponent(empCode||'');
    const src  = encodeURIComponent(sourceName||'social');
    const p    = GET_ACTIVE_LOAN_PRODUCTS_().find(x=>x.name.toUpperCase()===String(loanType||'').toUpperCase())||GET_ACTIVE_LOAN_PRODUCTS_()[0]||{name:'Personal Loan',roi:10.5,tat:3,icon:'💳',banks:[]};
    const name = emp?emp.NAME:'Divyanshi Capital';
    const applyUrl = `${base}?page=form&emp=${e}&source=${src}`;
    const caption = customMsg ||
      `${p.icon} *${p.name} — Quick Apply!*\n\n` +
      `✅ ROI: ${p.roi}% se shuru\n⏱ TAT: ${p.tat} din\n` +
      `🏦 Banks: ${(p.banks||[]).slice(0,4).join(', ')||'Top Banks'}\n` +
      `📋 Apply: ${applyUrl}\n\n` +
      `👤 RM: ${name}${emp&&emp.MOBILE?'\n📞 '+emp.MOBILE:''}\n\n` +
      `#DivyanshiCapital #${String(p.name).replace(/\s+/g,'')} #PersonalLoan #Loan`;
    return {ok:true, caption, applyUrl, product:p, rmName:name, rmMobile:emp?emp.MOBILE:''};
  } catch(e){ LOG_ERR_('GENERATE_LOAN_POST',empCode,e.message); return {ok:false,err:e.message}; }
}

/* ── Facebook Page post ── */
/* Setup: Add FACEBOOK_PAGE_ID + FACEBOOK_PAGE_TOKEN columns to ALL_EMPLOYEES  */
/* Token: Meta Business Suite → Pages → Connected Apps → Generate token       */
function POST_TO_FACEBOOK_(empCode, message, imageUrl) {
  try {
    const emp   = FIND_EMPLOYEE_FULL_(empCode); if(!emp)return{ok:false,err:'EMP not found'};
    const token = String(emp['FACEBOOK_PAGE_TOKEN']||'').trim();
    const pgId  = String(emp['FACEBOOK_PAGE_ID']||'').trim();
    if(!token||!pgId) return{ok:false,err:`FACEBOOK_PAGE_TOKEN / FACEBOOK_PAGE_ID missing for ${empCode} in ALL_EMPLOYEES`};
    const payload = imageUrl?{message,link:imageUrl}:{message};
    const res=UrlFetchApp.fetch(`https://graph.facebook.com/v20.0/${pgId}/feed`,{
      method:'post',muteHttpExceptions:true,
      headers:{'Authorization':'Bearer '+token},
      contentType:'application/json',
      payload:JSON.stringify(payload)
    });
    const j=JSON.parse(res.getContentText()||'{}');
    return j.id?{ok:true,postId:j.id,platform:'FACEBOOK'}:{ok:false,err:j.error?j.error.message:'Post failed'};
  } catch(e){ LOG_ERR_('POST_TO_FACEBOOK',empCode,e.message); return{ok:false,err:e.message}; }
}

/* ── Instagram Business post ── */
/* Setup: Instagram Business + FB Page → Meta for Developers → Get IG user ID  */
/* Token must have instagram_basic, instagram_content_publish permissions        */
/* imageUrl MUST be a publicly reachable HTTPS URL (JPEG/PNG, <8MB)             */
function POST_TO_INSTAGRAM_(empCode, caption, imageUrl) {
  try {
    const emp   = FIND_EMPLOYEE_FULL_(empCode); if(!emp)return{ok:false,err:'EMP not found'};
    const token = String(emp['INSTAGRAM_TOKEN']||'').trim();
    const igId  = String(emp['INSTAGRAM_HANDLE']||'').trim();
    if(!token||!igId) return{ok:false,err:`INSTAGRAM_TOKEN / INSTAGRAM_HANDLE missing for ${empCode} in ALL_EMPLOYEES`};
    if(!imageUrl)     return{ok:false,err:'imageUrl required (public HTTPS JPEG/PNG URL)'};
    // Step 1 — Create media container
    const r1=UrlFetchApp.fetch(`https://graph.facebook.com/v20.0/${igId}/media`,{
      method:'post',muteHttpExceptions:true,
      headers:{'Authorization':'Bearer '+token},
      contentType:'application/json',
      payload:JSON.stringify({image_url:imageUrl,caption})
    });
    const j1=JSON.parse(r1.getContentText()||'{}');
    if(!j1.id)return{ok:false,err:'Container failed: '+(j1.error?j1.error.message:r1.getContentText())};
    Utilities.sleep(3000);
    // Step 2 — Publish
    const r2=UrlFetchApp.fetch(`https://graph.facebook.com/v20.0/${igId}/media_publish`,{
      method:'post',muteHttpExceptions:true,
      headers:{'Authorization':'Bearer '+token},
      contentType:'application/json',
      payload:JSON.stringify({creation_id:j1.id})
    });
    const j2=JSON.parse(r2.getContentText()||'{}');
    return j2.id?{ok:true,postId:j2.id,platform:'INSTAGRAM'}:{ok:false,err:j2.error?j2.error.message:'Publish failed'};
  } catch(e){ LOG_ERR_('POST_TO_INSTAGRAM',empCode,e.message); return{ok:false,err:e.message}; }
}

/* ── Avatar learning — stores interactions in BULBHUL_LEARN tab of personal file ── */
function AVATAR_LEARN_(empCode, interactionType, data) {
  try {
    const emp=FIND_EMPLOYEE_FULL_(empCode); if(!emp||!emp.PERSONAL_FILE_ID)return;
    const pss=P1_OPEN_SS_SAFE_(emp.PERSONAL_FILE_ID);
    const sh =pss.getSheetByName('BULBHUL_LEARN')||pss.insertSheet('BULBHUL_LEARN');
    P1_ENSURE_HEADERS_(sh,['TIMESTAMP','TYPE','EMP_CODE','SUMMARY','OUTCOME','SCORE','RAW']);
    sh.appendRow([
      new Date(), interactionType||'', empCode,
      String(data.summary||'').slice(0,200),
      String(data.outcome||'').slice(0,100),
      Number(data.score||0),
      JSON.stringify(data).slice(0,500)
    ]);
  } catch(_){}
}

/* ── Bulk social schema installer — run once to add columns ── */
function INSTALL_AVATAR_SOCIAL_SCHEMA_() {
  const sh=SHEET_('ALL_EMPLOYEES'); if(!sh)throw new Error('ALL_EMPLOYEES missing');
  P1_ENSURE_HEADERS_(sh, P1_TAB_MAP.ALL_EMPLOYEES().concat(AVATAR_SOCIAL_COLS_));
  Logger.log('✅ Avatar social schema installed: '+AVATAR_SOCIAL_COLS_.join(', '));
  return 'AVATAR_SCHEMA_OK';
}

/* ── SYNC_ROLE_DASHBOARDS_ENGINE — legacy compatibility alias ── */
function SYNC_ROLE_DASHBOARDS_ENGINE() { MIS_15MIN_FULL_SYNC_(); }

/* ================================================================
   SECTION 25 — FRONTEND API SURFACE
   Every function below is called directly via google.script.run from
   index.html, smart_form.html, calling.html, or voice.html. Each one
   exists because a specific client-side call site requires it —
   see the html files' google.script.run chains for the call sites.
   ================================================================ */

/* ── Session tokens (ScriptCache-backed, 6h TTL — CacheService max) ── */
function P1_MINT_ACCESS_TOKEN_(empCode) {
  const token = Utilities.getUuid().replace(/-/g, '');
  SC_.put('ACCESS_' + token, String(empCode || '').trim().toUpperCase(), 21600);
  return token;
}

function P1_PIN_DIGEST_(empCode, pin, salt) {
  const material = [String(empCode || '').trim().toUpperCase(), String(salt || ''), String(pin || '')].join(':');
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, material, Utilities.Charset.UTF_8)
    .map(function (byte) { return ('0' + (byte & 0xff).toString(16)).slice(-2); }).join('');
}

function P1_AUTH_FAILURE_KEY_(empCode) { return 'AUTH_FAIL_' + String(empCode || '').trim().toUpperCase(); }
function P1_IS_AUTH_THROTTLED_(empCode) { return Number(SC_.get(P1_AUTH_FAILURE_KEY_(empCode)) || 0) >= 5; }
function P1_RECORD_AUTH_FAILURE_(empCode) {
  const key = P1_AUTH_FAILURE_KEY_(empCode);
  const attempts = Number(SC_.get(key) || 0) + 1;
  SC_.put(key, String(attempts), attempts >= 5 ? 900 : 900);
}
function P1_CLEAR_AUTH_FAILURES_(empCode) { SC_.remove(P1_AUTH_FAILURE_KEY_(empCode)); }

function P1_PASSWORD_MATCHES_(emp, password) {
  const props=PropertiesService.getScriptProperties();
  const hashKey='PIN_HASH_'+emp.EMP_CODE, saltKey='PIN_SALT_'+emp.EMP_CODE;
  const storedHash=String(props.getProperty(hashKey)||''), legacy=String(props.getProperty('PIN_'+emp.EMP_CODE)||'');
  if(storedHash) return P1_PIN_DIGEST_(emp.EMP_CODE,password,props.getProperty(saltKey))===storedHash;
  // Migrate the pre-existing HR-managed credential on first successful use.
  if(!legacy || password!==legacy)return false;
  const salt=Utilities.getUuid();
  props.setProperties({[hashKey]:P1_PIN_DIGEST_(emp.EMP_CODE,password,salt),[saltKey]:salt});
  props.deleteProperty('PIN_'+emp.EMP_CODE);
  return true;
}
function P1_VALIDATE_ACCESS_(empCode, token) {
  try {
    const code = String(empCode || '').trim().toUpperCase();
    const t = String(token || '').trim();
    if (!code || !t) return false;
    return SC_.get('ACCESS_' + t) === code;
  } catch (_) { return false; }
}

/* ── index.html: callGAS('P1_VERIFY_EMP', {empCode,pin}) — staff login on the personal card page ── */
function P1_VERIFY_EMP(payload) {
  payload = payload || {};
  const emp = FIND_EMPLOYEE_FULL_(String(payload.empCode || '').toUpperCase());
  if (!emp) return { ok: false, err: 'Invalid employee code or PIN' };
  if (P1_IS_AUTH_THROTTLED_(emp.EMP_CODE)) return { ok: false, err: 'Too many attempts. Please wait 15 minutes and try again.' };
  const pin = String(payload.pin || '').trim();
  const valid = !!pin && P1_PASSWORD_MATCHES_(emp,pin);
  if (!valid) {
    P1_RECORD_AUTH_FAILURE_(emp.EMP_CODE);
    return { ok: false, err: 'Invalid employee code or PIN' };
  }
  P1_CLEAR_AUTH_FAILURES_(emp.EMP_CODE);
  return { ok: true, empCode: emp.EMP_CODE, name: emp.NAME, role: emp.ROLE, accessToken: P1_MINT_ACCESS_TOKEN_(emp.EMP_CODE), err: '' };
}

function P1_CHANGE_EMP_PASSWORD(payload) {
  payload=payload||{};
  const emp=FIND_EMPLOYEE_FULL_(String(payload.empCode||'').trim().toUpperCase());
  const current=String(payload.currentPassword||'').trim(), next=String(payload.newPassword||'');
  if(!emp) return {ok:false,err:'Invalid employee code or password.'};
  if(P1_IS_AUTH_THROTTLED_(emp.EMP_CODE)) return {ok:false,err:'Too many attempts. Please wait 15 minutes and try again.'};
  if(next.length<8||next.length>64) return {ok:false,err:'New password must be 8–64 characters.'};
  if(!current||!P1_PASSWORD_MATCHES_(emp,current)){P1_RECORD_AUTH_FAILURE_(emp.EMP_CODE);return {ok:false,err:'Invalid employee code or password.'};}
  if(current===next) return {ok:false,err:'Choose a different new password.'};
  const props=PropertiesService.getScriptProperties(),salt=Utilities.getUuid();
  props.setProperties({['PIN_HASH_'+emp.EMP_CODE]:P1_PIN_DIGEST_(emp.EMP_CODE,next,salt),['PIN_SALT_'+emp.EMP_CODE]:salt});
  props.deleteProperty('PIN_'+emp.EMP_CODE); P1_CLEAR_AUTH_FAILURES_(emp.EMP_CODE);
  if(payload.accessToken) SC_.remove('ACCESS_'+String(payload.accessToken).trim());
  return {ok:true,message:'Password changed. Please sign in again.'};
}

/* ── index.html: callGAS('get_boot_data', {empCode,page}) ── */
function get_boot_data(payload) {
  payload = payload || {};
  const emp  = String(payload.empCode || '').trim().toUpperCase();
  const page = String(payload.page || 'home').trim().toLowerCase();
  return {
    baseUrl: P1_GET_EXEC_URL_(),
    page: page,
    emp: emp,
    products: GET_ACTIVE_LOAN_PRODUCTS_(),
    banks: P1_GET_BANK_OPTIONS_MAP_(),
    staff: emp ? P1_GET_PUBLIC_CARD_PROFILE_(emp) : null,
    avatar: (page === 'card' && emp) ? P1_GET_PUBLIC_CARD_PROFILE_(emp) : null,
    dashboard: (page === 'dashboard' && emp && P1_VALIDATE_ACCESS_(emp, payload.accessToken)) ? P1_GET_STAFF_DASHBOARD_DATA_(emp) : null
  };
}

/* ── index.html: callGAS('MLA_LOG_ACTIVITY', {type,empCode,amount}) ── */
function MLA_LOG_ACTIVITY(payload) {
  try {
    payload = payload || {};
    const sh = GET_OR_CREATE_('ACTIVITY_LOG');
    P1_ENSURE_HEADERS_(sh, ['TIMESTAMP', 'TYPE', 'EMP_CODE', 'DETAILS']);
    sh.appendRow([new Date(), String(payload.type || ''), String(payload.empCode || '').trim().toUpperCase(), JSON.stringify(payload).slice(0, 500)]);
    return { ok: true };
  } catch (e) { LOG_ERR_('MLA_LOG_ACTIVITY', '', e.message); return { ok: false, err: e.message }; }
}

/* ── index.html: callGAS('DC_TG_BROADCAST', msg) ── */
function DC_TG_BROADCAST(msg) {
  try {
    const sent = DC_SEND_TG_(String(msg || '').slice(0, 4000));
    return sent ? 'Broadcast sent!' : 'No Telegram recipients configured yet.';
  } catch (e) { LOG_ERR_('DC_TG_BROADCAST', '', e.message); return 'Broadcast failed: ' + e.message; }
}

/* ── smart_form.html: consent links + version shown on the intake form ── */
function P1_GET_HR_PUBLIC_CONFIG() {
  const p = PropertiesService.getScriptProperties();
  return {
    tcUrl: p.getProperty('TC_URL') || 'https://www.divyanshicapital.com/shop/terms-conditions/',
    privacyUrl: p.getProperty('PRIVACY_URL') || 'https://www.divyanshicapital.com/privacy-policy/',
    consentVersion: p.getProperty('CONSENT_VERSION') || 'v1'
  };
}

/* ── smart_form.html: requestUploadToken() ── */
function P1_ISSUE_UPLOAD_TOKEN(submissionKey, route) {
  try {
    const key = String(submissionKey || '').trim();
    if (!key) throw new Error('submissionKey required');
    const token = Utilities.getUuid().replace(/-/g, '');
    SC_.put('UPLOAD_TOKEN_' + token, JSON.stringify({ key: key }), 900);
    return token;
  } catch (e) { LOG_ERR_('P1_ISSUE_UPLOAD_TOKEN', '', e.message); throw e; }
}

function P1_STORE_PUBLIC_FILES_(payload, leadId, files) {
  const token=String(payload.upload_token||'').trim(), submissionKey=String(payload.submission_key||'').trim();
  const cached=token?SC_.get('UPLOAD_TOKEN_'+token):'';
  if(!cached) return {ok:false,err:'Upload session expired. Please select files and submit again.'};
  let grant={}; try{grant=JSON.parse(cached);}catch(_){ }
  if(!submissionKey || grant.key!==submissionKey) return {ok:false,err:'Upload session validation failed.'};
  if(!leadId || files.length>3) return {ok:false,err:'A maximum of 3 documents can be uploaded.'};
  const allowed={'application/pdf':true,'image/jpeg':true,'image/png':true}; let total=0;
  const clean=[];
  for(let i=0;i<files.length;i++){
    const f=files[i]||{}, mime=String(f.mimeType||'').toLowerCase();
    if(!allowed[mime]||!f.base64) return {ok:false,err:'Only PDF, JPG and PNG documents are accepted.'};
    const bytes=Utilities.base64Decode(String(f.base64).split(',').pop());
    if(bytes.length>2*1024*1024) return {ok:false,err:'Each document must be 2 MB or smaller.'};
    total+=bytes.length; if(total>5*1024*1024) return {ok:false,err:'Total document upload must be 5 MB or smaller.'};
    clean.push({bytes:bytes,mime:mime,name:String(f.name||('document_'+(i+1))).replace(/[^a-zA-Z0-9._ -]/g,'_').slice(0,100)});
  }
  const parentId=String(PropertiesService.getScriptProperties().getProperty('CLIENT_DOCS_FOLDER_ID')||'').trim();
  if(!parentId) return {ok:false,err:'Document storage is not configured.'};
  const parent=DriveApp.getFolderById(parentId), folder=parent.createFolder(String(leadId).replace(/[^a-zA-Z0-9_-]/g,'_'));
  clean.forEach(f=>folder.createFile(Utilities.newBlob(f.bytes,f.mime,f.name)));
  SC_.remove('UPLOAD_TOKEN_'+token);
  return {ok:true,folderUrl:folder.getUrl()};
}

/* ── smart_form.html: loadLoanData() ── */
function P1_GET_LOAN_CATALOG() {
  return { products: GET_ACTIVE_LOAN_PRODUCTS_(), banks: P1_GET_BANK_OPTIONS_MAP_() };
}

/* ── calling.html: initLead() ── */
function P1_GET_CALLING_QUEUE(empCode, accessToken) {
  try {
    empCode = String(empCode || '').trim().toUpperCase();
    if (!P1_VALIDATE_ACCESS_(empCode, accessToken)) return { ok: false, err: 'Session expired. Re-open Calling from your dashboard.' };
    const emp = FIND_EMPLOYEE_FULL_(empCode);
    if (!emp) return { ok: false, err: 'Employee not found' };
    const role = String(emp.ROLE || '').toUpperCase();
    const isLead = ['MANAGER', 'MD', 'FOUNDER', 'ADMIN'].some(r => role.includes(r));
    let data = GET_MASTER_SNAPSHOT_();
    if (!isLead) data = data.filter(r => String(r.EMP_CODE || '').toUpperCase() === empCode);
    const closedStates = ['DISBURSE', 'DISBURSED', 'REJECT', 'REJECTED', 'NOT INTERESTED', 'WRONG NUMBER'];
    const open = data.filter(r => !closedStates.includes(String(r.CASE_CATEGORY || '').toUpperCase()));
    const today = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');
    const doneToday = data.filter(r => {
      try { return closedStates.includes(String(r.CASE_CATEGORY || '').toUpperCase()) && Utilities.formatDate(new Date(r.LAST_UPDATED || 0), 'Asia/Kolkata', 'yyyy-MM-dd') === today; }
      catch (_) { return false; }
    }).length;
    const tatBreaches = data.filter(r => {
      const cat = String(r.CASE_CATEGORY || '').toUpperCase();
      if (closedStates.includes(cat)) return false;
      return String(r.TAT_STATUS || '').toUpperCase() === 'TAT_BREACHED' || (r.TAT_DEADLINE && new Date(r.TAT_DEADLINE) < new Date());
    }).length;
    const queue = open.slice(0, 100).map(r => ({
      leadId: r.LEAD_ID || '', clientName: r.CLIENT_NAME || '', mobile: r.CLIENT_MOBILE || '',
      name:r.CLIENT_NAME || '', type:r.LOAN_TYPE || '', loanType: r.LOAN_TYPE || '', amount: r.REQUIRED_LOAN_AMOUNT || '', bank: r.PREFERRED_BANK || '',
      status: r.CASE_CATEGORY || 'OPEN', remarks: r.REMARKS || '', tatStatus: r.TAT_STATUS || 'ACTIVE', empCode: r.EMP_CODE || ''
    }));
    const aiAvailable = !!(DC_CFG.DEEPSEEK_KEY || DC_CFG.OPENAI_KEY || DC_CFG.GEMINI_KEY);
    const pending = open.length;
    const performance = data.length ? Math.round(((data.length - pending) / data.length) * 100) : 0;
    const tatHealth = data.length ? Math.round(((data.length - tatBreaches) / data.length) * 100) : 100;
    return { ok: true, queue, stats: { pending, doneToday, tatBreaches, tatHealth, performance }, aiAvailable };
  } catch (e) { LOG_ERR_('P1_GET_CALLING_QUEUE', empCode, e.message); return { ok: false, err: e.message }; }
}

function P1_CASE_FOR_EMPLOYEE_(empCode, leadId) {
  const code=String(empCode||'').trim().toUpperCase(), id=String(leadId||'').trim().toUpperCase();
  const emp=FIND_EMPLOYEE_FULL_(code); if(!emp||!id)return null;
  const role=String(emp.ROLE||'').toUpperCase(), dept=String(emp.DEPARTMENT||'').toUpperCase();
  const lead=GET_MASTER_SNAPSHOT_().find(r=>String(r.LEAD_ID||'').trim().toUpperCase()===id); if(!lead)return null;
  if(['MD','FOUNDER','ADMIN','DIRECTOR'].some(r=>role.includes(r))||dept.includes('MANAGEMENT'))return lead;
  if(String(lead.EMP_CODE||'').trim().toUpperCase()===code)return lead;
  if(String(lead.MANAGER_EMAIL||'').trim().toLowerCase()===String(emp.EMAIL||'').trim().toLowerCase())return lead;
  return null;
}

/* ── calling.html: AI-suggested disposition remark ── */
function P1_CALLING_AI_REMARK(payload) {
  payload = payload || {};
  try {
    const empCode = String(payload.empCode || '').trim().toUpperCase();
    if (!P1_VALIDATE_ACCESS_(empCode, payload.accessToken)) return { ok: false, err: 'Session expired' };
    const leadId = String(payload.leadId || '').trim().toUpperCase();
    const lead = P1_CASE_FOR_EMPLOYEE_(empCode,leadId);
    if (!lead) return { ok: false, err: 'Lead not found' };
    const sys = BULBHUL_SYS_BASE_ + '\n\nTask: Suggest one short, professional call-disposition remark (1-2 sentences, Hinglish) based on the case snapshot below. Reply with the remark only, no preamble.';
    const prompt = '[CASE]\n' + JSON.stringify({ client: lead.CLIENT_NAME, loan: lead.LOAN_TYPE, bank: lead.PREFERRED_BANK, status: lead.CASE_CATEGORY, remarks: lead.REMARKS }, null, 2);
    const remark = MULTI_BRAIN_REPLY_(prompt, sys);
    return { ok: true, remark: String(remark || '').slice(0, 300) };
  } catch (e) { LOG_ERR_('P1_CALLING_AI_REMARK', payload.empCode, e.message); return { ok: false, err: e.message }; }
}

/* ── calling.html: disposition save (submitDisposition / closeNotesModal flow) ── */
function P1_CALLING_UPDATE(payload) {
  payload = payload || {};
  try {
    const agent = String(payload.agent || '').trim().toUpperCase();
    if (!P1_VALIDATE_ACCESS_(agent, payload.accessToken)) return { ok: false, err: 'Session expired' };
    const lead=P1_CASE_FOR_EMPLOYEE_(agent,payload.leadId);
    if(!lead) return {ok:false,err:'This case is not assigned to your account.'};
    const res = UPDATE_LEAD_STATUS_(lead.LEAD_ID, payload.status, payload.remarks);
    if (res.ok) {
      try { RECORD_TASK_FOR_ATTENDANCE_(agent); } catch (_) {}
      const sh = GET_OR_CREATE_('CALL_LOG');
      P1_ENSURE_HEADERS_(sh, ['TIMESTAMP', 'EMP_CODE', 'LEAD_ID', 'MOBILE', 'STATUS', 'REMARKS', 'DURATION_SEC']);
      sh.appendRow([new Date(), agent, payload.leadId || '', payload.mobile || '', payload.status || '', String(payload.remarks || '').slice(0, 300), Number(payload.durationSec || 0)]);
    }
    return res;
  } catch (e) { LOG_ERR_('P1_CALLING_UPDATE', payload.agent, e.message); return { ok: false, err: e.message }; }
}

/* ── calling.html: initiateCall() fire-and-forget call-start log ── */
function P1_CALLING_START(payload) {
  payload = payload || {};
  try {
    const code = String(payload.empCode || '').trim().toUpperCase();
    if (!P1_VALIDATE_ACCESS_(code, payload.accessToken)) return { ok: false, err: 'Session expired' };
    const lead=P1_CASE_FOR_EMPLOYEE_(code,payload.leadId);
    if(!lead)return {ok:false,err:'This case is not assigned to your account.'};
    const sh = GET_OR_CREATE_('CALL_LOG');
    P1_ENSURE_HEADERS_(sh, ['TIMESTAMP', 'EMP_CODE', 'LEAD_ID', 'MOBILE', 'STATUS', 'REMARKS', 'DURATION_SEC']);
    sh.appendRow([new Date(), code, String(lead.LEAD_ID || '').trim(), '', 'DIAL_ATTEMPTED', '', 0]);
    return { ok: true };
  } catch (e) { LOG_ERR_('P1_CALLING_START', '', e.message); return { ok: false, err: e.message }; }
}

/* ── calling.html: p1SaveCaseFiles() ── */
function P1_MINI_CRM_UPLOAD(payload) {
  payload = payload || {};
  try {
    const code = String(payload.empCode || '').trim().toUpperCase();
    if (!P1_VALIDATE_ACCESS_(code, payload.accessToken)) return { ok: false, err: 'Session expired' };
    const leadId = String(payload.leadId || '').trim();
    const files = Array.isArray(payload.files) ? payload.files : [];
    if (!leadId) return { ok: false, err: 'leadId required' };
    if (!P1_CASE_FOR_EMPLOYEE_(code,leadId)) return {ok:false,err:'This case is not assigned to your account.'};
    if (!files.length) return { ok: true, skipped: true };

    const parentId = PropertiesService.getScriptProperties().getProperty('CLIENT_DOCS_FOLDER_ID');
    if (!parentId) return { ok: false, err: 'CLIENT_DOCS_FOLDER_ID not configured' };
    const parent = DriveApp.getFolderById(parentId);
    const existing = parent.getFoldersByName(leadId);
    const folder = existing.hasNext() ? existing.next() : parent.createFolder(leadId);

    const links = [];
    files.forEach(f => {
      if (!f || !f.base64) return;
      const bytes = Utilities.base64Decode(String(f.base64).split(',').pop());
      const blob = Utilities.newBlob(bytes, f.mimeType || 'application/octet-stream', f.name || ('file_' + Date.now()));
      links.push(folder.createFile(blob).getUrl());
    });

    const sh = GET_OR_CREATE_('CASE_FILES_LOG');
    P1_ENSURE_HEADERS_(sh, ['TIMESTAMP', 'EMP_CODE', 'LEAD_ID', 'REMARKS', 'FILE_LINKS']);
    sh.appendRow([new Date(), code, leadId, String(payload.remarks || ''), links.join(', ')]);

    try {
      const master = SHEET_('MASTER_DATA');
      if (master && master.getLastRow() >= 2) {
        const h = master.getRange(1, 1, 1, master.getLastColumn()).getValues()[0].map(DC_NORM_);
        const li = h.indexOf('LEAD_ID'), di = h.indexOf('DOCS_LINK');
        if (li > -1 && di > -1) {
          const ids = master.getRange(2, li + 1, master.getLastRow() - 1, 1).getValues();
          for (let i = 0; i < ids.length; i++) {
            if (String(ids[i][0] || '').trim().toUpperCase() === leadId.toUpperCase()) {
              master.getRange(i + 2, di + 1).setValue(folder.getUrl());
              break;
            }
          }
        }
      }
    } catch (linkErr) { LOG_ERR_('P1_MINI_CRM_UPLOAD_LINK', leadId, linkErr.message); }

    return { ok: true, folderUrl: folder.getUrl(), files: links };
  } catch (e) { LOG_ERR_('P1_MINI_CRM_UPLOAD', '', e.message); return { ok: false, err: e.message }; }
}

/* ── voice.html: FreePBX bridge request ── */
function P1_PROCESS_VOICE_COMMAND(payload) {
  payload = payload || {};
  try {
    const code = String(payload.empCode || '').trim().toUpperCase();
    if (!P1_VALIDATE_ACCESS_(code, payload.accessToken)) return { ok: false, err: 'Session expired' };
    const lead=P1_CASE_FOR_EMPLOYEE_(code,payload.leadId);
    if(!lead) return {ok:false,err:'Open Voice Control from an assigned case.'};
    const mobile=DC_CLEAN_MOBILE_(lead.CLIENT_MOBILE||'');
    if(!/^[6-9]\d{9}$/.test(mobile)) return {ok:false,err:'The assigned case does not have a valid Indian mobile number.'};
    // A provider call is deliberately not claimed until a configured PBX adapter returns a call ID.
    DC_SEND_TG_('📞 [VOICE CALL REQUEST] ' + code + ' → +91' + mobile + ' | Lead: ' + lead.LEAD_ID);
    const sh=GET_OR_CREATE_('CALL_LOG'); P1_ENSURE_HEADERS_(sh,['TIMESTAMP','EMP_CODE','LEAD_ID','MOBILE','STATUS','REMARKS','DURATION_SEC']);
    sh.appendRow([new Date(),code,lead.LEAD_ID,mobile,'VOICE_REQUEST_LOGGED','PBX adapter not configured',0]);
    return {ok:true,message:'Call request logged. Your PBX administrator must configure the bridge before calls can be placed.'};
  } catch (e) { LOG_ERR_('P1_PROCESS_VOICE_COMMAND', payload.empCode, e.message); return { ok: false, err: e.message }; }
}
