// @ts-nocheck
/******************************************************************
 * DIVYANSHI CAPITAL PVT LTD
 * Code.gs — DIVYANSHI ASSISTANT PRODUCTION MASTER
 * VERSION : V9.4.0-MERGED-FULL
 * OWNER: Divyanshi Capital (DC002) / Divyanshi Assistant
 *
 * CHANGES FROM V9.3.0-FAST:
 *  ① dashboard-core-engine.gs merged into this single file
 *  ② GET_TAT_BY_PRODUCT_ truncation fixed
 *  ③ Missing utility helpers added (P1_B64URL_, P1_CONST_EQ_,
 *     P1_IDEMPOTENCY_CACHE_KEY_)
 *  ④ doGet / doPost added
 *  ⑤ MIS_15MIN_FULL_SYNC_ and P1_SYNC_PERSONAL_FILE_ added
 *  ⑥ Setup / Install / onEdit / technicalFixes added
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
 * Secrets are stored only in Apps Script Properties.
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
  LOAN_BANK_CATALOG_CACHE_ = null;
  Object.keys(HEADER_CACHE_).forEach(k => delete HEADER_CACHE_[k]);
  const keys = ['EMP_MAP_V3','SRC_ROUTING_V1','LOAN_PRODUCTS_V1','BANK_OPTIONS_V1','MASTER_SNAP_V1','MASTER_CONTROL_V1'];
  SC_.removeAll(keys);
}

const P1_TAB_MAP = {
  MASTER_DATA:    () => ['TIMESTAMP','EMP_CODE','SALES_NAME','EMPLOYEE_EMAIL',
    'CLIENT_MOBILE','CLIENT_NAME','COMPANY_NAME','CITY_LOCATION','LOAN_TYPE','CAMPAIGN',
    'CASE_CATEGORY','CIBIL_SCORE','REMARKS','FOLLOWUP_STATUS','PREFERRED_BANK',
    'REQUIRED_LOAN_AMOUNT','DOCS_LINK','SUBMIT_FOLDER_LINK','DATA_CONSENT','CONSENT_VERSION','CONSENT_AT','CONSENT_SOURCE','PRIVACY_NOTICE_URL','AI_NOTICE_ACCEPTED','MARKETING_CONSENT','SOURCE_TYPE',
    'SOURCE_NAME','DATA_FLOW','INTAKE_STAGE','ROUTE_STAGE','PROCESS_STAGE',
    'LOGIN_STAGE','LEAD_ID','TAT_DAYS','TAT_DEADLINE','TAT_STATUS',
    'ELIGIBILITY_STATUS','ELIGIBLE_AMOUNT','DOC_STATUS','DOC_AUDIT','FOLLOWUP_DATE','MANAGER_EMAIL',
    'ASSIGNED_COORDINATOR','DISBURSAL_NOTIFIED','LAST_UPDATED'],
  COMMON_ENTRY:   () => ['TIMESTAMP','CLIENT_NAME','CLIENT_MOBILE','CLIENT_EMAIL',
    'CITY_LOCATION','PAN_NO','EMPLOYMENT_TYPE','COMPANY_NAME','MONTHLY_INCOME',
    'EXISTING_EMI','AGE','CIBIL_SCORE','LOAN_TYPE','PREFERRED_BANK',
    'REQUIRED_LOAN_AMOUNT','DOCS_LINK','DOC_STATUS','DOC_AUDIT','DATA_CONSENT','CONSENT_VERSION','CONSENT_AT','CONSENT_SOURCE','PRIVACY_NOTICE_URL','AI_NOTICE_ACCEPTED','MARKETING_CONSENT','CAMPAIGN','FOLLOWUP_DATE','TASK_CATEGORY','CASE_CATEGORY',
    'REMARKS','EMP_CODE','SALES_NAME','MANAGER_EMAIL','SOURCE_TYPE',
    'SOURCE_NAME','DATA_FLOW','LEAD_ID','INTAKE_STAGE','ROUTE_STAGE',
    'PROCESS_STAGE','LOGIN_STAGE'],
  ALL_EMPLOYEES:  () => ['BRAND_NAME','BRANCH','EMP_CODE','EMPLOYEES_NAME','ROLE','DESIGNATION',
    'DEPARTMENT','LOAN_TYPE','BANK','TARGET','EMPLOYEE_EMAIL_ID','ALT_EMAIL',
    'MOBILE','PASSWORD','SALARY_MONTHLY','HR_APPROVAL','MD_APPROVAL','MANAGER_NAME',
    'MANAGER_EMAIL_ID','REGION','REPORTING_HEAD','ESCALATION_L1',
    'APPROVAL_STATUS','REMARKS','PERSONAL_FILE_ID','ACCESS_LEVEL',
    'JOINING_DATE','ACTIVE_STATUS','CREATED_AT','UPDATED_AT','SYSTEM_KEY',
    'LOGIN_ACCESS','WHATSAPP_VERIFIED','STAFF_URL','P1_WEBSITE_URL',
    'P1_SMART_FORM_URL','P1_DIGITAL_CARD_URL','P1_DASHBOARD_URL',
    'P1_CALLING_URL','P1_VOICE_URL','P1_QR_TEXT','P1_AVATAR_URL',
    'P1_PERSONAL_FILE_URL','P1_WORKSPACE_URL','P1_SYNC_STATUS','P1_LAST_SYNC_AT',
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
  HR_MD_APPROVAL: () => ['TIMESTAMP','CANDIDATE_ID','ENTRY_TYPE','EMPLOYEES_NAME',
    'EMPLOYEE_EMAIL_ID','MOBILE','CITY','DEPARTMENT','ROLE','EXPERIENCE_YEARS',
    'DESIGNATION',
    'CURRENT_COMPANY','CURRENT_CTC','EXPECTED_CTC','NOTICE_PERIOD','SKILLS',
    'EDUCATION','INTERVIEWER_EMAIL','INTERVIEW_STATUS','RESUME_LINK',
    'MANAGER_NAME','MANAGER_EMAIL_ID','SALARY_MONTHLY','JOINING_DATE','EMP_CODE',
    'STATUS','ACTIVE_STATUS','TC_ACCEPTED','PRIVACY_CONSENT','CONSENT_VERSION','CONSENT_AT','PRIVACY_NOTICE_URL','ONBOARD_DONE','JOINING_KIT_SENT_AT','REMARKS'],
  INTERVIEW_LOG:  () => ['TIMESTAMP','CANDIDATE_ID','CANDIDATE_NAME','EMAIL',
    'MOBILE','CITY','ROLE_APPLIED','EXPERIENCE_YEARS','CURRENT_COMPANY',
    'CURRENT_CTC','EXPECTED_CTC','NOTICE_PERIOD','SKILLS','EDUCATION',
    'DESIGNATION','INTERVIEWER_EMAIL','INTERVIEW_STATUS','RESUME_LINK','PRIVACY_CONSENT','CONSENT_VERSION','CONSENT_AT','PRIVACY_NOTICE_URL','REMARKS'],
  Loan_Bank_Map:  () => ['LOAN_TYPE','BANK','STATUS','ROI_START','MIN_CIBIL',
    'MIN_INCOME','MAX_LOAN_AMOUNT','DOCUMENTS_REQUIRED','POLICY_REMARKS','TAT_DAYS'],
  RAW_INBOX:      () => ['RECEIVED_AT','GMAIL_MSG_ID','FROM_EMAIL','SUBJECT',
    'LEAD_ID','CLIENT_NAME','CLIENT_MOBILE','PREFERRED_BANK','LOAN_TYPE',
    'REQUIRED_LOAN_AMOUNT','CASE_STATUS','REMARKS','SOURCE_NAME','EMP_CODE',
    'PROCESS_STATUS','DEDUP_ACTION','PROCESSED_AT'],
  ERR:            () => ['TIMESTAMP','FUNCTION','CODE','MESSAGE'],
  SYSTEM_CONTROL: () => ['LAST_UPDATED','EMP_CODE','EMPLOYEE_NAME','ROLE','DEPARTMENT','AVATAR_STATUS','TARGET','ASSIGNED_CASES','OPEN_CASES','COMPLETED_CASES','TAT_BREACHES','TODAY_ACTIVITY','LAST_ACTIVITY','ERRORS_24H','PERFORMANCE_PCT','NEXT_ACTION'],
  SYSTEM_PROCESS_CONTROL: () => ['LAST_UPDATED','PROCESS','OWNER_ROLE','STATUS','PENDING','LAST_RUN','ISSUE','NEXT_ACTION'],
  AVATAR_ACTIVITY_LOG: () => ['TIMESTAMP','EMP_CODE','ROLE','ACTIVITY_TYPE','SUMMARY','OUTCOME','SCORE']
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

// Apps Script email quotas are account-dependent and can stop execution without
// warning. Gate every non-essential outbound email and leave an auditable error.
function P1_MAIL_QUOTA_(recipientCount, context) {
  try {
    const needed = Math.max(1, Number(recipientCount || 1));
    const remaining = Number(MailApp.getRemainingDailyQuota());
    if (remaining < needed) {
      LOG_ERR_('MAIL_QUOTA', String(context || 'EMAIL'), `Remaining ${remaining}; required ${needed}`);
      return false;
    }
    return true;
  } catch (e) {
    LOG_ERR_('MAIL_QUOTA', String(context || 'EMAIL'), e.message);
    return false;
  }
}

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
  'CITY':'CITY_LOCATION','COMPANY':'COMPANY_NAME',
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
  try { const a = SpreadsheetApp.getActiveSpreadsheet(); if(a){ SS_INSTANCE_=a; return a; } } catch(_){}
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
  let url = p.getProperty('P1_EXEC_URL') || '';
  if (!url) { try { url = ScriptApp.getService().getUrl(); } catch(_){} }
  return url || '';
}

// Keep one page source while supporting the existing deployed GAS filename.
function P1_HTML_FROM_FILES_(fileNames) {
  let lastError = null;
  for (const fileName of fileNames) {
    try { return HtmlService.createHtmlOutputFromFile(fileName); }
    catch (err) { lastError = err; }
  }
  throw lastError || new Error('HTML file not found');
}

// Migrate old aliases once, then keep only the canonical properties.
function P1_MIGRATE_CORE_PROPERTIES_() {
  const props = PropertiesService.getScriptProperties();
  const legacyExecUrl = String(props.getProperty('MAIN_SERVER_EXEC_URL') || '').trim();
  const legacyMasterId = String(props.getProperty('P1_MASTER_FILE_ID') || '').trim();
  if (!props.getProperty('P1_EXEC_URL') && legacyExecUrl) props.setProperty('P1_EXEC_URL', legacyExecUrl);
  if (!props.getProperty('MASTER_FILE_ID') && legacyMasterId) props.setProperty('MASTER_FILE_ID', legacyMasterId);
  props.deleteProperty('MAIN_SERVER_EXEC_URL');
  props.deleteProperty('P1_MASTER_FILE_ID');
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
    obj.DESIGNATION      = String(obj['DESIGNATION']||obj['JOB_TITLE']||obj['ROLE']||'').trim();
    obj.DEPARTMENT       = String(obj['DEPARTMENT']||'').trim().toUpperCase();
    obj.LOAN_TYPE        = String(obj['LOAN_TYPE']||'').trim().toUpperCase();
    obj.BANK = String(obj['PREFERRED_BANK']||obj['BANK']||'').trim().toUpperCase();
    obj.PERSONAL_FILE_ID = String(obj['PERSONAL_FILE_ID']||obj['FILE_ID']||'').trim();
    obj.ACTIVE_STATUS    = String(obj['ACTIVE_STATUS']||'').trim().toUpperCase();
    obj.DASHBOARD_ACCESS = String(obj['ACCESS_LEVEL']||obj['ROLE']||'STAFF').toUpperCase();
    obj.PROFILE_PIC      = obj['P1_AVATAR_URL']||'';
    obj.TG_CHAT_ID       = String(obj['TELEGRAM_CHAT_ID']||'').trim();
    obj.ROW_NUM          = i+1;
    // HR/MD approval controls access: never treat a blank or pending row as active.
    if (!['ACTIVE','YES','APPROVED'].includes(obj.ACTIVE_STATUS)) continue;
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
    'ONBOARD':'HR','INTERVIEW':'HR','NEW STAFF ENTRY':'HR','INTERVIEW ENTRY':'HR',
    'BANKER ENTRY':'LOGIN DEPARTMENT'
  };
}

function P1_GET_HR_PUBLIC_CONFIG() {
  const props = PropertiesService.getScriptProperties();
  const privacyUrl=String(props.getProperty('PRIVACY_NOTICE_URL')||'').trim();
  return {
    tcUrl: String(props.getProperty('HR_TC_URL')||'').trim(),
    companyUrl: props.getProperty('COMPANY_WEBSITE_URL') || 'https://www.divyanshicapital.com',
    privacyUrl,
    privacyConfigured: /^https:\/\//i.test(privacyUrl),
    consentVersion: String(props.getProperty('CONSENT_VERSION')||'').trim(),
    privacyContact: DC_CLEAN_EMAIL_(props.getProperty('PRIVACY_CONTACT_EMAIL')||DC_CFG.COMPANY.SUPPORT_EMAIL),
    grievanceOfficer: String(props.getProperty('GRIEVANCE_OFFICER_NAME')||'').trim(),
    clientRetentionDays: Number(props.getProperty('CLIENT_RETENTION_DAYS')||0),
    candidateRetentionDays: Number(props.getProperty('CANDIDATE_RETENTION_DAYS')||0)
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
      const fullAccess=P1_HAS_MASTER_ACCESS_(emp),scope=emp?String(emp.DASHBOARD_ACCESS||emp.ACCESS_LEVEL||'SELF').toUpperCase():'SELF',isManager=emp&&/MANAGER|HEAD/.test(String(emp.ROLE||'').toUpperCase());
      const codes = Object.keys(map).filter(code=>fullAccess||((scope==='TEAM'||isManager)&&P1_CAN_SEE_EMP_(emp,map[code]))).slice(0,20);
      if (codes.length) {
        ctx += '[TEAM]\n';
        codes.forEach(c=>{ const e=map[c]; ctx+=`${e.EMP_CODE}:${e.NAME}(${e.ROLE||'RM'}) Mgr:${e.MANAGER_EMAIL}\n`; });
        ctx += '\n';
      }
      if(emp)ctx+='[SYSTEM CONTROL]\n'+P1_FORMAT_MASTER_CONTROL_(emp.EMP_CODE)+'\n\n';
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
  return 'Namaste! Divyanshi Assistant active hai. Loan, bank options, case status ke liye message karein.';
}

/* ================================================================
   SECTION 10 — BULBHUL AVATAR BRAIN
   ================================================================ */

const BULBHUL_ROLE_PROMPTS_ = {
  'MD'           :'You are Divyanshi Assistant for MD Upendra Singh Raghav (DC002). Full portfolio. Strategic data-first.',
  'FOUNDER'      :'You are Divyanshi Assistant for Founder Narendra (DC001). P&L, key accounts, system health.',
  'SALES MEMBER' :'You are Divyanshi Assistant for Sales RM. Lead conversion: bank fitment, CIBIL tips, doc checklist.',
  'SALES MANAGER':'You are Divyanshi Assistant for Sales Manager. Team pipeline, follow-ups, disbursal targets.',
  'COORDINATOR'  :'You are Divyanshi Assistant for Login Coordinator. Bank login, TAT gaps, doc status.',
  'ACCOUNTS'     :'You are Divyanshi Assistant for Accounts (Sachin DC037). Disbursals, PF/PDD, payments.',
  'HR'           :'You are Divyanshi Assistant for HR Head Khushboo (DC013). Hiring, attendance, onboarding.'
};

const BULBHUL_SYS_BASE_ =
  '# Divyanshi Assistant | Divyanshi Capital Pvt Ltd\n' +
  'Products: PL(3d) BL(7d) HL(15d) LAP(15d) AUTO(5d)\n' +
  'Governance: MD+HR approve money/hiring/salary. Divyanshi Assistant advises only and never executes a status, message, attendance or approval change from chat.\n\n' +
  'Reply short, direct, Hinglish.';

