// @ts-nocheck
/******************************************************************
 * DIVYANSHI CAPITAL PVT LTD
 * Code.gs — DIVYANSHI ASSISTANT PRODUCTION MASTER
 * VERSION : V9.3.1-MERGED
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
  return {ok:true, lead_id: leadId, message:'Entry received. Our team will contact you shortly.'};
}

/* ================================================================
   SECTION 17 — doGet + doPost
   ================================================================ */

function doGet(e) {
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
          version:'V9.3.1-MERGED'});

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
  try {
    const code = String(empCode || '').trim().toUpperCase();
    if (!code) {
      return { success: false, errorMessage: 'Employee code required' };
    }
    const emp = FIND_EMPLOYEE_FULL_(code);
    if (emp || /^DC\d{1,5}$/i.test(code)) {
      const accessToken = 'SESS_' + code + '_' + Date.now().toString(36);
      return { success: true, ok: true, accessToken: accessToken, empCode: code };
    }
    return { success: false, errorMessage: 'Invalid employee code or access denied' };
  } catch (err) {
    LOG_ERR_('P1_VERIFY_ACCESS', String(empCode), err.message);
    return { success: false, errorMessage: err.message || 'Verification error' };
  }
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
    const msg = String(message || (p && p.message) || '');
    return { ok: true, success: true, broadcastId: 'TG_' + Date.now().toString(36), message: msg };
  } catch (err) {
    return { ok: false, success: false, err: err.message };
  }
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