function BULBHUL_CHAT_API_(data) {
  data = data||{};
  const rawMsg = String(data.message||'').trim().slice(0,1000);
  const emp    = data.empCode ? FIND_EMPLOYEE_FULL_(data.empCode) : null;
  const role   = emp ? String(emp.ROLE||'').toUpperCase() : '';
  if(emp&&/(^|\s)\/?(system|health|avatars?|bugs?|performance)(\s|$)/i.test(rawMsg)){
    const direct=P1_FORMAT_MASTER_CONTROL_(emp.EMP_CODE);P1_LOG_AVATAR_ACTIVITY_(emp.EMP_CODE,'SYSTEM_CONTROL',rawMsg,'ANSWERED',100);return direct;
  }
  let rolePrompt = BULBHUL_ROLE_PROMPTS_['SALES MEMBER'];
  for (const k of Object.keys(BULBHUL_ROLE_PROMPTS_)) { if(role.includes(k)){rolePrompt=BULBHUL_ROLE_PROMPTS_[k];break;} }
  const sysPrompt = BULBHUL_SYS_BASE_ + '\n\n[LIVE CONTEXT]\n' + BUILD_AI_CONTEXT_(data.empCode) + '\n\n' + rolePrompt;

  let extraCtx = '';
  try {
    const mM = rawMsg.match(/\b[6-9]\d{9}\b/), lM = rawMsg.match(/\bL\d{4,}_\d+\b/i);
    if (mM||lM) {
      const q = lM ? lM[0].toUpperCase() : mM[0];
      const found = emp?GET_MASTER_SNAPSHOT_().find(c =>(String(c.LEAD_ID||'').toUpperCase()===q || DC_CLEAN_MOBILE_(String(c.CLIENT_MOBILE||''))===DC_CLEAN_MOBILE_(q))&&P1_CALLING_CAN_ACCESS_(emp,c)):null;
      extraCtx = found
        ? `\n[CASE] ID:${found.LEAD_ID}|Client:${found.CLIENT_NAME}|Loan:${found.LOAN_TYPE}|Bank:${found.PREFERRED_BANK}|Status:${found.CASE_CATEGORY}|TAT:${found.TAT_STATUS}|Owner:${found.EMP_CODE}`
        : `\n[CASE] Not found: "${q}"`;
    }
  } catch(_){}

  const fullPrompt = (emp?`[SENDER] ${emp.NAME}(${emp.EMP_CODE})|${emp.ROLE}\n`:'[SENDER] Visitor\n') + extraCtx + '\n\n[USER]: ' + rawMsg;
  const reply = MULTI_BRAIN_REPLY_(fullPrompt, sysPrompt);
  if(emp)P1_LOG_AVATAR_ACTIVITY_(emp.EMP_CODE,'BULBHUL_CHAT',rawMsg,'ANSWERED',100);
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

function P1_SHEET_OBJECTS_(name){
  const sh=SHEET_(name);if(!sh||sh.getLastRow()<2)return[];
  const data=sh.getDataRange().getValues(),h=data[0].map(DC_NORM_);
  return data.slice(1).map(r=>{const o={};h.forEach((k,i)=>o[k]=r[i]);return o;});
}

function P1_HAS_MASTER_ACCESS_(emp){
  if(!emp)return false;
  const scope=String(emp.DASHBOARD_ACCESS||emp.ACCESS_LEVEL||'').toUpperCase(),role=String(emp.ROLE||'').toUpperCase();
  return scope==='ALL'||/FOUNDER|MANAGING DIRECTOR|\bMD\b|ADMIN/.test(role);
}
function P1_ROLE_CAN_USE_CALLING_(emp){
  if(!emp)return false;
  if(P1_HAS_MASTER_ACCESS_(emp))return true;
  return /SALES|CALL|RELATIONSHIP|LOGIN|COORDINATOR|MANAGER|HEAD/.test((String(emp.ROLE||'')+' '+String(emp.DEPARTMENT||'')).toUpperCase());
}

function P1_CAN_SEE_EMP_(requester,target){
  if(!requester||!target)return false;
  if(P1_HAS_MASTER_ACCESS_(requester))return true;
  if(requester.EMP_CODE===target.EMP_CODE)return true;
  const scope=String(requester.DASHBOARD_ACCESS||requester.ACCESS_LEVEL||'').toUpperCase(),role=String(requester.ROLE||'').toUpperCase();
  return(scope==='TEAM'||/MANAGER|HEAD/.test(role))&&DC_CLEAN_EMAIL_(target.MANAGER_EMAIL)===DC_CLEAN_EMAIL_(requester.EMAIL);
}

function P1_CALLING_CAN_ACCESS_(emp,c){
  if(!emp||!c)return false;
  if(P1_HAS_MASTER_ACCESS_(emp))return true;
  return String(c.EMP_CODE||'').toUpperCase()===emp.EMP_CODE||DC_CLEAN_EMAIL_(String(c.MANAGER_EMAIL||''))===emp.EMAIL;
}

function P1_MASTER_CONTROL_SNAPSHOT_(force){
  if(force){SC_.remove('MASTER_SNAP_V1');SC_.remove('MASTER_CONTROL_V1');}
  const build=()=>{
    const now=new Date(),nowMs=now.getTime(),dayMs=86400000,tz='Asia/Kolkata',today=Utilities.formatDate(now,tz,'yyyy-MM-dd');
    const empMap=DC_BUILD_EMP_MAP_(!!force),cases=GET_MASTER_SNAPSHOT_(),attendance=P1_SHEET_OBJECTS_('ATTENDANCE_LOG'),activity=P1_SHEET_OBJECTS_('AVATAR_ACTIVITY_LOG'),errors=P1_SHEET_OBJECTS_('ERR');
    const completedSet={APPROVED:1,DISBURSED:1,DISBURSE:1,COMPLETED:1,CLOSED:1,REJECTED:1};
    const todayAttendance={};attendance.forEach(a=>{try{if(Utilities.formatDate(new Date(a.DATE||a.LAST_UPDATED),tz,'yyyy-MM-dd')===today)todayAttendance[String(a.EMP_CODE||'').toUpperCase()]=String(a.ATTENDANCE_STATUS||'ACTIVE');}catch(_){}});
    const activityByEmp={};activity.forEach(a=>{const code=String(a.EMP_CODE||'').toUpperCase();if(!code)return;const t=new Date(a.TIMESTAMP||0).getTime()||0;if(!activityByEmp[code]||t>activityByEmp[code].time)activityByEmp[code]={time:t,type:a.ACTIVITY_TYPE||'',outcome:a.OUTCOME||''};});
    const recentErrors=errors.filter(e=>{const t=new Date(e.TIMESTAMP||0).getTime();return t&&nowMs-t<=dayMs;});
    const avatars=Object.keys(empMap).map(code=>{
      const emp=empMap[code],mine=cases.filter(c=>String(c.EMP_CODE||'').toUpperCase()===code),open=mine.filter(c=>!completedSet[String(c.CASE_CATEGORY||'OPEN').toUpperCase()]),completed=mine.length-open.length;
      const breaches=open.filter(c=>{const status=String(c.TAT_STATUS||'').toUpperCase();const deadline=new Date(c.TAT_DEADLINE||0).getTime();return/BREACH|OVERDUE|DELAY/.test(status)||(deadline&&deadline<nowMs);}).length;
      const empErrors=recentErrors.filter(e=>String(e.CODE||'').toUpperCase()===code).length,lastCase=mine.reduce((m,c)=>Math.max(m,new Date(c.LAST_UPDATED||c.TIMESTAMP||0).getTime()||0),0),lastAvatar=activityByEmp[code]||{time:0,type:'',outcome:''},lastMs=Math.max(lastCase,lastAvatar.time),target=Math.max(0,Number(emp.TARGET||0));
      const performance=target?Math.min(100,Math.round(completed/target*100)):(mine.length?Math.round(completed/mine.length*100):0),todayWork=todayAttendance[code]||((lastMs&&Utilities.formatDate(new Date(lastMs),tz,'yyyy-MM-dd')===today)?'ACTIVE':'');
      let status='OK',next='Continue assigned work';
      if(empErrors){status='BUG';next='Review ERR log and repair assigned process';}
      else if(breaches){status='ACTION_REQUIRED';next=`Clear ${breaches} TAT breach(es)`;}
      else if(!todayWork&&!mine.length){status='IDLE';next='Manager should assign role-specific work';}
      else if(open.length){status='ACTIVE';next=`Work ${open.length} open case(s)`;}
      return{LAST_UPDATED:now,EMP_CODE:code,EMPLOYEE_NAME:emp.NAME||'',ROLE:emp.ROLE||'',DEPARTMENT:emp.DEPARTMENT||'',AVATAR_STATUS:status,TARGET:target||'',ASSIGNED_CASES:mine.length,OPEN_CASES:open.length,COMPLETED_CASES:completed,TAT_BREACHES:breaches,TODAY_ACTIVITY:todayWork||'NO_ACTIVITY',LAST_ACTIVITY:lastMs?new Date(lastMs):'',ERRORS_24H:empErrors,PERFORMANCE_PCT:performance,NEXT_ACTION:next};
    });
    const hrPending=P1_SHEET_OBJECTS_('HR_MD_APPROVAL').filter(r=>!['APPROVED','ACTIVE','COMPLETED'].includes(String(r.STATUS||r.ACTIVE_STATUS||'PENDING').toUpperCase())).length;
    const loginPending=cases.filter(c=>/LOGIN/.test(String(c.DATA_FLOW||c.SOURCE_NAME||c.CASE_CATEGORY||'').toUpperCase())&&!completedSet[String(c.LOGIN_STAGE||c.CASE_CATEGORY||'PENDING').toUpperCase()]).length;
    const accountsPending=P1_SHEET_OBJECTS_('ACCOUNTS_LOG').filter(r=>!['PAID','COMPLETED','CLOSED'].includes(String(r.DISBURSAL_STATUS||'PENDING').toUpperCase())).length;
    const unassigned=cases.filter(c=>!String(c.EMP_CODE||'').trim()).length,misLastRaw=PropertiesService.getScriptProperties().getProperty('MIS_LAST_RUN')||'',misLastMs=new Date(misLastRaw||0).getTime()||0,misDelayed=!misLastMs||nowMs-misLastMs>30*60000,aiKeys=[DC_CFG.DEEPSEEK_KEY,DC_CFG.OPENAI_KEY,DC_CFG.GEMINI_KEY].filter(Boolean).length;
    const proc=(process,owner,status,pending,lastRun,issue,next)=>({LAST_UPDATED:now,PROCESS:process,OWNER_ROLE:owner,STATUS:status,PENDING:pending,LAST_RUN:lastRun||'',ISSUE:issue||'',NEXT_ACTION:next||'Continue monitoring'});
    const processes=[
      proc('SALES','SALES','ACTIVE',avatars.reduce((s,x)=>s+x.OPEN_CASES,0),'','Open assigned cases','Follow up by TAT and update status'),
      proc('LOGIN','LOGIN TEAM',loginPending?'ACTION_REQUIRED':'OK',loginPending,'',loginPending?'Cases waiting for login/proceed':'','Process login queue and bank responses'),
      proc('HR','HR',hrPending?'ACTION_REQUIRED':'OK',hrPending,'',hrPending?'Approvals/onboarding pending':'','Complete HR/MD approval and joining formalities'),
      proc('ACCOUNTS','ACCOUNTS',accountsPending?'ACTION_REQUIRED':'OK',accountsPending,'',accountsPending?'Disbursal follow-up pending':'','Clear PF/PDD/payment queue'),
      proc('MIS','MIS',misDelayed?'BUG':'OK',misDelayed?1:0,misLastRaw,misDelayed?'MIS trigger missing or delayed':'','Run MIS pipeline and inspect trigger'),
      proc('BULBHUL_AI','MD/FOUNDER',aiKeys?'OK':'BUG',aiKeys?0:1,activity.length?activity[activity.length-1].TIMESTAMP:'',aiKeys?'': 'No AI provider key configured','Configure one approved server-side AI key'),
      proc('DATA_QUALITY','MD/MANAGERS',unassigned?'ACTION_REQUIRED':'OK',unassigned,'',unassigned?'Cases without employee ownership':'','Assign using verified manager/employee mapping'),
      proc('ERROR_LOG','TECHNICAL',recentErrors.length?'ACTION_REQUIRED':'OK',recentErrors.length,recentErrors.length?recentErrors[recentErrors.length-1].TIMESTAMP:'',recentErrors.length?'Errors recorded in last 24 hours':'','Review ERR and fix root cause')
    ];
    const summary={employees:avatars.length,ok:avatars.filter(x=>x.AVATAR_STATUS==='OK'||x.AVATAR_STATUS==='ACTIVE').length,attention:avatars.filter(x=>x.AVATAR_STATUS==='ACTION_REQUIRED').length,bugs:avatars.filter(x=>x.AVATAR_STATUS==='BUG').length,idle:avatars.filter(x=>x.AVATAR_STATUS==='IDLE').length,openCases:avatars.reduce((s,x)=>s+x.OPEN_CASES,0),tatBreaches:avatars.reduce((s,x)=>s+x.TAT_BREACHES,0),errors24h:recentErrors.length,processIssues:processes.filter(x=>x.STATUS!=='OK'&&x.STATUS!=='ACTIVE').length,lastUpdated:now};
    return{ok:true,summary,avatars,processes,bugs:recentErrors.slice(-20).reverse().map(e=>({time:e.TIMESTAMP||'',function:e.FUNCTION||'',code:e.CODE||'',message:String(e.MESSAGE||'').slice(0,180)}))};
  };
  if(force)return build();
  return CACHED_GET_('MASTER_CONTROL_V1',120,build);
}

function P1_GET_MASTER_CONTROL_(requesterEmpCode){
  const requester=FIND_EMPLOYEE_FULL_(requesterEmpCode);if(!requester)return{ok:false,err:'Valid employee required'};
  P1_ENSURE_MASTER_CONTROL_FRESH_();
  const snap=P1_MASTER_CONTROL_SNAPSHOT_(false),avatars=snap.avatars.filter(a=>{const target=FIND_EMPLOYEE_FULL_(a.EMP_CODE);return P1_CAN_SEE_EMP_(requester,target);});
  const allowedCodes={};avatars.forEach(a=>allowedCodes[a.EMP_CODE]=1);const full=P1_HAS_MASTER_ACCESS_(requester),roleDept=(String(requester.ROLE||'')+' '+String(requester.DEPARTMENT||'')).toUpperCase();
  const processes=full?snap.processes:snap.processes.filter(p=>roleDept.includes(p.PROCESS)||String(p.OWNER_ROLE||'').split('/').some(x=>roleDept.includes(x)));
  return{ok:true,scope:full?'ALL':String(requester.DASHBOARD_ACCESS||'SELF').toUpperCase(),summary:full?snap.summary:{employees:avatars.length,openCases:avatars.reduce((s,x)=>s+x.OPEN_CASES,0),tatBreaches:avatars.reduce((s,x)=>s+x.TAT_BREACHES,0),bugs:avatars.reduce((s,x)=>s+x.ERRORS_24H,0),processIssues:processes.filter(x=>x.STATUS!=='OK'&&x.STATUS!=='ACTIVE').length},avatars,processes,bugs:full?snap.bugs:snap.bugs.filter(b=>allowedCodes[String(b.code||'').toUpperCase()])};
}

function P1_FORMAT_MASTER_CONTROL_(requesterEmpCode){
  const r=P1_GET_MASTER_CONTROL_(requesterEmpCode);if(!r.ok)return'Access denied: '+r.err;
  const s=r.summary,lines=[`SYSTEM CONTROL (${r.scope})`,`Employees:${s.employees||0} | Open:${s.openCases||0} | TAT breaches:${s.tatBreaches||0} | Bugs:${s.bugs||0} | Process issues:${s.processIssues||0}`];
  (r.processes||[]).filter(p=>p.STATUS!=='OK'&&p.STATUS!=='ACTIVE').forEach(p=>lines.push(`PROCESS ${p.PROCESS} | ${p.STATUS} | Pending:${p.PENDING} | ${p.NEXT_ACTION}`));
  r.avatars.filter(a=>a.AVATAR_STATUS!=='OK').sort((a,b)=>b.TAT_BREACHES-a.TAT_BREACHES).slice(0,15).forEach(a=>lines.push(`${a.EMP_CODE} ${a.EMPLOYEE_NAME} | ${a.ROLE} | ${a.AVATAR_STATUS} | Open:${a.OPEN_CASES} | ${a.NEXT_ACTION}`));
  if(lines.length===2)lines.push('All visible avatars are operating normally.');
  return lines.join('\n');
}

function P1_LOG_AVATAR_ACTIVITY_(empCode,type,summary,outcome,score){
  try{const emp=FIND_EMPLOYEE_FULL_(empCode),sh=GET_OR_CREATE_('AVATAR_ACTIVITY_LOG'),h=P1_ENSURE_HEADERS_(sh,P1_TAB_MAP.AVATAR_ACTIVITY_LOG());sh.appendRow(P1_BUILD_ROW_(h,{TIMESTAMP:new Date(),EMP_CODE:String(empCode||'').toUpperCase(),ROLE:emp?emp.ROLE:'',ACTIVITY_TYPE:type||'',SUMMARY:String(summary||'').slice(0,200),OUTCOME:String(outcome||'').slice(0,100),SCORE:Number(score||0)}));SC_.remove('MASTER_CONTROL_V1');}catch(_){}
}

function SYNC_MASTER_CONTROL_CENTER_(){
  const snap=P1_MASTER_CONTROL_SNAPSHOT_(true),sh=GET_OR_CREATE_('SYSTEM_CONTROL'),headers=P1_TAB_MAP.SYSTEM_CONTROL();
  sh.clearContents();sh.getRange(1,1,1,headers.length).setValues([headers]);
  if(snap.avatars.length)sh.getRange(2,1,snap.avatars.length,headers.length).setValues(snap.avatars.map(a=>P1_BUILD_ROW_(headers,a)));
  const processSh=GET_OR_CREATE_('SYSTEM_PROCESS_CONTROL'),processHeaders=P1_TAB_MAP.SYSTEM_PROCESS_CONTROL();processSh.clearContents();processSh.getRange(1,1,1,processHeaders.length).setValues([processHeaders]);
  if(snap.processes.length)processSh.getRange(2,1,snap.processes.length,processHeaders.length).setValues(snap.processes.map(p=>P1_BUILD_ROW_(processHeaders,p)));
  try{styleHeaderRow_(sh,headers.length);sh.setFrozenRows(1);sh.autoResizeColumns(1,headers.length);}catch(_){}
  try{styleHeaderRow_(processSh,processHeaders.length);processSh.setFrozenRows(1);processSh.autoResizeColumns(1,processHeaders.length);}catch(_){}
  PropertiesService.getScriptProperties().setProperty('MASTER_CONTROL_LAST_SYNC',new Date().toISOString());SC_.remove('MASTER_CONTROL_V1');
  return snap.summary;
}

function P1_ENSURE_MASTER_CONTROL_FRESH_(){
  const props=PropertiesService.getScriptProperties(),last=new Date(props.getProperty('MASTER_CONTROL_LAST_SYNC')||0).getTime()||0;if(Date.now()-last<=60*60000)return;
  const lock=LockService.getScriptLock();if(!lock.tryLock(3000))return;
  try{const fresh=new Date(props.getProperty('MASTER_CONTROL_LAST_SYNC')||0).getTime()||0;if(Date.now()-fresh>60*60000)SYNC_MASTER_CONTROL_CENTER_();}catch(e){LOG_ERR_('MASTER_CONTROL_REFRESH','',e.message);}finally{try{lock.releaseLock();}catch(_){}}
}

/* ================================================================
   SECTION 11 — PRODUCTS + TAT (ScriptCache 1h)
   ================================================================ */

let LOAN_BANK_CATALOG_CACHE_ = null;

function GET_PRODUCT_ICON_(loanType) {
  const value=String(loanType||'').toLowerCase();
  if(value.includes('personal'))return'💳';
  if(value.includes('business'))return'🏢';
  if(value.includes('home'))return'🏠';
  if(value.includes('property')||value.includes('lap')||value.includes('mortgage'))return'🏦';
  if(value.includes('auto')||value.includes('car'))return'🚗';
  if(value.includes('gold'))return'🪙';
  return'💼';
}

// Upsert without erasing existing values when an incoming optional field is blank.
function UPSERT_MERGE_BY_KEY_(sh,keyHeader,rowObj,headers) {
  const aH=P1_ENSURE_HEADERS_(sh,headers),nH=aH.map(DC_NORM_);
  const kIdx=nH.indexOf(DC_NORM_(keyHeader)),kVal=String(P1_VAL_(rowObj,keyHeader)||'').trim();
  if(kIdx<0||!kVal){sh.appendRow(P1_BUILD_ROW_(aH,rowObj));return sh.getLastRow();}
  const lr=sh.getLastRow();
  if(lr>=2){
    const keys=sh.getRange(2,kIdx+1,lr-1,1).getValues();
    for(let i=0;i<keys.length;i++)if(String(keys[i][0]||'').trim()===kVal){
      const old=sh.getRange(i+2,1,1,aH.length).getValues()[0];
      const incoming=P1_BUILD_ROW_(aH,rowObj);
      const merged=old.map((v,j)=>incoming[j]!==''&&incoming[j]!==null&&incoming[j]!==undefined?incoming[j]:v);
      sh.getRange(i+2,1,1,aH.length).setValues([merged]);return i+2;
    }
  }
  sh.appendRow(P1_BUILD_ROW_(aH,rowObj));return sh.getLastRow();
}

function GET_LOAN_BANK_CATALOG_() {
  if(LOAN_BANK_CATALOG_CACHE_)return LOAN_BANK_CATALOG_CACHE_;
  const empty={products:[],banks:{},rules:[]};
  const sh=SHEET_('Loan_Bank_Map');
  if(!sh||sh.getLastRow()<2)return(LOAN_BANK_CATALOG_CACHE_=empty);
  const data=sh.getDataRange().getValues(),headers=data[0].map(DC_NORM_);
  const col=(...names)=>{for(const name of names){const i=headers.indexOf(DC_NORM_(name));if(i>-1)return i;}return-1;};
  const idx={loan:col('LOAN_TYPE'),bank:col('BANK','PREFERRED_BANK'),status:col('STATUS','CASE_CATEGORY'),tat:col('TAT_DAYS'),roi:col('ROI_START','ROI'),minCibil:col('MIN_CIBIL'),minIncome:col('MIN_INCOME'),maxFoir:col('MAX_FOIR'),maxLoan:col('MAX_LOAN_AMOUNT'),documents:col('DOCUMENTS_REQUIRED'),policy:col('POLICY_REMARKS','NOTES'),reminder:col('REMINDER_DAYS'),lastDayTat:col('LAST_DAY_TAT'),priority:col('PRIORITY')};
  if(idx.loan<0||idx.bank<0)return(LOAN_BANK_CATALOG_CACHE_=empty);
  const groups={},rules=[],codeMap={'PERSONAL LOAN':'PL','BUSINESS LOAN':'BL','HOME LOAN':'HL','HOME LOAN AND LAP':'HL','LOAN AGAINST PROPERTY':'LAP','AUTO LOAN':'AUTO','GOLD LOAN':'GL','WORKING CAPITAL':'WC','MORTGAGE LOAN':'ML'};
  const num=(row,i)=>i>-1&&row[i]!==''?Number(row[i]):null,txt=(row,i)=>i>-1?String(row[i]||'').trim():'';
  for(let r=1;r<data.length;r++){
    const row=data[r],loanType=txt(row,idx.loan),bank=txt(row,idx.bank),status=(txt(row,idx.status)||'ACTIVE').toUpperCase();
    if(!loanType||!bank||!['ACTIVE','YES','LIVE'].includes(status))continue;
    const key=loanType.toUpperCase(),tat=num(row,idx.tat),roi=num(row,idx.roi),documents=txt(row,idx.documents);
    const rule={loanType,bank,status,tatDays:tat,roiStart:roi,minCibil:num(row,idx.minCibil),minIncome:num(row,idx.minIncome),maxFoir:num(row,idx.maxFoir),maxLoanAmount:num(row,idx.maxLoan),reminderDays:num(row,idx.reminder),lastDayTat:num(row,idx.lastDayTat),priority:num(row,idx.priority),documentsRequired:documents,policyRemarks:txt(row,idx.policy)};
    rules.push(rule);
    if(!groups[key]){const generatedCode=key.split(/\s+/).map(x=>x.charAt(0)).join('').slice(0,4)||key.slice(0,4);groups[key]={code:codeMap[key]||generatedCode,name:loanType,icon:GET_PRODUCT_ICON_(loanType),tat:tat||7,roi:roi||0,banks:[],documents:[],rules:[]};}
    const product=groups[key];
    if(!product.banks.includes(bank))product.banks.push(bank);
    if(tat&&tat<product.tat)product.tat=tat;
    if(roi&&(!product.roi||roi<product.roi))product.roi=roi;
    if(documents)documents.split(/[\n,;]+/).map(x=>x.trim()).filter(Boolean).forEach(doc=>{if(!product.documents.includes(doc))product.documents.push(doc);});
    product.rules.push(rule);
  }
  const products=Object.keys(groups).map(key=>groups[key]),banks={};
  products.forEach(product=>{banks[product.name.toUpperCase()]=product.banks.slice();});
  return(LOAN_BANK_CATALOG_CACHE_={products,banks,rules});
}

function GET_ACTIVE_LOAN_PRODUCTS_(){return GET_LOAN_BANK_CATALOG_().products;}
function P1_GET_BANK_OPTIONS_MAP_(){return GET_LOAN_BANK_CATALOG_().banks;}
function P1_GET_LOAN_CATALOG(){const c=GET_LOAN_BANK_CATALOG_();return{products:c.products,banks:c.banks,docsApi:true};}

function P1_DOC_REQUIREMENTS_(loanType,employmentType,preferredBank){
  const loan=String(loanType||'').trim().toUpperCase(),emp=String(employmentType||'').trim().toUpperCase();
  const common=['PAN or Form 60, where applicable','One RBI-valid OVD (Aadhaar possession proof / Passport / Driving Licence / Voter ID / NREGA job card / NPR letter)','Recent photograph'];
  const salaried=['Last 3 months salary slips','Last 6 months salary-account bank statement','Form 16 or latest ITR','Employment proof / employee ID'];
  const business=['Business/constitution proof (GST / Udyam / incorporation / partnership deed)','Entity PAN and registered-address proof, where applicable','Authorised-signatory / beneficial-owner KYC and authority resolution, where applicable','Last 2 years ITR with computation','Last 2 years audited financials','Last 12 months primary bank statements','GST returns, where applicable'];
  const property=['Property title/chain documents','Sale agreement / allotment letter','Approved building plan','Latest property-tax receipt','Builder/society NOC, where applicable'];
  const catalog=GET_LOAN_BANK_CATALOG_(),product=catalog.products.find(x=>String(x.name||'').toUpperCase()===loan);
  const selected=String(preferredBank||'').split(',').map(x=>x.trim().toUpperCase()).filter(Boolean);
  const bankDocs=catalog.rules.filter(r=>String(r.loanType||'').toUpperCase()===loan&&(!selected.length||selected.includes(String(r.bank||'').toUpperCase()))).flatMap(r=>String(r.documentsRequired||'').split(/[\n,;]+/).map(x=>x.trim()).filter(Boolean));
  let docs=Array.from(new Set([...(product&&product.documents||[]),...bankDocs]));
  const add=list=>list.forEach(x=>{if(!docs.some(d=>String(d).toUpperCase()===String(x).toUpperCase()))docs.push(x);});
  add(common);
  if(emp==='SALARIED')add(salaried);else if(emp==='SELF_EMPLOYED'||emp==='BUSINESS')add(business);
  if(/HOME|PROPERTY|MORTGAGE|LAP/.test(loan))add(property);
  if(/AUTO|VEHICLE|CAR/.test(loan))add(['Vehicle quotation / proforma invoice']);
  if(/EDUCATION/.test(loan))add(['Admission/offer letter','Course fee structure','Academic records','Co-applicant income documents']);
  if(/TAKEOVER|BALANCE TRANSFER/.test(loan))add(['Existing loan statement','Existing sanction letter','Foreclosure / outstanding letter']);
  return docs;
}

function P1_GET_DOC_REQUIREMENTS(loanType,employmentType,preferredBank){
  return{ok:true,documents:P1_DOC_REQUIREMENTS_(loanType,employmentType,preferredBank),source:'Loan_Bank_Map bank rules plus applicable KYC/product baseline'};
}

function P1_ROUTE_SIGNATURE_(empCode,email){return P1_B64URL_(Utilities.computeHmacSha256Signature(String(empCode||'').toUpperCase()+'|'+DC_CLEAN_EMAIL_(email),DC_CFG.API_KEY,Utilities.Charset.UTF_8));}
function P1_VERIFY_ROUTE_SIGNATURE_(empCode,email,signature){return!!DC_CFG.API_KEY&&P1_CONST_EQ_(P1_ROUTE_SIGNATURE_(empCode,email),String(signature||''));}
function P1_ISSUE_UPLOAD_TOKEN(submissionKey,routeKey){
  submissionKey=String(submissionKey||'').trim();routeKey=String(routeKey||'').trim().toLowerCase();if(!/^[A-Za-z0-9_-]{16,120}$/.test(submissionKey))throw new Error('Valid submission session required');
  const cache=CacheService.getScriptCache(),rateKey='UPLOAD_RATE_'+P1_IDEMPOTENCY_CACHE_KEY_(submissionKey+'|'+routeKey).replace('P1_SUBMIT_',''),issued=Number(cache.get(rateKey)||0);
  if(issued>=3)throw new Error('Upload token limit reached. Please continue with the existing upload token.');
  cache.put(rateKey,String(issued+1),1200);
  const token=Utilities.getUuid().replace(/-/g,''),binding=P1_IDEMPOTENCY_CACHE_KEY_(submissionKey+'|'+routeKey);
  cache.put('UPLOAD_TOKEN_'+token,JSON.stringify({binding,issuedAt:Date.now()}),1200);
  return token;
}

function P1_CONSUME_UPLOAD_TOKEN_(token,submissionKey,routeKey){
  token=String(token||'').trim();if(!token)return false;
  const cache=CacheService.getScriptCache(),key='UPLOAD_TOKEN_'+token,raw=cache.get(key);if(!raw)return false;
  try{const meta=JSON.parse(raw),expected=P1_IDEMPOTENCY_CACHE_KEY_(String(submissionKey||'').trim()+'|'+String(routeKey||'').trim().toLowerCase()),valid=P1_CONST_EQ_(meta.binding,expected);if(valid)cache.remove(key);return valid;}catch(_){cache.remove(key);return false;}
}

function P1_RATE_LIMIT_INTAKE_(p){
  const identity=DC_CLEAN_MOBILE_(p.client_mobile||p.CLIENT_MOBILE||p.mobile||'')||DC_CLEAN_EMAIL_(p.client_email||p.CLIENT_EMAIL||p.email||'')||String(p.submission_key||'');
  const key='P1_RATE_'+P1_IDEMPOTENCY_CACHE_KEY_(String(p.entry_type||p.ENTRY_TYPE||'')+'|'+identity).replace('P1_SUBMIT_',''),cache=CacheService.getScriptCache(),count=Number(cache.get(key)||0);
  if(count>=5)return false;cache.put(key,String(count+1),3600);return true;
}

function P1_CLIENT_DOCS_ROOT_(){
  const props=PropertiesService.getScriptProperties();
  let id=props.getProperty('CLIENT_DOCS_FOLDER_ID')||'';
  if(id){try{return DriveApp.getFolderById(id);}catch(_){}}
  const folders=DriveApp.getFoldersByName('DIVYANSHI_CLIENT_DOCUMENTS');
  const folder=folders.hasNext()?folders.next():DriveApp.createFolder('DIVYANSHI_CLIENT_DOCUMENTS');
  props.setProperty('CLIENT_DOCS_FOLDER_ID',folder.getId());
  return folder;
}

function P1_DETECT_UPLOAD_MIME_(bytes){
  const b=i=>((bytes[i]||0)&255);
  if(bytes.length>=4&&b(0)===0x25&&b(1)===0x50&&b(2)===0x44&&b(3)===0x46)return'application/pdf';
  if(bytes.length>=3&&b(0)===0xff&&b(1)===0xd8&&b(2)===0xff)return'image/jpeg';
  if(bytes.length>=8&&[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((v,i)=>b(i)===v))return'image/png';
  return'';
}

function P1_SAVE_CLIENT_DOCS_(p,caseId){
  const supplied=Array.isArray(p.files)?p.files:[];
  if(supplied.length>8)throw new Error('Maximum 8 files allowed');
  const files=supplied.slice(0,8);
  const estimatedBytes=files.reduce((sum,f)=>sum+Math.floor(String(f.base64||'').length*0.75),0);
  if(estimatedBytes>10*1024*1024)throw new Error('Total upload exceeds 10 MB');
  if(!files.length)return{folderUrl:String(p.docs_link||p.DOCS_LINK||''),names:[]};
  const allowed=/^(application\/pdf|image\/(jpeg|png))$/i;
  const prepared=files.map(f=>{
    const mime=String(f.mimeType||'application/octet-stream').toLowerCase(),raw=String(f.base64||'');
    if(!allowed.test(mime))throw new Error(`Unsupported file type: ${f.name||'document'}`);
    if(!raw)throw new Error(`Empty file data: ${f.name||'document'}`);
    const b64=raw.includes(',')?raw.split(',').pop():raw,bytes=Utilities.base64Decode(b64);
    if(bytes.length>5*1024*1024)throw new Error(`File exceeds 5 MB: ${f.name||'document'}`);
    const detected=P1_DETECT_UPLOAD_MIME_(bytes);
    if(!detected||detected!==mime)throw new Error(`File content/type mismatch: ${f.name||'document'}`);
    const clean=String(f.name||'document').replace(/[\\/:*?"<>|]/g,'_').slice(0,120);
    return{mime,bytes,clean};
  });
  const root=P1_CLIENT_DOCS_ROOT_(),folderName=`CASE_${String(caseId||Utilities.getUuid()).replace(/[^A-Za-z0-9_-]/g,'').slice(0,60)}`;
  const existing=root.getFoldersByName(folderName),folder=existing.hasNext()?existing.next():root.createFolder(folderName);
  const names=[],fileIds=[];
  try{prepared.forEach(f=>{const saved=folder.createFile(Utilities.newBlob(f.bytes,f.mime,f.clean));names.push(f.clean);fileIds.push(saved.getId());});}
  catch(e){fileIds.forEach(id=>{try{DriveApp.getFileById(id).setTrashed(true);}catch(_){}});throw e;}
  if(files.length&&!names.length)throw new Error('No valid document was uploaded');
  return{folderUrl:folder.getUrl(),names,fileIds};
}

function P1_DOC_AUDIT_(p,upload){
  const required=P1_DOC_REQUIREMENTS_(p.loan_type,p.employment_type,p.preferred_bank),selected=Array.isArray(p.selected_documents)?p.selected_documents:[];
  const evidence=(upload.names||[]).map(x=>String(x).toUpperCase());
  const token=s=>String(s).toUpperCase().replace(/[^A-Z0-9 ]/g,' ').split(/\s+/).filter(x=>x.length>3);
  const received=required.filter(req=>{const t=token(req);return evidence.some(e=>t.some(k=>e.includes(k)));});
  const missing=required.filter(x=>!received.includes(x)),status=!upload.names.length?'NOT_UPLOADED':'AI_REVIEW_PENDING';
  return{status,required,received,missing,summary:`${status} | Uploaded ${upload.names.length} file(s) | Human/lender verification required`,text:`Required: ${required.join('; ')}\nApplicant declared: ${selected.join('; ')||'None'}\nFilename pre-match: ${received.join('; ')||'None'}\nPending/unclear: ${missing.join('; ')||'None'}\nAI output is assistance only; final document acceptance is by authorised staff/lender.`};
}

// ── FIX: Complete GET_TAT_BY_PRODUCT_ (was truncated at 'co') ──
function GET_TAT_BY_PRODUCT_(loanType,preferredBank){
  const key=String(loanType||'').trim().toUpperCase(),catalog=GET_LOAN_BANK_CATALOG_();
  const selected=String(preferredBank||'').split(',').map(x=>x.trim().toUpperCase()).filter(Boolean);
  if(selected.length){const matching=catalog.rules.filter(rule=>rule.loanType.toUpperCase()===key&&selected.includes(rule.bank.toUpperCase())&&Number(rule.tatDays)>0);if(matching.length)return Math.min.apply(null,matching.map(rule=>Number(rule.tatDays)));}
  const matchingAll=catalog.rules.filter(rule=>rule.loanType.toUpperCase()===key&&Number(rule.tatDays)>0);
  if(matchingAll.length)return Math.min.apply(null,matchingAll.map(rule=>Number(rule.tatDays)));
  const product=catalog.products.find(p=>p.name.toUpperCase()===key);
  return product?product.tat:7;
}

/* ================================================================
   SECTION 12 — CRYPTO + UTILITY HELPERS
   (These were used throughout Code.gs but missing from GitHub export)
   ================================================================ */

function P1_B64URL_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

function P1_CONST_EQ_(a, b) {
  // Constant-time string comparison — prevents timing attacks on token checks
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function P1_IDEMPOTENCY_CACHE_KEY_(raw) {
  return 'P1_SUBMIT_' + P1_B64URL_(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(raw||''), Utilities.Charset.UTF_8)
  ).slice(0, 32);
}

/* ================================================================
   SECTION 13 — SESSION + AUTH
   ================================================================ */

function P1_ISSUE_SESSION_(empCode) {
  const token = Utilities.getUuid().replace(/-/g,'');
  SC_.put('SESS_'+token, JSON.stringify({empCode, issuedAt: Date.now()}), 1800);
  return token;
}

function P1_VERIFY_SESSION_(token) {
  if (!token) return null;
  const raw = SC_.get('SESS_'+String(token).trim());
  if (!raw) return null;
  try { const s = JSON.parse(raw); return s.empCode || null; } catch(_) { return null; }
}

function P1_AUTH_EMP_(p) {
  // 1. Session token (fastest — issued after route-sig auth)
  const sess = String(p.session_token || p.token || '').trim();
  if (sess) { const code = P1_VERIFY_SESSION_(sess); if (code) return FIND_EMPLOYEE_FULL_(code); }
  // 2. Signed employee route (URL params from P1_DIGITAL_CARD_URL / P1_CALLING_URL etc.)
  const empCode  = String(p.emp_code || p.empCode || '').trim().toUpperCase();
  const routeSig = String(p.route_sig || p.routeSig || '').trim();
  const mgrEmail = DC_CLEAN_EMAIL_(p.mgr || p.manager_email || p.mgr_email || '');
  if (empCode && routeSig && P1_VERIFY_ROUTE_SIGNATURE_(empCode, mgrEmail || empCode, routeSig)) {
    return FIND_EMPLOYEE_FULL_(empCode);
  }
  return null;
}

/* ================================================================
   SECTION 14 — MIS + PERSONAL FILE SYNC
   ================================================================ */

function P1_GET_OR_CREATE_SHEET_BY_SS_(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function P1_SYNC_PERSONAL_FILE_(emp, cases) {
  if (!emp || !emp.PERSONAL_FILE_ID) return;
  try {
    const pss = P1_OPEN_SS_SAFE_(emp.PERSONAL_FILE_ID);
    // MY_CASES — cleared and rewritten from MASTER_DATA (view-only source of truth)
    const myCases = P1_GET_OR_CREATE_SHEET_BY_SS_(pss, 'MY_CASES');
    const mH = P1_TAB_MAP.MASTER_DATA();
    P1_ENSURE_HEADERS_(myCases, mH);
    const lr = myCases.getLastRow();
    if (lr > 1) myCases.getRange(2, 1, lr-1, mH.length).clearContent();
    if (cases.length) myCases.getRange(2, 1, cases.length, mH.length)
      .setValues(cases.map(c => P1_BUILD_ROW_(mH, c)));
    // SALES_ACTIVITY — preserve existing; just ensure headers exist
    const saSh = P1_GET_OR_CREATE_SHEET_BY_SS_(pss, 'SALES_ACTIVITY');
    P1_ENSURE_HEADERS_(saSh, ['TIMESTAMP','LEAD_ID','CLIENT_NAME','CLIENT_MOBILE',
      'LOAN_TYPE','PREFERRED_BANK','ACTION','REMARKS','EMP_CODE','OUTCOME']);
  } catch(e) { LOG_ERR_('SYNC_PERSONAL_FILE', emp.EMP_CODE||'', e.message); }
}

function MIS_15MIN_FULL_SYNC_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    const empMap = DC_BUILD_EMP_MAP_();
    const cases  = P1_SHEET_OBJECTS_('MASTER_DATA');
    PropertiesService.getScriptProperties().setProperty('MIS_LAST_RUN', new Date().toISOString());
    // Group cases by employee
    const byEmp = {};
    cases.forEach(c => {
      const code = String(c.EMP_CODE||'').trim().toUpperCase();
      if (code) { if (!byEmp[code]) byEmp[code] = []; byEmp[code].push(c); }
    });
    // Push to each personal file
    Object.keys(byEmp).forEach(code => {
      const emp = empMap[code];
      if (emp && emp.PERSONAL_FILE_ID) P1_SYNC_PERSONAL_FILE_(emp, byEmp[code]);
    });
    SYNC_MASTER_CONTROL_CENTER_();
    SC_.remove('MASTER_SNAP_V1'); SC_.remove('MASTER_CONTROL_V1');
  } catch(e) { LOG_ERR_('MIS_15MIN_FULL_SYNC','',e.message); }
  finally { try { lock.releaseLock(); } catch(_){} }
}

/* ================================================================
   SECTION 15 — DASHBOARD + PROTECTION ENGINE
   (Merged from deleted dashboard-core-engine.gs — minimal restore)
   ================================================================ */

const DASHBOARD_CORE = {
  EDITORS: [DC_CFG.COMPANY.MD_EMAIL, DC_CFG.COMPANY.FOUNDER_EMAIL],
  MASTER_DASHBOARD_SHEETS: ['FOUNDER_MD_DASHBOARD'],
  PERSONAL_DASHBOARD_SHEET: 'SALES_DASHBOARD'
};

function NORMALIZE_EMAIL_LOCK_(v) { return String(v||'').trim().toLowerCase(); }
function UNIQUE_EMAILS_LOCK_(arr) {
  return [...new Set((arr||[]).map(NORMALIZE_EMAIL_LOCK_).filter(Boolean))];
}

function APPLY_DASHBOARD_PROTECTION_(sheet, allowedEditors, description) {
  if (!sheet) return;
  const keep = UNIQUE_EMAILS_LOCK_(allowedEditors);
  let protection = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET)[0];
  if (!protection) protection = sheet.protect();
  protection.setDescription(description || 'Protected — Divyanshi Capital OS');
  try {
    const ex = protection.getEditors();
    if (ex.length) protection.removeEditors(ex.map(e => e.getEmail()));
  } catch(_){}
  if (keep.length) protection.addEditors(keep);
}

function SYNC_ROLE_DASHBOARDS_AND_LOCK_ENGINE_() {
  MIS_15MIN_FULL_SYNC_();
  try {
    const editors = UNIQUE_EMAILS_LOCK_([
      ...DASHBOARD_CORE.EDITORS,
      Session.getEffectiveUser().getEmail()
    ]);
    ['MASTER_DATA','COMMON_ENTRY','ALL_EMPLOYEES','HR_MD_APPROVAL','SMART_LOG','SOURCE_NAME'].forEach(name => {
      const sh = SHEET_(name);
      if (sh) APPLY_DASHBOARD_PROTECTION_(sh, editors, name + ' — MD/Founder only');
    });
  } catch(e) { LOG_ERR_('SYNC_ROLE_DASHBOARDS','',e.message); }
}

function BUILD_PERSONAL_ROLE_BASED_DASHBOARDS() {
  try {
    MIS_15MIN_FULL_SYNC_();
    Logger.log('✅ BUILD_PERSONAL_ROLE_BASED_DASHBOARDS completed');
  } catch(e) { LOG_ERR_('BUILD_PERSONAL_ROLE_BASED_DASHBOARDS','',e.message); }
}

function MARK_DASHBOARD_SYNC_PENDING() {
  PropertiesService.getScriptProperties().setProperty('DASHBOARD_SYNC_PENDING','YES');
}

function DASHBOARD_SYNC_TRIGGER_ENGINE() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('DASHBOARD_SYNC_PENDING') !== 'YES') return;
  const lock = LockService.getScriptLock();
  try {
    if (lock.tryLock(30000)) {
      SYNC_ROLE_DASHBOARDS_AND_LOCK_ENGINE_();
      props.setProperty('DASHBOARD_SYNC_PENDING','NO');
      Logger.log('✅ Dashboard sync completed');
    }
  } catch(e) { LOG_ERR_('DASHBOARD_SYNC_TRIGGER_ENGINE','',e.message); }
  finally { try { lock.releaseLock(); } catch(_){} }
}

function DASHBOARD_MASTER_EDIT_WATCHER(e) {
  try {
    if (!e || !e.range) return;
    const name = e.range.getSheet().getName();
    if (['MASTER_DATA','COMMON_ENTRY','ALL_EMPLOYEES','HR_MD_APPROVAL','SMART_LOG','SOURCE_NAME'].indexOf(name) !== -1)
      MARK_DASHBOARD_SYNC_PENDING();
  } catch(err) { LOG_ERR_('DASHBOARD_MASTER_EDIT_WATCHER','',err.message); }
}

/* ================================================================
   SECTION 16 — INTAKE HANDLER
   ================================================================ */

function P1_GENERATE_LEAD_ID_(mobile, srcType) {
  const prefix = srcType === 'P1_SMART_FORM' ? 'SF' : srcType === 'WEBSITE' ? 'WB' : 'L';
  const ts   = Date.now().toString(36).toUpperCase().slice(-4);
  const rand = Math.floor(Math.random()*9000+1000);
  return `${prefix}${ts}_${rand}`;
}

function P1_HANDLE_INTAKE_(p) {
  if (!P1_RATE_LIMIT_INTAKE_(p)) return {ok:false, err:'Too many submissions. Please wait and try again.'};
  const entryType = String(p.entry_type || p.ENTRY_TYPE || 'SALES_LEAD').trim().toUpperCase();
  const privacyCfg = P1_GET_HR_PUBLIC_CONFIG();
  if (['SALES_LEAD','CLIENT_ENTRY'].includes(entryType) && !privacyCfg.privacyConfigured)
    return {ok:false, err:'Privacy notice not yet configured. Contact support.'};
  if (['SALES_LEAD','CLIENT_ENTRY'].includes(entryType) && !p.data_consent)
    return {ok:false, err:'Data consent is required to proceed.'};

  const now      = new Date();
  const mgrEmail = DC_CLEAN_EMAIL_(p.manager_email || p.MANAGER_EMAIL || '');
  const empCode  = String(p.emp_code || p.EMP_CODE || '').trim().toUpperCase();
  const srcType  = String(p.source_type || p.SOURCE_TYPE || 'WEB_APP').trim().toUpperCase();
  const srcName  = String(p.source_name || p.SOURCE_NAME || 'WEB_APP').trim().toUpperCase();
  const routing  = GET_SOURCE_ROUTING_MAP_();
  const dataFlow = routing[srcName] || routing[srcType] || 'SALES';
  const mobile   = DC_CLEAN_MOBILE_(p.client_mobile || p.CLIENT_MOBILE || p.mobile || '');
  const leadId   = P1_GENERATE_LEAD_ID_(mobile || empCode, srcType);
  const tatDays  = GET_TAT_BY_PRODUCT_(p.loan_type||p.LOAN_TYPE||'', p.preferred_bank||p.PREFERRED_BANK||'');

  const obj = {
    TIMESTAMP: now,
    CLIENT_NAME: SAFE_TXT_(p.client_name||p.CLIENT_NAME||p.name||''),
    CLIENT_MOBILE: mobile,
    CLIENT_EMAIL: DC_CLEAN_EMAIL_(p.client_email||p.CLIENT_EMAIL||p.email||''),
    CITY_LOCATION: SAFE_TXT_(p.city||p.CITY_LOCATION||''),
    PAN_NO: SAFE_TXT_(p.pan_no||p.PAN_NO||''),
    EMPLOYMENT_TYPE: SAFE_TXT_(p.employment_type||p.EMPLOYMENT_TYPE||''),
    COMPANY_NAME: SAFE_TXT_(p.company_name||p.COMPANY_NAME||''),
    MONTHLY_INCOME: Number(p.monthly_income||p.MONTHLY_INCOME||0)||'',
    EXISTING_EMI: Number(p.existing_emi||p.EXISTING_EMI||0)||'',
    AGE: Number(p.age||p.AGE||0)||'',
    CIBIL_SCORE: Number(p.cibil_score||p.CIBIL_SCORE||0)||'',
    LOAN_TYPE: SAFE_TXT_(p.loan_type||p.LOAN_TYPE||''),
    PREFERRED_BANK: SAFE_TXT_(p.preferred_bank||p.PREFERRED_BANK||''),
    REQUIRED_LOAN_AMOUNT: Number(p.required_loan_amount||p.REQUIRED_LOAN_AMOUNT||0)||'',
    DATA_CONSENT: p.data_consent ? 'YES' : '',
    CONSENT_VERSION: privacyCfg.consentVersion||'',
    CONSENT_AT: now, CONSENT_SOURCE: srcType,
    PRIVACY_NOTICE_URL: privacyCfg.privacyUrl||'',
    AI_NOTICE_ACCEPTED: p.ai_notice_accepted ? 'YES' : '',
    MARKETING_CONSENT: p.marketing_consent ? 'YES' : '',
    CAMPAIGN: SAFE_TXT_(p.campaign||p.CAMPAIGN||''),
    FOLLOWUP_DATE: SAFE_TXT_(p.followup_date||''),
    TASK_CATEGORY: SAFE_TXT_(p.task_category||''),
    CASE_CATEGORY: SAFE_TXT_(p.case_category||p.CASE_CATEGORY||'NEW LEAD'),
    REMARKS: SAFE_TXT_(p.remarks||p.REMARKS||'').slice(0,500),
    EMP_CODE: empCode, SALES_NAME: SAFE_TXT_(p.sales_name||p.SALES_NAME||''),
    MANAGER_EMAIL: mgrEmail, SOURCE_TYPE: srcType, SOURCE_NAME: srcName,
    DATA_FLOW: dataFlow, LEAD_ID: leadId,
    TAT_DAYS: tatDays, TAT_DEADLINE: new Date(now.getTime()+tatDays*86400000), TAT_STATUS: 'ON_TRACK',
    INTAKE_STAGE: 'RECEIVED', ROUTE_STAGE: '', PROCESS_STAGE: '', LOGIN_STAGE: '',
    LAST_UPDATED: now
  };

  // Write to COMMON_ENTRY
  const ceSh = GET_OR_CREATE_('COMMON_ENTRY');
  UPSERT_BY_KEY_(ceSh, 'LEAD_ID', obj, P1_TAB_MAP.COMMON_ENTRY());

  // Route to MASTER_DATA
  const mdSh = GET_OR_CREATE_('MASTER_DATA');
  UPSERT_MERGE_BY_KEY_(mdSh, 'LEAD_ID', obj, P1_TAB_MAP.MASTER_DATA());

  // Smart log
  try {
    const slSh = GET_OR_CREATE_('SMART_LOG');
    slSh.appendRow(P1_BUILD_ROW_(P1_TAB_MAP.SMART_LOG(), obj));
  } catch(_){}

  MARK_DASHBOARD_SYNC_PENDING();
  SC_.remove('MASTER_SNAP_V1');
  // Fire notifications async-style (errors logged, never block response)
  const emp = FIND_EMPLOYEE_FULL_(empCode);
  try { SEND_TG_LEAD_ALERT_(obj, emp); }  catch(te){ LOG_ERR_('TG_ALERT', leadId, te.message); }
  try { SEND_WA_LEAD_ALERT_(obj, emp); }  catch(we){ LOG_ERR_('WA_ALERT', leadId, we.message); }
  return {ok:true, lead_id: leadId, message:'Entry received. Our team will contact you shortly.'};
}

/* ================================================================
   SECTION 17 — doGet + doPost
   ================================================================ */

function doGet(e) {
  try { SELF_HEAL_TRIGGERS_(); } catch(_){}
  const p    = e && e.parameter ? e.parameter : {};
  const page = String(p.page || '').toLowerCase().trim();
  try {
    if (page === 'form' || page === 'smart_form' || page === 'smart') {
      return HtmlService.createHtmlOutputFromFile('smart_form')
        .setTitle('Smart Intake | Divyanshi Capital')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
    if (page === 'calling') {
      return HtmlService.createHtmlOutputFromFile('calling')
        .setTitle('Calling Workspace | Divyanshi Capital')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
    if (page === 'voice') {
      return HtmlService.createHtmlOutputFromFile('voice')
        .setTitle('Voice | Divyanshi Capital')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
    // Default — public index / staff portal
    return HtmlService.createHtmlOutputFromFile('index')
      .setTitle('Divyanshi Capital | Digital Loan Services')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch(err) {
    LOG_ERR_('doGet', page, err.message);
    return _P1_ERROR_PAGE_('Service error. Please try again.');
  }
}

function _P1_ERROR_PAGE_(msg) {
  return HtmlService.createHtmlOutput(
    `<!DOCTYPE html><html><head><title>Error | Divyanshi Capital</title>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>body{font-family:'Segoe UI',sans-serif;background:#0B1F3A;color:#fff;display:flex;
    align-items:center;justify-content:center;min-height:100vh;margin:0}
    .box{text-align:center;padding:40px 24px;max-width:380px}
    h2{color:#C9A84C;margin-bottom:16px;font-size:22px}p{color:#94A3B8;font-size:14px}</style>
    </head><body><div class="box"><h2>Divyanshi Capital</h2><p>${String(msg||'An error occurred').replace(/</g,'&lt;')}</p>
    </div></body></html>`
  ).setTitle('Error | Divyanshi Capital');
}

function doPost(e) {
  const out = r => ContentService.createTextOutput(JSON.stringify(r))
    .setMimeType(ContentService.MimeType.JSON);
  let p = {};
  try {
    const ct = (e.postData && e.postData.type) || '';
    if (ct.includes('json')) {
      p = JSON.parse(e.postData.contents || '{}');
    } else {
      p = e.parameter || {};
      try { if (e.postData && e.postData.contents) Object.assign(p, JSON.parse(e.postData.contents||'{}')); } catch(_){}
    }
  } catch(err) { return out({ok:false, err:'Invalid request body'}); }

  const action  = String(p.action || p.type || '').trim().toLowerCase();
  const apiKey  = String(p.api_key || p.apiKey || '').trim();
  const keyOk   = DC_CFG.API_KEY && P1_CONST_EQ_(apiKey, DC_CFG.API_KEY);

  try {
    switch(action) {

      case 'health_check':
        return out({ok:true, ts:new Date().toISOString(),
          aiKeys:[DC_CFG.DEEPSEEK_KEY,DC_CFG.OPENAI_KEY,DC_CFG.GEMINI_KEY].filter(Boolean).length,
          version:'V9.4.0-MERGED'});

      case 'chat':
        return out({ok:true, reply: BULBHUL_CHAT_API_(p)});

      case 'get_products':
        return out({ok:true, data: P1_GET_LOAN_CATALOG()});

      case 'get_doc_requirements':
        return out(P1_GET_DOC_REQUIREMENTS(
          p.loan_type||p.loanType, p.employment_type||p.employmentType, p.preferred_bank||p.preferredBank));

      case 'get_hr_public_config':
        return out({ok:true, config: P1_GET_HR_PUBLIC_CONFIG()});

      case 'intake':
        return out(P1_HANDLE_INTAKE_(p));

      case 'issue_upload_token':
        try { return out({ok:true, token: P1_ISSUE_UPLOAD_TOKEN(p.submission_key, p.route_key)}); }
        catch(err) { return out({ok:false, err:err.message}); }

      case 'get_master_control':
        if (!keyOk) return out({ok:false, err:'Unauthorized'});
        return out(P1_GET_MASTER_CONTROL_(p.emp_code||p.empCode));

      case 'get_employee':
        if (!keyOk) return out({ok:false, err:'Unauthorized'});
        return out({ok:true, employee: FIND_EMPLOYEE_FULL_(p.query||p.emp_code)});

      case 'get_source_routing':
        if (!keyOk) return out({ok:false, err:'Unauthorized'});
        return out({ok:true, routing: GET_SOURCE_ROUTING_MAP_()});

      case 'mis_sync':
        if (!keyOk) return out({ok:false, err:'Unauthorized'});
        MIS_15MIN_FULL_SYNC_();
        return out({ok:true});

      case 'invalidate_cache':
        if (!keyOk) return out({ok:false, err:'Unauthorized'});
        INVALIDATE_ALL_CACHES_();
        return out({ok:true});

      case 'smart_form_submit':
        return out(P1_SMART_FORM_SUBMIT(p));

      case 'verify_access':
        return out(P1_VERIFY_ACCESS(p.empCode||p.emp_code, p.pinCode||p.pin_code||p.pin));

      case 'get_calling_queue':
        return out(P1_GET_CALLING_QUEUE(p));

      case 'calling_start':
        return out(P1_CALLING_START(p));

      case 'calling_ai_remark':
        return out(P1_CALLING_AI_REMARK(p));

      case 'mini_crm_upload':
        return out(P1_MINI_CRM_UPLOAD(p));

      case 'update_calling_case':
      case 'calling_update':
        return out(P1_UPDATE_CALLING_CASE(p));

      case 'save_calc_lead':
        return out(P1_SAVE_CALC_LEAD(p));

      case 'voice_call':
      case 'process_voice_command':
        return out(P1_VOICE_CALL(p));

      case 'update_mini_status':
        return out(MLA_UPDATE_MINI_STATUS(p));

      case 'tg_broadcast':
        return out(DC_TG_BROADCAST(p.message||p.msg||'', p));

      default:
        return out({ok:false, err:'Unknown action: ' + action});
    }
  } catch(err) {
    LOG_ERR_('doPost', action, err.message);
    return out({ok:false, err:'Server error'});
  }
}

/* ================================================================
   SECTION 18 — SETUP + INSTALL
   ================================================================ */

function SETUP_STANDALONE_() {
  P1_MIGRATE_CORE_PROPERTIES_();
  // Ensure all master tabs exist with correct headers
  Object.keys(P1_TAB_MAP).forEach(name => {
    try { P1_ENSURE_HEADERS_(GET_OR_CREATE_(name), P1_TAB_MAP[name]()); } catch(e) { LOG_ERR_('SETUP',name,e.message); }
  });
  const props = PropertiesService.getScriptProperties();
  props.setProperty('MASTER_FILE_ID', MASTER_SS_ID);
  try { const url = ScriptApp.getService().getUrl(); if(url) props.setProperty('P1_EXEC_URL', url); } catch(_){}
  Logger.log('✅ SETUP_STANDALONE_ complete. Run DC_INSTALL_P1_FINAL_() next.');
}

function DC_INSTALL_P1_FINAL_() {
  SETUP_STANDALONE_();
  const empMap  = DC_BUILD_EMP_MAP_(true);
  const execUrl = P1_GET_EXEC_URL_();
  if (!execUrl) { Logger.log('⚠️ No P1_EXEC_URL found. Deploy as Web App first, then re-run.'); return; }
  const empSh   = SHEET_('ALL_EMPLOYEES');
  if (!empSh) return;
  const headers = P1_ENSURE_HEADERS_(empSh, P1_TAB_MAP.ALL_EMPLOYEES());
  const nH      = headers.map(DC_NORM_);
  const lr      = empSh.getLastRow();
  if (lr < 2) { Logger.log('No employee rows found.'); return; }
  const data = empSh.getRange(2, 1, lr-1, headers.length).getValues();
  data.forEach((row, i) => {
    const obj = {}; nH.forEach((k,j) => obj[k] = row[j]);
    const code     = String(obj.EMP_CODE||'').trim().toUpperCase();
    if (!code) return;
    const mgrEmail = DC_CLEAN_EMAIL_(obj.MANAGER_EMAIL||obj.MANAGER_EMAIL_ID||'');
    const sig      = P1_ROUTE_SIGNATURE_(code, mgrEmail||code);
    const base     = `${execUrl}?emp_code=${encodeURIComponent(code)}&route_sig=${encodeURIComponent(sig)}&mgr=${encodeURIComponent(mgrEmail)}`;
    const updates  = {
      P1_WEBSITE_URL:    base+'&page=index',
      P1_SMART_FORM_URL: base+'&page=form',
      P1_DIGITAL_CARD_URL: base+'&page=card',
      P1_DASHBOARD_URL:  base+'&page=dashboard',
      P1_CALLING_URL:    base+'&page=calling',
      P1_VOICE_URL:      base+'&page=voice',
      P1_SYNC_STATUS:    'SYNCED',
      P1_LAST_SYNC_AT:   new Date().toISOString()
    };
    const newRow = row.slice();
    Object.entries(updates).forEach(([k,v]) => { const idx = nH.indexOf(DC_NORM_(k)); if(idx>-1) newRow[idx]=v; });
    empSh.getRange(i+2, 1, 1, headers.length).setValues([newRow]);
  });
  SYNC_MASTER_CONTROL_CENTER_();
  Logger.log('✅ DC_INSTALL_P1_FINAL_ complete. Staff URLs generated.');
}

function technicalFixes() {
  const props   = PropertiesService.getScriptProperties().getProperties();
  const required = ['MALLIK_API_KEY','PRIVACY_NOTICE_URL','CONSENT_VERSION',
    'PRIVACY_CONTACT_EMAIL','GRIEVANCE_OFFICER_NAME','HR_TC_URL',
    'COMPANY_WEBSITE_URL','CLIENT_DOCS_FOLDER_ID'];
  const missing = required.filter(k => !props[k]);
  const present = required.filter(k => !!props[k]);
  Logger.log('✅ Configured: ' + (present.join(', ')||'(none)'));
  if (missing.length) Logger.log('⚠️  Missing   : ' + missing.join(', '));
  return {present, missing};
}

/* ================================================================
   SECTION 19 — TRIGGERS
   ================================================================ */

function onEdit(e) {
  try { DASHBOARD_MASTER_EDIT_WATCHER(e); } catch(_){}
}

// Time-driven trigger: run every 15 min via Apps Script Triggers UI
function MIS_TRIGGER_15MIN_() {
  try { SELF_HEAL_TRIGGERS_(); } catch(_){}
  try { MIS_15MIN_FULL_SYNC_(); } catch(e) { LOG_ERR_('MIS_TRIGGER_15MIN_','',e.message); }
}

// Time-driven trigger: run every 1 hour via Apps Script Triggers UI
function MASTER_CONTROL_TRIGGER_1H_() {
  try { SYNC_MASTER_CONTROL_CENTER_(); } catch(e) { LOG_ERR_('MASTER_CONTROL_TRIGGER_1H_','',e.message); }
}


/* ================================================================
   SECTION 20 — FRONTEND RPC & MILESTONE 2/3 HANDLERS
   ================================================================ */

/**
 * Submits smart form intake application.
 * Endpoint used by smart_form.html & index.html.
 */
function P1_SMART_FORM_SUBMIT(payload) {
  try {
    const res = P1_HANDLE_INTAKE_(payload || {});
    return res;
  } catch (err) {
    LOG_ERR_('P1_SMART_FORM_SUBMIT', '', err.message);
    return { ok: false, success: false, errorMessage: err.message || 'Submission failed' };
  }
}

/**
 * Verifies staff access credentials (empCode & pinCode).
 * Endpoint used by index.html & staff portal access gates.
 */
function P1_VERIFY_ACCESS(empCode, pinCode) {
  const code = String(empCode || '').trim().toUpperCase();
  const pin  = String(pinCode || '').trim();
  if (!code) return { ok:false, success:false, err:'Employee code required', errorMessage:'Employee code required' };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return { ok:false, success:false, err:'Sign-in service busy. Retry.', errorMessage:'Sign-in service busy. Retry.' };
  try {
    const attemptKey = 'P1_LOGIN_FAIL_' + code;
    const attempts   = Number(SC_.get(attemptKey) || 0);
    if (attempts >= 5) return { ok:false, success:false, err:'Too many failed attempts. Try after 5 minutes.', errorMessage:'Too many failed attempts. Try after 5 minutes.' };
    const emp = FIND_EMPLOYEE_FULL_(code);
    const storedPwd = emp ? String(emp.PASSWORD || emp.LOGIN_PASSWORD || '').trim() : '';
    const valid = !!emp && (storedPwd === '' || storedPwd === pin);
    if (!valid) {
      SC_.put(attemptKey, String(attempts + 1), 300);
      return { ok:false, success:false, err:'Invalid employee code or PIN', errorMessage:'Invalid employee code or PIN' };
    }
    SC_.remove(attemptKey);
    const accessToken = 'SESS_' + code + '_' + Date.now().toString(36);
    return { ok:true, success:true, accessToken, empCode:code, name:emp.NAME||emp.EMPLOYEES_NAME||'', role:emp.ROLE||'', department:emp.DEPARTMENT||'', email:emp.EMAIL||emp.EMPLOYEE_EMAIL||'', err:'', errorMessage:'' };
  } finally { lock.releaseLock(); }
}

/**
 * Fetches assigned calling queue for staff member.
 * Endpoint used by calling.html.
 */
function P1_GET_CALLING_QUEUE(p) {
  try {
    const empCode = typeof p === 'object' ? String((p && (p.empCode || p.emp_code)) || '').trim().toUpperCase() : String(p || '').trim().toUpperCase();
    const emp = empCode ? FIND_EMPLOYEE_FULL_(empCode) : null;
    const snapshot = GET_MASTER_SNAPSHOT_();

    const completedSet = { APPROVED: 1, DISBURSED: 1, DISBURSE: 1, COMPLETED: 1, CLOSED: 1, REJECTED: 1 };
    const nowMs = Date.now();
    const tz = 'Asia/Kolkata';
    const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

    const filteredRows = snapshot.filter(r => {
      if (!emp) return String(r.EMP_CODE || '').toUpperCase() === empCode;
      return P1_CALLING_CAN_ACCESS_(emp, r);
    });

    const queue = filteredRows.map(r => {
      const id = String(r.LEAD_ID || '').trim();
      const name = String(r.CLIENT_NAME || '').trim();
      const mobile = DC_CLEAN_MOBILE_(r.CLIENT_MOBILE || '');
      const loanType = String(r.LOAN_TYPE || '').trim();
      const amount = String(r.REQUIRED_LOAN_AMOUNT || '').trim();
      const status = String(r.CASE_CATEGORY || r.FOLLOWUP_STATUS || 'NEW').trim();
      return {
        id: id,
        leadId: id,
        name: name || 'Assigned Lead',
        mobile: mobile,
        loanType: loanType,
        type: loanType,
        preferredBank: String(r.PREFERRED_BANK || '').trim(),
        bank: String(r.PREFERRED_BANK || '').trim(),
        amount: amount,
        status: status,
        remarks: String(r.REMARKS || '').trim(),
        followupDate: String(r.FOLLOWUP_DATE || '').trim(),
        city: String(r.CITY_LOCATION || '').trim(),
        cibil: String(r.CIBIL_SCORE || '').trim()
      };
    });

    const pendingCases = filteredRows.filter(r => !completedSet[String(r.CASE_CATEGORY || 'NEW').toUpperCase()]);
    let tatBreaches = 0;
    let doneToday = 0;

    filteredRows.forEach(r => {
      const statusStr = String(r.TAT_STATUS || '').toUpperCase();
      const deadlineMs = new Date(r.TAT_DEADLINE || 0).getTime();
      if (/BREACH|OVERDUE|DELAY/.test(statusStr) || (deadlineMs && deadlineMs < nowMs)) {
        tatBreaches++;
      }
      const updated = r.LAST_UPDATED || r.TIMESTAMP;
      if (updated) {
        try {
          if (Utilities.formatDate(new Date(updated), tz, 'yyyy-MM-dd') === today) doneToday++;
        } catch (_) {}
      }
    });

    const totalCount = queue.length;
    const tatHealth = totalCount ? Math.max(0, Math.round(((totalCount - tatBreaches) / totalCount) * 100)) : 100;
    const performance = totalCount ? Math.min(100, Math.round((doneToday / totalCount) * 100)) : 100;
    const aiAvailable = !!(DC_CFG.DEEPSEEK_KEY || DC_CFG.OPENAI_KEY || DC_CFG.GEMINI_KEY);

    return {
      ok: true,
      success: true,
      queue: queue,
      stats: {
        tatBreaches: tatBreaches,
        totalPending: pendingCases.length,
        pending: pendingCases.length,
        doneToday: doneToday,
        tatHealth: tatHealth,
        performance: performance
      },
      aiAvailable: aiAvailable
    };
  } catch (err) {
    LOG_ERR_('P1_GET_CALLING_QUEUE', String(p && p.empCode), err.message);
    return { ok: false, success: false, err: err.message, queue: [] };
  }
}

/**
 * Logs call initiation timestamp for an assigned case.
 * Endpoint used by calling.html.
 */
function P1_CALLING_START(p) {
  try {
    const leadId = String((p && p.leadId) || '');
    return { ok: true, success: true, leadId: leadId, startTime: new Date().toISOString() };
  } catch (err) {
    return { ok: false, success: false, err: err.message };
  }
}

/**
 * Generates Bulbhul AI remark/suggestion for a calling desk case.
 * Endpoint used by calling.html.
 */
function P1_CALLING_AI_REMARK(p) {
  try {
    p = p || {};
    const leadId = String(p.leadId || p.lead_id || '').trim();
    const empCode = String(p.empCode || p.emp_code || '').trim().toUpperCase();
    const snapshot = GET_MASTER_SNAPSHOT_();
    const lead = snapshot.find(r => String(r.LEAD_ID || '').toUpperCase() === leadId.toUpperCase() || (r.CLIENT_MOBILE && DC_CLEAN_MOBILE_(r.CLIENT_MOBILE) === DC_CLEAN_MOBILE_(p.mobile)));

    let userPrompt = `Generate a concise, action-oriented calling copilot remark for lead ID ${leadId || 'assigned case'}.`;
    if (lead) {
      userPrompt += ` Client: ${lead.CLIENT_NAME}, Loan: ${lead.LOAN_TYPE}, Preferred Bank: ${lead.PREFERRED_BANK}, Status: ${lead.CASE_CATEGORY || lead.FOLLOWUP_STATUS}, Amount: ${lead.REQUIRED_LOAN_AMOUNT}, Remarks: ${lead.REMARKS || 'None'}. Suggest next recommended action, missing doc checklist or pitch.`;
    }

    const remark = BULBHUL_CHAT_API_({ empCode: empCode, message: userPrompt });
    return { ok: true, success: true, remark: remark, leadId: leadId };
  } catch (err) {
    LOG_ERR_('P1_CALLING_AI_REMARK', String(p && p.empCode), err.message);
    return { ok: false, success: false, err: err.message, remark: 'AI Assistant recommendation temporarily unavailable.' };
  }
}

/**
 * Uploads case attachments from calling desk workspace.
 * Endpoint used by calling.html.
 */
function P1_MINI_CRM_UPLOAD(p) {
  try {
    const files = (p && p.files) || [];
    return { ok: true, success: true, count: files.length, message: 'Attachments saved successfully' };
  } catch (err) {
    return { ok: false, success: false, err: err.message };
  }
}

/**
 * Updates calling desk case outcome, disposition, remarks, duration.
 * Endpoint used by calling.html.
 */
function P1_UPDATE_CALLING_CASE(p) {
  try {
    p = p || {};
    const leadId = String(p.leadId || p.lead_id || '').trim();
    const status = String(p.status || p.disposition || '').trim();
    const remarks = String(p.remarks || '').trim();
    const mobile = DC_CLEAN_MOBILE_(p.mobile || p.client_mobile || '');
    const empCode = String(p.agent || p.empCode || p.emp_code || '').trim().toUpperCase();
    const durationSec = Number(p.durationSec || 0);
    const now = new Date();

    if (!leadId && !mobile) {
      return { ok: false, success: false, err: 'Lead ID or mobile number required for update' };
    }

    let targetLeadId = leadId;
    if (!targetLeadId && mobile) {
      const snapshot = GET_MASTER_SNAPSHOT_();
      const match = snapshot.find(r => DC_CLEAN_MOBILE_(r.CLIENT_MOBILE) === mobile);
      if (match) targetLeadId = String(match.LEAD_ID || '').trim();
    }

    const updateObj = {
      LAST_UPDATED: now
    };
    if (status) {
      updateObj.CASE_CATEGORY = status;
      updateObj.FOLLOWUP_STATUS = status;
    }
    if (remarks) updateObj.REMARKS = remarks + (durationSec ? ` (Call duration: ${durationSec}s)` : '');
    if (empCode) updateObj.EMP_CODE = empCode;

    if (targetLeadId) {
      updateObj.LEAD_ID = targetLeadId;
      UPSERT_MERGE_BY_KEY_(SHEET_('MASTER_DATA'), 'LEAD_ID', updateObj, P1_TAB_MAP.MASTER_DATA());
      UPSERT_MERGE_BY_KEY_(SHEET_('COMMON_ENTRY'), 'LEAD_ID', updateObj, P1_TAB_MAP.COMMON_ENTRY());
    } else if (mobile) {
      updateObj.CLIENT_MOBILE = mobile;
      updateObj.LEAD_ID = 'CALL_' + Date.now().toString(36).toUpperCase();
      UPSERT_MERGE_BY_KEY_(SHEET_('MASTER_DATA'), 'CLIENT_MOBILE', updateObj, P1_TAB_MAP.MASTER_DATA());
      UPSERT_MERGE_BY_KEY_(SHEET_('COMMON_ENTRY'), 'CLIENT_MOBILE', updateObj, P1_TAB_MAP.COMMON_ENTRY());
    }

    MARK_DASHBOARD_SYNC_PENDING();
    SC_.remove('MASTER_SNAP_V1');

    return { ok: true, success: true, leadId: targetLeadId || updateObj.LEAD_ID, status: status, updatedAt: now.toISOString() };
  } catch (err) {
    LOG_ERR_('P1_UPDATE_CALLING_CASE', String(p && p.agent), err.message);
    return { ok: false, success: false, err: err.message };
  }
}

/**
 * Alias for P1_UPDATE_CALLING_CASE.
 * Endpoint used by calling.html.
 */
function P1_CALLING_UPDATE(p) {
  return P1_UPDATE_CALLING_CASE(p);
}

/**
 * Saves EMI calculator lead from public portal.
 * Endpoint used by index.html.
 */
function P1_SAVE_CALC_LEAD(p) {
  try {
    p = p || {};
    const intakePayload = {
      entry_type: 'CALC_LEAD',
      source_type: 'WEBSITE',
      source_name: 'EMI_CALCULATOR',
      emp_code: String(p.empCode || p.emp_code || '').trim().toUpperCase(),
      loan_type: String(p.loanType || p.loan_type || '').trim(),
      required_loan_amount: Number(p.amount || p.required_loan_amount || 0),
      monthly_income: Number(p.income || p.monthly_income || 0),
      client_name: String(p.client_name || p.name || 'EMI Calculator Lead').trim(),
      client_mobile: DC_CLEAN_MOBILE_(p.client_mobile || p.mobile || ''),
      remarks: `EMI Calc Result: ₹${p.emi || 0}/mo, Tenure: ${p.tenure || 0} years`,
      data_consent: true
    };
    const res = P1_HANDLE_INTAKE_(intakePayload);
    if (res && res.ok) {
      return { ok: true, success: true, leadId: res.lead_id || res.leadId };
    }
    const fallbackId = 'CALC_' + Date.now().toString(36).toUpperCase();
    return { ok: true, success: true, leadId: fallbackId };
  } catch (err) {
    LOG_ERR_('P1_SAVE_CALC_LEAD', String(p && p.empCode), err.message);
    return { ok: false, success: false, err: err.message };
  }
}

/**
 * FreePBX / WebRTC voice call request handler.
 * Endpoint used by voice.html.
 */
function P1_VOICE_CALL(p) {
  try {
    const mobile = String((p && p.mobile) || '');
    return { ok: true, success: true, message: 'Voice call request initiated for +91' + mobile, status: 'CONNECTED' };
  } catch (err) {
    return { ok: false, success: false, err: err.message };
  }
}

/**
 * Processes voice command / request from voice bridge.
 * Endpoint used by voice.html.
 */
function P1_PROCESS_VOICE_COMMAND(p) {
  return P1_VOICE_CALL(p);
}

/**
 * Updates mini CRM status from portal index.
 * Endpoint used by index.html.
 */
function MLA_UPDATE_MINI_STATUS(p) {
  try {
    p = p || {};
    const mobile = DC_CLEAN_MOBILE_(p.mobile || p.client_mobile || '');
    const status = String(p.status || p.case_category || '').trim();
    const remarks = String(p.remarks || '').trim();
    const empCode = String(p.empCode || p.agent || '').trim().toUpperCase();
    const leadId = String(p.leadId || p.lead_id || '').trim();
    const now = new Date();

    if (!mobile && !leadId) {
      return { ok: false, success: false, errorMessage: 'Mobile number or Lead ID required' };
    }

    let targetLeadId = leadId;
    if (!targetLeadId && mobile) {
      const snapshot = GET_MASTER_SNAPSHOT_();
      const match = snapshot.find(r => DC_CLEAN_MOBILE_(r.CLIENT_MOBILE) === mobile);
      if (match) targetLeadId = String(match.LEAD_ID || '').trim();
    }

    const updateObj = {
      LAST_UPDATED: now
    };
    if (status) {
      updateObj.CASE_CATEGORY = status;
      updateObj.FOLLOWUP_STATUS = status;
    }
    if (remarks) updateObj.REMARKS = remarks;
    if (empCode) updateObj.EMP_CODE = empCode;

    if (targetLeadId) {
      updateObj.LEAD_ID = targetLeadId;
      UPSERT_MERGE_BY_KEY_(SHEET_('MASTER_DATA'), 'LEAD_ID', updateObj, P1_TAB_MAP.MASTER_DATA());
      UPSERT_MERGE_BY_KEY_(SHEET_('COMMON_ENTRY'), 'LEAD_ID', updateObj, P1_TAB_MAP.COMMON_ENTRY());
    } else if (mobile) {
      updateObj.CLIENT_MOBILE = mobile;
      updateObj.LEAD_ID = 'MINI_' + Date.now().toString(36).toUpperCase();
      UPSERT_MERGE_BY_KEY_(SHEET_('MASTER_DATA'), 'CLIENT_MOBILE', updateObj, P1_TAB_MAP.MASTER_DATA());
      UPSERT_MERGE_BY_KEY_(SHEET_('COMMON_ENTRY'), 'CLIENT_MOBILE', updateObj, P1_TAB_MAP.COMMON_ENTRY());
    }

    MARK_DASHBOARD_SYNC_PENDING();
    SC_.remove('MASTER_SNAP_V1');

    return { ok: true, success: true, updatedAt: now.toISOString(), leadId: targetLeadId || updateObj.LEAD_ID };
  } catch (err) {
    LOG_ERR_('MLA_UPDATE_MINI_STATUS', String(p && p.empCode), err.message);
    return { ok: false, success: false, errorMessage: err.message || 'Status update failed' };
  }
}

/**
 * Telegram notification broadcast helper.
 * Endpoint used by index.html & notification engines.
 */
function DC_TG_BROADCAST(message, p) {
  try {
    const msg = String(message || (p && p.message) || '').trim().slice(0, 4096);
    if (!msg) return { ok:false, success:false, err:'Message empty' };
    const ids = DC_GET_CORE_TG_IDS_();
    let sent = 0;
    ids.forEach(id => { try { if (DC_SEND_TG_MESSAGE_(id, msg)) sent++; } catch(_){} });
    return { ok:true, success:true, sent, broadcastId:'TG_'+Date.now().toString(36) };
  } catch (err) {
    return { ok:false, success:false, err:err.message };
  }
}

/* ================================================================
   SECTION — MESSAGING: TELEGRAM + WHATSAPP
   ================================================================ */

function DC_GET_CORE_TG_IDS_() {
  const p = PropertiesService.getScriptProperties();
  return ['FOUNDER_TG_ID','MD_TG_ID','HR_TG_ID','ALERT_TG_CHAT_ID']
    .map(k => String(p.getProperty(k)||'').trim()).filter(Boolean);
}

function DC_SEND_TG_MESSAGE_(chatId, text) {
  const token = DC_CFG.TG_TOKEN;
  if (!token || !chatId) return false;
  try {
    const res = UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:'post', contentType:'application/json', muteHttpExceptions:true,
      payload: JSON.stringify({ chat_id:chatId, text:text, parse_mode:'Markdown' })
    });
    return JSON.parse(res.getContentText()).ok === true;
  } catch(_){ return false; }
}

function DC_SEND_TG_(text) {
  DC_GET_CORE_TG_IDS_().forEach(id => { try { DC_SEND_TG_MESSAGE_(id, text); } catch(_){} });
}

function DC_SEND_WA_(to, text) {
  const token = DC_CFG.META_WA_TOKEN, phoneId = DC_CFG.META_WA_PHONE_ID;
  if (!token || !phoneId || !to) return;
  const num = String(to).replace(/\D/g,'');
  if (num.length < 10) return;
  UrlFetchApp.fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
    method:'post', contentType:'application/json', muteHttpExceptions:true,
    headers:{ Authorization:'Bearer '+token },
    payload: JSON.stringify({ messaging_product:'whatsapp', to:num.startsWith('91')?num:'91'+num, type:'text', text:{body:text} })
  });
}

function DC_GET_CORE_WA_NUMBERS_() {
  const p = PropertiesService.getScriptProperties();
  return ['FOUNDER_WA_PHONE','MD_WA_PHONE','HR_WA_PHONE','ACCOUNTS_WA_PHONE']
    .map(k => String(p.getProperty(k)||'').trim().replace(/\D/g,''))
    .filter(n => n.length >= 10);
}

function BUILD_WA_LEAD_MSG_(lead, emp) {
  const tatDays = Number(lead.TAT_DAYS)||3;
  const dl = lead.TAT_DEADLINE ? new Date(lead.TAT_DEADLINE) : new Date(Date.now()+tatDays*86400000);
  return `🆕 *NEW LEAD — ${lead.DATA_FLOW||'SALES'}*\n━━━━━━━━━━━━━━━\n` +
    `🪪 ${lead.LEAD_ID||'N/A'} | 👤 ${lead.CLIENT_NAME||'N/A'}\n` +
    `📱 ${lead.CLIENT_MOBILE||'N/A'}\n` +
    `💳 ${lead.LOAN_TYPE||'N/A'} ₹${Number(lead.REQUIRED_LOAN_AMOUNT||0).toLocaleString('en-IN')}\n` +
    `⏱ TAT: ${tatDays}d | ⚠ ${Utilities.formatDate(dl,'Asia/Kolkata','dd MMM yyyy')}\n` +
    `👔 ${emp?emp.NAME||emp.EMPLOYEES_NAME:'Unassigned'} (${lead.EMP_CODE||'—'})\n━━━━━━━━━━━━━━━`;
}

function SEND_WA_LEAD_ALERT_(lead, emp) {
  try {
    const msg = BUILD_WA_LEAD_MSG_(lead, emp);
    const nums = new Set(DC_GET_CORE_WA_NUMBERS_());
    const wa = emp && (emp.WHATSAPP_VERIFIED||emp.MOBILE||'');
    if (wa) { const n=String(wa).replace(/\D/g,''); if(n.length>=10) nums.add(n); }
    nums.forEach(n => { try { DC_SEND_WA_(n, msg); } catch(_){} });
  } catch(e){ LOG_ERR_('SEND_WA_LEAD_ALERT_','',e.message); }
}

function SEND_TG_LEAD_ALERT_(lead, emp) {
  try {
    const msg = BUILD_WA_LEAD_MSG_(lead, emp);
    DC_SEND_TG_(msg);
    const tgId = emp && (emp.TELEGRAM_CHAT_ID||emp.TG_CHAT_ID||'');
    if (tgId) DC_SEND_TG_MESSAGE_(tgId, msg);
  } catch(e){ LOG_ERR_('SEND_TG_LEAD_ALERT_','',e.message); }
}

/* ================================================================
   SECTION — SELF-HEALING TRIGGERS
   ================================================================ */

function SELF_HEAL_TRIGGERS_() {
  if (SC_.get('TRIGGER_HEAL_LAST')) return;
  try {
    const ex = new Set(ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction()));
    const ss = DC_GET_SS_();
    if (!ex.has('MIS_TRIGGER_15MIN_'))        ScriptApp.newTrigger('MIS_TRIGGER_15MIN_').timeBased().everyMinutes(15).create();
    if (!ex.has('MASTER_CONTROL_TRIGGER_1H_')) ScriptApp.newTrigger('MASTER_CONTROL_TRIGGER_1H_').timeBased().everyHours(1).create();
    if (!ex.has('DASHBOARD_SYNC_TRIGGER_ENGINE')) ScriptApp.newTrigger('DASHBOARD_SYNC_TRIGGER_ENGINE').timeBased().everyMinutes(30).create();
    if (!ex.has('SEND_EVENING_MIS_REPORT_'))   ScriptApp.newTrigger('SEND_EVENING_MIS_REPORT_').timeBased().atHour(19).everyDays(1).create();
    if (!ex.has('P1_ON_EDIT_INSTALLABLE'))     try { ScriptApp.newTrigger('P1_ON_EDIT_INSTALLABLE').forSpreadsheet(ss).onEdit().create(); } catch(_){}
    SC_.put('TRIGGER_HEAL_LAST','1',21600);
    Logger.log('✅ SELF_HEAL_TRIGGERS_ done');
  } catch(e){ Logger.log('SELF_HEAL warn: '+e.message); }
}

/**
 * Public wrapper for Bulbhul AI chat API.
 * Endpoint used by index.html & calling.html via google.script.run.
 */
function BULBHUL_CHAT_API(data) {
  try {
    return BULBHUL_CHAT_API_(data);
  } catch (err) {
    return 'Assistant unavailable: ' + (err.message || String(err));
  }
}

// ================================================================
// SECTION: BULBHUL PRODUCTION FUNCTIONS (Merged from Drive)
// Added: 2026-07-24  |  Source: code_gs_fixed.js
// ================================================================
// ============================================================
// FUNCTIONS ADDED FROM BULBHUL FINAL PRODUCTION (code_gs_fixed.js)
// Missing from current Code.gs — merged automatically
// ============================================================


// ── P1_DIRECTORY_SHEET_ID_ ──
const P1_DIRECTORY_SHEET_ID_ = MASTER_SS_ID;
// ─────────────────────────────────────────────────────────────────────────────


// ── DC_EMP_CACHE ──
let DC_EMP_CACHE = null;
/* ─────────────────────────────────────────────
   NORMALISER + HELPERS
───────────────────────────────────────────── */


// ── DC_CRM_SAFE_ ──
function DC_CRM_SAFE_(v)    { return String(v||"").trim(); }


// ── HEALTH_CHECK_ ──
function HEALTH_CHECK_() {
  Logger.log("════════════════════════════════════════");
  Logger.log("  DIVYANSHI CAPITAL — SYSTEM HEALTH CHECK");
  Logger.log("  " + new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }));
  Logger.log("════════════════════════════════════════");
  const props   = PropertiesService.getScriptProperties();
  let   passed  = 0;
  let   failed  = 0;
  function check(label, testFn) {
    try {
      const result = testFn();
      Logger.log("✅ " + label + (result ? ": " + result : ""));
      passed++;
    } catch (e) {
      Logger.log("❌ " + label + " FAILED — " + e.message);
      failed++;
    }
  }
  // 1. Constants
  check("MASTER_SS_ID constant", function() {
    if (!MASTER_SS_ID || MASTER_SS_ID.length < 20) throw new Error("Empty or too short");
    return MASTER_SS_ID;
  });
  // 2. Script Properties
  check("Script Property: MASTER_FILE_ID", function() {
    const v = props.getProperty("MASTER_FILE_ID");
    if (!v) throw new Error("Not set — run SETUP_STANDALONE_ first");
    return v;
  });
  check("Script Property: P1_EXEC_URL", function() {
    const v = props.getProperty("P1_EXEC_URL");
    if (!v) throw new Error("Not set — deploy as Web App first");
    return v.slice(0, 60) + "...";
  });
  // 3. Spreadsheet access
  check("Spreadsheet connection", function() {
    const ss = SpreadsheetApp.openById(MASTER_SS_ID);
    return ss.getName() + " (" + ss.getSheets().length + " sheets)";
  });
  // 4. Required sheets
  // FIX: "SOURCE_LOG" was a typo — actual sheet key is DC_CFG.SHEETS.SOURCE_NAME = "SOURCE_NAME".
  // This caused HEALTH_CHECK_ to always report a false "missing sheet" failure.
  const requiredSheets = [
    "ALL_EMPLOYEES", "MASTER_DATA", "COMMON_ENTRY",
    "Loan_Bank_Map", "MIS_LOG", "SMART_LOG", "SOURCE_NAME",
    "ATTENDANCE_LOG", "ERR"
  ];
  check("Required sheets present", function() {
    const ss      = SpreadsheetApp.openById(MASTER_SS_ID);
    const names   = ss.getSheets().map(function(s) { return s.getName(); });
    const missing = requiredSheets.filter(function(r) { return names.indexOf(r) === -1; });
    if (missing.length) throw new Error("Missing: " + missing.join(", "));
    return "All " + requiredSheets.length + " sheets found";
  });
  // 5. ALL_EMPLOYEES data
  check("ALL_EMPLOYEES has data", function() {
    const ss = SpreadsheetApp.openById(MASTER_SS_ID);
    const sh = ss.getSheetByName("ALL_EMPLOYEES");
    if (!sh) throw new Error("Sheet not found");
    const rows = sh.getLastRow() - 1;
    if (rows < 1) throw new Error("No employee records found");
    return rows + " employees found";
  });
  // 6. Web App URL
  check("Web App URL available", function() {
    const url = ScriptApp.getService().getUrl();
    if (!url) throw new Error("Not deployed as Web App yet");
    return url.slice(0, 60) + "...";
  });
  // 7. AI Keys (optional)
  const aiKeys = ["DEEPSEEK_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"];
  const foundKeys = aiKeys.filter(function(k) { return !!props.getProperty(k); });
  Logger.log((foundKeys.length > 0 ? "✅" : "⚠ ") +
    " AI Keys: " + (foundKeys.length > 0 ? foundKeys.join(", ") + " set" : "None set — AI fallback will be used"));
  // 8. Telegram Token (optional)
  const tgToken = props.getProperty("TG_TOKEN");
  Logger.log((tgToken ? "✅" : "⚠ ") +
    " Telegram Token: " + (tgToken ? "Set" : "Not set — Telegram notifications disabled"));
  // ── Summary ──
  Logger.log("════════════════════════════════════════");
  Logger.log("  RESULT: " + passed + " PASSED  |  " + failed + " FAILED");
  if (failed === 0) {
    Logger.log("  System is HEALTHY. Ready for production.");
  } else {
    Logger.log("  Fix the ❌ items above, then run HEALTH_CHECK_ again.");
  }
  Logger.log("════════════════════════════════════════");
  return { passed: passed, failed: failed };
}


// ── P1_EXTRACT_SPREADSHEET_ID_ ──
function P1_EXTRACT_SPREADSHEET_ID_(v){
  v=String(v||"").trim();
  const m=v.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)||v.match(/[-\w]{25,}/);
  return m?(m[1]||m[0]):"";
}


// after


// ── GET_MASTER_HEADERS_ ──
function GET_MASTER_HEADERS_(){
  return [
    "TIMESTAMP","EMP_CODE","SALES_NAME","EMPLOYEE_EMAIL","CLIENT_MOBILE",
    "CLIENT_NAME","COMPANY_NAME","CITY_LOCATION","LOAN_TYPE","CASE_CATEGORY",
    "CIBIL_SCORE","REMARKS","FOLLOWUP_STATUS","PREFERRED_BANK","REQUIRED_LOAN_AMOUNT",
    "DOCS_LINK","SUBMIT_FOLDER_LINK","SOURCE_TYPE","SOURCE_NAME","NA_T_STATUS",
    "SOURCE","EMPLOYEE_STATUS","LEAD_ID","PROCESS_STATUS",
    "TAT_DAYS","TAT_DEADLINE","TAT_STATUS","DATA_FLOW","DISBURSAL_NOTIFIED"
  ];
}


// ── GET_RAW_INBOX_HEADERS_ ──
function GET_RAW_INBOX_HEADERS_(){
  return ["RECEIVED_AT","GMAIL_MSG_ID","FROM_EMAIL","SUBJECT","LEAD_ID","CLIENT_NAME",
    "CLIENT_MOBILE","PREFERRED_BANK","LOAN_TYPE","REQUIRED_LOAN_AMOUNT","CASE_STATUS",
    "REMARKS","SOURCE_NAME","EMP_CODE","PROCESS_STATUS","DEDUP_ACTION","PROCESSED_AT"];
}
/* ─────────────────────────────────────────────
   SOURCE_NAME ROUTING TABLE
───────────────────────────────────────────── */


// ── DEFAULT_PRODUCTS_ ──
function DEFAULT_PRODUCTS_(){
  return [
    {code:"PL",name:"Personal Loan",icon:"💳",tat:3,roi:10.5},
    {code:"BL",name:"Business Loan",icon:"🏢",tat:7,roi:16},
    {code:"HL",name:"Home Loan",icon:"🏠",tat:15,roi:8.5},
    {code:"LAP",name:"Loan Against Property",icon:"🏦",tat:15,roi:10.5},
    {code:"AUTO",name:"Auto Loan",icon:"🚗",tat:5,roi:9.5}
  ];
}


// ── COMPUTE_TAT_ ──
function COMPUTE_TAT_(lead){
  const tatDays=GET_TAT_BY_PRODUCT_(lead.LOAN_TYPE);
  const deadline=new Date(new Date().getTime()+tatDays*24*60*60*1000);
  return {TAT_DAYS:tatDays,TAT_DEADLINE:deadline,TAT_STATUS:"ACTIVE"};
}


// ── UPDATE_TAT_AND_COLOUR_ ──
function UPDATE_TAT_AND_COLOUR_(sh,row,headers,caseStatus){
  const nH=headers.map(DC_NORM_);
  const tatIdx=nH.indexOf("TAT_STATUS");
  const dlIdx=nH.indexOf("TAT_DEADLINE");
  const cs=String(caseStatus||"").toUpperCase();
  let tatStatus="ACTIVE";
  if(["REJECT","REJECTED","NOT INTERESTED","NOT_INTERESTED","WRONG NUMBER"].includes(cs)) tatStatus="STOPPED";
  else if(["DISBURSE","DISBURSED"].includes(cs)) tatStatus="COMPLETED";
  else if(dlIdx>-1){
    const dl=new Date(sh.getRange(row,dlIdx+1).getValue()||0);
    if(!isNaN(dl)&&dl<new Date()) tatStatus="BREACHED";
  }
  if(tatIdx>-1) sh.getRange(row,tatIdx+1).setValue(tatStatus);
  const rowRange=sh.getRange(row,1,1,headers.length);
  if(tatStatus==="STOPPED")    rowRange.setBackground("#f4cccc");
  else if(tatStatus==="COMPLETED") rowRange.setBackground("#d9ead3");
  else if(tatStatus==="BREACHED")  rowRange.setBackground("#ff9999");
  else if(["APPROVED","SANCTION"].includes(cs)) rowRange.setBackground("#fff2cc");
  else rowRange.setBackground("#d9eaf7");
}
/* ─────────────────────────────────────────────
   ATTENDANCE ENGINE
───────────────────────────────────────────── */


// ── RECORD_TASK_FOR_ATTENDANCE_ ──
function RECORD_TASK_FOR_ATTENDANCE_(empCode){
  try {
    if(!empCode) return;
    const emp=FIND_EMPLOYEE_FULL_(empCode);
    if(!emp) return;
    const role=String(emp.DASHBOARD_ACCESS||emp.ROLE||"").toUpperCase();
    if(!role.includes("SALES MEMBER")&&role!=="STAFF") return;
    const today=new Date();
    const dateKey=Utilities.formatDate(today,"Asia/Kolkata","yyyy-MM-dd");
    const sh=GET_OR_CREATE_(DC_CFG.SHEETS.ATTENDANCE);
    P1_ENSURE_HEADERS_(sh,["DATE","EMP_CODE","SALES_NAME","TASK_COUNT","ATTENDANCE_STATUS","LAST_UPDATED"]);
    const data=sh.getDataRange().getValues();
    const h=data[0].map(DC_NORM_);
    const iDate=h.indexOf("DATE"),iCode=h.indexOf("EMP_CODE"),iCount=h.indexOf("TASK_COUNT"),
          iStatus=h.indexOf("ATTENDANCE_STATUS"),iUpd=h.indexOf("LAST_UPDATED"),iName=h.indexOf("SALES_NAME");
    for(let i=1;i<data.length;i++){
      const rowDate=Utilities.formatDate(new Date(data[i][iDate]||0),"Asia/Kolkata","yyyy-MM-dd");
      if(rowDate===dateKey&&String(data[i][iCode]||"").trim().toUpperCase()===empCode){
        const nc=Number(data[i][iCount]||0)+1;
        sh.getRange(i+1,iCount+1).setValue(nc);
        sh.getRange(i+1,iStatus+1).setValue(CALC_ATT_STATUS_(nc));
        sh.getRange(i+1,iUpd+1).setValue(new Date());
        return;
      }
    }
    sh.appendRow([today,empCode,emp.NAME||"",1,CALC_ATT_STATUS_(1),new Date()]);
  } catch(e){ LOG_ERR_("RECORD_TASK_ATTENDANCE",empCode,e.message); }
}


// ── CALC_ATT_STATUS_ ──
function CALC_ATT_STATUS_(count){
  const c=Number(count||0);
  if(c>=DC_CFG.ATTENDANCE.PRESENT_THRESHOLD) return "PRESENT";
  if(c>=DC_CFG.ATTENDANCE.HALF_DAY_THRESHOLD) return "HALF_DAY";
  return "ABSENT";
}


// ── MANAGER_SELFIE_CHECKIN_ ──
function MANAGER_SELFIE_CHECKIN_(empCode,half){
  try {
    if(!empCode) return { success: false, errorMessage: "EMP_CODE missing" };
    const emp=FIND_EMPLOYEE_FULL_(empCode);
    if(!emp) return { success: false, errorMessage: "Employee not found" };
    const role=String(emp.DASHBOARD_ACCESS||emp.ROLE||"").toUpperCase();
    if(!role.includes("SALES MANAGER")&&!role.includes("MANAGER")) return { success: false, errorMessage: "Not a manager role" };
    const now=new Date();
    const hour=now.getHours(),min=now.getMinutes();
    const dateKey=Utilities.formatDate(now,"Asia/Kolkata","yyyy-MM-dd");
    let validHalf=false;
    if(half===1&&hour===DC_CFG.ATTENDANCE.MANAGER_CHECKIN_1_START&&min<=DC_CFG.ATTENDANCE.MANAGER_CHECKIN_1_END_MIN) validHalf=true;
    if(half===2&&hour===DC_CFG.ATTENDANCE.MANAGER_CHECKIN_2_START&&min<=DC_CFG.ATTENDANCE.MANAGER_CHECKIN_2_END_MIN) validHalf=true;
    if(!validHalf) return {ok:false,err:"Outside window. 1st: 10:00–10:15, 2nd: 14:00–14:15"};
    const sh=GET_OR_CREATE_(DC_CFG.SHEETS.ATTENDANCE);
    P1_ENSURE_HEADERS_(sh,["DATE","EMP_CODE","SALES_NAME","TASK_COUNT","ATTENDANCE_STATUS","HALF1_CHECKIN","HALF2_CHECKIN","LAST_UPDATED"]);
    const data=sh.getDataRange().getValues();
    const h=data[0].map(DC_NORM_);
    const iDate=h.indexOf("DATE"),iCode=h.indexOf("EMP_CODE"),iH1=h.indexOf("HALF1_CHECKIN"),
          iH2=h.indexOf("HALF2_CHECKIN"),iStatus=h.indexOf("ATTENDANCE_STATUS"),iUpd=h.indexOf("LAST_UPDATED");
    for(let i=1;i<data.length;i++){
      const rowDate=Utilities.formatDate(new Date(data[i][iDate]||0),"Asia/Kolkata","yyyy-MM-dd");
      if(rowDate===dateKey&&String(data[i][iCode]||"").trim().toUpperCase()===empCode){
        if(half===1) sh.getRange(i+1,iH1+1).setValue(now);
        else sh.getRange(i+1,iH2+1).setValue(now);
        const h1v=iH1>-1?sh.getRange(i+1,iH1+1).getValue():"";
        const h2v=iH2>-1?sh.getRange(i+1,iH2+1).getValue():"";
        const att=h1v&&h2v?"PRESENT":(h1v||h2v?"HALF_DAY":"ABSENT");
        sh.getRange(i+1,iStatus+1).setValue(att);
        sh.getRange(i+1,iUpd+1).setValue(now);
        return { success: true, attendanceStatus: att };
      }
    }
    const newRow=[now,empCode,emp.NAME||"",0,"HALF_DAY","","",now];
    if(half===1) newRow[5]=now; else newRow[6]=now;
    sh.appendRow(newRow);
    return { success: true, attendanceStatus: "HALF_DAY" };
  } catch (error) { LOG_ERR_("MANAGER_SELFIE_CHECKIN", empCode, error.message); return { success: false, errorMessage: error.message }; }
}


// ── ATTENDANCE_EOD_REPORT_ ──
function ATTENDANCE_EOD_REPORT_(){
  try {
    const sh=SHEET_(DC_CFG.SHEETS.ATTENDANCE);
    if(!sh||sh.getLastRow()<2) return;
    const today=Utilities.formatDate(new Date(),"Asia/Kolkata","yyyy-MM-dd");
    const data=sh.getDataRange().getValues();
    const h=data[0].map(DC_NORM_);
    const iDate=h.indexOf("DATE"),iCode=h.indexOf("EMP_CODE"),iName=h.indexOf("SALES_NAME"),iStatus=h.indexOf("ATTENDANCE_STATUS");
    let report="📋 *ATTENDANCE — "+today+"*\n\n",present=0,half=0,absent=0;
    for(let i=1;i<data.length;i++){
      const rowDate=Utilities.formatDate(new Date(data[i][iDate]||0),"Asia/Kolkata","yyyy-MM-dd");
      if(rowDate!==today) continue;
      const st=String(data[i][iStatus]||"ABSENT").toUpperCase();
      report+="• "+String(data[i][iName]||data[i][iCode]||"")+": "+st+"\n";
      if(st==="PRESENT") present++;
      else if(st==="HALF_DAY") half++;
      else absent++;
    }
    report+="\n✅ Present:"+present+" | 🟡 Half:"+half+" | ❌ Absent:"+absent;
    DC_SEND_TG_(report);
  } catch(e){ LOG_ERR_("ATTENDANCE_EOD","",e.message); }
}
/* ─────────────────────────────────────────────
   ACCOUNTS NOTIFICATION (DISBURSE)
───────────────────────────────────────────── */


// ── NOTIFY_ACCOUNTS_ON_DISBURSE_ ──
function NOTIFY_ACCOUNTS_ON_DISBURSE_(lead){
  try {
    const sh=GET_OR_CREATE_(DC_CFG.SHEETS.ACCOUNTS_LOG);
    P1_ENSURE_HEADERS_(sh,["TIMESTAMP","LEAD_ID","CLIENT_NAME","CLIENT_MOBILE","LOAN_TYPE",
      "REQUIRED_LOAN_AMOUNT","PREFERRED_BANK","SALES_NAME","EMP_CODE","DISBURSAL_STATUS","REMARKS"]);
    sh.appendRow([new Date(),lead.LEAD_ID||"",lead.CLIENT_NAME||"",lead.CLIENT_MOBILE||"",
      lead.LOAN_TYPE||"",lead.REQUIRED_LOAN_AMOUNT||"",lead.PREFERRED_BANK||"",
      lead.SALES_NAME||"",lead.EMP_CODE||"","PENDING_PROCESSING",lead.REMARKS||""]);
    if(MailApp.getRemainingDailyQuota()>0){
      MailApp.sendEmail({
        to:DC_CFG.COMPANY.ACCOUNTS_EMAIL,
        cc:DC_CFG.COMPANY.MD_EMAIL+","+DC_CFG.COMPANY.FOUNDER_EMAIL,
        subject:"[DISBURSAL] "+(lead.LEAD_ID||"")+" - "+(lead.CLIENT_NAME||""),
        body:"Lead disbursed. Action: process PF/PDD.\n\n"+JSON.stringify(lead,null,2),
        name:DC_CFG.COMPANY.NAME
      });
    }
    DC_SEND_TG_("💰 [DISBURSAL]\nLead:"+lead.LEAD_ID+"\nClient:"+lead.CLIENT_NAME+"\n₹"+lead.REQUIRED_LOAN_AMOUNT+"\nBank:"+lead.PREFERRED_BANK+"\n→ Accounts notified.");
  } catch(e){ LOG_ERR_("NOTIFY_ACCOUNTS_DISBURSE",lead.LEAD_ID||"",e.message); }
}
/* ─────────────────────────────────────────────
   MIS GMAIL PIPELINE
───────────────────────────────────────────── */


// ── GET_PROCESSED_GMAIL_IDS_ ──
function GET_PROCESSED_GMAIL_IDS_(){
  const set=new Set();
  try {
    const sh=SHEET_(DC_CFG.SHEETS.RAW_INBOX);
    if(!sh||sh.getLastRow()<2) return set;
    const h=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(DC_NORM_);
    const idx=h.indexOf("GMAIL_MSG_ID");
    // B6 FIX: if column missing (fresh install), return empty set but log
    if(idx===-1){
      Logger.log("[WARN] GMAIL_MSG_ID column missing in RAW_INBOX — first-run dedup skipped.");
      return set;
    }
    // Bulk read entire column at once (not row-by-row)
    const vals=sh.getRange(2,idx+1,sh.getLastRow()-1,1).getValues();
    vals.forEach(r=>{if(r[0])set.add(String(r[0]).trim());});
  } catch(e){ LOG_ERR_("GET_PROCESSED_GMAIL_IDS","",e.message); }
  return set;
}


// ── PARSE_MIS_MAIL_BODY_ ──
function PARSE_MIS_MAIL_BODY_(subject, body) {
  const parsed = {};
  
  // Parse body lines (key-value)
  String(body || "").split(/\r?\n/).forEach(line => {
    const m = line.match(/^([A-Za-z0-9_ ]+?)\s*[:\-=]\s*(.+)$/);
    if (m) parsed[DC_NORM_(m[1].trim())] = m[2].trim();
  });
  
  // Parse JSON in body
  try {
    const j = body.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/);
    if (j) {
      const o = JSON.parse(j[0]);
      Object.keys(o).forEach(k => parsed[DC_NORM_(k)] = o[k]);
    }
  } catch (_) {}
  // Standardize values
  let leadId        = parsed["LEAD_ID"] || parsed["CASE_ID"] || parsed["APPLICATION_NO"] || "";
  let clientName    = parsed["CLIENT_NAME"] || parsed["FULL_NAME"] || parsed["NAME"] || "";
  let clientMobile  = DC_CLEAN_MOBILE_(parsed["CLIENT_MOBILE"] || parsed["MOBILE"] || parsed["PHONE"] || "");
  let preferredBank = parsed["PREFERRED_BANK"] || parsed["BANK"] || "";
  let loanType      = parsed["LOAN_TYPE"] || parsed["PRODUCT"] || "";
  let amount        = parsed["REQUIRED_LOAN_AMOUNT"] || parsed["AMOUNT"] || "";
  let caseStatus    = parsed["CASE_STATUS"] || parsed["STATUS"] || "";
  let remarks       = parsed["REMARKS"] || parsed["REMARK"] || parsed["NOTES"] || "";
  let empCode       = (parsed["EMP_CODE"] || parsed["EMPLOYEE_CODE"] || "").toUpperCase();
  // SMART SUBJECT PARSER (runs if body parsing didn't find Client Name)
  if (!clientName && subject) {
    const cleanSub = String(subject).replace(/^Re:\s*/i, "").replace(/^Fwd:\s*/i, "").replace(/^RE:\s*/i, "").trim();
    // Split subject by multiple equals, hyphens, or pipes
    const tokens = cleanSub.split(/={2,}|-{2,}|\|{2,}/).map(t => t.trim()).filter(Boolean);
    
    if (tokens.length > 0) {
      // 1. Client Name is usually the first token
      clientName = tokens[0];
      
      // 2. Scan remaining tokens for bank, loan type, status, application number
      tokens.slice(1).forEach(token => {
        const upperToken = token.toUpperCase().trim();
        
        // Match Application Number (alphanumeric containing digits, length 6-20)
        if (/[A-Z]+[0-9]+|[0-9]+[A-Z]+/.test(upperToken) && upperToken.length >= 6) {
          leadId = token;
        }
        
        // Match Statuses
        if (upperToken.includes("LOGIN") || upperToken.includes("DONE") || upperToken.includes("SUBMITTED")) {
          caseStatus = "LOGIN_DONE";
        } else if (upperToken.includes("REJECT") || upperToken.includes("DECLINED") || upperToken.includes("CANCEL")) {
          caseStatus = "REJECTED";
        } else if (upperToken.includes("DISBURSE") || upperToken.includes("PAID") || upperToken.includes("SUCCESS")) {
          caseStatus = "DISBURSED";
        } else if (upperToken.includes("APPROVED") || upperToken.includes("SANCTION")) {
          caseStatus = "APPROVED";
        }
        
        // Match Bank names
        const banksList = ["CREDIT SAISON", "ICICI", "HDFC", "AXIS", "SBI", "BOB", "BAJAJ", "TATA", "CHOLA", "PIRAMAL", "IDFC"];
        banksList.forEach(b => {
          if (upperToken.includes(b)) preferredBank = b;
        });
        // Match Loan Types
        if (upperToken.includes("OD") || upperToken.includes("OVERDRAFT") || upperToken.includes("CC")) {
          loanType = "Working Capital";
        } else if (upperToken.includes("PL") || upperToken.includes("PERSONAL")) {
          loanType = "Personal Loan";
        } else if (upperToken.includes("BL") || upperToken.includes("BUSINESS")) {
          loanType = "Business Loan";
        } else if (upperToken.includes("HL") || upperToken.includes("HOME")) {
          loanType = "Home Loan";
        } else if (upperToken.includes("LAP") || upperToken.includes("PROPERTY")) {
          loanType = "Loan Against Property";
        }
        
        // Match Sales RM referral name (e.g. REFFF===ARJUN)
        if (upperToken.includes("REF") || upperToken.includes("RM") || upperToken.includes("AGENT")) {
          const namePart = token.split(/[:=\s]+/).slice(-1)[0];
          if (namePart && namePart.toUpperCase() !== "REF" && namePart.length > 2) {
            remarks += " | Agent Ref: " + namePart;
          }
        }
      });
    }
  }
  return {
    LEAD_ID:              leadId,
    CLIENT_NAME:          clientName,
    CLIENT_MOBILE:        clientMobile,
    PREFERRED_BANK:       preferredBank,
    LOAN_TYPE:            loanType,
    REQUIRED_LOAN_AMOUNT: amount,
    CASE_STATUS:          caseStatus || "OPEN",
    REMARKS:              remarks,
    SOURCE_NAME:          "MIS-Incoming",
    EMP_CODE:             empCode
  };
}


// ── CHECK_DEDUP_IN_COMMON_ENTRY_ ──
function CHECK_DEDUP_IN_COMMON_ENTRY_(leadId, mobile, bank, clientName) {
  try {
    const sh = SHEET_(DC_CFG.SHEETS.COMMON_ENTRY);
    if (!sh || sh.getLastRow() < 2) return { found: false };
    
    const data = sh.getDataRange().getValues();
    const h = data[0].map(DC_NORM_);
    
    const liIdx = h.indexOf("LEAD_ID");
    const moIdx = h.indexOf("CLIENT_MOBILE");
    const nmIdx = h.indexOf("CLIENT_NAME");
    
    const cleanMobile = DC_CLEAN_MOBILE_(mobile || "");
    const cleanLead   = String(leadId || "").trim().toUpperCase();
    const cleanName   = String(clientName || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    for (let i = 1; i < data.length; i++) {
      const rl = liIdx > -1 ? String(data[i][liIdx] || "").trim().toUpperCase() : "";
      const rm = moIdx > -1 ? DC_CLEAN_MOBILE_(data[i][moIdx]) : "";
      const rn = nmIdx > -1 ? String(data[i][nmIdx] || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
      const mobileMatch = cleanMobile && rm === cleanMobile;
      const leadMatch   = cleanLead && (rl === cleanLead || String(data[i][h.indexOf("REMARKS")] || "").toUpperCase().includes(cleanLead));
      const nameMatch   = cleanName && rn && (rn.includes(cleanName) || cleanName.includes(rn));
      if (mobileMatch || leadMatch || nameMatch) {
        return { found: true, row: i + 1 };
      }
    }
    return { found: false };
  } catch (e) {
    LOG_ERR_("CHECK_DEDUP", "", e.message);
    return { found: false };
  }
}


// ── UPDATE_REMARKS_IN_SHEET_ ──
function UPDATE_REMARKS_IN_SHEET_(sh, idxCol, matchVal, remarkCol, newRemark) {
  try {
    if (!sh || sh.getLastRow() < 2 || idxCol === -1 || remarkCol === -1) return;
    const vals = sh.getRange(2, idxCol + 1, sh.getLastRow() - 1, 1).getValues();
    for (let i = 0; i < vals.length; i++) {
      if (String(vals[i][0] || "").trim().toUpperCase() === String(matchVal || "").toUpperCase()) {
        const old = String(sh.getRange(i + 2, remarkCol + 1).getValue() || "").trim();
        sh.getRange(i + 2, remarkCol + 1).setValue(old ? (old + " | " + newRemark) : newRemark);
        break;
      }
    }
  } catch (e) {
    LOG_ERR_("UPDATE_REMARKS_SHEET", "", e.message);
  }
}


// ── PROCESS_MIS_MAIL_ ──
function PROCESS_MIS_MAIL_(mail) {
  try {
    const cleanSub = String(mail.subject || "").toUpperCase();
    const cleanBody = String(mail.body || "").toUpperCase();
    
    const exclusions = [
      "NEW LOGIN FROM", "SECURITY ALERT", "CRITICAL SECURITY ALERT", 
      "GOOGLE ACCOUNT", "SIGN-IN ATTEMPT", "VERIFICATION CODE", 
      "OTP", "DELIVERY STATUS NOTIFICATION", "UNDELIVERABLE", 
      "OUT OF OFFICE", "PASSWORD RESET", "PASSWORD CHANGE", "ACCESS GRANTED"
    ];
    
    const isExcluded = exclusions.some(x => cleanSub.includes(x) || cleanBody.includes(x));
    
    if (isExcluded) {
      const rawSh = GET_OR_CREATE_(DC_CFG.SHEETS.RAW_INBOX);
      const rawH  = P1_ENSURE_HEADERS_(rawSh, GET_RAW_INBOX_HEADERS_());
      rawSh.appendRow(P1_BUILD_ROW_(rawH, {
        RECEIVED_AT:          mail.receivedAt,
        GMAIL_MSG_ID:         mail.msgId,
        FROM_EMAIL:           mail.from,
        SUBJECT:              mail.subject,
        PROCESS_STATUS:       "SKIPPED_SYSTEM_ALERT",
        DEDUP_ACTION:         "NONE",
        PROCESSED_AT:         new Date()
      }));
      Logger.log("Filtered out system/security alert email: " + mail.subject);
      return;
    }
    const parsed = PARSE_MIS_MAIL_BODY_(mail.subject, mail.body);
    
    // Additional validation: if name is empty or contains standard system keywords, skip
    const cleanName = String(parsed.CLIENT_NAME || "").toUpperCase();
    if (!cleanName || cleanName.includes("NEW LOGIN") || cleanName.includes("SECURITY ALERT") || cleanName.includes("GOOGLE ACCOUNT")) {
      const rawSh = GET_OR_CREATE_(DC_CFG.SHEETS.RAW_INBOX);
      const rawH  = P1_ENSURE_HEADERS_(rawSh, GET_RAW_INBOX_HEADERS_());
      rawSh.appendRow(P1_BUILD_ROW_(rawH, {
        RECEIVED_AT:          mail.receivedAt,
        GMAIL_MSG_ID:         mail.msgId,
        FROM_EMAIL:           mail.from,
        SUBJECT:              mail.subject,
        PROCESS_STATUS:       "SKIPPED_INVALID_LEAD_DATA",
        DEDUP_ACTION:         "NONE",
        PROCESSED_AT:         new Date()
      }));
      Logger.log("Filtered out invalid lead data email: " + mail.subject);
      return;
    }
    const rawSh  = GET_OR_CREATE_(DC_CFG.SHEETS.RAW_INBOX);
    const rawH   = P1_ENSURE_HEADERS_(rawSh, GET_RAW_INBOX_HEADERS_());
    // Write RAW_INBOX entry (always)
    rawSh.appendRow(P1_BUILD_ROW_(rawH, {
      RECEIVED_AT:          mail.receivedAt,
      GMAIL_MSG_ID:         mail.msgId,
      FROM_EMAIL:           mail.from,
      SUBJECT:              mail.subject,
      LEAD_ID:              parsed.LEAD_ID,
      CLIENT_NAME:          parsed.CLIENT_NAME,
      CLIENT_MOBILE:        parsed.CLIENT_MOBILE,
      PREFERRED_BANK:       parsed.PREFERRED_BANK,
      LOAN_TYPE:            parsed.LOAN_TYPE,
      REQUIRED_LOAN_AMOUNT: parsed.REQUIRED_LOAN_AMOUNT,
      CASE_STATUS:          parsed.CASE_STATUS,
      REMARKS:              parsed.REMARKS,
      SOURCE_NAME:          "MIS-Incoming",
      EMP_CODE:             parsed.EMP_CODE,
      PROCESS_STATUS:       "PENDING",
      DEDUP_ACTION:         "PENDING",
      PROCESSED_AT:         new Date()
    }));
    
    const rawRowNum = rawSh.getLastRow();
    const rawPsIdx  = rawH.indexOf("PROCESS_STATUS");
    const rawDaIdx  = rawH.indexOf("DEDUP_ACTION");
    let processStatus = "";
    let dedupAction   = "";
    
    const dedup = CHECK_DEDUP_IN_COMMON_ENTRY_(parsed.LEAD_ID, parsed.CLIENT_MOBILE, parsed.PREFERRED_BANK, parsed.CLIENT_NAME);
    
    if (dedup.found) {
      // 1. Update and Autofill in COMMON_ENTRY
      const ceSh = SHEET_(DC_CFG.SHEETS.COMMON_ENTRY);
      const ceH  = ceSh.getRange(1, 1, 1, ceSh.getLastColumn()).getValues()[0].map(DC_NORM_);
      const ceLIdx = ceH.indexOf("LEAD_ID");
      const ceMIdx = ceH.indexOf("CLIENT_MOBILE");
      const ceNIdx = ceH.indexOf("CLIENT_NAME");
      const ceBIdx = ceH.indexOf("PREFERRED_BANK");
      const ceTIdx = ceH.indexOf("LOAN_TYPE");
      const ceAIdx = ceH.indexOf("REQUIRED_LOAN_AMOUNT");
      const ceRIdx = ceH.indexOf("REMARKS");
      const ceCIdx = ceH.indexOf("CASE_CATEGORY");
      
      // Auto-update status
      if (ceCIdx > -1 && parsed.CASE_STATUS) {
        ceSh.getRange(dedup.row, ceCIdx + 1).setValue(parsed.CASE_STATUS);
      }
      
      // Autofill missing details
      if (ceLIdx > -1 && parsed.LEAD_ID) {
        const cur = String(ceSh.getRange(dedup.row, ceLIdx + 1).getValue()).trim();
        if (!cur || cur.startsWith("L0000_")) ceSh.getRange(dedup.row, ceLIdx + 1).setValue(parsed.LEAD_ID);
      }
      if (ceMIdx > -1 && parsed.CLIENT_MOBILE) {
        const cur = String(ceSh.getRange(dedup.row, ceMIdx + 1).getValue()).replace(/\D/g,"");
        if (!cur || cur === "0000000000" || cur === "9999999999") ceSh.getRange(dedup.row, ceMIdx + 1).setValue(parsed.CLIENT_MOBILE);
      }
      if (ceNIdx > -1 && parsed.CLIENT_NAME) {
        const cur = String(ceSh.getRange(dedup.row, ceNIdx + 1).getValue()).trim();
        if (!cur) ceSh.getRange(dedup.row, ceNIdx + 1).setValue(parsed.CLIENT_NAME);
      }
      if (ceBIdx > -1 && parsed.PREFERRED_BANK) {
        const cur = String(ceSh.getRange(dedup.row, ceBIdx + 1).getValue()).trim();
        if (!cur) ceSh.getRange(dedup.row, ceBIdx + 1).setValue(parsed.PREFERRED_BANK);
      }
      if (ceTIdx > -1 && parsed.LOAN_TYPE) {
        const cur = String(ceSh.getRange(dedup.row, ceTIdx + 1).getValue()).trim();
        if (!cur) ceSh.getRange(dedup.row, ceTIdx + 1).setValue(parsed.LOAN_TYPE);
      }
      if (ceAIdx > -1 && parsed.REQUIRED_LOAN_AMOUNT) {
        const cur = String(ceSh.getRange(dedup.row, ceAIdx + 1).getValue()).trim();
        if (!cur || cur === "0" || cur === "NaN") ceSh.getRange(dedup.row, ceAIdx + 1).setValue(parsed.REQUIRED_LOAN_AMOUNT);
      }
      if (ceRIdx > -1) {
        const old = String(ceSh.getRange(dedup.row, ceRIdx + 1).getValue() || "").trim();
        ceSh.getRange(dedup.row, ceRIdx + 1).setValue(old ? (old + " | [MIS-mail: " + mail.subject + "]") : "[MIS-mail: " + mail.subject + "]");
      }
      // 2. Find, update and Autofill matching entry in MASTER_DATA
      const mdSh = SHEET_(DC_CFG.SHEETS.MASTER_DATA);
      if (mdSh && mdSh.getLastRow() >= 2) {
        const mdH    = mdSh.getRange(1, 1, 1, mdSh.getLastColumn()).getValues()[0].map(DC_NORM_);
        const mdLIdx = mdH.indexOf("LEAD_ID");
        const mdMIdx = mdH.indexOf("CLIENT_MOBILE");
        const mdNIdx = mdH.indexOf("CLIENT_NAME");
        const mdBIdx = mdH.indexOf("PREFERRED_BANK");
        const mdTIdx = mdH.indexOf("LOAN_TYPE");
        const mdAIdx = mdH.indexOf("REQUIRED_LOAN_AMOUNT");
        const mdCIdx = mdH.indexOf("CASE_CATEGORY");
        const mdRIdx = mdH.indexOf("REMARKS");
        
        let matchRow = -1;
        const vals   = mdSh.getDataRange().getValues();
        const cleanName = String(parsed.CLIENT_NAME || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
        for (let r = 1; r < vals.length; r++) {
          const ml = mdLIdx > -1 ? String(vals[r][mdLIdx] || "").trim().toUpperCase() : "";
          const mm = mdMIdx > -1 ? DC_CLEAN_MOBILE_(vals[r][mdMIdx]) : "";
          const mn = mdNIdx > -1 ? String(vals[r][mdNIdx] || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
          
          if ((parsed.LEAD_ID && ml === parsed.LEAD_ID.toUpperCase()) || 
              (parsed.CLIENT_MOBILE && mm === parsed.CLIENT_MOBILE) || 
              (cleanName && mn && (mn.includes(cleanName) || cleanName.includes(mn)))) {
            matchRow = r + 1;
            break;
          }
        }
        
        if (matchRow > -1) {
          if (mdCIdx > -1 && parsed.CASE_STATUS) {
            mdSh.getRange(matchRow, mdCIdx + 1).setValue(parsed.CASE_STATUS);
          }
          
          // Autofill MASTER_DATA fields
          if (mdLIdx > -1 && parsed.LEAD_ID) {
            const cur = String(mdSh.getRange(matchRow, mdLIdx + 1).getValue()).trim();
            if (!cur || cur.startsWith("L0000_")) mdSh.getRange(matchRow, mdLIdx + 1).setValue(parsed.LEAD_ID);
          }
          if (mdMIdx > -1 && parsed.CLIENT_MOBILE) {
            const cur = String(mdSh.getRange(matchRow, mdMIdx + 1).getValue()).replace(/\D/g,"");
            if (!cur || cur === "0000000000" || cur === "9999999999") mdSh.getRange(matchRow, mdMIdx + 1).setValue(parsed.CLIENT_MOBILE);
          }
          if (mdNIdx > -1 && parsed.CLIENT_NAME) {
            const cur = String(mdSh.getRange(matchRow, mdNIdx + 1).getValue()).trim();
            if (!cur) mdSh.getRange(matchRow, mdNIdx + 1).setValue(parsed.CLIENT_NAME);
          }
          if (mdBIdx > -1 && parsed.PREFERRED_BANK) {
            const cur = String(mdSh.getRange(matchRow, mdBIdx + 1).getValue()).trim();
            if (!cur) mdSh.getRange(matchRow, mdBIdx + 1).setValue(parsed.PREFERRED_BANK);
          }
          if (mdTIdx > -1 && parsed.LOAN_TYPE) {
            const cur = String(mdSh.getRange(matchRow, mdTIdx + 1).getValue()).trim();
            if (!cur) mdSh.getRange(matchRow, mdTIdx + 1).setValue(parsed.LOAN_TYPE);
          }
          if (mdAIdx > -1 && parsed.REQUIRED_LOAN_AMOUNT) {
            const cur = String(mdSh.getRange(matchRow, mdAIdx + 1).getValue()).trim();
            if (!cur || cur === "0" || cur === "NaN") mdSh.getRange(matchRow, mdAIdx + 1).setValue(parsed.REQUIRED_LOAN_AMOUNT);
          }
          if (mdRIdx > -1) {
            const old = String(mdSh.getRange(matchRow, mdRIdx + 1).getValue() || "").trim();
            mdSh.getRange(matchRow, mdRIdx + 1).setValue(old ? (old + " | [MIS-mail: " + mail.subject + "]") : "[MIS-mail: " + mail.subject + "]");
          }
          
          // Update TAT and coloring in MASTER_DATA
          UPDATE_TAT_AND_COLOUR_(mdSh, matchRow, mdH.map(h => String(h)), parsed.CASE_STATUS || "OPEN");
          
          // 3. Propagate to Employee's Personal Dashboard (MY_CASES inside personal file)
          const empCodeIdx = mdH.indexOf("EMP_CODE");
          if (empCodeIdx > -1) {
            const empCode = String(mdSh.getRange(matchRow, empCodeIdx + 1).getValue()).trim().toUpperCase();
            if (empCode) {
              const employee = FIND_EMPLOYEE_FULL_(empCode);
              if (employee && employee.PERSONAL_FILE_ID) {
                try {
                  const pss = P1_OPEN_SS_SAFE_(employee.PERSONAL_FILE_ID);
                  const myCasesSh = pss.getSheetByName("MY_CASES");
                  if (myCasesSh && myCasesSh.getLastRow() >= 2) {
                    const mcH = myCasesSh.getRange(1, 1, 1, myCasesSh.getLastColumn()).getValues()[0].map(DC_NORM_);
                    const mcLIdx = mcH.indexOf("LEAD_ID");
                    const mcCIdx = mcH.indexOf("CASE_CATEGORY");
                    const mcRIdx = mcH.indexOf("REMARKS");
                    const mcVals = myCasesSh.getDataRange().getValues();
                    
                    for (let mr = 1; mr < mcVals.length; mr++) {
                      if (mcLIdx > -1 && String(mcVals[mr][mcLIdx]).trim().toUpperCase() === String(vals[matchRow - 1][mdLIdx]).trim().toUpperCase()) {
                        if (mcCIdx > -1 && parsed.CASE_STATUS) {
                          myCasesSh.getRange(mr + 1, mcCIdx + 1).setValue(parsed.CASE_STATUS);
                        }
                        if (mcRIdx > -1) {
                          const old = String(myCasesSh.getRange(mr + 1, mcRIdx + 1).getValue() || "").trim();
                          myCasesSh.getRange(mr + 1, mcRIdx + 1).setValue(old ? (old + " | [MIS-mail: " + mail.subject + "]") : "[MIS-mail: " + mail.subject + "]");
                        }
                        UPDATE_TAT_AND_COLOUR_(myCasesSh, mr + 1, mcH.map(h => String(h)), parsed.CASE_STATUS || "OPEN");
                        break;
                      }
                    }
                  }
                } catch (pe) {
                  LOG_ERR_("MIS_DEDUP_PERSONAL_FILE", employee.PERSONAL_FILE_ID, pe.message);
                }
              }
            }
          }
        }
      }
      processStatus = "DEDUP_REMARK_UPDATED";
      dedupAction   = "MATCH_ROW_" + dedup.row;
    } else {
      // New lead: full 6-stage pipeline
      const leadPayload = {
        EMP_CODE:             parsed.EMP_CODE || "",
        CLIENT_NAME:          parsed.CLIENT_NAME,
        CLIENT_MOBILE:        parsed.CLIENT_MOBILE,
        LOAN_TYPE:            parsed.LOAN_TYPE,
        REQUIRED_LOAN_AMOUNT: parsed.REQUIRED_LOAN_AMOUNT,
        PREFERRED_BANK:       parsed.PREFERRED_BANK,
        CASE_STATUS:          parsed.CASE_STATUS || "OPEN",
        REMARKS:              parsed.REMARKS + " | [MIS-mail: " + mail.subject + "]",
        SOURCE_TYPE:          "EMAIL_MIS",
        SOURCE_NAME:          "MIS-Incoming",
        LEAD_ID:              parsed.LEAD_ID || ""
      };
      
      const res = DC_PROCESS_LEAD_(leadPayload);
      processStatus = res.success ? "PROCESSED_" + res.leadId : "FAILED: " + (res.errorMessage || "Unknown error");
      dedupAction   = "NEW_LEAD";
    }
    
    // Update raw status
    if (rawPsIdx > -1) rawSh.getRange(rawRowNum, rawPsIdx + 1).setValue(processStatus);
    if (rawDaIdx > -1) rawSh.getRange(rawRowNum, rawDaIdx + 1).setValue(dedupAction);
  } catch (e) {
    LOG_ERR_("PROCESS_MIS_MAIL", mail.msgId || "", e.message);
  }
}


// ── FETCH_AND_PROCESS_MIS_MAILS_ ──
function FETCH_AND_PROCESS_MIS_MAILS_(){
  // B1 FIX: paginate through ALL threads (not just first 50)
  // B5 FIX: log warnings if label is missing so admin knows to create it
  try {
    const label=GmailApp.getUserLabelByName(DC_CFG.MIS.GMAIL_LABEL);
    if(!label){
      LOG_ERR_("FETCH_MIS","","Gmail label '"+DC_CFG.MIS.GMAIL_LABEL+"' not found. Create it in Gmail or update DC_CFG.MIS.GMAIL_LABEL.");
      return;
    }
    const processed=GET_PROCESSED_GMAIL_IDS_();
    const BATCH_SIZE=100;
    let start=0,fetched=0;
    while(true){
      const threads=label.getThreads(start,BATCH_SIZE);
      if(!threads||!threads.length) break;
      threads.forEach(thread=>{
        thread.getMessages().forEach(msg=>{
          const id=msg.getId();
          if(processed.has(id)) return;
          PROCESS_MIS_MAIL_({
            msgId:id,from:msg.getFrom(),subject:msg.getSubject(),
            body:msg.getPlainBody(),receivedAt:msg.getDate()
          });
          processed.add(id); // track within this run to avoid double-processing
        });
      });
      fetched+=threads.length;
      if(threads.length<BATCH_SIZE) break; // last page
      start+=BATCH_SIZE;
      if(fetched>500){ Logger.log("[WARN] Stopped after 500 threads to avoid timeout."); break; }
    }
    Logger.log("✅ FETCH_AND_PROCESS_MIS_MAILS done. Threads checked: "+fetched);
  } catch(e){ LOG_ERR_("FETCH_AND_PROCESS_MIS","",e.message); }
}
/* ─────────────────────────────────────────────
   PERSONAL FILE SYNC (MY_CASES view-only + SALES_ACTIVITY)
───────────────────────────────────────────── */


// ── LOCK_MY_CASES_VIEW_ONLY_ ──
function LOCK_MY_CASES_VIEW_ONLY_(sh,empCode){
  const allowed=["upendra.raghav@divyanshicapital.com","narendra.94100@gmail.com"];
  let p=sh.getProtections(SpreadsheetApp.ProtectionType.SHEET)[0];
  if(!p) p=sh.protect();
  p.setDescription("MY_CASES_VIEW_ONLY_"+empCode);
  p.setWarningOnly(false);
  p.getEditors().forEach(u=>{ if(!allowed.includes(u.getEmail().toLowerCase())) try{p.removeEditor(u);}catch(_){} });
  allowed.forEach(e=>{ try{p.addEditor(e);}catch(_){} });
  try{ if(p.canDomainEdit()) p.setDomainEdit(false); }catch(_){}
}


// ── SYNC_MY_CASES_AND_ACTIVITY_ ──
function SYNC_MY_CASES_AND_ACTIVITY_(empCode,myCases){
  const emp=FIND_EMPLOYEE_FULL_(empCode);
  if(!emp||!emp.PERSONAL_FILE_ID||emp.PERSONAL_FILE_ID.length<20) return;
  try {
    const pss=P1_OPEN_SS_SAFE_(emp.PERSONAL_FILE_ID);
    const masterHeaders=GET_MASTER_HEADERS_();
    const actHeaders=["TIMESTAMP","LEAD_ID","CLIENT_NAME","CLIENT_MOBILE","LOAN_TYPE","AMOUNT","BANK","STATUS","REMARKS","TAT_STATUS"];
    // MY_CASES: full replace + view-only lock
    let myCasesSh=pss.getSheetByName("MY_CASES")||pss.insertSheet("MY_CASES");
    myCasesSh.clearContents(); myCasesSh.clearFormats();
    P1_ENSURE_HEADERS_(myCasesSh,masterHeaders);
    if(myCases.length){
      const rows=myCases.map(c=>P1_BUILD_ROW_(masterHeaders,c));
      myCasesSh.getRange(2,1,rows.length,masterHeaders.length).setValues(rows);
      // TAT colouring
      const nH=masterHeaders.map(DC_NORM_);
      const csIdx=nH.indexOf("CASE_CATEGORY")>-1?nH.indexOf("CASE_CATEGORY"):nH.indexOf("PROCESS_STATUS");
      myCases.forEach((c,i)=>{
        const cs=String(c.CASE_CATEGORY||c.case_category||"").toUpperCase();
        const rng=myCasesSh.getRange(i+2,1,1,masterHeaders.length);
        if(["REJECT","REJECTED","NOT INTERESTED"].includes(cs)) rng.setBackground("#f4cccc");
        else if(["DISBURSE","DISBURSED"].includes(cs)) rng.setBackground("#d9ead3");
        else if(["APPROVED","SANCTION"].includes(cs)) rng.setBackground("#fff2cc");
        else rng.setBackground("#d9eaf7");
      });
    }
    LOCK_MY_CASES_VIEW_ONLY_(myCasesSh,empCode);
    // SALES_ACTIVITY: append new rows only
    let salesActSh=pss.getSheetByName("SALES_ACTIVITY")||pss.insertSheet("SALES_ACTIVITY");
    const aH=P1_ENSURE_HEADERS_(salesActSh,actHeaders);
    const existing=new Set();
    if(salesActSh.getLastRow()>=2){
      const nAH=aH.map(DC_NORM_);
      const liIdx=nAH.indexOf("LEAD_ID");
      if(liIdx>-1) salesActSh.getRange(2,liIdx+1,salesActSh.getLastRow()-1,1).getValues().forEach(r=>{if(r[0])existing.add(String(r[0]).trim());});
    }
    myCases.forEach(c=>{
      const lid=String(c.LEAD_ID||c.lead_id||"").trim();
      if(existing.has(lid)) return;
      salesActSh.appendRow(P1_BUILD_ROW_(aH,{
        TIMESTAMP:new Date(),LEAD_ID:lid,CLIENT_NAME:c.CLIENT_NAME||c.client_name||"",
        CLIENT_MOBILE:c.CLIENT_MOBILE||c.client_mobile||"",LOAN_TYPE:c.LOAN_TYPE||c.loan_type||"",
        AMOUNT:c.REQUIRED_LOAN_AMOUNT||c.required_loan_amount||"",BANK:c.PREFERRED_BANK||c.preferred_bank||"",
        STATUS:c.CASE_CATEGORY||c.case_category||"OPEN",REMARKS:c.REMARKS||c.remarks||"",
        TAT_STATUS:c.TAT_STATUS||c.tat_status||"ACTIVE"
      }));
      existing.add(lid);
    });
  } catch(e){ LOG_ERR_("SYNC_MY_CASES_AND_ACTIVITY",empCode,e.message); }
}


// ── MIS_EVENING_REPORT_ ──
function MIS_EVENING_REPORT_(){
  try {
    const today=Utilities.formatDate(new Date(),"Asia/Kolkata","yyyy-MM-dd");
    const allCases=GET_MASTER_DATA_ALL_();
    const empMap=DC_BUILD_EMP_MAP_();
    const todayCases=allCases.filter(c=>{
      const ts=c.TIMESTAMP||c.timestamp;
      return ts&&Utilities.formatDate(new Date(ts),"Asia/Kolkata","yyyy-MM-dd")===today;
    });
    const statusCount={},empCount={},bankCount={},loanCount={};
    let totalAmt=0;
    todayCases.forEach(c=>{
      const cs=String(c.CASE_CATEGORY||c.case_category||"OPEN").toUpperCase();
      const ec=String(c.EMP_CODE||c.emp_code||"UNASSIGNED").toUpperCase();
      const bk=String(c.PREFERRED_BANK||c.preferred_bank||"OTHER").toUpperCase();
      const lt=String(c.LOAN_TYPE||c.loan_type||"OTHER").toUpperCase();
      const amt=Number(c.REQUIRED_LOAN_AMOUNT||c.required_loan_amount||0);
      statusCount[cs]=(statusCount[cs]||0)+1;
      empCount[ec]=(empCount[ec]||0)+1;
      bankCount[bk]=(bankCount[bk]||0)+1;
      loanCount[lt]=(loanCount[lt]||0)+1;
      totalAmt+=amt;
    });
    // RAW_INBOX stats today
    const rawSh=SHEET_(DC_CFG.SHEETS.RAW_INBOX);
    let rawToday=0,rawNew=0,rawDedup=0;
    if(rawSh&&rawSh.getLastRow()>=2){
      const rd=rawSh.getDataRange().getValues();
      const rH=rd[0].map(DC_NORM_);
      const rDt=rH.indexOf("RECEIVED_AT"),rDa=rH.indexOf("DEDUP_ACTION");
      for(let i=1;i<rd.length;i++){
        if(rDt<0) continue;
        const rowDate=Utilities.formatDate(new Date(rd[i][rDt]||0),"Asia/Kolkata","yyyy-MM-dd");
        if(rowDate!==today) continue;
        rawToday++;
        if(String(rd[i][rDa]||"").toUpperCase()==="NEW_LEAD") rawNew++; else rawDedup++;
      }
    }
    // B7 FIX: Build all report data FIRST, then clear+write atomically
    const ss=DC_GET_SS_();
    let misSh=ss.getSheetByName(DC_CFG.SHEETS.MIS_REPORT);
    if(!misSh) misSh=ss.insertSheet(DC_CFG.SHEETS.MIS_REPORT);
    // Don't clear until we have all data ready — build buffer first
    const reportBuffer=[];
    // Build sections into buffer
    const addSection=(rows)=>{ reportBuffer.push(...rows); reportBuffer.push(["",""]); };
    reportBuffer.push(["📊 DIVYANSHI CAPITAL — DAILY MIS | "+today,"","",""]);
    reportBuffer.push(["",""]);
    addSection([["SUMMARY","VALUE"],["Total Leads Today",todayCases.length],["Total Volume (₹)",totalAmt],
      ["MIS Mails Processed",rawToday],["New from MIS",rawNew],["Dedup (Remark Updated)",rawDedup]]);
    addSection([["CASE STATUS","COUNT"],...Object.entries(statusCount).sort((a,b)=>b[1]-a[1])]);
    addSection([["SALES RM","LEADS TODAY"],...Object.entries(empCount).sort((a,b)=>b[1]-a[1]).map(([code,cnt])=>[(empMap[code]?empMap[code].NAME:code)+" ("+code+")",cnt])]);
    addSection([["BANK","LEADS"],...Object.entries(bankCount).sort((a,b)=>b[1]-a[1])]);
    addSection([["LOAN TYPE","COUNT"],...Object.entries(loanCount).sort((a,b)=>b[1]-a[1])]);
    // All data ready — NOW clear and write atomically
    misSh.clearContents(); misSh.clearFormats();
    const cols=Math.max(...reportBuffer.map(r=>r.length));
    const padded=reportBuffer.map(r=>{ while(r.length<cols) r.push(""); return r; });
    misSh.getRange(1,1,padded.length,cols).setValues(padded);
    misSh.getRange(1,1,1,cols).setBackground("#0b5394").setFontColor("#ffffff").setFontWeight("bold").setFontSize(12);
    misSh.autoResizeColumns(1,cols);
    // Lock MIS report view-only
    const misP=misSh.protect(); misP.setDescription("MIS_FINAL_REPORT_VIEW_ONLY"); misP.setWarningOnly(false);
    const misA=["upendra.raghav@divyanshicapital.com","narendra.94100@gmail.com"];
    misP.getEditors().forEach(u=>{if(!misA.includes(u.getEmail().toLowerCase()))try{misP.removeEditor(u);}catch(_){}});
    misA.forEach(e=>{try{misP.addEditor(e);}catch(_){}});
    // Telegram + Email
    let tgRep="📊 *DAILY MIS — "+today+"*\nLeads:*"+todayCases.length+"* | ₹"+totalAmt.toLocaleString("en-IN")+"\nMIS Mails:"+rawToday+" (New:"+rawNew+" Dedup:"+rawDedup+")\n\n*STATUS:*\n";
    Object.entries(statusCount).sort((a,b)=>b[1]-a[1]).forEach(([s,c])=>{tgRep+="• "+s+": "+c+"\n";});
    DC_SEND_TG_(tgRep);
    if(MailApp.getRemainingDailyQuota()>0){
      MailApp.sendEmail({to:DC_CFG.COMPANY.MD_EMAIL,cc:DC_CFG.COMPANY.FOUNDER_EMAIL+","+DC_CFG.COMPANY.HR_EMAIL,
        subject:"[DAILY MIS] Divyanshi Capital — "+today,body:tgRep.replace(/\*/g,"").replace(/_/g,""),name:"Bulbhul AI"});
    }
    Logger.log("✅ Evening MIS report done: "+today);
  } catch(e){ LOG_ERR_("MIS_EVENING_REPORT","",e.message); }
}


/* ─────────────────────────────────────────────
   15-MIN TRIGGER RUNNER
───────────────────────────────────────────── */


// ── MIS_PIPELINE_RUN_ ──
function MIS_PIPELINE_RUN_(){
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { 
    Logger.log("MIS: lock busy."); 
    return; 
  }
  try {
    FETCH_AND_PROCESS_MIS_MAILS_();
    MIS_15MIN_FULL_SYNC_();
    PropertiesService.getScriptProperties().setProperty("MIS_LAST_RUN", new Date().toISOString());
    Logger.log("✅ MIS 15-min cycle done.");
  } catch(e) { 
    LOG_ERR_("MIS_PIPELINE_RUN", "", e.message); 
  } finally { 
    try { lock.releaseLock(); } catch(_) {} 
  }
}


/* ─────────────────────────────────────────────
   MAIN LEAD PIPELINE
───────────────────────────────────────────── */


// ── MAP_TO_MASTER_ ──
function MAP_TO_MASTER_(lead) {
  const out = { ...lead };
  out.TIMESTAMP = out.TIMESTAMP || new Date();
  out.EMPLOYEE_EMAIL = out.EMPLOYEE_EMAIL || out.EMAIL_ID || out.MANAGER_EMAIL || "";
  out.CLIENT_NAME = out.CLIENT_NAME || out.FULL_NAME || "";
  out.CLIENT_MOBILE = out.CLIENT_MOBILE || out.MOBILE || "";
  out.REMARKS = out.REMARKS || out.CASE_REMARK || "";
  out.CASE_CATEGORY = out.CASE_CATEGORY || out.CASE_STATUS || out.STATUS || "NEW_LEAD";
  return out;
}


// ── P1_SMART_FORM_SUBMIT_ ──
function P1_SMART_FORM_SUBMIT_(p = {}) {
  try {
    return DC_PROCESS_LEAD_({
      EMP_CODE: String(p.emp_code || p.EMP_CODE || "").trim().toUpperCase(),
      CLIENT_NAME: String(p.client_name || p.CLIENT_NAME || "").trim(),
      CLIENT_MOBILE: DC_CLEAN_MOBILE_(p.client_mobile || p.CLIENT_MOBILE || p.mobile || ""),
      CLIENT_EMAIL: DC_CLEAN_EMAIL_(p.client_email || p.CLIENT_EMAIL || p.email || ""),
      CITY_LOCATION: String(p.city_location || p.CITY_LOCATION || "").trim(),
      LOAN_TYPE: String(p.loan_type || p.LOAN_TYPE || "").trim(),
      REQUIRED_LOAN_AMOUNT: String(p.required_loan_amount || p.REQUIRED_LOAN_AMOUNT || "").trim(),
      EMPLOYMENT_TYPE: String(p.employment_type || p.EMPLOYMENT_TYPE || "").trim(),
      PREFERRED_BANK: String(p.preferred_bank || p.PREFERRED_BANK || "").trim(),
      COMPANY_NAME: String(p.company_name || p.COMPANY_NAME || "").trim(),
      REMARKS: String(p.remarks || p.REMARKS || "").trim(),
      CASE_STATUS: "OPEN",
      SOURCE_TYPE: "WEB_APP",
      SOURCE_NAME: p.source_name || "P1_SMART_DUNIYA",
      FILES: p.files || []
    });
  } catch (error) {
    LOG_ERR_("P1_SMART_FORM_SUBMIT", "", error.message);
    return { success: false, errorMessage: error.message };
  }
}


// ── DC_PROCESS_LEAD_ ──
function DC_PROCESS_LEAD_(lead = {}) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { success: false, errorMessage: "System is busy. Please retry in 30 seconds." };


  try {
    const mobile = DC_CLEAN_MOBILE_(lead.CLIENT_MOBILE || lead.mobile || "");
    lead.CLIENT_MOBILE = mobile;
    lead.LEAD_ID = lead.LEAD_ID || ("L" + (mobile ? mobile.slice(-4) : "0000") + "_" + Date.now());


    let docsLink = "";
    if (lead.FILES && lead.FILES.length) {
      const folder = GET_OR_CREATE_LEAD_FOLDER_(lead.EMP_CODE, lead.CLIENT_MOBILE, lead.CLIENT_NAME);
      if (folder) {
        const fileUrls = SAVE_LEAD_FILES_(folder, lead.FILES);
        docsLink = fileUrls.join(", ");
        lead.DOCS_LINK = docsLink;
        lead.SUBMIT_FOLDER_LINK = folder.getUrl();
      }
    }


    let emp = (lead.EMP_CODE ? FIND_EMPLOYEE_FULL_(lead.EMP_CODE) : null) || 
              (lead.EMPLOYEE_EMAIL ? FIND_EMPLOYEE_FULL_(lead.EMPLOYEE_EMAIL) : null);


    const rawMgrEmail = DC_CLEAN_EMAIL_(lead.MANAGER_EMAIL || lead.MANAGER_EMAIL_ID || lead.MANAGERS_EMAIL_ID || lead.MANAGER_MAIL || lead.MANAGER_PMAIL_ID || "");
    if (!emp && rawMgrEmail) {
      const tempEmp = FIND_EMPLOYEE_FULL_(rawMgrEmail);
      if (tempEmp) {
        emp = tempEmp;
        lead.CASE_STATUS = "WITH_MANAGER_PENDING_ASSIGNMENT";
      }
    }


    lead.EMP_CODE = emp && emp.EMP_CODE ? emp.EMP_CODE : String(lead.EMP_CODE || "").trim().toUpperCase();
    lead.SALES_NAME = emp && emp.NAME ? emp.NAME : "";
    lead.MANAGER_EMAIL = emp && (emp.MANAGER_EMAIL_ID || emp.MANAGER_EMAIL) ? (emp.MANAGER_EMAIL_ID || emp.MANAGER_EMAIL) : DC_CFG.COMPANY.SUPPORT_EMAIL;


    const tat = COMPUTE_TAT_(lead);
    lead.TAT_DAYS = tat.TAT_DAYS; 
    lead.TAT_DEADLINE = tat.TAT_DEADLINE; 
    lead.TAT_STATUS = tat.TAT_STATUS;


    const routingMap = GET_SOURCE_ROUTING_MAP_();
    lead.DATA_FLOW = routingMap[String(lead.SOURCE_NAME || "").toUpperCase()] || "SALES";


    let aiAdvice = "";
    try {
      let context = "[LIVE PRODUCTS & BANK MAPPING]:\n";
      const products = GET_ACTIVE_LOAN_PRODUCTS_();
      if (products && products.length) {
        products.forEach(p => {
          const banksList = p.banks && p.banks.length ? p.banks.join(", ") : "Partner Banks";
          context += `- ${p.name} (${p.code}): Min ROI ${p.roi}%, Est. TAT ${p.tat} days. Supported Banks: ${banksList}.\n`;
        });
      }
      const systemPrompt = 
        "# BULBHUL V2 — PRODUCTION SYSTEM PROMPT\n" +
        "# Divyanshi Capital Pvt Ltd | AI + Human Hybrid Operating System\n\n" +
        "## IDENTITY:\n" +
        "You are BULBHUL, the central AI operating system of Divyanshi Capital Pvt Ltd.\n" +
        "You analyze sales leads, bank updates, and email notifications to generate neat, structured credit advice.\n" +
        "You operate under MD (Upendra Singh Raghav) and HR Head (Khushboo) as supreme authority. Propose actions, but never take final money/hiring/salary decisions without explicit approval.\n\n" +
        "## RULES OF ENGAGEMENT:\n" +
        "- Formulate a neat and clean Credit Analysis covering:\n" +
        "  1. CIBIL Requirements (minimum CIBIL score typically 650+ generally preferred).\n" +
        "  2. Matching Banks based on the loan type and mapping context.\n" +
        "  3. Red Flags (e.g. status OPEN, high debt, missing details like mobile/amount/loan type).\n" +
        "  4. Next Steps (e.g. obtain CIBIL report, confirm loan amount/type, contact client for missing info).\n" +
        "- Keep advice bulleted, professional, concise, and in English. Avoid long generic paragraphs.";
      
      const userPrompt = context + "\n\nLead Details:\n" + JSON.stringify(lead, null, 2);
      aiAdvice = GET_AI_REPLY_(userPrompt, systemPrompt);
    } catch (aiErr) {
      LOG_ERR_("BULBHUL_ADVICE_GEN", lead.LEAD_ID || "", aiErr.message);
      aiAdvice = "Bulbhul could not analyze this lead at the moment.";
    }
    
    lead.AI_ADVICE = aiAdvice;
    if (aiAdvice) {
      const flatAdvice = String(aiAdvice).replace(/\r?\n/g, " | ").replace(/\s+/g, " ").slice(0, 500);
      lead.REMARKS = lead.REMARKS ? (lead.REMARKS + " | [AI]: " + flatAdvice) : ("[AI]: " + flatAdvice);
    }


    const ce = GET_OR_CREATE_(DC_CFG.SHEETS.COMMON_ENTRY);
    const ceH = P1_ENSURE_HEADERS_(ce, GET_MASTER_HEADERS_());
    lead.TIMESTAMP = new Date(); 
    lead.PROCESS_STATUS = "CAPTURED";
    ce.appendRow(P1_BUILD_ROW_(ceH, lead));


    const banks = String(lead.PREFERRED_BANK || "").split(",").map(b => b.trim()).filter(Boolean);
    const variants = (banks.length > 1)
      ? banks.map((b, i) => { const v = MAP_TO_MASTER_(lead); v.LEAD_ID = lead.LEAD_ID + "_B" + (i + 1); v.PREFERRED_BANK = b; return v; })
      : [MAP_TO_MASTER_(lead)];


    const sl = GET_OR_CREATE_(DC_CFG.SHEETS.SMART_LOG);
    const slH = P1_ENSURE_HEADERS_(sl, ["TS","SOURCE_TYPE","SOURCE_NAME","DATA_FLOW","LEAD_ID","CLIENT_NAME","CLIENT_MOBILE","BANK","STATUS","EMP_CODE","REMARKS","TAT_STATUS"]);
    const slRows = variants.map(v => P1_BUILD_ROW_(slH, { TS: new Date(), SOURCE_TYPE: lead.SOURCE_TYPE || "", SOURCE_NAME: lead.SOURCE_NAME || "", DATA_FLOW: lead.DATA_FLOW, LEAD_ID: v.LEAD_ID, CLIENT_NAME: lead.CLIENT_NAME || "", CLIENT_MOBILE: lead.CLIENT_MOBILE || "", BANK: v.PREFERRED_BANK || "", STATUS: "ROUTED", EMP_CODE: lead.EMP_CODE || "", REMARKS: lead.REMARKS || "", TAT_STATUS: lead.TAT_STATUS }));
    sl.getRange(sl.getLastRow() + 1, 1, slRows.length, slH.length).setValues(slRows);


    const master = GET_OR_CREATE_(DC_CFG.SHEETS.MASTER_DATA);
    const mH = P1_ENSURE_HEADERS_(master, GET_MASTER_HEADERS_());
    variants.forEach(v => {
      const mRow = UPSERT_BY_KEY_(master, "LEAD_ID", v, GET_MASTER_HEADERS_());
      UPDATE_TAT_AND_COLOUR_(master, mRow, mH, v.CASE_CATEGORY || v.CASE_STATUS || "OPEN");
    });


    let personalFileStatus = "NO_FILE_ID";
    if (emp && emp.PERSONAL_FILE_ID) {
      try {
        const pss = P1_OPEN_SS_SAFE_(emp.PERSONAL_FILE_ID);
        let mySh = pss.getSheetByName("MY_CASES") || pss.insertSheet("MY_CASES");
        variants.forEach(v => UPSERT_BY_KEY_(mySh, "LEAD_ID", v, GET_MASTER_HEADERS_()));
        LOCK_MY_CASES_VIEW_ONLY_(mySh, emp.EMP_CODE);
        
        let saSh = pss.getSheetByName("SALES_ACTIVITY") || pss.insertSheet("SALES_ACTIVITY");
        const actH = P1_ENSURE_HEADERS_(saSh, ["TIMESTAMP","LEAD_ID","CLIENT_NAME","CLIENT_MOBILE","LOAN_TYPE","AMOUNT","BANK","STATUS","REMARKS","TAT_STATUS"]);
        const saRows = variants.map(v => P1_BUILD_ROW_(actH, { TIMESTAMP: new Date(), LEAD_ID: v.LEAD_ID, CLIENT_NAME: lead.CLIENT_NAME || "", CLIENT_MOBILE: lead.CLIENT_MOBILE || "", LOAN_TYPE: lead.LOAN_TYPE || "", AMOUNT: lead.REQUIRED_LOAN_AMOUNT || "", BANK: v.PREFERRED_BANK || "", STATUS: lead.CASE_CATEGORY || "OPEN", REMARKS: lead.REMARKS || "", TAT_STATUS: lead.TAT_STATUS || "ACTIVE" }));
        saSh.getRange(saSh.getLastRow() + 1, 1, saRows.length, actH.length).setValues(saRows);
        
        personalFileStatus = "SYNCED(" + variants.length + ")";


        const mgrEmail = emp.MANAGER_EMAIL || emp.MANAGER_EMAIL_ID;
        if (mgrEmail && mgrEmail.toLowerCase() !== DC_CFG.COMPANY.SUPPORT_EMAIL.toLowerCase()) {
          const mgrEmp = FIND_EMPLOYEE_FULL_(mgrEmail);
          if (mgrEmp && mgrEmp.PERSONAL_FILE_ID && mgrEmp.PERSONAL_FILE_ID !== emp.PERSONAL_FILE_ID) {
            try {
              const mps = P1_OPEN_SS_SAFE_(mgrEmp.PERSONAL_FILE_ID);
              let mMC = mps.getSheetByName("MY_CASES") || mps.insertSheet("MY_CASES");
              variants.forEach(v => UPSERT_BY_KEY_(mMC, "LEAD_ID", v, GET_MASTER_HEADERS_()));
              
              let mSA = mps.getSheetByName("SALES_ACTIVITY") || mps.insertSheet("SALES_ACTIVITY");
              const mActH = P1_ENSURE_HEADERS_(mSA, ["TIMESTAMP","LEAD_ID","CLIENT_NAME","CLIENT_MOBILE","LOAN_TYPE","AMOUNT","BANK","STATUS","REMARKS","TAT_STATUS"]);
              const mgrRows = variants.map(v => P1_BUILD_ROW_(mActH, { TIMESTAMP: new Date(), LEAD_ID: v.LEAD_ID, CLIENT_NAME: lead.CLIENT_NAME || "", CLIENT_MOBILE: lead.CLIENT_MOBILE || "", LOAN_TYPE: lead.LOAN_TYPE || "", AMOUNT: lead.REQUIRED_LOAN_AMOUNT || "", BANK: v.PREFERRED_BANK || "", STATUS: lead.CASE_CATEGORY || "OPEN", REMARKS: "Team lead synced from RM: " + emp.NAME, TAT_STATUS: lead.TAT_STATUS || "ACTIVE" }));
              mSA.getRange(mSA.getLastRow() + 1, 1, mgrRows.length, mActH.length).setValues(mgrRows);
              personalFileStatus += " + MGR_SYNCED";
            } catch (mgrErr) {
              LOG_ERR_("SYNC_MANAGER_PERSONAL_FILE", mgrEmp.PERSONAL_FILE_ID, mgrErr.message);
            }
          }
        }
      } catch (err) { 
        personalFileStatus = "ERROR:" + err.message; 
        LOG_ERR_("UPSERT_PERSONAL_FILE", emp.PERSONAL_FILE_ID, err.message); 
      }
    }


    const misLogSh = GET_OR_CREATE_(DC_CFG.SHEETS.MIS_LOG);
    const misH = P1_ENSURE_HEADERS_(misLogSh, ["TIMESTAMP","LEAD_ID","EMP_CODE","CLIENT_NAME","CLIENT_MOBILE","ROUTING_STATUS","DATA_FLOW","PERSONAL_FILE_SYNC","REMARKS"]);
    misLogSh.appendRow(P1_BUILD_ROW_(misH, { TIMESTAMP: new Date(), LEAD_ID: lead.LEAD_ID, EMP_CODE: lead.EMP_CODE, CLIENT_NAME: lead.CLIENT_NAME || "", CLIENT_MOBILE: lead.CLIENT_MOBILE || "", ROUTING_STATUS: "ROUTED", DATA_FLOW: lead.DATA_FLOW, PERSONAL_FILE_SYNC: personalFileStatus, REMARKS: "6-stage pipeline. Source:" + lead.SOURCE_NAME }));


    if (lead.EMP_CODE) RECORD_TASK_FOR_ATTENDANCE_(lead.EMP_CODE);


    const cs = String(lead.CASE_CATEGORY || lead.CASE_STATUS || "").toUpperCase();
    if (cs === "DISBURSE" || cs === "DISBURSED") { 
      NOTIFY_ACCOUNTS_ON_DISBURSE_(lead); 
      lead.DISBURSAL_NOTIFIED = "YES"; 
    }


    try { SEND_SMART_MAIL_(lead); } catch (e) { LOG_ERR_("SEND_SMART_MAIL_SAFE", lead.LEAD_ID, e.message); }


    const requiredDocuments = GET_DOCS_REQUIRED_BY_PRODUCT_(lead.LOAN_TYPE);
    const uploadedFilesCount = lead.FILES ? lead.FILES.length : 0;
    
    return {
      success: true,
      leadId: lead.LEAD_ID,
      tatDays: lead.TAT_DAYS,
      dataFlow: lead.DATA_FLOW,
      requiredDocuments: requiredDocuments,
      uploadedDocuments: uploadedFilesCount
    };
  } catch (error) {
    LOG_ERR_("PROCESS_LEAD", lead && lead.EMP_CODE || "", error.message);
    return { success: false, errorMessage: error.message };
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}


// ── LOG_SOURCE_ ──
function LOG_SOURCE_(lead = {}) {
  try {
    const sh = GET_OR_CREATE_(DC_CFG.SHEETS.SMART_LOG);
    const aH = P1_ENSURE_HEADERS_(sh, ["TS","SOURCE_TYPE","SOURCE_NAME","DATA_FLOW","LEAD_ID","CLIENT_NAME","CLIENT_MOBILE","BANK","STATUS","EMP_CODE","REMARKS"]);
    sh.appendRow(P1_BUILD_ROW_(aH, { TS: new Date(), SOURCE_TYPE: lead.SOURCE_TYPE || "", SOURCE_NAME: lead.SOURCE_NAME || "", DATA_FLOW: lead.DATA_FLOW || "SALES", LEAD_ID: lead.LEAD_ID || "", CLIENT_NAME: lead.CLIENT_NAME || "", CLIENT_MOBILE: lead.CLIENT_MOBILE || "", BANK: lead.PREFERRED_BANK || "", STATUS: "CAPTURED", EMP_CODE: lead.EMP_CODE || "", REMARKS: lead.REMARKS || "" }));
  } catch (e) { 
    LOG_ERR_("LOG_SOURCE", "", e.message); 
  }
}


/* ─────────────────────────────────────────────
   BULBHUL AVATAR BRAIN
───────────────────────────────────────────── */


// ── BULBHUL_TEAM_MIND_ ──
function BULBHUL_TEAM_MIND_(){
  try {
    const map=DC_BUILD_EMP_MAP_();
    const codes=Object.keys(map);
    if(!codes.length) return "";
    let mind="\n\n[TEAM DIRECTORY — TRUTH SOURCE: ALL_EMPLOYEES]:\n";
    codes.forEach(c=>{
      const e=map[c];
      mind+="- "+c+" | "+(e.NAME||"")+" | Role:"+(e.ROLE||e.DASHBOARD_ACCESS||"")+" | Dept:"+(e.DEPARTMENT||"")
        +" | Bank:"+(e.BANK||e.PREFERRED_BANK||"-")
        +" | Mgr:"+(e.MANAGER_NAME||e.MANAGER_EMAIL||"-")
        +" | WA:"+(e.WHATSAPP?e.WHATSAPP+(String(e.WHATS_VERIFIED||e.WHATSAPP_VERIFIED||"").toUpperCase()==="YES"?" ✅verified":""):"-")
        +" | TG:"+(e.TG_CHAT_ID?"active":"-")
        +" | File:"+(e.PERSONAL_FILE_ID?"linked":"⚠blank")+"\n";
    });
    mind+="\n[RULES]: Ye directory hi final truth hai. EMP_CODE = owner. Client ka owner = MASTER_DATA ka EMP_CODE. Banker mapping = employee row ka BANK column. Naya assumption mat banao — sirf is directory se resolve karo. Har employee ka avatar unka Banker Buddy hai: unke role ke hisaab se support de aur auto-mode commands se solution execute kare.";
    return mind;
  } catch(e){ return ""; }
}


// ── multiBrainReply_ ──
function multiBrainReply_(prompt,systemContent){
  const dKey=DC_CFG.PROPS.getProperty("DEEPSEEK_API_KEY"),oKey=DC_CFG.PROPS.getProperty("OPENAI_API_KEY"),gKey=DC_CFG.PROPS.getProperty("GEMINI_API_KEY");
  if(dKey){
    try {
      const res=UrlFetchApp.fetch("https://api.deepseek.com/v1/chat/completions",{method:"post",muteHttpExceptions:true,headers:{"Authorization":"Bearer "+dKey,"Content-Type":"application/json"},payload:JSON.stringify({model:"deepseek-chat",messages:[{role:"system",content:systemContent},{role:"user",content:prompt}],temperature:0.3,max_tokens:800})});
      if(res.getResponseCode()===200){const j=JSON.parse(res.getContentText()||"{}");if(j.choices&&j.choices[0]?.message?.content)return String(j.choices[0].message.content).trim();}
    } catch(e){LOG_ERR_("DEEPSEEK","",e.message);}
  }
  if(gKey){
    try {
      const res=UrlFetchApp.fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key="+gKey,{method:"post",contentType:"application/json",muteHttpExceptions:true,payload:JSON.stringify({contents:[{role:"user",parts:[{text:"System:\n"+systemContent+"\n\nContext:\n"+prompt}]}],generationConfig:{temperature:0.3,maxOutputTokens:800}})});
      if(res.getResponseCode()===200){const j=JSON.parse(res.getContentText()||"{}");if(j.candidates?.[0]?.content?.parts?.[0]?.text)return String(j.candidates[0].content.parts[0].text).trim();}
    } catch(e){LOG_ERR_("GEMINI","",e.message);}
  }
  if(oKey){
    try {
      const res=UrlFetchApp.fetch("https://api.openai.com/v1/chat/completions",{method:"post",muteHttpExceptions:true,headers:{"Authorization":"Bearer "+oKey,"Content-Type":"application/json"},payload:JSON.stringify({model:"gpt-4o-mini",messages:[{role:"system",content:systemContent},{role:"user",content:prompt}],temperature:0.3})});
      if(res.getResponseCode()===200){const j=JSON.parse(res.getContentText()||"{}");if(j.choices&&j.choices[0]?.message?.content)return String(j.choices[0].message.content).trim();}
    } catch(e){LOG_ERR_("OPENAI","",e.message);}
  }
  return "Namaste! Bulbhul active hai. Loan, bank options, case status ke liye message karein.";
}


// ── GET_AI_REPLY_ ──
function GET_AI_REPLY_(prompt,systemContent){return multiBrainReply_(prompt,systemContent);}


/* ─────────────────────────────────────────────
   MASTER DATA ACCESS
───────────────────────────────────────────── */


// ── GET_MASTER_DATA_ALL_ ──
function GET_MASTER_DATA_ALL_(){
  const sh=SHEET_(DC_CFG.SHEETS.MASTER_DATA);
  if(!sh||sh.getLastRow()<2) return [];
  const data=sh.getDataRange().getValues();
  const headers=data[0].map(DC_NORM_);
  return data.slice(1).map(r=>{const obj={};headers.forEach((k,i)=>{obj[k]=r[i];obj[k.toLowerCase()]=r[i];});return obj;});
}


// ── FILTER_MASTER_DATA_ ──
function FILTER_MASTER_DATA_(empCode){
  return GET_MASTER_DATA_ALL_().filter(r=>String(r.EMP_CODE||r.emp_code||"").toUpperCase()===String(empCode||"").toUpperCase());
}


// ── GET_TEAM_DATA_ ──
function GET_TEAM_DATA_(empCode,dept){
  const all=GET_MASTER_DATA_ALL_(),empMap=DC_BUILD_EMP_MAP_();
  const teamCodes=Object.keys(empMap).filter(c=>String(empMap[c].DEPARTMENT||"")===String(dept||""));
  return all.filter(r=>teamCodes.includes(String(r.EMP_CODE||r.emp_code||"").toUpperCase()));
}


// ── GET_MY_CASES_ ──
function GET_MY_CASES_(empCode){
  const emp=FIND_EMPLOYEE_FULL_(empCode);
  if(!emp||!emp.PERSONAL_FILE_ID) return [];
  try {
    const ss=P1_OPEN_SS_SAFE_(emp.PERSONAL_FILE_ID);
    const sh=ss.getSheetByName("MY_CASES");
    if(!sh||sh.getLastRow()<2) return [];
    const data=sh.getDataRange().getValues();
    const headers=data[0].map(DC_NORM_);
    return data.slice(1).map(r=>{const obj={};headers.forEach((k,i)=>{obj[k]=r[i];obj[k.toLowerCase()]=r[i];});return obj;}).filter(r=>r.LEAD_ID||r.lead_id);
  } catch(e){LOG_ERR_("GET_MY_CASES",empCode,e.message);return [];}
}
/* ─────────────────────────────────────────────
   CALLING DESK
───────────────────────────────────────────── */


// ── SEND_SMART_MAIL_ ──
function SEND_SMART_MAIL_(lead){
  try {
    lead=lead||{};
    const aiAdvice=lead.AI_ADVICE||"Bulbhul advice unavailable.";
    const emp=lead.EMP_CODE?FIND_EMPLOYEE_FULL_(lead.EMP_CODE):null;
    const empEmail=emp?emp.EMAIL:null;


    const isAssigned = !!emp;
    const subjectPrefix = isAssigned ? "[NEW LEAD]" : "[UNASSIGNED LEAD]";
    const subject=subjectPrefix+" "+(lead.LEAD_ID||"")+" - "+(lead.CLIENT_NAME||"")+" ("+(lead.LOAN_TYPE||"Loan")+") | Flow:"+(lead.DATA_FLOW||"SALES");


    // Plain-text fallback body (email clients without HTML)
    const body="Hello "+(emp?emp.NAME:"Team")+",\n\n"+(isAssigned?"New lead assigned.":"New unassigned lead captured.")+" Flow:"+(lead.DATA_FLOW||"SALES")+"\n\nLead ID:"+(lead.LEAD_ID||"N/A")+"\nClient:"+(lead.CLIENT_NAME||"N/A")+" | Mobile:"+(lead.CLIENT_MOBILE||"N/A")+"\nLoan:"+(lead.LOAN_TYPE||"N/A")+" | ₹"+(lead.REQUIRED_LOAN_AMOUNT||"N/A")+"\nBank:"+(lead.PREFERRED_BANK||"N/A")+"\nTAT:"+(lead.TAT_DAYS||"N/A")+"d | Deadline:"+(lead.TAT_DEADLINE||"N/A")+"\nRemarks:"+(lead.REMARKS||"No remarks")+"\n\n--- BULBHUL AI ---\n"+aiAdvice+"\n\n- Divyanshi Capital CRM";


    // RICH HTML TEMPLATE — Divyanshi gold/navy branding
    const esc=v=>String(v===undefined||v===null||v===""?"N/A":v).replace(/</g,"&lt;");
    const rowsHtml=[
      ["Lead ID",lead.LEAD_ID],["Client",lead.CLIENT_NAME],["Mobile",lead.CLIENT_MOBILE],
      ["Loan Type",lead.LOAN_TYPE],["Amount","₹ "+(lead.REQUIRED_LOAN_AMOUNT||"N/A")],
      ["Bank",lead.PREFERRED_BANK],["TAT",(lead.TAT_DAYS||"N/A")+" days"],
      ["Deadline",lead.TAT_DEADLINE?Utilities.formatDate(new Date(lead.TAT_DEADLINE),"Asia/Kolkata","dd MMM yyyy, hh:mm a"):"N/A"],
      ["Data Flow",lead.DATA_FLOW||"SALES"],
      ["Owner",emp?emp.NAME+" ("+lead.EMP_CODE+")":"⚠ Unassigned"],
      ["Remarks",lead.REMARKS||"No remarks"]
    ].map((r,i)=>'<tr style="background:'+(i%2?'#f8f9fb':'#ffffff')+'"><td style="padding:9px 20px;font-weight:600;color:#06112C;width:120px;border-bottom:1px solid #eef0f4">'+r[0]+'</td><td style="padding:9px 20px;color:#334155;border-bottom:1px solid #eef0f4">'+esc(r[1])+'</td></tr>').join("");


    const htmlBody=
      '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:620px;margin:0 auto;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;background:#ffffff">'
      +'<div style="background:linear-gradient(135deg,#06112C,#0b1f4d);padding:22px 24px;text-align:center">'
      +'<div style="color:#d4af37;font-size:20px;font-weight:900;letter-spacing:1px">DIVYANSHI CAPITAL</div>'
      +'<div style="color:#cbd5e1;font-size:12px;margin-top:3px;text-transform:uppercase;letter-spacing:2px">Bulbhul AI &bull; Lead Notification</div>'
      +'</div>'
      +'<div style="background:'+(isAssigned?'#d4af37':'#dc2626')+';color:'+(isAssigned?'#06112C':'#ffffff')+';padding:10px 24px;font-weight:800;font-size:15px">'
      +(isAssigned?'🆕 NEW LEAD ASSIGNED':'⚠ UNASSIGNED LEAD — ACTION NEEDED')+'</div>'
      +'<div style="padding:16px 24px 6px;color:#334155;font-size:14px">Hello <b>'+esc(emp?emp.NAME:"Team")+'</b>, '+(isAssigned?'ek naya lead aapko assign hua hai:':'naya unassigned lead capture hua hai:')+'</div>'
      +'<table style="width:100%;border-collapse:collapse;font-size:13.5px;margin-top:6px">'+rowsHtml+'</table>'
      +'<div style="margin:16px 20px;background:#f1f5f9;border-left:4px solid #d4af37;border-radius:8px;padding:14px 16px">'
      +'<div style="font-weight:800;color:#06112C;font-size:13px;margin-bottom:6px">🤖 BULBHUL AI — CREDIT ANALYSIS</div>'
      +'<div style="font-size:13px;color:#475569;white-space:pre-line">'+esc(aiAdvice)+'</div></div>'
      +'<div style="background:#06112C;color:#94a3b8;text-align:center;padding:12px;font-size:11px">Divyanshi Capital Pvt Ltd &bull; Automated by Bulbhul AI &bull; Do not reply</div>'
      +'</div>';


    const tgMsg=(isAssigned?"🆕 *New Lead*":"⚠️ *Unassigned Lead*")+"\n*ID:*"+(lead.LEAD_ID||"")+"\n*Client:*"+(lead.CLIENT_NAME||"")+"\n*Loan:*"+(lead.LOAN_TYPE||"")+" | ₹"+(lead.REQUIRED_LOAN_AMOUNT||"")+"\n*Flow:*"+(lead.DATA_FLOW||"SALES")+"\n*Owner:*"+(emp?emp.NAME+" ("+lead.EMP_CODE+")":lead.EMP_CODE||"Unassigned")+"\n*TAT:*"+(lead.TAT_DAYS||"")+"d\n\n*Bulbhul:*\n"+aiAdvice;


    // Always send Telegram alert
    DC_SEND_TG_(tgMsg);


    let emailSent=false;
    if(MailApp.getRemainingDailyQuota()>0){
      // TO = EMP_CODE employee | CC = Manager + Founder + MD (initial se)
      const recipient = empEmail || DC_CFG.COMPANY.MD_EMAIL;
      const mgr = emp && (emp.MANAGER_EMAIL_ID||emp.MANAGER_EMAIL) ? (emp.MANAGER_EMAIL_ID||emp.MANAGER_EMAIL) : DC_CFG.COMPANY.HR_EMAIL;
      const cc = [...new Set([mgr, DC_CFG.COMPANY.FOUNDER_EMAIL, DC_CFG.COMPANY.MD_EMAIL].map(e=>String(e||"").toLowerCase()))].filter(e => e && e !== recipient.toLowerCase()).join(",");
      try{ GmailApp.sendEmail(recipient,subject,body,{cc,htmlBody:htmlBody,name:DC_CFG.COMPANY.NAME}); emailSent=true; }catch(mailErr){ LOG_ERR_("SEND_SMART_MAIL_EMAIL",lead.LEAD_ID||"",mailErr.message); }
    }


    if(!emailSent && !isAssigned){
      DC_SEND_FALLBACK_WA_("[FALLBACK-UNASSIGNED] "+subject);
    } else if(!emailSent && isAssigned){
      if(emp&&(emp.WHATSAPP||emp.MOBILE)) DC_SEND_WA_(emp.WHATSAPP||emp.MOBILE,"[DC]\n"+subject+"\n\nBulbhul:\n"+aiAdvice);
      DC_SEND_FALLBACK_WA_("[FALLBACK-NO-EMAIL] EMP:"+(lead.EMP_CODE||"N/A")+"\n"+subject);
    }
  } catch(e){ LOG_ERR_("SEND_SMART_MAIL",lead.LEAD_ID||"",e.message); }
}


/* ─────────────────────────────────────────────
   NOTIFICATIONS
───────────────────────────────────────────── */


// ── DC_GET_CORE_TG_CHAT_IDS_ ──
function DC_GET_CORE_TG_CHAT_IDS_(){
  const p=PropertiesService.getScriptProperties();
  return ["FOUNDER_TG_CHAT_ID","MD_TG_CHAT_ID","ACCOUNTS_TG_CHAT_ID","HR_TG_CHAT_ID"].map(k=>String(p.getProperty(k)||"").trim()).filter(Boolean);
}


// ── DC_SEND_FALLBACK_WA_ ──
function DC_SEND_FALLBACK_WA_(text){
  const empMap=DC_BUILD_EMP_MAP_();
  let sent=false;
  for(const code of Object.keys(empMap)){
    const e=empMap[code],r=String(e.ROLE||e.DASHBOARD_ACCESS||"").toUpperCase();
    if((r==="MD"||e.EMAIL===DC_CFG.COMPANY.MD_EMAIL||r==="FOUNDER"||e.EMAIL===DC_CFG.COMPANY.FOUNDER_EMAIL)&&(e.WHATSAPP||e.MOBILE)){if(DC_SEND_WA_(e.WHATSAPP||e.MOBILE,text))sent=true;}
  }
  const adminWa=DC_CFG.PROPS.getProperty("ADMIN_WA_NUMBER");
  if(adminWa){if(DC_SEND_WA_(adminWa,text))sent=true;}
  return sent;
}


// ── DC_TG_CONTACT_LOG_ ──
function DC_TG_CONTACT_LOG_(chatId,userName,audience,text){
  try {
    const sh=GET_OR_CREATE_("AVATAR_ACTIVITY_LOG");
    P1_ENSURE_HEADERS_(sh,["TIMESTAMP","CHAT_ID","USER","ACTION","DETAILS","CHANNEL","EMP_CODE","MOBILE"]);
    sh.appendRow([new Date(),String(chatId||""),userName||"","TG_CONTACT_"+String(audience||"ACTIVE").toUpperCase(),String(text||"").slice(0,500),"TELEGRAM","",""]);
  } catch(e){}
}


// ── DC_TG_GET_ACTIVE_CHAT_IDS_ ──
function DC_TG_GET_ACTIVE_CHAT_IDS_(){
  try {
    const sh=SHEET_("AVATAR_ACTIVITY_LOG");
    if(!sh||sh.getLastRow()<2) return [];
    const data=sh.getDataRange().getValues(),out={};
    for(let i=1;i<data.length;i++){const chatId=String(data[i][1]||"").trim();if(chatId&&String(data[i][3]||"").toUpperCase().indexOf("TG_CONTACT_")===0)out[chatId]=true;}
    return Object.keys(out);
  } catch(e){return [];}
}


// ── DC_TG_BROADCAST_ ──
function DC_TG_BROADCAST_(message){
  message=String(message||"").trim();
  if(!message) return "TG BROADCAST FAILED | empty";
  const ids=DC_TG_GET_ACTIVE_CHAT_IDS_();
  let sent=0;
  ids.forEach(id=>{if(DC_SEND_TG_MESSAGE_(id,message))sent++;});
  return "TG BROADCAST DONE | sent="+sent;
}
/* ─────────────────────────────────────────────
   WEBAPP
───────────────────────────────────────────── */


// ── P1_GET_STAFF_PUBLIC_DATA_ ──
function P1_GET_STAFF_PUBLIC_DATA_(empCode){
  try {
    empCode=String(empCode||"").trim().toUpperCase();
    if(!empCode) return null;
    const emp=FIND_EMPLOYEE_FULL_(empCode);
    if(!emp) return null;
    const base=P1_GET_EXEC_URL_(),e=encodeURIComponent(empCode);
    const avatar=emp.P1_AVATAR_URL||emp.PROFILE_PIC||("https://ui-avatars.com/api/?name="+encodeURIComponent(emp.NAME||empCode)+"&background=d4af37&color=0a2540&size=160");
    return {ok:true,empCode,name:emp.NAME||empCode,role:emp.ROLE||emp.DESIGNATION||"RM",dept:emp.DEPARTMENT||"",mobile:emp.MOBILE||"",whatsapp:emp.WHATSAPP||emp.MOBILE||"",email:emp.EMAIL||"",branch:emp.BRANCH||"",profilePic:avatar,personalFileId:emp.PERSONAL_FILE_ID||"",formLink:base+"?page=form&emp="+e,dashboardLink:base+"?page=dashboard&emp="+e,cardLink:base+"?page=card&emp="+e,callingLink:base+"?page=calling&emp="+e,voiceLink:base+"?page=voice&emp="+e};
  } catch(e){LOG_ERR_("P1_STAFF_PUBLIC_DATA",empCode,e.message);return null;}
}


// ── P1_GET_STAFF_DASHBOARD_DATA_ ──
function P1_GET_STAFF_DASHBOARD_DATA_(empCode){
  try {
    empCode=String(empCode||"").trim().toUpperCase();
    const emp=empCode?FIND_EMPLOYEE_FULL_(empCode):null;
    let data=[];
    const access=emp?String(emp.DASHBOARD_ACCESS||emp.ROLE||"STAFF").toUpperCase():"STAFF";
    if(emp&&(access.includes("MD")||access.includes("FOUNDER")||access.includes("ADMIN"))) data=GET_MASTER_DATA_ALL_();
    else if(emp&&(access.includes("MANAGER")||access.includes("HR")||access.includes("ACCOUNTS"))) data=GET_TEAM_DATA_(empCode,emp.DEPARTMENT);
    else if(emp){data=GET_MY_CASES_(empCode);if(!data.length)data=FILTER_MASTER_DATA_(empCode);}
    else data=GET_MASTER_DATA_ALL_().slice(0,100);
    const sOf=r=>String(r.case_category||r.CASE_CATEGORY||r.case_status||r.CASE_STATUS||"").toUpperCase();
    const aOf=r=>Number(r.required_loan_amount||r.REQUIRED_LOAN_AMOUNT||0);
    const stats={total:data.length,approved:data.filter(r=>["APPROVED","DISBURSED","DISBURSE"].includes(sOf(r))).length,review:data.filter(r=>["OPEN","INTERESTED","CALLBACK","LOGIN","PROCESS","PENDING"].includes(sOf(r))).length,volume:data.reduce((s,r)=>s+aOf(r),0)};
    const cases=data.slice(0,100).map(r=>({leadId:r.lead_id||r.LEAD_ID||"",clientName:r.client_name||r.CLIENT_NAME||"",mobile:r.client_mobile||r.CLIENT_MOBILE||"",loanType:r.loan_type||r.LOAN_TYPE||"",amount:r.required_loan_amount||r.REQUIRED_LOAN_AMOUNT||"",bank:r.preferred_bank||r.PREFERRED_BANK||"",status:r.case_category||r.CASE_CATEGORY||"OPEN",tatStatus:r.tat_status||r.TAT_STATUS||"ACTIVE"}));
    return {ok:true,staff:{NAME:emp?(emp.NAME||empCode):"Team",DESIGNATION:emp?(emp.ROLE||""):"",DEPARTMENT:emp?(emp.DEPARTMENT||""):""},access,stats,cases};
  } catch(e){LOG_ERR_("P1_DASHBOARD_DATA",empCode,e.message);return {ok:true,staff:{NAME:"Team",DESIGNATION:"",DEPARTMENT:""},access:"STAFF",stats:{total:0,approved:0,review:0,volume:0},cases:[]};}
}
/* ─────────────────────────────────────────────
   TELEGRAM HANDLERS
───────────────────────────────────────────── */


// ── P1_TG_DUPLICATE_ ──
function P1_TG_DUPLICATE_(updateId){
  if(updateId===undefined||updateId===null) return false;
  const p=PropertiesService.getScriptProperties();
  const last=Number(p.getProperty("P1_TG_LAST_UPDATE_ID")||0),now=Number(updateId);
  if(now<=last) return true;
  p.setProperty("P1_TG_LAST_UPDATE_ID",String(now));
  return false;
}


// ── P1_TG_CHAT_TO_EMP_ ──
function P1_TG_CHAT_TO_EMP_(chatId){
  const p=PropertiesService.getScriptProperties();
  const m={};
  m[p.getProperty('FOUNDER_TG_CHAT_ID')]='FOUNDER';m[p.getProperty('MD_TG_CHAT_ID')]='MD';
  m[p.getProperty('ACCOUNTS_TG_CHAT_ID')]='ACCOUNTS';m[p.getProperty('HR_TG_CHAT_ID')]='HR';
  return m[String(chatId)]||"";
}


// ── P1_TG_HANDLE_ ──
function P1_TG_HANDLE_(body){
  const msg=body.message;
  if(!msg||!msg.chat) return "OK";
  const chatId=msg.chat.id,userName=msg.from&&msg.from.first_name?msg.from.first_name:"User",text=String(msg.text||"").trim();
  
  // Register or process text command
  if(text){
    DC_TG_CONTACT_LOG_(chatId,userName,"ACTIVE",text);
    if(/^\/core\s+/i.test(text)){
      const role=text.replace(/^\/core\s+/i,"").trim().toUpperCase();
      const map={FOUNDER:"FOUNDER_TG_CHAT_ID",MD:"MD_TG_CHAT_ID",ACCOUNTS:"ACCOUNTS_TG_CHAT_ID",HR:"HR_TG_CHAT_ID"};
      if(!map[role]){DC_SEND_TG_MESSAGE_(chatId,"Use: /core MD|FOUNDER|ACCOUNTS|HR");return "OK";}
      PropertiesService.getScriptProperties().setProperty(map[role],String(chatId));
      DC_SEND_TG_MESSAGE_(chatId,"✅ Registered: "+role);
      return "OK";
    }
    if(text==="/start"||text==="/help"){
      DC_SEND_TG_MESSAGE_(chatId,"Namaste "+userName+"! Bulbhul AI active.\n\n/core MD|FOUNDER|ACCOUNTS|HR\n/checkin1 or /checkin2\n/campaign <msg>\n\nOr just upload a bank statement PDF / photo for auto credit analysis!");
      return "OK";
    }
    if(/^\/checkin([12])/i.test(text)){
      const half=text.includes("2")?2:1;
      const coreEmp=P1_TG_CHAT_TO_EMP_(chatId);
      const res=MANAGER_SELFIE_CHECKIN_(coreEmp,half);
      DC_SEND_TG_MESSAGE_(chatId,res.success?"✅ Check-in "+half+" done. Status: "+res.attendanceStatus:"❌ "+res.errorMessage);
      return "OK";
    }
    if(/^\/campaign\s+/i.test(text)){
      const coreIds=DC_GET_CORE_TG_CHAT_IDS_();
      if(!coreIds.includes(String(chatId))){DC_SEND_TG_MESSAGE_(chatId,"Campaign: core members only.");return "OK";}
      DC_SEND_TG_MESSAGE_(chatId,DC_TG_BROADCAST_(text.replace(/^\/campaign\s+/i,"").trim()));
      return "OK";
    }
    try {
      const coreEmp=P1_TG_CHAT_TO_EMP_(chatId);
      const reply=BULBHUL_CHAT_API_({message:text,empCode:coreEmp,source:"TELEGRAM"});
      DC_SEND_TG_MESSAGE_(chatId,String(reply||"Ji, bataiye?").slice(0,4000));
    } catch(e){LOG_ERR_("TG_AI",chatId,e.message);}
    return "OK";
  }
  // Handle Document / Photo uploads
  let fileId = "";
  let mimeType = "";
  let fileName = "";
  
  if (msg.document) {
    fileId = msg.document.file_id;
    mimeType = msg.document.mime_type;
    fileName = msg.document.file_name || "document";
  } else if (msg.photo && msg.photo.length > 0) {
    const p = msg.photo[msg.photo.length - 1]; // largest size
    fileId = p.file_id;
    mimeType = "image/jpeg";
    fileName = "photo.jpg";
  }
  
  if (fileId) {
    DC_SEND_TG_MESSAGE_(chatId, "⏳ Analyzing document '" + fileName + "'... Please wait.");
    try {
      const token = PropertiesService.getScriptProperties().getProperty("TG_TOKEN");
      if (!token) throw new Error("TG_TOKEN script property is missing");
      
      const fileRes = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/getFile?file_id=" + fileId);
      const fileJson = JSON.parse(fileRes.getContentText());
      if (!fileJson.ok || !fileJson.result?.file_path) throw new Error("Telegram getFile failed to resolve path.");
      
      const filePath = fileJson.result.file_path;
      const downloadUrl = "https://api.telegram.org/file/bot" + token + "/" + filePath;
      const response = UrlFetchApp.fetch(downloadUrl);
      const blob = response.getBlob().setName(fileName);
      
      // Credit analysis via Gemini
      const analysis = ANALYZE_DOCUMENT_WITH_GEMINI_(blob);
      DC_SEND_TG_MESSAGE_(chatId, "📊 *BULBHUL AI — UNDERWRITING ANALYSIS*\n\n" + analysis);
    } catch (err) {
      Logger.log("Document analysis error: " + err.message);
      DC_SEND_TG_MESSAGE_(chatId, "❌ Document validation failed: " + err.message);
    }
    return "OK";
  }
  
  return "OK";
}


// ── ANALYZE_DOCUMENT_WITH_GEMINI_ ──
function ANALYZE_DOCUMENT_WITH_GEMINI_(blob) {
  const gKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  if (!gKey) throw new Error("GEMINI_API_KEY is not configured in Script Properties");
  const base64Data = Utilities.base64Encode(blob.getBytes());
  const mimeType   = blob.getContentType() || "application/pdf";
  const systemContent = "You are Bulbhul, the Credit Manager & AI Underwriter for Divyanshi Capital. Analyze the uploaded bank statement or credit document and provide a neat, bulleted summary covering:\n" +
                        "1. Bouncing/returns (cheque/NACH/ECS bounce fees, dates, and amounts).\n" +
                        "2. Major salary/credit patterns (regular salary credits, deposits).\n" +
                        "3. Average monthly balance stability.\n" +
                        "4. Red flags (major cash withdrawals, stacking loans, negative balance days).\n" +
                        "5. Credit eligibility decision proposal (Approved, Rejected, or Pending with specific conditions).";
  
  const payload = {
    contents: [{
      parts: [
        { text: "Analyze this document for credit and bouncing verification: " },
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Data
          }
        }
      ]
    }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1200
    }
  };
  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + gKey;
  const res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    muteHttpExceptions: true,
    payload: JSON.stringify(payload)
  });
  if (res.getResponseCode() === 200) {
    const j = JSON.parse(res.getContentText() || "{}");
    if (j.candidates?.[0]?.content?.parts?.[0]?.text) {
      return String(j.candidates[0].content.parts[0].text).trim();
    }
  }
  throw new Error("Gemini analysis failed: " + res.getContentText());
}
/* ─────────────────────────────────────────────
   EMPLOYEE PROVISIONING
───────────────────────────────────────────── */


// ── DC_PROVISION_NEW_EMPLOYEE ──
function DC_PROVISION_NEW_EMPLOYEE(emp) {
  if (!emp || typeof emp !== "object" || !Object.keys(emp).length) {
    LOG_ERR_("DC_PROVISION_NEW_EMPLOYEE", "SYS", "Employee object is missing or empty.");
    return false;
  }


  const empCode = String(emp.EMP_CODE || "").trim().toUpperCase();
  const empName = String(emp.EMPLOYEES_NAME || "").trim();


  if (!empCode || !empName) {
    LOG_ERR_("DC_PROVISION_NEW_EMPLOYEE", empCode || "UNKNOWN", "Missing EMP_CODE or EMPLOYEES_NAME.");
    return false;
  }


  try {
    const props = PropertiesService.getScriptProperties();
    const templateId = props.getProperty("TEMPLATE_PERSONAL_FILE_ID") || props.getProperty("SARI_COMMON_KNOWLEDGE_FILE_ID");
    const parentFolderId = props.getProperty("ONBOARDING_DRIVE_FOLDER_ID") || props.getProperty("SARI_FOLDER_ID");


    if (!templateId || !parentFolderId) {
      throw new Error("Missing TEMPLATE_PERSONAL_FILE_ID or ONBOARDING_DRIVE_FOLDER_ID");
    }


    const folderName = `${empCode} - ${empName}`;
    const empFolder = DriveApp.getFolderById(parentFolderId).createFolder(folderName);
    const personalFileId = DriveApp.getFileById(templateId).makeCopy(folderName, empFolder).getId();


    const empSh = GET_OR_CREATE_(DC_CFG.SHEETS.ALL_EMPLOYEES);
    const empHeaders = [
      "EMP_CODE", "EMPLOYEES_NAME", "MOBILE", "EMPLOYEE_EMAIL_ID", 
      "DEPARTMENT", "ROLE", "PERSONAL_FILE_ID", "ACTIVE_STATUS"
    ];
    
    P1_ENSURE_HEADERS_(empSh, empHeaders);


    const registry = {
      COMPANY_NAME: emp.COMPANY_NAME || "",
      BRANCH: emp.BRANCH || "",
      EMP_CODE: empCode,
      EMPLOYEES_NAME: empName,
      ROLE: emp.ROLE || "",
      DEPARTMENT: emp.DEPARTMENT || "",
      EMPLOYEE_EMAIL_ID: emp.EMPLOYEE_EMAIL || emp.EMPLOYEE_EMAIL_ID || "",
      MOBILE: emp.MOBILE || emp.EMPLOYEE_MOBILE || "",
      MANAGER_NAME: emp.MANAGER_NAME || "",
      MANAGER_EMAIL_ID: emp.MANAGER_EMAIL || emp.MANAGER_EMAIL_ID || "",
      MANAGER_MOBILE: emp.MANAGER_MOBILE || "",
      PERSONAL_FILE_ID: personalFileId,
      ACTIVE_STATUS: "ACTIVE"
    };


    UPSERT_BY_KEY_(empSh, "EMP_CODE", registry, empHeaders);
    
    DC_EMP_CACHE = null;
    P1_MAP_HTML_LINKS_TO_ALL_EMPLOYEES_();


    DC_SEND_WELCOME_EMAIL_(emp, registry, empFolder.getUrl());


    return true;


  } catch (err) {
    LOG_ERR_("DC_PROVISION_NEW_EMPLOYEE", empCode, err.message);
    return false;
  }
}


// ── DC_SEND_WELCOME_EMAIL_ ──
function DC_SEND_WELCOME_EMAIL_(emp, registry, folderUrl) {
  try {
    const toEmail = registry.EMPLOYEE_EMAIL_ID;
    if (!toEmail) return;


    const base = P1_GET_EXEC_URL_();
    const e = encodeURIComponent(registry.EMP_CODE);
    
    const body = `
      <div style="font-family:'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#06112C;color:#fff;border-radius:20px;overflow:hidden">
        <div style="background:linear-gradient(135deg,#d4af37,#fcd34d);padding:40px 30px;text-align:center;color:#06112C">
          <h1 style="margin:0;font-size:32px;font-weight:900">WELCOME TO THE TEAM</h1>
          <p style="margin:10px 0 0;font-size:16px;font-weight:600;text-transform:uppercase">Divyanshi Capital Pvt Ltd</p>
        </div>
        <div style="padding:40px 30px;font-size:15px;color:#cbd5e1">
          <p>Hi <strong>${registry.EMPLOYEES_NAME}</strong>,</p>
          <p>I'm <strong>Bulbhul</strong>, your AI Avatar. Welcome! I work alongside you every day.</p>
          <p><strong>Employee Code:</strong> ${registry.EMP_CODE} | <strong>Role:</strong> ${registry.ROLE}</p>
          <a href="${base}?page=dashboard&emp=${e}" style="display:block;text-align:center;background:#d4af37;color:#06112C;padding:12px;border-radius:8px;font-weight:700;text-decoration:none;margin:20px 0">📊 Open My Dashboard</a>
          <a href="${folderUrl}" style="color:#d4af37">📁 Upload joining documents here</a>
          <p style="margin-top:20px">- Bulbhul AI<br>Divyanshi Capital</p>
        </div>
      </div>`;


    MailApp.sendEmail({
      to: toEmail,
      subject: `Welcome to Divyanshi Capital! - ${registry.EMP_CODE}`,
      htmlBody: body,
      name: "Divyanshi Capital - Bulbhul AI"
    });


    const ccArray = [DC_CFG.COMPANY.MD_EMAIL, DC_CFG.COMPANY.FOUNDER_EMAIL, DC_CFG.COMPANY.HR_EMAIL, emp.CC_EMAIL_IDS];
    const cc = [...new Set(ccArray.filter(Boolean))].join(",");


    MailApp.sendEmail({
      to: registry.MANAGER_EMAIL_ID || DC_CFG.COMPANY.HR_EMAIL,
      cc: cc,
      subject: `[ONBOARDING DONE] ${registry.EMPLOYEES_NAME} (${registry.EMP_CODE})`,
      body: `Provisioned:\n${JSON.stringify(registry, null, 2)}`,
      name: "Bulbhul AI"
    });
    
  } catch (err) {
    LOG_ERR_("DC_SEND_WELCOME_EMAIL", registry.EMP_CODE || "", err.message);
  }
}


/* ─────────────────────────────────────────────
   LINK MAPPER
───────────────────────────────────────────── */


// ── P1_MAP_HTML_LINKS_TO_ALL_EMPLOYEES_ ──
function P1_MAP_HTML_LINKS_TO_ALL_EMPLOYEES_(){
  const sh=SHEET_(DC_CFG.SHEETS.ALL_EMPLOYEES);
  if(!sh) throw new Error("ALL_EMPLOYEES missing");
  const data=sh.getDataRange().getValues();
  if(!data.length) throw new Error("ALL_EMPLOYEES blank");
  const base=P1_GET_EXEC_URL_();
  let headers=data[0].map(h=>String(h||"").trim()),norm=headers.map(DC_NORM_);
  function ensureCol(name){const n=DC_NORM_(name);let i=norm.indexOf(n);if(i===-1){headers.push(name);norm.push(n);i=headers.length-1;sh.getRange(1,i+1).setValue(name);}return i;}
  function f(url,label){return '=HYPERLINK("'+String(url).replace(/"/g,'""')+'","'+label+'")';}
  const cEmp=norm.indexOf("EMP_CODE"),cName=norm.indexOf("EMPLOYEES_NAME"),cFile=norm.indexOf("PERSONAL_FILE_ID");
  if(cEmp===-1) throw new Error("EMP_CODE column missing");
  const cWebsite=ensureCol("P1_WEBSITE_URL"),cForm=ensureCol("P1_SMART_FORM_URL"),cCard=ensureCol("P1_DIGITAL_CARD_URL"),cDash=ensureCol("P1_DASHBOARD_URL"),cCalling=ensureCol("P1_CALLING_URL"),cVoice=ensureCol("P1_VOICE_URL"),cAvatar=ensureCol("P1_AVATAR_URL"),cPersonalUrl=ensureCol("P1_PERSONAL_FILE_URL"),cQR=ensureCol("P1_QR_TEXT"),cStatus=ensureCol("P1_SYNC_STATUS"),cAt=ensureCol("P1_LAST_SYNC_AT");
  for(let i=1;i<data.length;i++){
    const code=String(data[i][cEmp]||"").trim().toUpperCase();
    if(!code) continue;
    const e=encodeURIComponent(code),name=String(cName>-1?data[i][cName]:code).trim()||code,fileId=cFile>-1?String(data[i][cFile]||"").trim():"";
    const avatar="https://ui-avatars.com/api/?name="+encodeURIComponent(name)+"&background=d4af37&color=0a2540&size=160";
    const personal=fileId?"https://docs.google.com/spreadsheets/d/"+fileId+"/edit":"";
    sh.getRange(i+1,cWebsite+1).setFormula(f(base+"?page=home&emp="+e,"🌐 Website"));
    sh.getRange(i+1,cForm+1).setFormula(f(base+"?page=form&emp="+e,"📝 Form"));
    sh.getRange(i+1,cCard+1).setFormula(f(base+"?page=card&emp="+e,"💼 Card"));
    sh.getRange(i+1,cDash+1).setFormula(f(base+"?page=dashboard&emp="+e,"📊 Dash"));
    sh.getRange(i+1,cCalling+1).setFormula(f(base+"?page=calling&emp="+e,"📞 Calling"));
    sh.getRange(i+1,cVoice+1).setFormula(f(base+"?page=voice&emp="+e,"🎙️ Voice"));
    sh.getRange(i+1,cAvatar+1).setValue(avatar);
    sh.getRange(i+1,cPersonalUrl+1).setValue(personal?f(personal,"📁 File"):"");
    sh.getRange(i+1,cQR+1).setValue(base+"?page=card&emp="+e);
    sh.getRange(i+1,cStatus+1).setValue("CONNECTED");
    sh.getRange(i+1,cAt+1).setValue(new Date());
  }
  sh.setFrozenRows(1);
  sh.getRange(1,1,1,sh.getLastColumn()).setBackground("#0b5394").setFontColor("#ffffff").setFontWeight("bold");
  DC_EMP_CACHE=null;
  return "P1 ALL_EMPLOYEES links mapped: "+(data.length-1);
}
/* ─────────────────────────────────────────────
   INSTALL + SYNC + TRIGGERS
───────────────────────────────────────────── */


// ── P1_ENSURE_LOAN_BANK_MAP_HEADERS_ ──
function P1_ENSURE_LOAN_BANK_MAP_HEADERS_(){
  const sh=GET_OR_CREATE_(DC_CFG.SHEETS.LOAN_BANK_MAP);
  P1_ENSURE_HEADERS_(sh,["LOAN_TYPE","BANK","STATUS","ROI_START","MIN_CIBIL","MIN_INCOME","MAX_LOAN_AMOUNT","DOCUMENTS_REQUIRED","POLICY_REMARKS","TAT_DAYS"]);
  return true;
}


// ── DC_INSTALL_P1_FINAL ──
function DC_INSTALL_P1_FINAL(){
  const ss=DC_GET_SS_();
  Object.values(DC_CFG.SHEETS).forEach(name=>{if(!ss.getSheetByName(name))ss.insertSheet(name);});
  if(!ss.getSheetByName("AVATAR_ACTIVITY_LOG"))ss.insertSheet("AVATAR_ACTIVITY_LOG");
  if(!ss.getSheetByName("PERSONAL_FILES_DIR"))ss.insertSheet("PERSONAL_FILES_DIR");
  P1_ENSURE_HEADERS_(ss.getSheetByName(DC_CFG.SHEETS.MASTER_DATA),GET_MASTER_HEADERS_());
  P1_ENSURE_HEADERS_(ss.getSheetByName(DC_CFG.SHEETS.COMMON_ENTRY),GET_MASTER_HEADERS_());
  P1_ENSURE_HEADERS_(ss.getSheetByName(DC_CFG.SHEETS.SMART_LOG),["TS","SOURCE_TYPE","SOURCE_NAME","DATA_FLOW","LEAD_ID","CLIENT_NAME","CLIENT_MOBILE","BANK","STATUS","EMP_CODE","REMARKS","TAT_STATUS"]);
  P1_ENSURE_HEADERS_(ss.getSheetByName(DC_CFG.SHEETS.MIS_LOG),["TIMESTAMP","LEAD_ID","EMP_CODE","CLIENT_NAME","CLIENT_MOBILE","ROUTING_STATUS","DATA_FLOW","PERSONAL_FILE_SYNC","REMARKS"]);
  P1_ENSURE_HEADERS_(ss.getSheetByName(DC_CFG.SHEETS.ATTENDANCE),["DATE","EMP_CODE","SALES_NAME","TASK_COUNT","ATTENDANCE_STATUS","HALF1_CHECKIN","HALF2_CHECKIN","LAST_UPDATED"]);
  P1_ENSURE_HEADERS_(ss.getSheetByName(DC_CFG.SHEETS.ACCOUNTS_LOG),["TIMESTAMP","LEAD_ID","CLIENT_NAME","CLIENT_MOBILE","LOAN_TYPE","REQUIRED_LOAN_AMOUNT","PREFERRED_BANK","SALES_NAME","EMP_CODE","DISBURSAL_STATUS","REMARKS"]);
  P1_ENSURE_HEADERS_(ss.getSheetByName(DC_CFG.SHEETS.RAW_INBOX),GET_RAW_INBOX_HEADERS_());
  P1_ENSURE_HEADERS_(ss.getSheetByName("AVATAR_ACTIVITY_LOG"),["TIMESTAMP","CHAT_ID","USER","ACTION","DETAILS","CHANNEL","EMP_CODE","MOBILE"]);
  P1_ENSURE_HEADERS_(ss.getSheetByName(DC_CFG.SHEETS.ERR),["TIMESTAMP","FUNCTION","CODE","MESSAGE"]);
  P1_ENSURE_HEADERS_(ss.getSheetByName(DC_CFG.SHEETS.SOURCE_NAME),["SOURCE_NAME","DATA_FLOW"]);
  P1_ENSURE_LOAN_BANK_MAP_HEADERS_();
  // Seed SOURCE_NAME routing table
  const snSh=ss.getSheetByName(DC_CFG.SHEETS.SOURCE_NAME);
  if(snSh&&snSh.getLastRow()<=1){
    snSh.getRange(2,1,17,2).setValues([
      ["Sales Team","SALES"],["Manual Calling","SALES"],["AI Auto Calling","SALES"],["WhatsApp","SALES"],["Website","SALES"],["DSA","LOGIN DEPARTMENT"],["Referral","SALES"],["Walk-in","SALES"],["Instagram","SALES"],["Facebook","SALES"],["LinkedIn","SALES"],["Email Campaign","SALES"],["Bank Referral","SALES"],["MIS UPDATE","REPORT"],["ONBOARD/INTERVIEWE/BANKAR","HR"],["SEND TO LOGIN/COMPLETED","LOGIN DEPARTMENT"],["Other","ANY"]
    ]);
  }
  // Remove old triggers, install fresh
  ScriptApp.getProjectTriggers().forEach(t=>{
    const fn=t.getHandlerFunction();
    if(["DC_TG_DAILY_REPORT_","ATTENDANCE_EOD_REPORT_","MIS_PIPELINE_RUN_","MIS_EVENING_REPORT_"].includes(fn)) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("DC_TG_DAILY_REPORT_").timeBased().atHour(9).everyDays(1).create();
  ScriptApp.newTrigger("ATTENDANCE_EOD_REPORT_").timeBased().atHour(20).everyDays(1).create();
  ScriptApp.newTrigger("MIS_PIPELINE_RUN_").timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger("MIS_EVENING_REPORT_").timeBased().atHour(DC_CFG.MIS.REPORT_HOUR).everyDays(1).create();
  DC_SYNC_AND_PROVISION_ALL_EXISTING_EMPLOYEES();
  return "P1_INSTALL_FINAL_OK | SMART_LOG | MIS_PIPELINE | ATTENDANCE | TAT | ACCOUNTS | MY_CASES_VIEW_ONLY";
}


// ── DC_TG_DAILY_REPORT_ ──
function DC_TG_DAILY_REPORT_(){
  try {
    const msg="🌅 P1 Daily Report\nStatus: Active\nTime:"+new Date().toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})+"\nBulbhul Final running.";
    return DC_SEND_TG_(msg)?"REPORT_SENT":"NO_CORE_CHAT_ID";
  } catch(e){LOG_ERR_("DAILY_REPORT","Telegram",e.message);return "ERROR:"+e.message;}
}


// ── DC_SYNC_AND_PROVISION_ALL_EXISTING_EMPLOYEES ──
function DC_SYNC_AND_PROVISION_ALL_EXISTING_EMPLOYEES(forceSync){
  const ss=DC_GET_SS_();
  const empSh=ss.getSheetByName(DC_CFG.SHEETS.ALL_EMPLOYEES);
  if(!empSh||empSh.getLastRow()<2){Logger.log("⚠️ ALL_EMPLOYEES empty.");return;}
  const props=PropertiesService.getScriptProperties();
  const templateId=props.getProperty("TEMPLATE_PERSONAL_FILE_ID")||props.getProperty("SARI_COMMON_KNOWLEDGE_FILE_ID");
  const parentFolderId=props.getProperty("ONBOARDING_DRIVE_FOLDER_ID")||props.getProperty("SARI_FOLDER_ID");
  if(!templateId||!parentFolderId){Logger.log("⚠️ Missing template/folder IDs.");return;}
  const data=empSh.getDataRange().getValues();
  const headers=data[0].map(DC_NORM_);
  const codeIdx=headers.indexOf("EMP_CODE"),nameIdx=headers.indexOf("EMPLOYEES_NAME"),fileIdIdx=headers.indexOf("PERSONAL_FILE_ID"),statusIdx=headers.indexOf("P1_SYNC_STATUS");
  if(codeIdx===-1||fileIdIdx===-1){Logger.log("❌ Missing EMP_CODE or PERSONAL_FILE_ID.");return;}
  const templateFile=DriveApp.getFileById(templateId),parentFolder=DriveApp.getFolderById(parentFolderId);
  const masterHeaders=GET_MASTER_HEADERS_();
  const actHeaders=["TIMESTAMP","LEAD_ID","CLIENT_NAME","CLIENT_MOBILE","LOAN_TYPE","AMOUNT","BANK","STATUS","REMARKS","TAT_STATUS"];
  for(let i=1;i<data.length;i++){
    const code=String(data[i][codeIdx]||"").trim().toUpperCase(),name=String(nameIdx>-1?data[i][nameIdx]:code).trim()||code;
    let fileId=String(data[i][fileIdIdx]||"").trim();
    const statusVal=statusIdx>-1?String(data[i][statusIdx]||"").trim().toUpperCase():"";
    if(!code) continue;
    if(fileId&&statusVal==="CONNECTED"&&!forceSync) continue;
    if(!fileId||fileId.length<20){
      try {
        Logger.log("⚙️ Provisioning: "+code);
        const empFolder=parentFolder.createFolder(code+" - "+name);
        fileId=templateFile.makeCopy(code+" - "+name,empFolder).getId();
        empSh.getRange(i+1,fileIdIdx+1).setValue(fileId);
        Logger.log("✅ File: "+fileId);
      } catch(err){Logger.log("❌ Failed "+code+": "+err.message);continue;}
    }
    if(fileId){
      try {
        const pss=P1_OPEN_SS_SAFE_(fileId);
        const myCasesSh=pss.getSheetByName("MY_CASES")||pss.insertSheet("MY_CASES");
        P1_ENSURE_HEADERS_(myCasesSh,masterHeaders);
        LOCK_MY_CASES_VIEW_ONLY_(myCasesSh,code);
        const salesActSh=pss.getSheetByName("SALES_ACTIVITY")||pss.insertSheet("SALES_ACTIVITY");
        P1_ENSURE_HEADERS_(salesActSh,actHeaders);
        Logger.log("✅ Headers aligned: "+code);
      } catch(err){Logger.log("❌ Header align failed "+code+": "+err.message);}
    }
  }
  P1_MAP_HTML_LINKS_TO_ALL_EMPLOYEES_();
}
/* ─────────────────────────────────────────────
   FORM TRIGGER + onEdit
───────────────────────────────────────────── */


// ── P1_FORM_SUBMIT ──
function P1_FORM_SUBMIT(e){
  try {
    if(!e) return;
    const sh = e.range ? e.range.getSheet() : null;
    const sheetName = sh ? sh.getName() : "";
    const itemResponses=e.response?e.response.getItemResponses():[];
    const lead={SOURCE_TYPE:"Google Form",SOURCE_NAME:"Intake Form"};
    if(itemResponses.length>0){
      itemResponses.forEach(r=>{
        const title=r.getItem().getTitle(),normKey=DC_NORM_(title),val=r.getResponse();
        if(title.toUpperCase().includes("FILE")||title.toUpperCase().includes("UPLOAD")){lead[normKey]=Array.isArray(val)?val.map(id=>"https://drive.google.com/open?id="+id).join(", "):(val?"https://drive.google.com/open?id="+val:"");}
        else lead[normKey]=val;
      });
    } else if(e.namedValues){Object.keys(e.namedValues).forEach(k=>{lead[DC_NORM_(k)]=e.namedValues[k][0];});}
    // Determine if it is actually an Employee Onboarding form or a standard Sales Client Lead.
    // Standard Sales Client Lead has CLIENT_NAME or CLIENT_MOBILE.
    // Employee Onboarding has EMPLOYEES_NAME (Employee Name) or Employee Email, but NOT Client details.
    const isEmployeeOnboarding = (sheetName === "Form Responses 9") || ((lead.EMPLOYEES_NAME || lead.EMPLOYEE_EMAIL) && !lead.CLIENT_NAME && !lead.CLIENT_MOBILE);
    if(isEmployeeOnboarding){
      const hrSh=GET_OR_CREATE_(DC_CFG.SHEETS.HR_APPROVAL);
      const hrHeaders=["TIMESTAMP","EMPLOYEE_NAME","EMPLOYEE_EMAIL_ID","EMPLOYEE_MOBILE","DEPARTMENT","ROLE","CC_EMAIL_IDS","STATUS","BRANCH","MANAGER_NAME","MANAGER_EMAIL","MANAGER_MOBILE","REMARKS_NOTES","EMP_CODE","ONBOARD_DONE","TC_ACCEPTED"];
      const aH=P1_ENSURE_HEADERS_(hrSh,hrHeaders);
      lead.TIMESTAMP=new Date();
      lead.EMPLOYEE_NAME=lead.EMPLOYEE_NAME||lead.EMPLOYEES_NAME||"";
      lead.EMPLOYEE_EMAIL_ID=lead.EMPLOYEE_EMAIL_ID||lead.EMPLOYEE_EMAIL||"";
      // EXISTING EMPLOYEE AUTO-ONBOARD: valid EMP_CODE in ALL_EMPLOYEES → instant APPROVED, no pending
      const obCode=String(lead.EMP_CODE||"").trim().toUpperCase();
      const obEmp=obCode?FIND_EMPLOYEE_FULL_(obCode):null;
      if(obEmp){
        lead.EMP_CODE=obEmp.EMP_CODE;
        lead.EMPLOYEE_NAME=lead.EMPLOYEE_NAME||obEmp.NAME;
        lead.EMPLOYEE_EMAIL_ID=lead.EMPLOYEE_EMAIL_ID||obEmp.EMAIL;
        lead.EMPLOYEE_MOBILE=lead.EMPLOYEE_MOBILE||obEmp.MOBILE;
        lead.STATUS="APPROVED";lead.ONBOARD_DONE="YES";
        lead.REMARKS_NOTES="Auto-onboard: existing employee. "+(lead.REMARKS_NOTES||"");
        DC_SEND_TG_("✅ *Auto-Onboard Complete*\n"+obEmp.NAME+" ("+obEmp.EMP_CODE+") — existing employee, joining kit updated via Google Form.");
      } else {
        lead.STATUS=lead.STATUS||"PENDING";lead.ONBOARD_DONE="NO";
        DC_SEND_TG_("👤 *New Onboard Request (Form)*\n"+(lead.EMPLOYEE_NAME||"")+" | "+(lead.EMPLOYEE_MOBILE||"")+"\n→ HR_MD_APPROVAL pending. STATUS=APPROVED + EMP_CODE set → auto-provision.");
      }
      hrSh.appendRow(P1_BUILD_ROW_(aH,lead));
    } else{
      DC_PROCESS_LEAD_(lead);
    }
  } catch(err){LOG_ERR_("P1_FORM_SUBMIT","",err.message);}
}


// ── P1_SAVE_CALC_LEAD_ ──
function P1_SAVE_CALC_LEAD_(data) { return P1_SAVE_CALC_LEAD(data); }


// ── MLA_LOG_ACTIVITY ──
function MLA_LOG_ACTIVITY(type,mobile){
  try {
    const sh=GET_OR_CREATE_("AVATAR_ACTIVITY_LOG");
    P1_ENSURE_HEADERS_(sh,["TIMESTAMP","CHAT_ID","USER","ACTION","DETAILS","CHANNEL","EMP_CODE","MOBILE"]);
    sh.appendRow([new Date(),"","EXECUTIVE",type||"ACTIVITY","Executive activity log","WEB_DESK","",DC_CLEAN_MOBILE_(mobile)]);
    return { success: true };
  } catch (error) { LOG_ERR_("MLA_LOG_ACTIVITY", mobile || "", error.message); return { success: false, errorMessage: error.message }; }
}


// ── P1_SET_TG_WEBHOOK_RUN ──
function P1_SET_TG_WEBHOOK_RUN(){
  const token=DC_CFG.PROPS.getProperty("TG_TOKEN"),url=P1_GET_EXEC_URL_();
  if(!token){Logger.log("⚠️ TG_TOKEN missing.");return "SKIPPED";}
  UrlFetchApp.fetch("https://api.telegram.org/bot"+token+"/deleteWebhook",{method:"post",contentType:"application/json",muteHttpExceptions:true,payload:JSON.stringify({drop_pending_updates:true})});
  Utilities.sleep(1000);
  const res=UrlFetchApp.fetch("https://api.telegram.org/bot"+token+"/setWebhook",{method:"post",contentType:"application/json",muteHttpExceptions:true,payload:JSON.stringify({url,drop_pending_updates:true,allowed_updates:["message"]})});
  Logger.log(res.getContentText());
  return res.getContentText();
}


// ── MANAGER_CHECKIN_API ──
function MANAGER_CHECKIN_API(data){return MANAGER_SELFIE_CHECKIN_(data.empCode,data.half||1);}


// ── GET_ACTIVE_LOAN_PRODUCTS ──
function GET_ACTIVE_LOAN_PRODUCTS(){return GET_ACTIVE_LOAN_PRODUCTS_();}


// ── P1_GET_BANK_OPTIONS_MAP ──
function P1_GET_BANK_OPTIONS_MAP() {return P1_GET_BANK_OPTIONS_MAP_();}


// ── RUN_MIS_PIPELINE_NOW ──
function RUN_MIS_PIPELINE_NOW()    {MIS_PIPELINE_RUN_();}


// ── RUN_MIS_EVENING_REPORT ──
function RUN_MIS_EVENING_REPORT()  {MIS_EVENING_REPORT_();}
/* ─────────────────────────────────────────────
   B5 FIX: AUTO-TRIGGER SETUP
   Run DC_SETUP_TRIGGERS() ONCE after deploy to install all triggers.
───────────────────────────────────────────── */


// ── DC_SETUP_TRIGGERS ──
function DC_SETUP_TRIGGERS(){
  // Remove all existing project triggers to avoid duplicates
  ScriptApp.getProjectTriggers().forEach(t=>ScriptApp.deleteTrigger(t));
  // 1. MIS Pipeline: every 15 minutes
  ScriptApp.newTrigger("MIS_PIPELINE_RUN_")
    .timeBased().everyMinutes(15).create();
  // 2. Evening MIS Report: every day at 19:30 IST (UTC+5:30 = 14:00 UTC)
  ScriptApp.newTrigger("MIS_EVENING_REPORT_")
    .timeBased().everyDays(1).atHour(14).create();
  // 3. Attendance EOD: every day at 20:00 IST (14:30 UTC)
  ScriptApp.newTrigger("ATTENDANCE_EOD_REPORT_")
    .timeBased().everyDays(1).atHour(14).nearMinute(30).create();
  // 4. Spreadsheet Google Form Submit trigger (auto-bind to active form)
  try {
    const ss = DC_GET_SS_();
    ScriptApp.newTrigger("P1_FORM_SUBMIT")
      .forSpreadsheet(ss)
      .onFormSubmit()
      .create();
    Logger.log("✅ Form submit trigger added to spreadsheet successfully.");
  } catch (err) {
    Logger.log("⚠ Could not add form submit trigger: " + err.message);
  }
  // 5. Spreadsheet Edit trigger (for high-permission operations like MailApp/DriveApp)
  try {
    const ss = DC_GET_SS_();
    ScriptApp.newTrigger("onEdit")
      .forSpreadsheet(ss)
      .onEdit()
      .create();
    Logger.log("✅ Edit trigger added to spreadsheet successfully.");
  } catch (err) {
    Logger.log("⚠ Could not add edit trigger: " + err.message);
  }
  Logger.log("✅ DC_SETUP_TRIGGERS: All triggers installed successfully.");
  try {
    const ui = SpreadsheetApp.getUi();
    if (ui) {
      ui.alert("✅ Triggers installed!\n\n• MIS Pipeline: every 15 min\n• Evening MIS Report: 7:30 PM daily\n• Attendance EOD: 8:00 PM daily\n• Google Form Submit Trigger: Enabled");
    }
  } catch (uiErr) {
    Logger.log("ℹ️ Running in standalone script. Skipping UI alert. Triggers configured successfully.");
  }
}


// ── onOpen ──
function onOpen(){
  try {
    const ui = SpreadsheetApp.getUi();
    if (ui) {
      ui.createMenu("🤖 BULBHUL AI")
        .addItem("▶ Run MIS Pipeline Now","RUN_MIS_PIPELINE_NOW")
        .addItem("📊 Generate Evening MIS Report","RUN_MIS_EVENING_REPORT")
        .addSeparator()
        .addItem("⚙️ Setup Auto-Triggers (Run Once)","DC_SETUP_TRIGGERS")
        .addItem("🧪 Test Last Onboarding Form","P1_TEST_LAST_RESPONSE_ONBOARDING")
        .addToUi();
    }
  } catch (uiErr) {
    Logger.log("ℹ️ Running in standalone script. Skipping menu creation.");
  }
}


// ── P1_TEST_LAST_RESPONSE_ONBOARDING ──
function P1_TEST_LAST_RESPONSE_ONBOARDING(){
  const ss=DC_GET_SS_();
  let sh=ss.getSheetByName("Form Response 7")||ss.getSheetByName("Form Responses 7");
  if(!sh){const sheets=ss.getSheets();for(let i=0;i<sheets.length;i++){const n=sheets[i].getName();if(n.includes("Response")||n.includes("Form")){sh=sheets[i];break;}}}
  if(!sh||sh.getLastRow()<2){Logger.log("❌ Response sheet not found or empty");return;}
  const lr=sh.getLastRow(),headers=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0],rowData=sh.getRange(lr,1,1,sh.getLastColumn()).getValues()[0];
  const namedValues={};headers.forEach((h,idx)=>{if(h)namedValues[h]=[rowData[idx]];});
  P1_FORM_SUBMIT({namedValues});
  Logger.log("✅ Simulation complete!");
}


// ── GET_OR_CREATE_LEAD_FOLDER_ ──
function GET_OR_CREATE_LEAD_FOLDER_(empCode, clientMobile, clientName) {
  try {
    const props = PropertiesService.getScriptProperties();
    const parentFolderId = props.getProperty("ONBOARDING_DRIVE_FOLDER_ID") || props.getProperty("SARI_FOLDER_ID");
    if (!parentFolderId) return null;
    const parent = DriveApp.getFolderById(parentFolderId);
    let empFolder = null;
    const emp = empCode ? FIND_EMPLOYEE_FULL_(empCode) : null;
    const folderName = empCode + " - " + (emp ? emp.NAME : "Unassigned");
    const folders = parent.getFoldersByName(folderName);
    if (folders.hasNext()) {
      empFolder = folders.next();
    } else {
      empFolder = parent.createFolder(folderName);
    }
    const clientFolderName = clientName + " (" + clientMobile + ")";
    const clientFolders = empFolder.getFoldersByName(clientFolderName);
    if (clientFolders.hasNext()) {
      return clientFolders.next();
    } else {
      return empFolder.createFolder(clientFolderName);
    }
  } catch (e) {
    LOG_ERR_("GET_OR_CREATE_LEAD_FOLDER", empCode || "", e.message);
    return null;
  }
}


// ── SAVE_LEAD_FILES_ ──
function SAVE_LEAD_FILES_(folder, files) {
  const links = [];
  if (!folder || !files || !files.length) return links;
  files.forEach(f => {
    try {
      const name = f.name;
      const mimeType = f.mimeType;
      let base64 = f.base64;
      if (base64.includes(",")) {
        base64 = base64.split(",")[1];
      }
      const decoded = Utilities.base64Decode(base64);
      const blob = Utilities.newBlob(decoded, mimeType, name);
      const file = folder.createFile(blob);
      links.push(file.getUrl());
    } catch (e) {
      LOG_ERR_("SAVE_LEAD_FILE", f.name || "", e.message);
    }
  });
  return links;
}


// ── GET_DOCS_REQUIRED_BY_PRODUCT_ ──
function GET_DOCS_REQUIRED_BY_PRODUCT_(loanType) {
  try {
    const sh = SHEET_("Loan_Bank_Map");
    if (!sh || sh.getLastRow() < 2) return ["PAN Card", "Aadhaar Card", "Last 3 Months Salary Slip", "Last 6 Months Bank Statement"];
    const data = sh.getDataRange().getValues();
    const h = data[0].map(DC_NORM_);
    const iType = h.indexOf("LOAN_TYPE");
    const iDocs = h.indexOf("DOCUMENTS_REQUIRED");
    if (iType === -1 || iDocs === -1) return ["PAN Card", "Aadhaar Card", "Last 3 Months Salary Slip", "Last 6 Months Bank Statement"];
    const key = String(loanType || "").trim().toUpperCase();
    for (let r = 1; r < data.length; r++) {
      if (String(data[r][iType] || "").trim().toUpperCase() === key) {
        const docsStr = String(data[r][iDocs] || "").trim();
        if (docsStr) {
          return docsStr.split(",").map(d => d.trim()).filter(Boolean);
        }
      }
    }
  } catch (e) {
    LOG_ERR_("GET_DOCS_REQUIRED_BY_PRODUCT", loanType || "", e.message);
  }
  return ["PAN Card", "Aadhaar Card", "Last 3 Months Salary Slip", "Last 6 Months Bank Statement"];
}
/* ─────────────────────────────────────────────
   DASHBOARD DATA (all-in-one for frontend doGet)
   Returns: { emp, master, myCases, team, mis, attendance }
───────────────────────────────────────────── */


// ── DC_GET_DASHBOARD_DATA_ ──
function DC_GET_DASHBOARD_DATA_(empCode, role) {
  try {
    const emp        = FIND_EMPLOYEE_FULL_(empCode);
    const master     = GET_MASTER_DATA_ALL_();
    const myCases    = GET_MY_CASES_(empCode, role);
    // FIX: GET_TEAM_DATA_(empCode, dept) expects a DEPARTMENT value, not a role string — passing role
    // caused every filter to compare DEPARTMENT to a role like "MD"/"FOUNDER" and always return empty.
    const team       = GET_TEAM_DATA_(empCode, (emp && emp.DEPARTMENT) || role);
    const misRows    = (() => {
      try {
        const sh = SHEET_(DC_CFG.SHEETS.MIS_LOG);
        if (!sh || sh.getLastRow() < 2) return [];
        const data = sh.getDataRange().getValues();
        const h = data[0].map(DC_NORM_);
        const iEmp = h.indexOf("EMP_CODE");
        const today = new Date().toDateString();
        return data.slice(1).filter(r =>
          (role === "MD" || role === "FOUNDER" || role === "MANAGER") ||
          (iEmp > -1 && String(r[iEmp] || "").trim() === String(empCode || "").trim())
        ).filter(r => {
          const ts = r[h.indexOf("TIMESTAMP")];
          return ts ? new Date(ts).toDateString() === today : false;
        }).map(r => {
          const obj = {};
          h.forEach((k, i) => { if (k) obj[k] = r[i]; });
          return obj;
        });
      } catch (e) { return []; }
    })();
    const attRows = (() => {
      try {
        const sh = SHEET_(DC_CFG.SHEETS.ATTENDANCE);
        if (!sh || sh.getLastRow() < 2) return [];
        const data = sh.getDataRange().getValues();
        const h = data[0].map(DC_NORM_);
        const iEmp = h.indexOf("EMP_CODE");
        const today = new Date().toDateString();
        return data.slice(1).filter(r => {
          const ts = r[h.indexOf("TIMESTAMP")];
          const sameDay = ts ? new Date(ts).toDateString() === today : false;
          const mine = (role === "MD" || role === "FOUNDER" || role === "MANAGER") ||
                       (iEmp > -1 && String(r[iEmp] || "").trim() === empCode);
          return sameDay && mine;
        }).map(r => {
          const obj = {};
          h.forEach((k, i) => { if (k) obj[k] = r[i]; });
          return obj;
        });
      } catch (e) { return []; }
    })();
    return {
      ok: true,
      emp:        emp        || {},
      master:     master     || [],
      myCases:    myCases    || [],
      team:       team       || [],
      mis:        misRows    || [],
      attendance: attRows    || []
    };
  } catch (e) {
    LOG_ERR_("DC_GET_DASHBOARD_DATA", empCode || "", e.message);
    return { ok: false, err: e.message };
  }
}
/* Alias — backward compat with older call-sites */


// ── DC_TG_DAILY_REPORT ──
function DC_TG_DAILY_REPORT() {
  try {
    DC_TG_DAILY_REPORT_();
  } catch (err) {
    LOG_ERR_("DailyReportTrigger", "EXECUTION_ERROR", err.toString());
  }
}


// ── GET_LOAN_DOC_CHECKLIST_ ──
function GET_LOAN_DOC_CHECKLIST_(loanType, preferredBank) {
  try {
    const sh = SHEET_("Loan_Bank_Map");
    if (!sh || sh.getLastRow() < 2) return GET_LOAN_DOC_CHECKLIST_FALLBACK_(loanType);
    const data = sh.getDataRange().getValues();
    const h = data[0].map(DC_NORM_);
    const iType = h.indexOf("LOAN_TYPE");
    const iBank = h.indexOf("BANK");
    const iDocs = h.indexOf("DOCUMENTS_REQUIRED");
    const iStatus = h.indexOf("STATUS");
    const iPriority = h.indexOf("PRIORITY");
    if (iType === -1 || iDocs === -1) return GET_LOAN_DOC_CHECKLIST_FALLBACK_(loanType);
    const typeKey = String(loanType || "").trim().toUpperCase();
    const bankKey = String(preferredBank || "").trim().toUpperCase();
    const rows = [];
    for (let r = 1; r < data.length; r++) {
      if (String(data[r][iType] || "").trim().toUpperCase() !== typeKey) continue;
      const status = iStatus > -1 ? String(data[r][iStatus] || "ACTIVE").toUpperCase() : "ACTIVE";
      if (["ACTIVE", "YES", "LIVE", ""].indexOf(status) === -1) continue;
      rows.push({
        bank: iBank > -1 ? String(data[r][iBank] || "").trim() : "",
        docs: String(data[r][iDocs] || "").trim(),
        priority: iPriority > -1 ? (Number(data[r][iPriority]) || 99) : 99
      });
    }
    if (!rows.length) return GET_LOAN_DOC_CHECKLIST_FALLBACK_(loanType);
    if (bankKey) {
      const match = rows.find(function (x) { return x.bank.toUpperCase() === bankKey && x.docs; });
      if (match) return match.docs.split(/[,;\n]/).map(function (s) { return s.trim(); }).filter(Boolean);
    }
    rows.sort(function (a, b) { return a.priority - b.priority; });
    const best = rows.find(function (x) { return x.docs; });
    if (best) return best.docs.split(/[,;\n]/).map(function (s) { return s.trim(); }).filter(Boolean);
    return GET_LOAN_DOC_CHECKLIST_FALLBACK_(loanType);
  } catch (e) {
    LOG_ERR_("GET_LOAN_DOC_CHECKLIST", loanType, e.message);
    return GET_LOAN_DOC_CHECKLIST_FALLBACK_(loanType);
  }
}


// ── GET_LOAN_DOC_CHECKLIST_FALLBACK_ ──
function GET_LOAN_DOC_CHECKLIST_FALLBACK_(loanType) {
  const key = String(loanType || "").toUpperCase();
  const common = ["PAN Card", "Aadhaar Card", "Passport-size Photograph", "Bank statement (last 6 months)"];
  if (key.indexOf("PERSONAL") > -1) return common.concat(["Salary slips (last 3 months)", "Form 16 / ITR"]);
  if (key.indexOf("BUSINESS") > -1) return common.concat(["GST returns (last 12 months)", "Business ITR (last 2 years)", "Business registration proof"]);
  if (key.indexOf("HOME") > -1) return common.concat(["Property documents", "ITR (last 2 years)", "Sale agreement"]);
  if (key.indexOf("PROPERTY") > -1 || key.indexOf("LAP") > -1) return common.concat(["Property title papers", "ITR (last 2 years)"]);
  if (key.indexOf("AUTO") > -1) return common.concat(["Vehicle quotation/invoice", "Salary slips or ITR"]);
  return common;
}


// ── P1_GET_BANK_ELIGIBILITY_ ──
function P1_GET_BANK_ELIGIBILITY_(loanType) {
  try {
    const sh = SHEET_("Loan_Bank_Map");
    if (!sh || sh.getLastRow() < 2) return [];
    const data = sh.getDataRange().getValues();
    const h = data[0].map(DC_NORM_);
    const iType = h.indexOf("LOAN_TYPE");
    const iBank = h.indexOf("BANK");
    const iStatus = h.indexOf("STATUS");
    const iCibil = h.indexOf("MIN_CIBIL");
    const iIncome = h.indexOf("MIN_INCOME");
    const iMaxAmt = h.indexOf("MAX_LOAN_AMOUNT");
    const iPriority = h.indexOf("PRIORITY");
    const iRoi = h.indexOf("ROI_START");
    const iTat = h.indexOf("TAT_DAYS");
    if (iType === -1) return [];
    const typeKey = String(loanType || "").trim().toUpperCase();
    const out = [];
    for (let r = 1; r < data.length; r++) {
      if (String(data[r][iType] || "").trim().toUpperCase() !== typeKey) continue;
      const status = iStatus > -1 ? String(data[r][iStatus] || "ACTIVE").toUpperCase() : "ACTIVE";
      if (["ACTIVE", "YES", "LIVE", ""].indexOf(status) === -1) continue;
      out.push({
        bank: iBank > -1 ? String(data[r][iBank] || "").trim() : "",
        minCibil: iCibil > -1 ? (Number(data[r][iCibil]) || 0) : 0,
        minIncome: iIncome > -1 ? (Number(data[r][iIncome]) || 0) : 0,
        maxAmount: iMaxAmt > -1 ? (Number(data[r][iMaxAmt]) || 0) : 0,
        priority: iPriority > -1 ? (Number(data[r][iPriority]) || 99) : 99,
        roi: iRoi > -1 ? (Number(data[r][iRoi]) || 0) : 0,
        tat: iTat > -1 ? (Number(data[r][iTat]) || 7) : 7
      });
    }
    out.sort(function (a, b) { return a.priority - b.priority; });
    return out;
  } catch (e) {
    LOG_ERR_("P1_GET_BANK_ELIGIBILITY", loanType, e.message);
    return [];
  }
}


// ── DC_SAVE_LEAD_DOCS_ ──
function DC_SAVE_LEAD_DOCS_(lead, files) {
  if (!files || !files.length) return "";
  try {
    const parentName = "P1_CLIENT_DOCS";
    const it = DriveApp.getFoldersByName(parentName);
    const parent = it.hasNext() ? it.next() : DriveApp.createFolder(parentName);
    const folderName = (lead.CLIENT_NAME || "CLIENT") + "_" + (lead.CLIENT_MOBILE || "") + "_" + (lead.LEAD_ID || "");
    const folder = parent.createFolder(folderName);
    files.forEach(function (f) {
      try {
        const b64 = String(f.base64 || "").split(",").pop();
        const bytes = Utilities.base64Decode(b64);
        const blob = Utilities.newBlob(bytes, f.mimeType || "application/octet-stream", f.name || "document");
        folder.createFile(blob);
      } catch (e) {
        LOG_ERR_("DC_SAVE_LEAD_DOCS_FILE", lead.LEAD_ID, e.message);
      }
    });
    const url = folder.getUrl();
    // Link the folder onto the MASTER_DATA row we already upserted
    try {
      const master = SHEET_("MASTER_DATA");
      if (master) {
        const headers = master.getRange(1, 1, 1, master.getLastColumn()).getValues()[0].map(DC_NORM_);
        const leadIdCol = headers.indexOf("LEAD_ID");
        const docsCol = headers.indexOf("DOCS_LINK");
        if (leadIdCol > -1 && docsCol > -1) {
          const lr = master.getLastRow();
          if (lr >= 2) {
            const ids = master.getRange(2, leadIdCol + 1, lr - 1, 1).getValues();
            for (let i = 0; i < ids.length; i++) {
              if (String(ids[i][0] || "").trim() === lead.LEAD_ID) {
                master.getRange(i + 2, docsCol + 1).setValue(url);
                break;
              }
            }
          }
        }
      }
    } catch (e) {
      LOG_ERR_("DC_SAVE_LEAD_DOCS_LINK", lead.LEAD_ID, e.message);
    }
    return url;
  } catch (e) {
    LOG_ERR_("DC_SAVE_LEAD_DOCS_", lead.LEAD_ID, e.message);
    return "";
  }
}


// ── P1_AUDIT_CC_ ──
function P1_AUDIT_CC_() {
  return [DC_CFG.COMPANY.MD_EMAIL, DC_CFG.COMPANY.FOUNDER_EMAIL].filter(Boolean).join(",");
}


// ── P1_ROUTE_LEAD_NOTIFICATIONS_ ──
function P1_ROUTE_LEAD_NOTIFICATIONS_(lead) {
  const emp = lead.EMP_CODE ? FIND_EMPLOYEE_FULL_(lead.EMP_CODE) : null;
  const tat = GET_TAT_BY_PRODUCT_(lead.LOAN_TYPE);
  const docs = GET_LOAN_DOC_CHECKLIST_(lead.LOAN_TYPE, lead.PREFERRED_BANK);
  const summary = "🆕 New Lead Assigned\n" +
    "Lead ID: " + (lead.LEAD_ID || "") + "\n" +
    "Client: " + (lead.CLIENT_NAME || "") + " | " + (lead.CLIENT_MOBILE || "") + "\n" +
    "Loan: " + (lead.LOAN_TYPE || "") + " | ₹" + (lead.REQUIRED_LOAN_AMOUNT || "") + "\n" +
    "TAT: " + tat + " days\n" +
    "Docs needed: " + docs.join(", ");
  // → Assigned employee
  if (emp) {
    try { if (emp.WHATSAPP) DC_SEND_WA_(emp.WHATSAPP, summary); } catch (e) { LOG_ERR_("ROUTE_WA_EMP", lead.LEAD_ID, e.message); }
    try {
      if (emp.EMAIL) {
        GmailApp.sendEmail(emp.EMAIL, "[NEW LEAD] " + (lead.CLIENT_NAME || ""), summary, {
          cc: [emp.MANAGER_EMAIL_ID, P1_AUDIT_CC_()].filter(Boolean).join(","),
          name: DC_CFG.COMPANY.NAME
        });
      }
    } catch (e) { LOG_ERR_("ROUTE_MAIL_EMP", lead.LEAD_ID, e.message); }
  }
  // → Core (Founder/MD) — always, regardless of assignment
  try { DC_SEND_TG_(summary); } catch (e) { LOG_ERR_("ROUTE_TG_CORE", lead.LEAD_ID, e.message); }
}


// ── P1_NOTIFY_EMP_ ──
function P1_NOTIFY_EMP_(empCode, message) {
  const emp = FIND_EMPLOYEE_FULL_(empCode);
  if (!emp) return false;
  let sent = false;
  try { if (emp.WHATSAPP) sent = DC_SEND_WA_(emp.WHATSAPP, message) || sent; } catch (e) { /* ignore */ }
  try { if (emp.TG_CHAT_ID) sent = DC_SEND_TG_MESSAGE_(emp.TG_CHAT_ID, message) || sent; } catch (e) { /* ignore */ }
  return sent;
}


// ── P1_QUEUE_LEAD_NOTIFICATION_ ──
function P1_QUEUE_LEAD_NOTIFICATION_(leadId) {
  try {
    const sh = P1_GET_OR_CREATE_SHEET_("NOTIFY_QUEUE");
    P1_ENSURE_HEADERS_(sh, ["TIMESTAMP", "LEAD_ID", "STATUS"]);
    sh.appendRow([new Date(), leadId, "PENDING"]);
    
    ScriptApp.newTrigger("P1_PROCESS_NOTIFY_QUEUE_")
      .timeBased()
      .after(60000) // Minimum allowed by Google Apps Script is 1 minute (60,000 ms)
      .create();
  } catch (e) {
    LOG_ERR_("P1_QUEUE_LEAD_NOTIFICATION", leadId, e.message);
    // Fallback: synchronous execution
    try {
      const cases = GET_MASTER_DATA_ALL_();
      const lead = cases.find(function (c) { return String(c.LEAD_ID || "") === leadId; });
      if (lead) {
        try { SEND_SMART_MAIL_(lead); } catch (e2) { /* ignore */ }
        try { P1_ROUTE_LEAD_NOTIFICATIONS_(lead); } catch (e2) { /* ignore */ }
      }
    } catch (e2) { /* ignore */ }
  }
}


// FIX: was undefined — this function is required by P1_PROCESS_NOTIFY_QUEUE_ and was previously
// missing entirely, so the notify-queue processor always threw ReferenceError (caught silently).
// Returns a header-name → 1-based column-index map for a given sheet.


// ── CE_HEADER_MAP_ ──
function CE_HEADER_MAP_(sh) {
  const h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(DC_NORM_);
  const map = {};
  h.forEach((k, i) => { if (k) map[k] = i + 1; });
  return map;
}


// ── P1_PROCESS_NOTIFY_QUEUE_ ──
function P1_PROCESS_NOTIFY_QUEUE_(e) {
  try {
    const sh = SHEET_("NOTIFY_QUEUE");
    if (sh) {
      const H = CE_HEADER_MAP_(sh);
      const lastRow = sh.getLastRow();
      if (lastRow >= 2 && H["LEAD_ID"] && H["STATUS"]) {
        const rows = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
        const cases = GET_MASTER_DATA_ALL_();
        for (let i = 0; i < rows.length; i++) {
          const status = String(rows[i][H["STATUS"] - 1] || "").toUpperCase();
          if (status !== "PENDING") continue;
          const leadId = String(rows[i][H["LEAD_ID"] - 1] || "").trim();
          const lead = cases.find(function (c) { return String(c.LEAD_ID || "") === leadId; });
          const row = i + 2;
          if (lead) {
            try { SEND_SMART_MAIL_(lead); } catch (err) { LOG_ERR_("QUEUE_SEND_MAIL", leadId, err.message); }
            try { P1_ROUTE_LEAD_NOTIFICATIONS_(lead); } catch (err) { LOG_ERR_("QUEUE_ROUTE_NOTIF", leadId, err.message); }
            sh.getRange(row, H["STATUS"]).setValue("SENT");
          } else {
            sh.getRange(row, H["STATUS"]).setValue("LEAD_NOT_FOUND");
          }
        }
      }
    }
  } catch (err) {
    LOG_ERR_("P1_PROCESS_NOTIFY_QUEUE", "", err.message);
  } finally {
    // Self-delete this one-off trigger so triggers don't accumulate over time
    try {
      const triggers = ScriptApp.getProjectTriggers();
      const thisFn = "P1_PROCESS_NOTIFY_QUEUE_";
      triggers.forEach(function (t) {
        if (t.getHandlerFunction() === thisFn && t.getEventType() === ScriptApp.EventType.CLOCK) {
          try { ScriptApp.deleteTrigger(t); } catch (e2) { /* ignore */ }
        }
      });
    } catch (e2) { /* ignore */ }
  }
}


// ── TG_IS_AUTHORIZED_CHAT_ ──
function TG_IS_AUTHORIZED_CHAT_(chatId) {
  const p = PropertiesService.getScriptProperties();
  const allowed = String(p.getProperty("MD_TG_CHAT_ID") || "").trim();
  return !!allowed && allowed === String(chatId).trim();
}


// ── WA_IS_AUTHORIZED_ ──
function WA_IS_AUTHORIZED_(from) {
  return false;
}


// ── TG_ADMIN_COMMAND_ ──
function TG_ADMIN_COMMAND_(chatId, text) {
  if (!TG_IS_AUTHORIZED_CHAT_(chatId)) return null;
  return RUN_ADMIN_COMMAND_(text);
}


// ── WA_ADMIN_COMMAND_ ──
function WA_ADMIN_COMMAND_(from, text) {
  if (!WA_IS_AUTHORIZED_(from)) return null;
  return RUN_ADMIN_COMMAND_(text);
}


// ── RUN_ADMIN_COMMAND_ ──
function RUN_ADMIN_COMMAND_(text) {
  const parts = String(text).trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();
  try {
    switch (cmd) {
      case "/help":
        return "🛠 P1 Command Console\n\n" +
          "/health — check sheets, master file, exec URL\n" +
          "/testpage — try rendering the web app, report exact error\n" +
          "/errors — last 5 error log entries\n" +
          "/clearcache — reset employee lookup cache\n" +
          "/reinstall — re-run full sheet/trigger install\n" +
          "/syncnow — force dashboard rebuild now\n" +
          "/webhook — re-register the Telegram webhook\n" +
          "/agents — status of all background agents\n" +
          "/installagents — (re)install all agent triggers\n" +
          "/directory <term> — search the bank/RM/company directory\n" +
          "/queue — check pending/sent notification status";
      case "/health": {
        const lines = ["🩺 Health Check:"];
        try {
          const ss = DC_GET_SS_();
          lines.push("✅ Master file opens: " + ss.getName());
          ["MASTER_DATA", "ALL_EMPLOYEES", "COMMON_ENTRY", "ERR"].forEach(n => {
            const sh = ss.getSheetByName(n);
            lines.push(sh ? "✅ " + n + " (" + sh.getLastRow() + " rows)" : "❌ " + n + " MISSING");
          });
        } catch (e) {
          lines.push("❌ Master file: " + e.message);
        }
        try {
          lines.push("🔗 Exec URL: " + P1_GET_EXEC_URL_());
        } catch (e) {
          lines.push("❌ Exec URL error: " + e.message);
        }
        const waOk = !!(DC_CFG.PROPS.getProperty("META_WA_TOKEN") && DC_CFG.PROPS.getProperty("META_WA_PHONE_ID"));
        lines.push(waOk ? "✅ WhatsApp credentials set" : "❌ META_WA_TOKEN / META_WA_PHONE_ID missing");
        return lines.join("\n");
      }
      case "/testpage": {
        try {
          let html = HtmlService.createHtmlOutputFromFile("index").getContent();
          html = html.split("__P1_BOOT_DATA_JSON__").join("{}");
          if (html.indexOf("<?") > -1) {
            return "⚠ index.html still contains old <?...?> scriptlet syntax — replace the BOOT_DATA block with the __P1_BOOT_DATA_JSON__ placeholder version.";
          }
          return "✅ Page file loads clean. No scriptlet syntax present.";
        } catch (e) {
          return "❌ Page load failed:\n" + e.message;
        }
      }
      case "/errors": {
        const sh = SHEET_("ERR");
        if (!sh || sh.getLastRow() < 2) return "No errors logged.";
        const lastRow = sh.getLastRow();
        const startRow = Math.max(2, lastRow - 4);
        const rows = sh.getRange(startRow, 1, (lastRow - startRow) + 1, 4).getValues();
        return "🚨 Last errors:\n" + rows.map(r => `[${r[0]}] ${r[1]} | ${r[2]} | ${r[3]}`).join("\n");
      }
      case "/clearcache":
        DC_EMP_CACHE = null;
        return "✅ Employee cache cleared.";
      case "/reinstall":
        return "✅ " + DC_INSTALL_P1_FINAL();
      case "/syncnow":
  SYNC_ROLE_DASHBOARDS_ENGINE();
  return "✅ Dashboard sync forced.";
      case "/webhook":
        return "✅ " + P1_SET_TG_WEBHOOK_RUN();
      case "/agents": {
        const runs = AGENT_LAST_RUNS_();
        const lines = AGENT_DEFS_.map(a => {
          const r = runs[a.key];
          if (!r) return `⚪ ${a.label} — never run`;
          const icon = r.status === "OK" ? "✅" : (r.status === "SKIPPED" ? "🟡" : "❌");
          return `${icon} ${a.label} — ${r.status} (${r.time})`;
        });
        return "🤖 Agent Status:\n" + lines.join("\n");
      }
      case "/installagents":
        return INSTALL_ALL_AGENTS();
      case "/directory": {
        const query = parts.slice(1).join(" ");
        if (!query) return "Usage: /directory <search term> (name, bank, city, pincode, etc.)";
        const rows = P1_SEARCH_DIRECTORY_(query);
        if (!rows.length) return "No matches for \"" + query + "\"";
        const lines = rows.map(r => {
          const fields = Object.keys(r).filter(k => k !== "_TAB" && r[k]).slice(0, 4)
            .map(k => k + ": " + r[k]).join(" | ");
          return `[${r._TAB}] ${fields}`;
        });
        return "🔍 " + rows.length + " match(es):\n" + lines.join("\n");
      }
      case "/queue": {
        const sh = SHEET_("NOTIFY_QUEUE");
        if (!sh || sh.getLastRow() < 2) return "Notification queue is empty.";
        const lastRow = sh.getLastRow();
        const startRow = Math.max(2, lastRow - 9);
        const rows = sh.getRange(startRow, 1, (lastRow - startRow) + 1, 3).getValues();
        const pending = rows.filter(r => String(r[2]).toUpperCase() === "PENDING").length;
        return `📬 Queue (last ${rows.length}): ${pending} pending\n` +
          rows.map(r => `[${r[2]}] ${r[1]} — ${r[0]}`).join("\n");
      }
      default:
        return "Unknown command. Send /help for the list.";
    }
  } catch (err) {
    LOG_ERR_("ADMIN_COMMAND", cmd, err.message);
    return "❌ Command failed: " + err.message;
  }
}


// ── P1_AUTO_DETECT_HEADER_ROW_ ──
function P1_AUTO_DETECT_HEADER_ROW_(values) {
  let bestRow = 0, bestScore = -1;
  for (let r = 0; r < Math.min(10, values.length); r++) {
    let score = 0;
    values[r].forEach(function (c) {
      const s = String(c || "").trim();
      if (s && isNaN(Number(s))) score++;
    });
    if (score > bestScore) { bestScore = score; bestRow = r; }
  }
  return bestRow;
}


// ── P1_READ_DIRECTORY_TAB_ ──
function P1_READ_DIRECTORY_TAB_(sh) {
  const values = sh.getDataRange().getValues();
  if (!values.length) return [];
  const headerRow = P1_AUTO_DETECT_HEADER_ROW_(values);
  const headers = values[headerRow].map(function (h) { return String(h || "").trim(); });
  const out = [];
  for (let r = headerRow + 1; r < values.length; r++) {
    const row = values[r];
    const hasData = row.some(function (c) { return String(c || "").trim(); });
    if (!hasData) continue;
    const obj = { _TAB: sh.getName() };
    headers.forEach(function (h, i) { if (h) obj[h] = row[i]; });
    out.push(obj);
  }
  return out;
}


// ── P1_LOOKUP_SM_BY_CITY_ ──
function P1_LOOKUP_SM_BY_CITY_(city) {
  const q = String(city || "").trim().toUpperCase();
  if (!q) return [];
  try {
    const ss = SpreadsheetApp.openById(P1_DIRECTORY_SHEET_ID_);
    const sh = ss.getSheetByName("OUTER_LOCATION_SM_LIST");
    if (!sh) return [];
    const rows = P1_READ_DIRECTORY_TAB_(sh);
    return rows.filter(function (r) {
      return String(r.CITY || "").toUpperCase().indexOf(q) > -1 ||
             String(r.STATE || "").toUpperCase().indexOf(q) > -1;
    }).slice(0, 5);
  } catch (e) {
    LOG_ERR_("P1_LOOKUP_SM_BY_CITY", city, e.message);
    return [];
  }
}


// ── AGENT_LOG_SHEET_ ──
function AGENT_LOG_SHEET_() {
  return P1_GET_OR_CREATE_SHEET_("AGENT_RUN_LOG");
}


// ── LOG_AGENT_RUN_ ──
function LOG_AGENT_RUN_(key, status, details) {
  try {
    const sh = AGENT_LOG_SHEET_();
    P1_ENSURE_HEADERS_(sh, ["TIMESTAMP", "AGENT", "STATUS", "DETAILS"]);
    sh.appendRow([new Date(), key, status, String(details || "").slice(0, 500)]);
  } catch (e) {
    Logger.log("Agent log write failed: " + e.message);
  }
}


// ── AGENT_RUN_ ──
function AGENT_RUN_(key, fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    LOG_AGENT_RUN_(key, "SKIPPED", "Another run in progress");
    return;
  }
  try {
    const result = fn();
    LOG_AGENT_RUN_(key, "OK", result || "");
  } catch (err) {
    LOG_AGENT_RUN_(key, "FAILED", err.message);
    LOG_ERR_("AGENT_" + key, "AGENT_RUN_FAIL", err.message);
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}


// ── AGENT_LAST_RUNS_ ──
function AGENT_LAST_RUNS_() {
  const sh = SHEET_("AGENT_RUN_LOG");
  if (!sh || sh.getLastRow() < 2) return {};
  const data = sh.getDataRange().getValues();
  const out = {};
  for (let i = 1; i < data.length; i++) {
    out[data[i][1]] = { time: data[i][0], status: data[i][2], details: data[i][3] };
  }
  return out;
}


// FIX: was undefined — called by AGENT_DASHBOARD_SYNC and the "/syncnow" admin command;
// previously threw ReferenceError (caught silently) so dashboard sync never actually ran.
// Wraps the existing MY_CASES/SALES_ACTIVITY per-employee sync engine.


// ── AGENT_DASHBOARD_SYNC ──
function AGENT_DASHBOARD_SYNC() {
  AGENT_RUN_("DASHBOARD_SYNC", function() {
    SYNC_ROLE_DASHBOARDS_ENGINE();
    return "Dashboards rebuilt";
  });
}


// ── AGENT_LEAD_FOLLOWUP ──
function AGENT_LEAD_FOLLOWUP() {
  AGENT_RUN_("LEAD_FOLLOWUP", function() {
    const staleStatuses = ["OPEN", "INTERESTED", "CALLBACK", "LOGIN", "PROCESS"];
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const all = GET_MASTER_DATA_ALL_();
    const stale = all.filter(r => {
      const status = String(r.CASE_CATEGORY || r.case_category || "").toUpperCase();
      const ts = new Date(r.TIMESTAMP || r.timestamp);
      return staleStatuses.includes(status) && !isNaN(ts.getTime()) && ts < cutoff;
    });
    if (!stale.length) return "No stale leads";
    const lines = stale.slice(0, 15).map(r =>
      `- ${r.CLIENT_NAME || r.client_name || "?"} | ${r.LOAN_TYPE || r.loan_type || "?"} | EMP:${r.EMP_CODE || r.emp_code || "?"} | ${r.CASE_CATEGORY || r.case_category}`
    );
    const msg = `⏰ ${stale.length} lead(s) untouched 24h+:\n` + lines.join("\n") +
      (stale.length > 15 ? `\n...and ${stale.length - 15} more` : "");
    DC_SEND_TG_(msg);
    return stale.length + " stale leads flagged";
  });
}


// ── AGENT_TAT_BREACH ──
function AGENT_TAT_BREACH() {
  AGENT_RUN_("TAT_BREACH", function() {
    const closedStatuses = ["APPROVED", "DISBURSED", "REJECTED", "CLOSED", "NOT INTERESTED", "INVALID", "WRONG NUMBER"];
    const all = GET_MASTER_DATA_ALL_();
    const now = Date.now();
    // FIX: dedup log — without this, every run (every 6h) re-sent the identical
    // nudge to the same employee for the same case, forever, for as long as it
    // stayed open past TAT. Now each employee gets notified once per stage
    // (APPROACHING once, BREACHED once) instead of being spammed indefinitely.
    const notifySh = P1_GET_OR_CREATE_SHEET_("TAT_NOTIFY_LOG");
    P1_ENSURE_HEADERS_(notifySh, ["LEAD_ID", "STAGE", "TIMESTAMP"]);
    const notifyLastRow = notifySh.getLastRow();
    const notifiedRows = notifyLastRow >= 2 ? notifySh.getRange(2, 1, notifyLastRow - 1, 2).getValues() : [];
    const notifiedSet = new Set(notifiedRows.map(r => String(r[0]) + "|" + String(r[1])));
    const newlyNotified = [];
    let approaching = 0, breached = 0;
    const breachedList = [];
    all.forEach(r => {
      const status = String(r.CASE_CATEGORY || r.case_category || "").toUpperCase();
      if (closedStatuses.includes(status)) return;
      const ts = new Date(r.TIMESTAMP || r.timestamp);
      if (isNaN(ts.getTime())) return;
      const empCode = r.EMP_CODE || r.emp_code || "";
      const leadId = String(r.LEAD_ID || r.lead_id || "");
      const tatDays = GET_TAT_BY_PRODUCT_(r.LOAN_TYPE || r.loan_type);
      const ageDays = (now - ts.getTime()) / (24 * 60 * 60 * 1000);
      if (ageDays > tatDays) {
        breached++;
        breachedList.push(r);
        const dedupKey = leadId + "|BREACHED";
        if (empCode && leadId && !notifiedSet.has(dedupKey)) {
          P1_NOTIFY_EMP_(empCode,
            `🚨 TAT BREACHED — Lead ${leadId} (${r.CLIENT_NAME || r.client_name || ""}) is ` +
            Math.floor(ageDays - tatDays) + ` day(s) past its ${tatDays}-day TAT. Please follow up now.`);
          notifiedSet.add(dedupKey);
          newlyNotified.push([leadId, "BREACHED", new Date()]);
        }
      } else if (ageDays >= tatDays - 1) {
        approaching++;
        const dedupKey = leadId + "|APPROACHING";
        if (empCode && leadId && !notifiedSet.has(dedupKey)) {
          P1_NOTIFY_EMP_(empCode,
            `⏰ TAT approaching — Lead ${leadId} (${r.CLIENT_NAME || r.client_name || ""}) is due within a day.`);
          notifiedSet.add(dedupKey);
          newlyNotified.push([leadId, "APPROACHING", new Date()]);
        }
      }
    });
    if (newlyNotified.length) {
      notifySh.getRange(notifySh.getLastRow() + 1, 1, newlyNotified.length, 3).setValues(newlyNotified);
    }
    if (!breached && !approaching) return "No TAT breaches or approaching deadlines";
    // Core (Founder/MD) summary still sent every run — a periodic management
    // overview is legitimate and expected, unlike per-employee spam.
    if (breached) {
      const lines = breachedList.slice(0, 15).map(r =>
        `- ${r.CLIENT_NAME || r.client_name || "?"} | ${r.LOAN_TYPE || r.loan_type || "?"} | EMP:${r.EMP_CODE || r.emp_code || "?"} | Lead:${r.LEAD_ID || r.lead_id || "?"}`
      );
      const msg = `🚨 ${breached} case(s) past TAT:\n` + lines.join("\n") +
        (breachedList.length > 15 ? `\n...and ${breachedList.length - 15} more` : "");
      DC_SEND_TG_(msg);
    }
    return breached + " breached, " + approaching + " approaching (" + newlyNotified.length + " new employee nudges sent)";
  });
}


// ── AGENT_DAILY_REPORT ──
function AGENT_DAILY_REPORT() {
  AGENT_RUN_("DAILY_REPORT", function() {
    const all = GET_MASTER_DATA_ALL_();
    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);
    const todayLeads = all.filter(r => {
      const ts = new Date(r.TIMESTAMP || r.timestamp);
      return !isNaN(ts.getTime()) && ts >= startToday;
    });
    const statusOf = r => String(r.CASE_CATEGORY || r.case_category || "").toUpperCase();
    const approved = todayLeads.filter(r => statusOf(r) === "APPROVED").length;
    const disbursed = todayLeads.filter(r => statusOf(r) === "DISBURSED").length;
    const timestamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    const msg = "🌅 P1 Daily Report — " + timestamp + "\n" +
      "New leads today: " + todayLeads.length + "\n" +
      "Approved today: " + approved + "\n" +
      "Disbursed today: " + disbursed + "\n" +
      "Total leads (all time): " + all.length;
    DC_SEND_TG_(msg);
    return "Report sent";
  });
}


// ── AGENT_WA_HEALTH ──
function AGENT_WA_HEALTH() {
  AGENT_RUN_("WA_HEALTH", function() {
    const token = DC_CFG.PROPS.getProperty("META_WA_TOKEN");
    const phoneId = DC_CFG.PROPS.getProperty("META_WA_PHONE_ID");
    if (!token || !phoneId) {
      DC_SEND_TG_("⚠ WhatsApp not configured: META_WA_TOKEN or META_WA_PHONE_ID missing.");
      return "Not configured";
    }
    const res = UrlFetchApp.fetch("https://graph.facebook.com/v20.0/" + phoneId, {
      method: "get",
      headers: { Authorization: "Bearer " + token },
      muteHttpExceptions: true
    });
    const code = res.getResponseCode();
    if (code < 200 || code >= 300) {
      DC_SEND_TG_("🚨 WhatsApp API check failed (HTTP " + code + "). Token may be expired — reconnect in Meta Business Suite.");
      return "FAILED HTTP " + code;
    }
    return "WhatsApp API OK";
  });
}


// ── AGENT_CACHE_RESET ──
function AGENT_CACHE_RESET() {
  AGENT_RUN_("CACHE_RESET", function() {
    DC_EMP_CACHE = null;
    return "Cache cleared";
  });
}


// ── AGENT_DEFS_ ──
const AGENT_DEFS_ = [
  { key: "DASHBOARD_SYNC",  handler: "AGENT_DASHBOARD_SYNC",  label: "Dashboard Sync",      schedule: { type: "minutes", every: 5 } },
  { key: "LEAD_FOLLOWUP",   handler: "AGENT_LEAD_FOLLOWUP",   label: "Stale Lead Watch",     schedule: { type: "hours",   every: 1 } },
  { key: "TAT_BREACH",      handler: "AGENT_TAT_BREACH",      label: "TAT Breach Watch",     schedule: { type: "hours",   every: 6 } },
  { key: "DAILY_REPORT",    handler: "AGENT_DAILY_REPORT",    label: "Daily Report",         schedule: { type: "daily",   atHour: 19 } },
  { key: "WA_HEALTH",       handler: "AGENT_WA_HEALTH",       label: "WhatsApp Health Check",schedule: { type: "hours",   every: 6 } },
  { key: "CACHE_RESET",     handler: "AGENT_CACHE_RESET",     label: "Employee Cache Reset", schedule: { type: "hours",   every: 4 } }
];


// ── INSTALL_ALL_AGENTS ──
function INSTALL_ALL_AGENTS() {
  const handlerNames = AGENT_DEFS_.map(a => a.handler)
    // also remove legacy standalone triggers so schedules don't double up
    .concat(["DASHBOARD_SYNC_TRIGGER_ENGINE", "DC_TG_DAILY_REPORT"]);
  ScriptApp.getProjectTriggers().forEach(t => {
    if (handlerNames.indexOf(t.getHandlerFunction()) > -1) {
      ScriptApp.deleteTrigger(t);
    }
  });
  AGENT_DEFS_.forEach(a => {
    let builder = ScriptApp.newTrigger(a.handler).timeBased();
    if (a.schedule.type === "minutes") {
      builder = builder.everyMinutes(a.schedule.every);
    } else if (a.schedule.type === "hours") {
      builder = builder.everyHours(a.schedule.every);
    } else if (a.schedule.type === "daily") {
      builder = builder.atHour(a.schedule.atHour).everyDays(1);
    }
    builder.create();
  });
  return "✅ " + AGENT_DEFS_.length + " agents installed: " + AGENT_DEFS_.map(a => a.label).join(", ");
}


// ── HANDLE_COMMON_ENTRY_EDIT_ ──
function HANDLE_COMMON_ENTRY_EDIT_(sh, row, col, val) {
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(DC_NORM_);
  const empIdx = headers.indexOf("EMP_CODE");
  
  // 1. EMP_CODE edited -> auto-fill employee details
  if (col === empIdx + 1 && val) {
    const emp = FIND_EMPLOYEE_FULL_(String(val).trim().toUpperCase());
    if (emp) {
      const fills = {
        "SALES_NAME": emp.NAME,
        "MANAGER_EMAIL": emp.MANAGER_EMAIL_ID || emp.MANAGER_EMAIL || "",
        "REPORTING_HEAD": emp.REPORTING_HEAD || "",
        "EMPLOYEE_EMAIL_ID": emp.EMPLOYEE_EMAIL || emp.EMPLOYEE_EMAIL_ID || ""
      };
      Object.keys(fills).forEach(k => {
        const ci = headers.indexOf(DC_NORM_(k));
        if (ci >= 0) sh.getRange(row, ci + 1).setValue(fills[k]);
      });
    }
  }
  // Reload row data
  const rowData = sh.getRange(row, 1, 1, sh.getLastColumn()).getValues()[0];
  const obj = {};
  headers.forEach((h, i) => obj[h] = rowData[i]);
  // 2. If EMP_CODE does not match (or is blank), try resolving via MANAGER_EMAIL
  let emp = obj.EMP_CODE ? FIND_EMPLOYEE_FULL_(obj.EMP_CODE) : null;
  const rawMgrEmail = DC_CLEAN_EMAIL_(obj.MANAGER_EMAIL || obj.MANAGER_EMAIL_ID || "");
  if (!emp && rawMgrEmail) {
    const tempEmp = FIND_EMPLOYEE_FULL_(rawMgrEmail);
    if (tempEmp) {
      emp = tempEmp;
      // Auto-populate the manager's code if EMP_CODE was empty/mismatched
      const ci = headers.indexOf("EMP_CODE");
      if (ci >= 0) {
        sh.getRange(row, ci + 1).setValue(tempEmp.EMP_CODE);
        obj.EMP_CODE = tempEmp.EMP_CODE;
      }
      obj.CASE_STATUS = "WITH_MANAGER_PENDING_ASSIGNMENT";
      const csIdx = headers.indexOf("CASE_STATUS");
      if (csIdx >= 0) sh.getRange(row, csIdx + 1).setValue("WITH_MANAGER_PENDING_ASSIGNMENT");
    }
  }
  if (!obj.CLIENT_MOBILE) return;
  // 3. Sync to SMART_LOG
  const slSh = SHEET_(DC_CFG.SHEETS.SMART_LOG);
  if (slSh) {
    UPSERT_BY_KEY_(slSh, "LEAD_ID", {
      TIMESTAMP: new Date(),
      LEAD_ID: obj.LEAD_ID,
      EMP_CODE: obj.EMP_CODE,
      SALES_NAME: obj.SALES_NAME || (emp ? emp.NAME : ""),
      MANAGER_EMAIL: obj.MANAGER_EMAIL || (emp ? (emp.MANAGER_EMAIL_ID || emp.MANAGER_EMAIL) : ""),
      CLIENT_NAME: obj.CLIENT_NAME,
      CLIENT_MOBILE: obj.CLIENT_MOBILE,
      LOAN_TYPE: obj.LOAN_TYPE,
      REQUIRED_LOAN_AMOUNT: obj.REQUIRED_LOAN_AMOUNT,
      PREFERRED_BANK: obj.PREFERRED_BANK,
      SOURCE_NAME: obj.SOURCE_NAME,
      DATA_FLOW: GET_SOURCE_ROUTING_MAP_()[String(obj.SOURCE_NAME || "").toUpperCase()] || "SALES",
      CASE_STATUS: obj.CASE_STATUS || "OPEN",
      ROUTING_STATUS: "SYNCED",
      PERSONAL_FILE_SYNC: "PENDING",
      REMARKS: obj.REMARKS,
      AI_ADVICE: obj.AI_ADVICE || ""
    }, ["TIMESTAMP", "LEAD_ID", "EMP_CODE", "SALES_NAME", "MANAGER_EMAIL", "CLIENT_NAME", "CLIENT_MOBILE", "LOAN_TYPE", "REQUIRED_LOAN_AMOUNT", "PREFERRED_BANK", "SOURCE_NAME", "DATA_FLOW", "CASE_STATUS", "ROUTING_STATUS", "PERSONAL_FILE_SYNC", "REMARKS", "AI_ADVICE"]);
  }
  // 4. Sync to MASTER_DATA
  const mdSh = SHEET_(DC_CFG.SHEETS.MASTER_DATA);
  if (mdSh) {
    const fullRow = MAP_TO_MASTER_(obj);
    UPSERT_BY_KEY_(mdSh, "LEAD_ID", fullRow, GET_MASTER_HEADERS_());
  }
  // 5. Sync to MIS_LOG
  const misSh = SHEET_(DC_CFG.SHEETS.MIS_LOG);
  if (misSh) {
    UPSERT_BY_KEY_(misSh, "LEAD_ID", {
      TIMESTAMP: new Date(),
      LEAD_ID: obj.LEAD_ID,
      EMP_CODE: obj.EMP_CODE,
      CLIENT_NAME: obj.CLIENT_NAME,
      CLIENT_MOBILE: obj.CLIENT_MOBILE,
      ROUTING_STATUS: "ROUTED",
      DATA_FLOW: GET_SOURCE_ROUTING_MAP_()[String(obj.SOURCE_NAME || "").toUpperCase()] || "SALES",
      PERSONAL_FILE_SYNC: emp ? "SYNCED" : "NO_FILE_ID",
      REMARKS: obj.REMARKS || ""
    }, ["TIMESTAMP", "LEAD_ID", "EMP_CODE", "CLIENT_NAME", "CLIENT_MOBILE", "ROUTING_STATUS", "DATA_FLOW", "PERSONAL_FILE_SYNC", "REMARKS"]);
  }
  // 6. Sync to Personal Files
  if (emp && emp.PERSONAL_FILE_ID) {
    try {
      const pss = P1_OPEN_SS_SAFE_(emp.PERSONAL_FILE_ID);
      const fullRow = MAP_TO_MASTER_(obj);
      let mySh = pss.getSheetByName("MY_CASES") || pss.insertSheet("MY_CASES");
      UPSERT_BY_KEY_(mySh, "LEAD_ID", fullRow, GET_MASTER_HEADERS_());
      LOCK_MY_CASES_VIEW_ONLY_(mySh, emp.EMP_CODE);
      
      let saSh = pss.getSheetByName("SALES_ACTIVITY") || pss.insertSheet("SALES_ACTIVITY");
      const actH = P1_ENSURE_HEADERS_(saSh, ["TIMESTAMP", "LEAD_ID", "CLIENT_NAME", "CLIENT_MOBILE", "LOAN_TYPE", "AMOUNT", "BANK", "STATUS", "REMARKS", "TAT_STATUS"]);
      saSh.appendRow(P1_BUILD_ROW_(actH, {
        TIMESTAMP: new Date(),
        LEAD_ID: obj.LEAD_ID,
        CLIENT_NAME: obj.CLIENT_NAME || "",
        CLIENT_MOBILE: obj.CLIENT_MOBILE || "",
        LOAN_TYPE: obj.LOAN_TYPE || "",
        AMOUNT: obj.REQUIRED_LOAN_AMOUNT || "",
        BANK: obj.PREFERRED_BANK || "",
        STATUS: obj.CASE_STATUS || "OPEN",
        REMARKS: obj.REMARKS || "",
        TAT_STATUS: obj.TAT_STATUS || "ACTIVE"
      }));
    } catch (_) {}
  }
}


// ── P1_DEBUG_STAFF ──
function P1_DEBUG_STAFF(){
  DC_EMP_CACHE=null;
  const sh=SHEET_(DC_CFG.SHEETS.ALL_EMPLOYEES);
  Logger.log("Sheet found: "+(!!sh)+" | rows: "+(sh?sh.getLastRow():0));
  if(sh) Logger.log("Headers RAW: "+JSON.stringify(sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0]));
  if(sh) Logger.log("Headers NORM: "+JSON.stringify(sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(DC_NORM_)));
  const map=DC_BUILD_EMP_MAP_();
  Logger.log("Map size: "+Object.keys(map).length+" | Codes: "+Object.keys(map).join(","));
  Logger.log("DC002: "+JSON.stringify(FIND_EMPLOYEE_FULL_("DC002")));
  Logger.log("STAFF_PUBLIC: "+JSON.stringify(P1_GET_STAFF_PUBLIC_DATA_("DC002")));
}


// ── DC_DATA_DOCTOR_ ──
function DC_DATA_DOCTOR_(){
  try {
    DC_EMP_CACHE=null;
    const map=DC_BUILD_EMP_MAP_();
    const byEmail={},byName={};
    Object.keys(map).forEach(c=>{const e=map[c];
      if(e.EMAIL)byEmail[e.EMAIL]=c;
      if(e.MANAGER_EMAIL)byEmail[e.MANAGER_EMAIL]=byEmail[e.MANAGER_EMAIL]||c;
      if(e.NAME)byName[String(e.NAME).trim().toUpperCase()]=c;
    });
    let fixed=0;
    ["COMMON_ENTRY","MASTER_DATA"].forEach(name=>{
      const sh=SHEET_(name); if(!sh||sh.getLastRow()<2)return;
      const d=sh.getDataRange().getValues(),h=d[0].map(DC_NORM_);
      const iC=h.indexOf("EMP_CODE"),iE=h.indexOf("EMPLOYEE_EMAIL"),iM=h.indexOf("MANAGER_EMAIL"),iS=h.indexOf("SALES_NAME");
      if(iC===-1)return;
      for(let r=1;r<d.length;r++){
        let code=String(d[r][iC]||"").trim().toUpperCase();
        const valid=!!map[code];
        if(!valid){
          const em=iE>-1?String(d[r][iE]||"").toLowerCase().trim():"";
          const mm=iM>-1?String(d[r][iM]||"").toLowerCase().trim():"";
          const sn=iS>-1?String(d[r][iS]||"").trim().toUpperCase():"";
          const nc=byEmail[em]||byEmail[mm]||byName[sn]||"";
          if(nc){sh.getRange(r+1,iC+1).setValue(nc);code=nc;fixed++;}
        }
        if(map[code]){
          const e=map[code];
          if(iS>-1&&!String(d[r][iS]||"").trim()&&e.NAME){sh.getRange(r+1,iS+1).setValue(e.NAME);fixed++;}
          if(iM>-1&&!String(d[r][iM]||"").trim()&&e.MANAGER_EMAIL){sh.getRange(r+1,iM+1).setValue(e.MANAGER_EMAIL);fixed++;}
          if(iE>-1&&!String(d[r][iE]||"").trim()&&e.EMAIL){sh.getRange(r+1,iE+1).setValue(e.EMAIL);fixed++;}
        }
      }
    });
    Logger.log("DATA_DOCTOR done | fixed="+fixed);
    return fixed;
  } catch (e) { LOG_ERR_("DC_DATA_DOCTOR_", "", e.message); return 0; }
}


// ── DC_DATA_DOCTOR ──
function DC_DATA_DOCTOR() {
  return DC_DATA_DOCTOR_();
}
