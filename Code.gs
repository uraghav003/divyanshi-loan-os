// @ts-nocheck
/******************************************************************
 * DIVYANSHI CAPITAL PVT LTD
 * Code.gs — DIVYANSHI ASSISTANT PRODUCTION MASTER
 * VERSION : V9.3.0-FAST
 * OWNER: Divyanshi Capital (DC002) / Divyanshi Assistant
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
      const found = emp?GET_MASTER_SNAPSHOT_().find(c => (String(c.LEAD_ID||'').toUpperCase()===q || DC_CLEAN_MOBILE_(String(c.CLIENT_MOBILE||''))===DC_CLEAN_MOBILE_(q))&&P1_CALLING_CAN_ACCESS_(emp,c)):null;
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

function GET_TAT_BY_PRODUCT_(loanType,preferredBank){
  const key=String(loanType||'').trim().toUpperCase(),catalog=GET_LOAN_BANK_CATALOG_();
  const selected=String(preferredBank||'').split(',').map(x=>x.trim().toUpperCase()).filter(Boolean);
  if(selected.length){const matching=catalog.rules.filter(rule=>rule.loanType.toUpperCase()===key&&selected.includes(rule.bank.toUpperCase())&&Number(rule.tatDays)>0);if(matching.length)return Math.min.apply(null,matching.map(rule=>Number(rule.tatDays)));}
  const product=catalog.products.find(p=>p.name.toUpperCase()===key||p.code.toUpperCase()===key);
  return product?Number(product.tat)||7:7;
}

function COMPUTE_TAT_(loanType,preferredBank){const tat=GET_TAT_BY_PRODUCT_(loanType,preferredBank);return{TAT_DAYS:tat,TAT_DEADLINE:new Date(Date.now()+tat*86400000),TAT_STATUS:'ACTIVE'};}

function P1_IDEMPOTENCY_CACHE_KEY_(raw){
  if(!String(raw||'').trim())return'';
  const digest=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(raw).trim());
  return'P1_SUBMIT_'+Utilities.base64EncodeWebSafe(digest).replace(/=+$/,'');
}
function P1_IDEMPOTENCY_BEGIN_(raw){
  const key=P1_IDEMPOTENCY_CACHE_KEY_(raw);if(!key)return{ok:false,err:'Submission key missing'};
  const lock=LockService.getScriptLock();if(!lock.tryLock(5000))return{ok:false,err:'System busy. Retry shortly.'};
  try{const cache=CacheService.getScriptCache(),hit=cache.get(key);if(hit){if(hit.indexOf('DONE:')===0){try{return{ok:true,replay:JSON.parse(hit.slice(5)),key};}catch(_){}}return{ok:false,err:'This submission is already processing. Please wait.'};}cache.put(key,'BUSY',600);return{ok:true,key};}
  finally{lock.releaseLock();}
}
function P1_IDEMPOTENCY_FINISH_(state,result){
  if(!state||!state.key)return result;
  const cache=CacheService.getScriptCache();
  if(result&&(result.ok||result.success)){try{cache.put(state.key,'DONE:'+JSON.stringify(result),21600);}catch(_){}}
  else cache.remove(state.key);
  return result;
}

/* ================================================================
   SECTION 12 — MAIN LEAD PIPELINE (6 stages)
   ================================================================ */

// Website leads arrive through the authenticated Loan OS server, never from a
// browser directly. Routing remains SSOT-driven through one approved employee.
function P1_WEBSITE_LEAD_SUBMIT_(p) {
  p=p||{};
  const props=PropertiesService.getScriptProperties(),routeKey=DC_CLEAN_EMAIL_(props.getProperty('WEBSITE_MANAGER_EMAIL_ID')||'');
  const routeEmp=FIND_EMPLOYEE_FULL_(routeKey),privacy=P1_GET_HR_PUBLIC_CONFIG();
  if(!routeEmp)return{ok:false,err:'Website routing is not configured. Set WEBSITE_MANAGER_EMAIL_ID to an active routing email.'};
  if(!privacy.privacyConfigured||!privacy.consentVersion)return{ok:false,err:'Website privacy configuration is incomplete.'};
  const consent=P1_BOOL_YES_(p.data_consent||p.DATA_CONSENT),aiNotice=P1_BOOL_YES_(p.ai_notice_accepted||p.AI_NOTICE_ACCEPTED);
  if(!consent||!aiNotice)return{ok:false,err:'Website consent and AI notice acknowledgement are required.'};
  return P1_SMART_FORM_SUBMIT_({
    ...p,
    entry_type:'CLIENT_ENTRY',source_name:'Website',source_type:'WEBSITE',
    manager_email_id:routeEmp.EMAIL,
    data_consent:'YES',ai_notice_accepted:'YES',consent_version:privacy.consentVersion,
    privacy_notice_url:privacy.privacyUrl,consent_source:'WEBSITE_WEBHOOK',submission_key:String(p.submission_key||Utilities.getUuid()).replace(/[^A-Za-z0-9_-]/g,'').slice(0,120)
  },true);
}

function P1_SMART_FORM_SUBMIT_(p,trustedTrigger) {
  let idem=null;
  try {
    p=p||{};
    const entryType=String(p.entry_type||p.ENTRY_TYPE||'').trim().toUpperCase();
    const submissionKey=String(p.submission_key||p.SUBMISSION_KEY||(trustedTrigger?Utilities.getUuid():'')).trim();
    if(!trustedTrigger&&!/^[A-Za-z0-9_-]{16,120}$/.test(submissionKey))return{ok:false,err:'Submission session missing. Refresh the form.'};
    if(!trustedTrigger&&String(p.website||p.company_website||'').trim())return{ok:false,err:'Submission rejected'};
    if(!trustedTrigger&&!P1_RATE_LIMIT_INTAKE_(p))return{ok:false,err:'Too many submissions. Try again later.'};
    // MANAGER_EMAIL_ID is the only inbound routing key. EMP_CODE is resolved
    // server-side after this lookup and is never accepted from a public form.
    const routeKey=DC_CLEAN_EMAIL_(p.manager_email_id||p.manager_email||p.MANAGER_EMAIL_ID||p.MANAGER_EMAIL||'');
    if(!routeKey)return{ok:false,err:'Manager email routing is required'};
    if(!trustedTrigger&&!P1_CONSUME_UPLOAD_TOKEN_(p.upload_token,submissionKey,routeKey))return{ok:false,err:'Form session expired. Refresh and retry.'};
    idem=P1_IDEMPOTENCY_BEGIN_(submissionKey);
    if(!idem.ok)return{ok:false,err:idem.err};
    if(idem.replay)return idem.replay;
    const finish=result=>P1_IDEMPOTENCY_FINISH_(idem,result);
    const privacy=P1_GET_HR_PUBLIC_CONFIG();
    if(!trustedTrigger&&(!privacy.privacyConfigured||!privacy.consentVersion))return finish({ok:false,err:'Privacy notice is not configured. Contact support.'});
    if(entryType==='NEW_STAFF_ENTRY')return finish(P1_NEW_STAFF_ENTRY_(p));
    if(entryType==='INTERVIEW_ENTRY')return finish(P1_INTERVIEW_ENTRY_(p));
    const consent=p.data_consent===true||String(p.data_consent||'').trim().toUpperCase()==='YES';
    if(!consent)return finish({ok:false,err:'Data processing consent required'});
    const aiNotice=p.ai_notice_accepted===true||String(p.ai_notice_accepted||p.AI_NOTICE_ACCEPTED||'').trim().toUpperCase()==='YES';
    if(!aiNotice)return finish({ok:false,err:'AI assistance notice acknowledgement required'});
    const clientName=String(p.client_name||p.CLIENT_NAME||p.full_name||'').trim(),mobile=DC_CLEAN_MOBILE_(p.client_mobile||p.CLIENT_MOBILE||p.mobile||'');
    if(!clientName||!mobile)return finish({ok:false,err:'Valid client name and 10-digit mobile required'});
    const loanFlow=['SALES_LEAD','CLIENT_ENTRY','BANKER_ENTRY','DOC_UPLOAD'].includes(entryType);
    if(loanFlow&&!String(p.loan_type||p.LOAN_TYPE||'').trim())return finish({ok:false,err:'Loan type required'});
    if(loanFlow&&!String(p.employment_type||p.EMPLOYMENT_TYPE||'').trim())return finish({ok:false,err:'Employment type required'});
    const amount=Number(p.required_loan_amount||p.REQUIRED_LOAN_AMOUNT||p.amount||0),age=p.age===''?null:Number(p.age),income=p.monthly_income===''?null:Number(p.monthly_income),emi=p.existing_emi===''?null:Number(p.existing_emi),cibil=p.cibil_score===''?null:Number(p.cibil_score);
    if(loanFlow&&(!Number.isFinite(amount)||amount<1000))return finish({ok:false,err:'Required amount must be at least INR 1,000'});
    if(age!==null&&(!Number.isFinite(age)||age<18||age>80))return finish({ok:false,err:'Age must be between 18 and 80'});
    if(income!==null&&(!Number.isFinite(income)||income<0))return finish({ok:false,err:'Monthly income cannot be negative'});
    if(emi!==null&&(!Number.isFinite(emi)||emi<0))return finish({ok:false,err:'Existing EMI cannot be negative'});
    if(cibil!==null&&(!Number.isFinite(cibil)||cibil<300||cibil>900))return finish({ok:false,err:'CIBIL score must be between 300 and 900'});
    const routeEmp=FIND_EMPLOYEE_FULL_(routeKey);
    if(!routeEmp)return finish({ok:false,err:'Manager/staff routing key is invalid or inactive'});
    if(!trustedTrigger&&!P1_VERIFY_ROUTE_SIGNATURE_(routeEmp.EMP_CODE,routeEmp.EMAIL,p.route_signature||p.ROUTE_SIGNATURE))return finish({ok:false,err:'Assigned staff link is invalid or expired'});
    if(entryType==='DOC_UPLOAD'&&(!Array.isArray(p.files)||!p.files.length))return finish({ok:false,err:'Select at least one document to upload'});
    const caseId='L'+mobile.slice(-4)+'_'+Date.now(),upload=P1_SAVE_CLIENT_DOCS_(p,caseId),docAudit=P1_DOC_AUDIT_(p,upload);
    const result=DC_PROCESS_LEAD_({
      LEAD_ID:caseId,
      EMP_CODE:routeEmp.EMP_CODE,
      SALES_NAME:routeEmp.NAME,
      MANAGER_EMAIL:routeKey,
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
      LOAN_TYPE:String(p.loan_type||p.LOAN_TYPE||'').trim(),
      PREFERRED_BANK:String(p.preferred_bank||p.PREFERRED_BANK||'').trim(),
      REQUIRED_LOAN_AMOUNT:String(p.required_loan_amount||p.REQUIRED_LOAN_AMOUNT||p.amount||'').trim(),
      DOCS_LINK:upload.folderUrl||p.docs_link||p.DOCS_LINK||'',
      DOC_STATUS:docAudit.status,
      DOC_AUDIT:docAudit.text,
      DATA_CONSENT:consent?'YES':'NO',
      CONSENT_VERSION:String(p.consent_version||p.CONSENT_VERSION||privacy.consentVersion||'').trim(),
      CONSENT_AT:p.consent_at||p.CONSENT_AT||new Date(),
      CONSENT_SOURCE:String(p.consent_source||p.CONSENT_SOURCE||p.source_type||p.SOURCE_TYPE||'WEB_APP').trim(),
      PRIVACY_NOTICE_URL:String(p.privacy_notice_url||p.PRIVACY_NOTICE_URL||privacy.privacyUrl||'').trim(),
      AI_NOTICE_ACCEPTED:aiNotice?'YES':'NO',
      MARKETING_CONSENT:P1_BOOL_YES_(p.marketing_consent||p.MARKETING_CONSENT)?'YES':'NO',
      CAMPAIGN:String(p.campaign||p.CAMPAIGN||'').trim(),
      FOLLOWUP_DATE:p.followup_date||p.FOLLOWUP_DATE||'',
      TASK_CATEGORY:p.task_category||p.TASK_CATEGORY||'NEW_LEAD',
      CASE_CATEGORY:p.case_category||p.CASE_CATEGORY||p.case_status||'OPEN',
      REMARKS:String(p.remarks||p.REMARKS||'').trim(),
      SOURCE_TYPE:p.source_type||p.SOURCE_TYPE||'WEB_APP',
      SOURCE_NAME:p.source_name||p.SOURCE_NAME||'P1_SMART_FORM'
    });
    if(result&&result.ok){result.docAudit=docAudit.summary;result.docsLink=upload.folderUrl;result.docStatus=docAudit.status;}
    else (upload.fileIds||[]).forEach(id=>{try{DriveApp.getFileById(id).setTrashed(true);}catch(_){}});
    return finish(result);
  } catch(e){ if(idem&&idem.key)CacheService.getScriptCache().remove(idem.key);const ref='ERR_'+Date.now();LOG_ERR_('P1_SMART_FORM_SUBMIT',ref,e.message); return {ok:false,err:'Submission could not be completed. Reference: '+ref}; }
}

function P1_SMART_FORM_SUBMIT(p){ return P1_SMART_FORM_SUBMIT_(p,false); }

function P1_CANDIDATE_ID_(p){
  const mobile=DC_CLEAN_MOBILE_(p.client_mobile||p.mobile||p.MOBILE||'');
  if(mobile)return 'CAND_'+mobile;
  const email=DC_CLEAN_EMAIL_(p.client_email||p.email||p.EMAIL||'');
  const digest=Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,email||String(Date.now()));
  return 'CAND_'+Utilities.base64EncodeWebSafe(digest).replace(/=+$/,'').slice(0,12).toUpperCase();
}

function P1_BOOL_YES_(value){return value===true||String(value||'').trim().toUpperCase()==='YES';}

function P1_CANDIDATE_OBJ_(p){
  const props=PropertiesService.getScriptProperties();
  return {
    TIMESTAMP:new Date(),CANDIDATE_ID:P1_CANDIDATE_ID_(p),
    ENTRY_TYPE:String(p.entry_type||'').toUpperCase(),
    EMPLOYEES_NAME:String(p.client_name||p.employees_name||p.EMPLOYEES_NAME||p.CANDIDATE_NAME||'').trim(),
    EMPLOYEE_EMAIL_ID:DC_CLEAN_EMAIL_(p.client_email||p.employee_email_id||p.EMPLOYEE_EMAIL_ID||p.EMPLOYEE_EMAIL||p.EMAIL||''),
    MOBILE:DC_CLEAN_MOBILE_(p.client_mobile||p.mobile||p.MOBILE||''),CITY:String(p.city_location||p.city||p.CITY_LOCATION||p.CITY||'').trim(),
    DEPARTMENT:String(p.department||p.DEPARTMENT||'').trim(),ROLE:String(p.permission_role||p.role||p.ROLE||'APPLICANT').trim(),DESIGNATION:String(p.designation_applied||p.role_applied||p.DESIGNATION||p.ROLE_APPLIED||'').trim(),
    EXPERIENCE_YEARS:p.experience_years||'',CURRENT_COMPANY:p.current_company||'',
    CURRENT_CTC:p.current_ctc||'',EXPECTED_CTC:p.expected_ctc||'',NOTICE_PERIOD:p.notice_period||'',
    SKILLS:p.skills||'',EDUCATION:p.education||'',INTERVIEWER_EMAIL:DC_CLEAN_EMAIL_(p.interviewer_email||''),
    INTERVIEW_STATUS:String(p.interview_status||'PENDING').toUpperCase(),
    MANAGER_NAME:p.manager_name||'',MANAGER_EMAIL_ID:DC_CLEAN_EMAIL_(p.manager_email_id||''),
    SALARY_MONTHLY:p.salary_monthly||'',JOINING_DATE:p.joining_date||'',EMP_CODE:'',
    STATUS:'PENDING',ACTIVE_STATUS:'PENDING',TC_ACCEPTED:P1_BOOL_YES_(p.tc_accepted||p.TC_ACCEPTED)?'YES':'NO',PRIVACY_CONSENT:P1_BOOL_YES_(p.candidate_consent||p.PRIVACY_CONSENT)?'YES':'NO',CONSENT_VERSION:String(p.consent_version||p.CONSENT_VERSION||props.getProperty('CONSENT_VERSION')||'').trim(),CONSENT_AT:p.consent_at||p.CONSENT_AT||new Date(),PRIVACY_NOTICE_URL:String(p.privacy_notice_url||p.PRIVACY_NOTICE_URL||props.getProperty('PRIVACY_NOTICE_URL')||'').trim(),
    ONBOARD_DONE:'NO',REMARKS:String(p.remarks||'').trim()
  };
}

function CREATE_CANDIDATE_RESUME_(candidate){
  try{
    const doc=DocumentApp.create(`${candidate.CANDIDATE_ID} - ${candidate.EMPLOYEES_NAME} - Candidate Profile`);
    const body=doc.getBody();
    body.appendParagraph(candidate.EMPLOYEES_NAME||'Candidate').setHeading(DocumentApp.ParagraphHeading.TITLE);
    body.appendParagraph(`Role Applied: ${candidate.ROLE||'Not specified'}`);
    body.appendParagraph(`Mobile: ${candidate.MOBILE||''} | Email: ${candidate.EMPLOYEE_EMAIL_ID||''} | City: ${candidate.CITY||''}`);
    body.appendParagraph('Professional Summary').setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph(`Experience: ${candidate.EXPERIENCE_YEARS||'Not provided'} years\nCurrent Company: ${candidate.CURRENT_COMPANY||'Not provided'}\nCurrent CTC: ${candidate.CURRENT_CTC||'Not provided'}\nExpected CTC: ${candidate.EXPECTED_CTC||'Not provided'}\nNotice Period: ${candidate.NOTICE_PERIOD||'Not provided'}`);
    body.appendParagraph('Skills & Education').setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph(`Skills: ${candidate.SKILLS||'Not provided'}\nEducation: ${candidate.EDUCATION||'Not provided'}`);
    body.appendParagraph('Interview Notes').setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph(candidate.REMARKS||'Pending interviewer notes.');
    doc.saveAndClose();
    const file=DriveApp.getFileById(doc.getId()),folderId=PropertiesService.getScriptProperties().getProperty('ONBOARDING_DRIVE_FOLDER_ID')||'';
    if(folderId){try{file.moveTo(DriveApp.getFolderById(folderId));}catch(_){}}
    return file.getUrl();
  }catch(e){LOG_ERR_('CREATE_CANDIDATE_RESUME',candidate.CANDIDATE_ID,e.message);return '';}
}

function P1_NEW_STAFF_ENTRY_(p){
  const c=P1_CANDIDATE_OBJ_(p);
  if(!c.EMPLOYEES_NAME||!c.MOBILE||!c.EMPLOYEE_EMAIL_ID)return{ok:false,err:'Name, mobile and registered email required'};
  if(c.TC_ACCEPTED!=='YES')return{ok:false,err:'Terms & Conditions acceptance required'};
  if(c.PRIVACY_CONSENT!=='YES')return{ok:false,err:'Candidate privacy consent required'};
  c.RESUME_LINK=CREATE_CANDIDATE_RESUME_(c);
  const sh=GET_OR_CREATE_('HR_MD_APPROVAL');
  UPSERT_MERGE_BY_KEY_(sh,'CANDIDATE_ID',c,P1_TAB_MAP.HR_MD_APPROVAL());
  DC_SEND_TG_(`🧑‍💼 *NEW STAFF ENTRY*\n${c.EMPLOYEES_NAME}|${c.ROLE||'Role pending'}|${c.MOBILE}\n→ HR/MD approval pending. EMP_CODE will be assigned only by HR.`);
  return{ok:true,candidateId:c.CANDIDATE_ID,status:'PENDING_HR_APPROVAL',leadId:c.CANDIDATE_ID};
}

function P1_INTERVIEW_ENTRY_(p){
  const c=P1_CANDIDATE_OBJ_(p);c.ENTRY_TYPE='INTERVIEW_ENTRY';
  if(!c.EMPLOYEES_NAME||!c.MOBILE||!c.EMPLOYEE_EMAIL_ID)return{ok:false,err:'Candidate name, mobile and email required'};
  if(c.PRIVACY_CONSENT!=='YES')return{ok:false,err:'Candidate privacy consent required'};
  c.RESUME_LINK=CREATE_CANDIDATE_RESUME_(c);
  const sh=GET_OR_CREATE_('INTERVIEW_LOG');
  UPSERT_MERGE_BY_KEY_(sh,'CANDIDATE_ID',{TIMESTAMP:c.TIMESTAMP,CANDIDATE_ID:c.CANDIDATE_ID,CANDIDATE_NAME:c.EMPLOYEES_NAME,EMAIL:c.EMPLOYEE_EMAIL_ID,MOBILE:c.MOBILE,CITY:c.CITY,ROLE_APPLIED:c.DESIGNATION,DESIGNATION:c.DESIGNATION,EXPERIENCE_YEARS:c.EXPERIENCE_YEARS,CURRENT_COMPANY:c.CURRENT_COMPANY,CURRENT_CTC:c.CURRENT_CTC,EXPECTED_CTC:c.EXPECTED_CTC,NOTICE_PERIOD:c.NOTICE_PERIOD,SKILLS:c.SKILLS,EDUCATION:c.EDUCATION,INTERVIEWER_EMAIL:c.INTERVIEWER_EMAIL,INTERVIEW_STATUS:c.INTERVIEW_STATUS,RESUME_LINK:c.RESUME_LINK,PRIVACY_CONSENT:c.PRIVACY_CONSENT,CONSENT_VERSION:c.CONSENT_VERSION,CONSENT_AT:c.CONSENT_AT,PRIVACY_NOTICE_URL:c.PRIVACY_NOTICE_URL,REMARKS:c.REMARKS},P1_TAB_MAP.INTERVIEW_LOG());
  DC_SEND_TG_(`🎙 *INTERVIEW ENTRY*\n${c.EMPLOYEES_NAME}|${c.ROLE||'Role pending'}|${c.MOBILE}\nResume: ${c.RESUME_LINK||'creation pending'}`);
  return{ok:true,candidateId:c.CANDIDATE_ID,status:'INTERVIEW_RECORDED',leadId:c.CANDIDATE_ID,resumeLink:c.RESUME_LINK};
}

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

    // Stage 2: ownership. MANAGER_EMAIL_ID is the single routing key; EMP_CODE
    // is resolved only after this lookup and cannot be selected by an intake.
    const routeEmail=DC_CLEAN_EMAIL_(lead.MANAGER_EMAIL||lead.MANAGER_EMAIL_ID||'');
    const emp=routeEmail?FIND_EMPLOYEE_FULL_(routeEmail):null;
    if(!emp)throw new Error('Active MANAGER_EMAIL_ID routing is required');
    lead.EMP_CODE=emp.EMP_CODE;
    lead.SALES_NAME=emp.NAME||lead.SALES_NAME||'';
    lead.MANAGER_EMAIL=routeEmail;
    lead.EMPLOYEE_EMAIL=emp.EMAIL||'';

    // Stage 3: TAT
    const tat=COMPUTE_TAT_(lead.LOAN_TYPE,lead.PREFERRED_BANK);
    lead.TAT_DAYS=tat.TAT_DAYS; lead.TAT_DEADLINE=tat.TAT_DEADLINE; lead.TAT_STATUS=tat.TAT_STATUS;

    // Stage 4: AI credit analysis
    let aiAdvice='';
    try {
      const aiPrompt='[REDACTED CREDIT FACTS]\n'+JSON.stringify({loan:lead.LOAN_TYPE,bank:lead.PREFERRED_BANK,amount:lead.REQUIRED_LOAN_AMOUNT,income:lead.MONTHLY_INCOME,cibil:lead.CIBIL_SCORE,emi:lead.EXISTING_EMI,documentStatus:lead.DOC_STATUS,emp:lead.EMP_CODE},null,2)+'\n\n[CTX]\n'+BUILD_AI_CONTEXT_(lead.EMP_CODE);
      const aiSys=BULBHUL_SYS_BASE_+'\n\nTask: Credit analysis. 4 sections:\n#### CIBIL Requirements:\n#### Matching Banks:\n#### Red Flags:\n#### Next Steps:';
      aiAdvice=MULTI_BRAIN_REPLY_(aiPrompt,aiSys);
      lead.AI_ADVICE=aiAdvice;
    } catch(ae){ aiAdvice='AI analysis unavailable.'; lead.AI_ADVICE=aiAdvice; }

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
    APPLY_TAT_COLOUR_(masterSh,rowNum,lead.CASE_CATEGORY||'OPEN');

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

function SEND_SMART_MAIL_(lead,aiAdvice,emp) {
  try {
    if(MailApp.getRemainingDailyQuota()<=0)return false;
    lead=lead||{}; aiAdvice=aiAdvice||lead.AI_ADVICE||'AI analysis unavailable.';
    if(!emp&&lead.EMP_CODE)emp=FIND_EMPLOYEE_FULL_(lead.EMP_CODE);
    const tatDays=Number(lead.TAT_DAYS)||GET_TAT_BY_PRODUCT_(lead.LOAN_TYPE);
    const dl=lead.TAT_DEADLINE?new Date(lead.TAT_DEADLINE):new Date(Date.now()+tatDays*86400000);
    const fmtDL=Utilities.formatDate(dl,'Asia/Kolkata','dd MMM yyyy, hh:mm a');
    const subject=`[NEW LEAD] ${lead.LEAD_ID||''} — ${lead.CLIENT_NAME||''} | ${lead.LOAN_TYPE||'Loan'} | ${lead.EMP_CODE||'Unassigned'}`;
    const aiHtml=String(aiAdvice)
      .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
      .replace(/#### (.*?)(\n|$)/g,'<h4 style="color:#0d2260;margin:12px 0 4px;border-bottom:1px solid #dce6f7;padding-bottom:3px;font-size:13px;">$1</h4>')
      .replace(/^- (.*?)(\n|$)/gm,'<li style="margin-bottom:5px;line-height:1.5">$1</li>')
      .replace(/\n/g,'<br>');
    const htmlBody=`<!DOCTYPE html><html><head><meta charset="utf-8">
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#eef1f5;padding:20px}.w{max-width:620px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 18px rgba(0,0,0,.10);border:1px solid #dde1e8}.h{background:#0d2260;padding:28px 24px;text-align:center}.h h1{color:#f5a623;font-size:24px;font-weight:900;letter-spacing:2px;margin-bottom:4px}.h p{color:rgba(255,255,255,.85);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:2px}.b{background:#d4af37;padding:13px 20px;text-align:center;color:#06112c;font-weight:900;font-size:14px;letter-spacing:1.5px;text-transform:uppercase}.c{padding:28px 24px}.g{font-size:15px;color:#222;line-height:1.6;margin-bottom:20px}table{width:100%;border-collapse:collapse;margin-bottom:24px;font-size:13px}td{padding:10px 12px;border-bottom:1px solid #f0f2f5;line-height:1.4;vertical-align:top}td.l{font-weight:700;color:#5a6a8a;width:32%;text-transform:uppercase;font-size:11px;letter-spacing:.5px}td.v{color:#111}.ai{background:#f7f9fc;border-left:4px solid #0d2260;border:1px solid #e0e6f0;border-radius:6px;padding:20px 22px}.ai-t{font-size:13px;font-weight:900;color:#0d2260;text-transform:uppercase;border-bottom:2px solid #0d2260;padding-bottom:5px;margin-bottom:14px;display:inline-block}.f{background:#0d2260;text-align:center;padding:14px;font-size:11px;color:rgba(255,255,255,.75)}</style></head><body>
<div class="w">
<div class="h"><h1>DIVYANSHI CAPITAL</h1><p>Divyanshi Assistant — Lead Notification</p></div>
<div class="b">⚡⚡⚡⚡⚡ NEW LEAD ASSIGNED</div>
<div class="c">
<p class="g">Hello <strong>${emp?emp.NAME:'Team'}</strong>, ek naya lead assign hua hai. Immediately follow up karo.</p>
<table>
<tr><td class="l">Lead ID</td><td class="v"><strong>${lead.LEAD_ID||'N/A'}</strong></td></tr>
<tr><td class="l">Client</td><td class="v"><strong>${lead.CLIENT_NAME||'N/A'}</strong></td></tr>
<tr><td class="l">Mobile</td><td class="v">${lead.CLIENT_MOBILE||'N/A'}</td></tr>
<tr><td class="l">Loan Type</td><td class="v">${lead.LOAN_TYPE||'N/A'}</td></tr>
<tr><td class="l">Amount</td><td class="v">₹ ${Number(lead.REQUIRED_LOAN_AMOUNT||0).toLocaleString('en-IN')||'N/A'}</td></tr>
<tr><td class="l">Bank</td><td class="v">${lead.PREFERRED_BANK||'Will Auto Update'}</td></tr>
<tr><td class="l">TAT</td><td class="v">${tatDays} days</td></tr>
<tr><td class="l">Deadline</td><td class="v"><strong style="color:#c0392b">${fmtDL}</strong></td></tr>
<tr><td class="l">Data Flow</td><td class="v">${lead.DATA_FLOW||'SALES'}</td></tr>
<tr><td class="l">Owner</td><td class="v">${emp?emp.NAME:'Unassigned'} (${lead.EMP_CODE||'—'})</td></tr>
<tr><td class="l">Remarks</td><td class="v" style="color:#555;font-style:italic">${String(lead.REMARKS||'No remarks.').slice(0,300)}</td></tr>
</table>
<div class="ai"><div class="ai-t">⚡⚡⚡⚡⚡ DIVYANSHI ASSISTANT — CREDIT ANALYSIS</div><div style="font-size:13px;line-height:1.7;color:#2c3e50">${aiHtml}</div></div>
</div><div class="f">Divyanshi Capital Pvt Ltd — Automated by Divyanshi Assistant — Do not reply</div>
</div></body></html>`;
    const sent=new Set();
    const addR=e=>{if(e){const el=String(e).trim().toLowerCase();if(el&&!sent.has(el))sent.add(el);}};
    addR(emp?emp.EMAIL:null); addR(lead.MANAGER_EMAIL); addR(DC_CFG.COMPANY.FOUNDER_EMAIL); addR(DC_CFG.COMPANY.MD_EMAIL);
    const arr=[...sent]; if(!arr[0])return false;
    GmailApp.sendEmail(arr[0],subject,'',{htmlBody,cc:arr.slice(1).join(',')||'',name:'Divyanshi Assistant'});
    return true;
  } catch(e){ LOG_ERR_('SEND_SMART_MAIL',(lead&&lead.LEAD_ID)||'',e.message); return false; }
}

function SEND_TG_LEAD_ALERT_(lead,emp) {
  const tatDays=Number(lead.TAT_DAYS)||GET_TAT_BY_PRODUCT_(lead.LOAN_TYPE);
  const dl=lead.TAT_DEADLINE?new Date(lead.TAT_DEADLINE):new Date(Date.now()+tatDays*86400000);
  const aiShort=String(lead.AI_ADVICE||'').split('\n').slice(0,6).join('\n').slice(0,400);
  DC_SEND_TG_(
    `🆕 *NEW LEAD — ${lead.DATA_FLOW||'SALES'}*\n━━━━━━━━━━━━━━━━━\n`+
    `🪪 *Lead ID:* ${lead.LEAD_ID||'N/A'}\n👤 *Client:* ${lead.CLIENT_NAME||'N/A'}\n📱 *Mobile:* ${lead.CLIENT_MOBILE||'N/A'}\n`+
    `💳 *Loan:* ${lead.LOAN_TYPE||'N/A'} | ₹${Number(lead.REQUIRED_LOAN_AMOUNT||0).toLocaleString('en-IN')}\n🏦 *Bank:* ${lead.PREFERRED_BANK||'TBD'}\n`+
    `⏱ *TAT:* ${tatDays}d | ⚠ ${Utilities.formatDate(dl,'Asia/Kolkata','dd MMM yyyy')}\n👔 *Owner:* ${emp?emp.NAME:'Unassigned'} (${lead.EMP_CODE||'—'})\n`+
    `📋 *Remarks:* ${String(lead.REMARKS||'N/A').slice(0,100)}\n━━━━━━━━━━━━━━━━━\n🤖 *Divyanshi Assistant:*\n${aiShort}`
  );
}

function NOTIFY_ACCOUNTS_ON_DISBURSE_(lead) {
  try {
    const sh=GET_OR_CREATE_('ACCOUNTS_LOG');
    sh.appendRow(P1_BUILD_ROW_(P1_ENSURE_HEADERS_(sh,P1_TAB_MAP.ACCOUNTS_LOG()),{TIMESTAMP:new Date(),LEAD_ID:lead.LEAD_ID||'',CLIENT_NAME:lead.CLIENT_NAME||'',CLIENT_MOBILE:lead.CLIENT_MOBILE||'',LOAN_TYPE:lead.LOAN_TYPE||'',REQUIRED_LOAN_AMOUNT:lead.REQUIRED_LOAN_AMOUNT||'',PREFERRED_BANK:lead.PREFERRED_BANK||'',SALES_NAME:lead.SALES_NAME||'',EMP_CODE:lead.EMP_CODE||'',DISBURSAL_STATUS:'PENDING_PROCESSING',REMARKS:lead.REMARKS||''}));
    if(MailApp.getRemainingDailyQuota()>0)
      MailApp.sendEmail({to:DC_CFG.COMPANY.ACCOUNTS_EMAIL,cc:DC_CFG.COMPANY.MD_EMAIL+','+DC_CFG.COMPANY.FOUNDER_EMAIL,subject:`[DISBURSAL] ${lead.LEAD_ID||''} — ${lead.CLIENT_NAME||''} | ${lead.PREFERRED_BANK||''}`,body:`Disbursed. Process PF/PDD.\n\nLead:${lead.LEAD_ID}\nClient:${lead.CLIENT_NAME}|${lead.CLIENT_MOBILE}\nLoan:${lead.LOAN_TYPE}|₹${Number(lead.REQUIRED_LOAN_AMOUNT||0).toLocaleString('en-IN')}\nBank:${lead.PREFERRED_BANK}\nOwner:${lead.SALES_NAME}(${lead.EMP_CODE})\n\n— Divyanshi Assistant`,name:DC_CFG.COMPANY.NAME});
    DC_SEND_TG_(`💰 *DISBURSAL*\n${lead.LEAD_ID||''}|${lead.CLIENT_NAME||''}|${lead.PREFERRED_BANK||''}|₹${Number(lead.REQUIRED_LOAN_AMOUNT||0).toLocaleString('en-IN')}\nOwner:${lead.SALES_NAME||''}(${lead.EMP_CODE||''})\n→Accounts notified.`);
  } catch(e){ LOG_ERR_('NOTIFY_ACCOUNTS_DISBURSE',lead.LEAD_ID||'',e.message); }
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
        // A backend-confirmed action is real work. Volume affects performance,
        // never whether a staff member is labelled absent.
        if(iSt>-1&&!['PRESENT','HALF_DAY','LEAVE'].includes(String(data[i][iSt]||'').toUpperCase()))sh.getRange(i+1,iSt+1).setValue('WORKING');
        if(iUp>-1)sh.getRange(i+1,iUp+1).setValue(new Date());
        return;
      }
    }
    const aH=P1_ENSURE_HEADERS_(sh,P1_TAB_MAP.ATTENDANCE_LOG());
    sh.appendRow(P1_BUILD_ROW_(aH,{DATE:today,LOG_KEY:logKey,EMP_CODE:empCode,EMP_NAME:emp.NAME,DEPARTMENT:emp.DEPARTMENT,ROLE:emp.ROLE,CALLS_TODAY:1,FIRST_PUNCH:Utilities.formatDate(new Date(),tz,'HH:mm'),ATTENDANCE_STATUS:'WORKING',LAST_UPDATED:new Date()}));
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
  if(text==='/start'||text==='/help'){DC_SEND_TG_MESSAGE_(chatId,'Namaste! 🙏 Divyanshi Assistant active hai.\n\nThis chat works only after the administrator maps this chat ID to an employee.\n/checkin1 or /checkin2 — manager attendance\n\nOr type karo, I\'ll help!');return'OK';}
  if(/^\/core\s+/i.test(text)){DC_SEND_TG_MESSAGE_(chatId,'Chat mapping is administrator-controlled. Contact the MD/technical owner.');return'OK';}
  try {
    const empCode=P1_TG_EMP_CODE_(chatId);if(!empCode){DC_SEND_TG_MESSAGE_(chatId,'This Telegram chat is not mapped to an active employee.');return'OK';}
    const reply=BULBHUL_CHAT_API_({message:text,empCode,source:'TELEGRAM'});
    DC_SEND_TG_MESSAGE_(chatId,String(reply||'Ji, bataiye?').slice(0,4000));
  } catch(e){ LOG_ERR_('TG_AI',chatId,e.message); }
  return'OK';
}

function P1_TG_DUPLICATE_(updateId) {
  if(!updateId)return false;
  const lock=LockService.getScriptLock();if(!lock.tryLock(3000))return true;
  try{
  const p=PropertiesService.getScriptProperties();
  const last=Number(p.getProperty('P1_TG_LAST_UPDATE_ID')||0),now=Number(updateId);
  if(now<=last)return true;
  p.setProperty('P1_TG_LAST_UPDATE_ID',String(now));
  return false;
  }finally{lock.releaseLock();}
}

function P1_FIND_LOGIN_COORDINATOR_(lead){
  const manager=DC_CLEAN_EMAIL_(lead&&lead.MANAGER_EMAIL||''),candidates=Object.values(DC_BUILD_EMP_MAP_()).filter(emp=>P1_ROLE_CAN_USE_CALLING_(emp)&&/LOGIN|COORDINATOR/.test((String(emp.ROLE||'')+' '+String(emp.DEPARTMENT||'')).toUpperCase()));
  return candidates.find(emp=>manager&&DC_CLEAN_EMAIL_(emp.MANAGER_EMAIL)===manager)||null;
}
// Move the existing case into Login without creating a second client row.
function P1_MOVE_CASE_TO_LOGIN_(lead,remark){
  const coordinator=P1_FIND_LOGIN_COORDINATOR_(lead);if(!coordinator)return{ok:false,err:'No active Login Coordinator is configured'};
  const sh=SHEET_('MASTER_DATA');if(!sh||sh.getLastRow()<2)return{ok:false,err:'MASTER_DATA not found'};
  const h=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(DC_NORM_),iLead=h.indexOf('LEAD_ID');
  const rows=sh.getRange(2,1,sh.getLastRow()-1,h.length).getValues(),wanted=String(lead.LEAD_ID||'').toUpperCase();
  for(let i=0;i<rows.length;i++)if(String(rows[i][iLead]||'').toUpperCase()===wanted){
    const row=i+2,set=(name,value)=>{const col=h.indexOf(name);if(col>-1)sh.getRange(row,col+1).setValue(value);};
    set('DATA_FLOW','LOGIN DEPARTMENT');set('PROCESS_STAGE','LOGIN');set('LOGIN_STAGE','PENDING');set('CASE_CATEGORY','SEND TO LOGIN');set('ASSIGNED_COORDINATOR',coordinator.EMP_CODE);set('LAST_UPDATED',new Date());
    if(remark){const col=h.indexOf('REMARKS');if(col>-1){const old=String(sh.getRange(row,col+1).getValue()||'').trim();sh.getRange(row,col+1).setValue(old?old+' | '+remark:remark);}}
    SC_.remove('MASTER_SNAP_V1');return{ok:true,row,lead:Object.assign({},lead,{DATA_FLOW:'LOGIN DEPARTMENT',PROCESS_STAGE:'LOGIN',LOGIN_STAGE:'PENDING',CASE_CATEGORY:'SEND TO LOGIN',ASSIGNED_COORDINATOR:coordinator.EMP_CODE})};
  }
  return{ok:false,err:'Lead not found'};
}

// Authenticated post-call camera/gallery attachment for an assigned case.
function P1_MINI_CRM_UPLOAD(data){
  try{data=data||{};const actor=P1_REQUIRE_API_ACTOR_(data);if(!actor)return{ok:false,err:'Employee session required'};
    const lead=GET_MASTER_SNAPSHOT_().find(c=>String(c.LEAD_ID||'').toUpperCase()===String(data.leadId||'').toUpperCase());
    if(!lead||!P1_CALLING_CAN_ACCESS_(actor,lead))return{ok:false,err:'Assigned case access required'};
    const files=Array.isArray(data.files)?data.files:[];if(!files.length)return{ok:false,err:'Select at least one JPEG, PNG, or PDF'};
    const upload=P1_SAVE_CLIENT_DOCS_({files:files},lead.LEAD_ID),update=UPDATE_LEAD_STATUS_(lead.LEAD_ID,'',data.remark||'Document image uploaded');
    if(!update.ok){(upload.fileIds||[]).forEach(id=>{try{DriveApp.getFileById(id).setTrashed(true);}catch(_){}});return update;}
    const sh=SHEET_('MASTER_DATA'),h=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(DC_NORM_),row=update.row;
    const set=(name,value)=>{const col=h.indexOf(name);if(col>-1)sh.getRange(row,col+1).setValue(value);};set('DOCS_LINK',upload.folderUrl);set('DOC_STATUS','AI_REVIEW_PENDING');
    const owner=FIND_EMPLOYEE_FULL_(lead.EMP_CODE);if(owner&&owner.PERSONAL_FILE_ID)SYNC_PERSONAL_FILE_FAST_(owner,Object.assign({},lead,{DOCS_LINK:upload.folderUrl,DOC_STATUS:'AI_REVIEW_PENDING'}),row);
    return{ok:true,names:upload.names};
  }catch(e){LOG_ERR_('P1_MINI_CRM_UPLOAD','',e.message);return{ok:false,err:e.message};}
}

function P1_SET_TG_WEBHOOK_() {
  const props=PropertiesService.getScriptProperties(),secret=String(props.getProperty('TG_WEBHOOK_SECRET')||'').trim()||Utilities.getUuid().replace(/-/g,'');if(!props.getProperty('TG_WEBHOOK_SECRET'))props.setProperty('TG_WEBHOOK_SECRET',secret);
  const token=DC_CFG.TG_TOKEN,url=P1_GET_EXEC_URL_(); if(!token||!url){Logger.log('⚠ TG_TOKEN or exec URL missing');return;}
  UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/deleteWebhook',{method:'post',contentType:'application/json',muteHttpExceptions:true,payload:JSON.stringify({drop_pending_updates:true})});
  Utilities.sleep(1000);
  Logger.log(UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/setWebhook',{method:'post',contentType:'application/json',muteHttpExceptions:true,payload:JSON.stringify({url:url+'?tg_secret='+encodeURIComponent(secret),allowed_updates:['message'],drop_pending_updates:true})}).getContentText());
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
    if(!emp)return{ok:false,err:'Valid active employee required',stats:{total:0,approved:0,review:0,volume:0},cases:[]};
    const access=emp?String(emp.DASHBOARD_ACCESS||emp.ROLE||'STAFF').toUpperCase():'STAFF';
    let data=GET_MASTER_SNAPSHOT_();
    if(!P1_HAS_MASTER_ACCESS_(emp))data=data.filter(r=>{
      if(String(r.ASSIGNED_COORDINATOR||'').toUpperCase()===empCode)return true;
      const ownerCode=String(r.EMP_CODE||'').toUpperCase();if(ownerCode===empCode)return true;
      const owner=FIND_EMPLOYEE_FULL_(ownerCode);return owner?P1_CAN_SEE_EMP_(emp,owner):false;
    });
    const sOf=r=>String(r.CASE_CATEGORY||'OPEN').toUpperCase();
    const stats={total:data.length,approved:data.filter(r=>['APPROVED','DISBURSED','DISBURSE'].includes(sOf(r))).length,review:data.filter(r=>['OPEN','INTERESTED','CALLBACK'].includes(sOf(r))).length,volume:data.reduce((s,r)=>s+Number(r.REQUIRED_LOAN_AMOUNT||0),0)};
    const cases=data.slice(0,150).map(r=>({leadId:r.LEAD_ID||'',clientName:r.CLIENT_NAME||'',mobile:r.CLIENT_MOBILE||'',loanType:r.LOAN_TYPE||'',amount:r.REQUIRED_LOAN_AMOUNT||'',bank:r.PREFERRED_BANK||'',status:sOf(r),tatStatus:r.TAT_STATUS||'ACTIVE',empCode:r.EMP_CODE||''}));
    return{ok:true,staff:{NAME:emp.NAME,ROLE:emp.ROLE||'',DESIGNATION:emp.DESIGNATION||emp.ROLE||'',DEPARTMENT:emp.DEPARTMENT||''},access,stats,cases,control:P1_GET_MASTER_CONTROL_(empCode),products:GET_ACTIVE_LOAN_PRODUCTS_(),banks:P1_GET_BANK_OPTIONS_MAP_()};
  } catch(e){ LOG_ERR_('P1_GET_STAFF_DASHBOARD_DATA',empCode,e.message); return{ok:false,err:e.message,stats:{total:0,approved:0,review:0,volume:0},cases:[]}; }
}

function P1_GET_STAFF_PUBLIC_DATA_(empCode) {
  try {
    empCode=String(empCode||'').trim().toUpperCase();
    const emp=empCode?FIND_EMPLOYEE_FULL_(empCode):null;if(!emp)return null;
    const base=P1_GET_EXEC_URL_(),e=encodeURIComponent(empCode);
    const designation=String(emp.DESIGNATION||emp.ROLE||'Financial Consultant').trim();
    const department=String(emp.DEPARTMENT||'').trim();
    const avatar=emp.PROFILE_PIC||`https://ui-avatars.com/api/?name=${encodeURIComponent(emp.NAME||empCode)}&background=d4af37&color=0a2540&size=160`;
    const routeEmail=DC_CLEAN_EMAIL_(emp.EMAIL||''),routeSig=routeEmail?P1_ROUTE_SIGNATURE_(emp.EMP_CODE,routeEmail):'';
    const route=routeEmail?`&manager_email_id=${encodeURIComponent(routeEmail)}&route_signature=${encodeURIComponent(routeSig)}`:'';
    return{ok:true,empCode,name:emp.NAME,role:String(emp.ROLE||designation).trim(),designation,dept:department,department,mobile:emp.MOBILE||'',whatsapp:emp.WHATSAPP||emp.MOBILE||'',email:emp.EMAIL||'',address:String(emp.OFFICE_ADDRESS||PropertiesService.getScriptProperties().getProperty('COMPANY_ADDRESS')||'').trim(),profilePic:avatar,formLink:`${base}?page=form&emp=${e}${route}`,dashboardLink:`${base}?page=dashboard&emp=${e}`,cardLink:`${base}?page=card&emp=${e}`,callingLink:`${base}?page=calling&emp=${e}`};
  } catch(e){ LOG_ERR_('P1_GET_STAFF_PUBLIC_DATA',empCode,e.message); return null; }
}

function P1_TG_EMP_CODE_(chatId){
  const p=PropertiesService.getScriptProperties(),id=String(chatId||'').trim();
  const mapped=[['MD_TG_CHAT_ID','MD_TG_EMP_CODE'],['FOUNDER_TG_CHAT_ID','FOUNDER_TG_EMP_CODE'],['ACCOUNTS_TG_CHAT_ID','ACCOUNTS_TG_EMP_CODE'],['HR_TG_CHAT_ID','HR_TG_EMP_CODE']];
  for(const pair of mapped){if(String(p.getProperty(pair[0])||'').trim()===id){const code=String(p.getProperty(pair[1])||'').trim().toUpperCase();if(code)return code;}}
  const emp=Object.values(DC_BUILD_EMP_MAP_()).find(e=>String(e.TG_CHAT_ID||'').trim()===id);return emp?emp.EMP_CODE:'';
}

/* ================================================================
   SECTION 20 — TRIGGERS + ONEDIT
   ================================================================ */

// Installable edit handler. A custom name prevents duplicate simple+installable execution.
function P1_ON_EDIT_INSTALLABLE(e) {
  try {
    if(!e||!e.range)return;
    const sh=e.range.getSheet(),name=sh.getName(),row=e.range.getRow(),col=e.range.getColumn();
    if(row<2)return;

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
        const watched=['STATUS','EMP_CODE','EMPLOYEE_EMAIL_ID','SALARY_MONTHLY','JOINING_DATE','ACTIVE_STATUS','MANAGER_EMAIL_ID','ROLE','DESIGNATION','TC_ACCEPTED'];
        if(watched.some(k=>col===h.indexOf(k)+1))PROCESS_HR_APPROVAL_ROW_(sh,row);
      } catch(_){}
    }

    // ALL_EMPLOYEES: smart auto-provision when 4 key fields filled
    if(name==='ALL_EMPLOYEES'){
      try { ALL_EMP_SMART_PROVISION_ON_EDIT_(sh,row,col); } catch(_){}
    }
  } catch(err){ LOG_ERR_('P1_ON_EDIT_INSTALLABLE','',err.message); }
}

/* ── ALL_EMPLOYEES smart provision on edit ── */
function ALL_EMP_SMART_PROVISION_ON_EDIT_(sh, row, col) {
  const h = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(DC_NORM_);
  const idx = k => { const n=DC_NORM_(k); return h.indexOf(n); };
  const iCode = idx('EMP_CODE');
  if(iCode < 0) return;

  const rowVals = sh.getRange(row,1,1,h.length).getValues()[0];
  const get = k => { const i=idx(k); return i>-1?String(rowVals[i]||'').trim():''; };

  const empCode = (get('EMP_CODE')).toUpperCase();
  if(!empCode) return;

  const empName = get('EMPLOYEES_NAME')||get('EMPLOYEE_NAME')||get('NAME');
  const dept    = get('DEPARTMENT');
  const email   = DC_CLEAN_EMAIL_(get('EMPLOYEE_EMAIL_ID')||get('EMPLOYEE_EMAIL'));
  const fileId  = get('PERSONAL_FILE_ID');
  const props   = PropertiesService.getScriptProperties();

  // HR manually filled PERSONAL_FILE_ID → queue link mapping immediately
  const iFile = idx('PERSONAL_FILE_ID');
  if(iFile > -1 && col === iFile+1 && fileId.length > 15) {
    props.setProperty('AUTO_PROVISION_PENDING_'+empCode, 'LINKS_ONLY');
    MARK_DASHBOARD_SYNC_PENDING();
    return;
  }

  // All 4 key fields present + PERSONAL_FILE_ID missing → queue full provision
  if(empCode && empName && dept && email && (!fileId || fileId.length < 15)) {
    props.setProperty('AUTO_PROVISION_PENDING_'+empCode, 'FULL');
    MARK_DASHBOARD_SYNC_PENDING();
  }
}

/* ── Process pending auto-provisions (called by MIS 15-min trigger) ── */
function P1_PROCESS_AUTO_PROVISION_() {
  const props = PropertiesService.getScriptProperties();
  const all   = props.getProperties();
  const keys  = Object.keys(all).filter(k => k.startsWith('AUTO_PROVISION_PENDING_'));
  if(!keys.length) return;

  keys.forEach(function(key) {
    const empCode = key.replace('AUTO_PROVISION_PENDING_','');
    try {
      fixIndividualStaff_(empCode);
      props.deleteProperty(key);
      Logger.log('✅ Auto-provisioned: '+empCode);
    } catch(e) {
      LOG_ERR_('P1_PROCESS_AUTO_PROVISION_', empCode, e.message);
    }
  });
}

function P1_FORM_SUBMIT(e) {
  try {
    if(!e)return;
    const nv=e.namedValues||{};
    const lead={};
    Object.keys(nv).forEach(k=>{lead[DC_NORM_(k)]=Array.isArray(nv[k])?nv[k][0]:nv[k];});
    const isStaff=(lead['EMPLOYEES_NAME']||lead['EMPLOYEE_EMAIL_ID']||lead['EMPLOYEE_EMAIL'])&&!lead['CLIENT_NAME'];
    const entryType=String(lead.ENTRY_TYPE||(isStaff?'NEW_STAFF_ENTRY':'SALES_LEAD')).trim().toUpperCase();
    const payload=Object.assign({},lead,{
      entry_type:entryType,submission_key:'GF_'+Utilities.getUuid().replace(/-/g,''),source_type:'GOOGLE_FORM',source_name:lead.SOURCE_NAME||'Google Form',
      client_name:lead.CLIENT_NAME||lead.EMPLOYEES_NAME||lead.CANDIDATE_NAME||'',client_mobile:lead.CLIENT_MOBILE||lead.MOBILE||'',client_email:lead.CLIENT_EMAIL||lead.EMPLOYEE_EMAIL_ID||lead.EMPLOYEE_EMAIL||lead.EMAIL||'',
      manager_email_id:lead.MANAGER_EMAIL_ID||lead.MANAGER_EMAIL||'',data_consent:lead.DATA_CONSENT,candidate_consent:lead.PRIVACY_CONSENT||lead.CANDIDATE_CONSENT,tc_accepted:lead.TC_ACCEPTED,
      ai_notice_accepted:lead.AI_NOTICE_ACCEPTED,consent_version:lead.CONSENT_VERSION,consent_at:new Date(),consent_source:'GOOGLE_FORM',privacy_notice_url:lead.PRIVACY_NOTICE_URL
    });
    const result=P1_SMART_FORM_SUBMIT_(payload,true);
    if(!result||!result.ok)LOG_ERR_('P1_FORM_SUBMIT','VALIDATION_REJECTED',result&&result.err?result.err:'Unknown validation error');
    return result;
  } catch(err){ LOG_ERR_('P1_FORM_SUBMIT','',err.message); }
}

function P1_HR_ONBOARDING_MISSING_(o){
  const role=String(o.ROLE||'').toUpperCase(),missing=[];
  if(!String(o.EMP_CODE||'').trim())missing.push('EMP_CODE');
  if(!DC_CLEAN_EMAIL_(o.EMPLOYEE_EMAIL_ID||o.EMPLOYEE_EMAIL||''))missing.push('EMPLOYEE_EMAIL_ID');
  if(!/FOUNDER|\bMD\b|MANAGING DIRECTOR/.test(role)&&!DC_CLEAN_EMAIL_(o.MANAGER_EMAIL_ID||o.MANAGER_EMAIL||''))missing.push('MANAGER_EMAIL_ID');
  if(!String(o.ROLE||'').trim())missing.push('ROLE');
  if(!String(o.DESIGNATION||o.ROLE||'').trim())missing.push('DESIGNATION');
  if(!String(o.SALARY_MONTHLY||'').trim())missing.push('SALARY_MONTHLY');
  if(!String(o.JOINING_DATE||'').trim())missing.push('JOINING_DATE');
  if(!P1_BOOL_YES_(o.TC_ACCEPTED))missing.push('TC_ACCEPTED');
  return missing;
}

function PROCESS_HR_APPROVAL_ROW_(sh,row){
  const h=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(DC_NORM_);
  const v=sh.getRange(row,1,1,h.length).getValues()[0],o={};h.forEach((k,i)=>o[k]=v[i]);
  const status=String(o.STATUS||'').trim().toUpperCase(),empCode=String(o.EMP_CODE||'').trim().toUpperCase();
  if(!['APPROVED','ACTIVE'].includes(status)||String(o.ONBOARD_DONE||'').toUpperCase()==='YES')return;
  const missing=P1_HR_ONBOARDING_MISSING_(o);
  if(missing.length){
    const remarksIndex=h.indexOf('REMARKS');
    if(remarksIndex>-1)sh.getRange(row,remarksIndex+1).setValue('HR onboarding blocked: '+missing.join(', '));
    return;
  }
  const role=String(o.ROLE||'STAFF').trim(),designation=String(o.DESIGNATION||o.ROLE||role).trim(),roleU=role.toUpperCase();
  const access=/FOUNDER|MD/.test(roleU)?'ALL':/MANAGER|HEAD/.test(roleU)?'TEAM':'SELF';
  const emp={BRAND_NAME:'DIVYANSHI CAPITAL',EMP_CODE:empCode,EMPLOYEES_NAME:o.EMPLOYEES_NAME||'',ROLE:role,DESIGNATION:designation,DEPARTMENT:o.DEPARTMENT||'',EMPLOYEE_EMAIL_ID:o.EMPLOYEE_EMAIL_ID||'',MOBILE:o.MOBILE||'',SALARY_MONTHLY:o.SALARY_MONTHLY||'',MANAGER_NAME:o.MANAGER_NAME||'',MANAGER_EMAIL_ID:o.MANAGER_EMAIL_ID||'',HR_APPROVAL:'APPROVED',MD_APPROVAL:'APPROVED',APPROVAL_STATUS:'APPROVED',ACCESS_LEVEL:access,JOINING_DATE:o.JOINING_DATE||new Date(),ACTIVE_STATUS:o.ACTIVE_STATUS&&String(o.ACTIVE_STATUS).toUpperCase()!=='PENDING'?o.ACTIVE_STATUS:'ACTIVE',CREATED_AT:new Date(),UPDATED_AT:new Date(),SYSTEM_KEY:empCode};
  const empSh=GET_OR_CREATE_('ALL_EMPLOYEES');
  UPSERT_MERGE_BY_KEY_(empSh,'EMP_CODE',emp,P1_TAB_MAP.ALL_EMPLOYEES());
  CLEAR_EMP_CACHE_();
  const provision=fixIndividualStaff_(empCode);
  CLEAR_EMP_CACHE_();
  const liveEmp=FIND_EMPLOYEE_FULL_(empCode)||emp;
  const sent=SEND_EMPLOYEE_JOINING_KIT_(liveEmp,o);
  const set=(k,val)=>{const i=h.indexOf(k);if(i>-1)sh.getRange(row,i+1).setValue(val);};
  set('ACTIVE_STATUS','ACTIVE');set('ONBOARD_DONE',sent?'YES':'PROVISIONED');set('JOINING_KIT_SENT_AT',sent?new Date():'');
  DC_SEND_TG_(`✅ *STAFF ONBOARDED*\n${empCode}|${emp.EMPLOYEES_NAME}|${role}\n${provision}`);
}

function SEND_EMPLOYEE_JOINING_KIT_(emp,approval){
  try{
    const to=DC_CLEAN_EMAIL_(emp.EMAIL||approval.EMPLOYEE_EMAIL_ID||'');if(!to)return false;
    const props=PropertiesService.getScriptProperties(),base=P1_GET_EXEC_URL_(),e=encodeURIComponent(emp.EMP_CODE||'');
    const manager=approval.MANAGER_NAME||emp.MANAGER_NAME||'Your reporting manager';
    const tcUrl=props.getProperty('HR_TC_URL')||'',companyUrl=props.getProperty('COMPANY_WEBSITE_URL')||'https://www.divyanshicapital.com';
    const links={Website:`${base}?page=home&emp=${e}`,SmartForm:`${base}?page=form&emp=${e}`,DigitalCard:`${base}?page=card&emp=${e}`,Dashboard:`${base}?page=dashboard&emp=${e}`,Calling:`${base}?page=calling&emp=${e}`,PersonalFile:emp.PERSONAL_FILE_ID?`https://docs.google.com/spreadsheets/d/${emp.PERSONAL_FILE_ID}/edit`:''};
    const linkHtml=Object.keys(links).filter(k=>links[k]).map(k=>`<li><a href="${links[k]}">${k}</a></li>`).join('');
    const html=`<div style="font-family:Arial;color:#10213b;max-width:700px"><h1 style="color:#0a2540">Welcome to Divyanshi Capital</h1><p>Dear <b>${emp.NAME||approval.EMPLOYEES_NAME||''}</b>,</p><p>Your onboarding is approved. Employee code: <b>${emp.EMP_CODE}</b>.</p><h3>Your role</h3><p><b>${emp.ROLE||''}</b> — ${emp.DEPARTMENT||''}. Reporting manager: <b>${manager}</b>${approval.MANAGER_EMAIL_ID?` (${approval.MANAGER_EMAIL_ID})`:''}.</p><h3>Company brief</h3><p>Divyanshi Capital supports customers across loan products through transparent eligibility checks, document coordination, bank mapping and service follow-up. Use only approved data, protect customer information and keep every activity updated.</p><h3>Your work links</h3><ul>${linkHtml}</ul><h3>First-day formalities</h3><ol><li>Read the company and role brief.</li><li>Review Terms & Conditions and confidentiality rules.</li><li>Open your Personal File and verify manager, role, mobile and email.</li><li>Complete attendance/check-in and contact HR if any mapping is wrong.</li></ol>${tcUrl?`<p><a href="${tcUrl}">Read Terms & Conditions</a></p>`:''}<p>Company website: <a href="${companyUrl}">${companyUrl}</a></p><p>Regards,<br><b>HR Avatar — Divyanshi Capital</b></p></div>`;
    const attachments=[];
    ['HR_ICARD_FILE_ID','HR_TC_FILE_ID'].forEach(k=>{const id=props.getProperty(k)||'';if(id){try{attachments.push(DriveApp.getFileById(id).getBlob());}catch(_){}}});
    const cc=[DC_CFG.COMPANY.HR_EMAIL,DC_CFG.COMPANY.MD_EMAIL].filter(Boolean);
    if(!P1_MAIL_QUOTA_(1+cc.length,'JOINING_KIT'))return false;
    MailApp.sendEmail({to,cc:cc.join(','),subject:`Welcome to Divyanshi Capital | ${emp.EMP_CODE} | Joining Kit`,body:`Welcome ${emp.NAME||''}. Employee Code: ${emp.EMP_CODE}. Please open your joining kit links.`,htmlBody:html,attachments});
    return true;
  }catch(e){LOG_ERR_('SEND_EMPLOYEE_JOINING_KIT',emp.EMP_CODE||'',e.message);return false;}
}

function HR_DAILY_ONBOARDING_FOLLOWUP_(){
  try{
    const sh=SHEET_('HR_MD_APPROVAL');if(!sh||sh.getLastRow()<2)return;
    const data=sh.getDataRange().getValues(),h=data[0].map(DC_NORM_);let pending=[];
    data.slice(1).forEach(r=>{const o={};h.forEach((k,i)=>o[k]=r[i]);if(String(o.ONBOARD_DONE||'').toUpperCase()!=='YES')pending.push(`${o.CANDIDATE_ID||''}|${o.EMPLOYEES_NAME||''}|${o.STATUS||'PENDING'}|EMP:${o.EMP_CODE||'NOT ASSIGNED'}`);});
    if(pending.length)DC_SEND_TG_(`🧑‍💼 *HR AVATAR DAILY FOLLOW-UP*\n${pending.slice(0,20).join('\n')}\n→ Verify interview, approval, EMP_CODE, salary, manager, joining date and attendance readiness.`);
  }catch(e){LOG_ERR_('HR_DAILY_ONBOARDING_FOLLOWUP','',e.message);}
}

/* ================================================================
   SECTION 21 — SETUP + MIS TRIGGERS
   ================================================================ */

function SETUP_STANDALONE_() {
  Logger.log('═══════════════════════════════');
  Logger.log('  DIVYANSHI CAPITAL — V9.3.0-FAST SETUP');
  Logger.log('═══════════════════════════════');
  if(!MASTER_SS_ID||MASTER_SS_ID.length<20)throw new Error('MASTER_SS_ID missing');
  Logger.log('✅ MASTER_SS_ID: '+MASTER_SS_ID);
  let execUrl='';
  try{execUrl=ScriptApp.getService().getUrl();Logger.log('✅ Exec URL: '+execUrl);}catch(_){Logger.log('⚠ Deploy as Web App first');}
  const setupProps=PropertiesService.getScriptProperties();
  P1_MIGRATE_CORE_PROPERTIES_();
  setupProps.setProperty('MASTER_FILE_ID',MASTER_SS_ID);
  if(execUrl)setupProps.setProperty('P1_EXEC_URL',execUrl);
  if(!setupProps.getProperty('MALLIK_API_KEY'))setupProps.setProperty('MALLIK_API_KEY',(Utilities.getUuid()+Utilities.getUuid()).replace(/-/g,''));
  try{const ss=SpreadsheetApp.openById(MASTER_SS_ID);Logger.log('✅ Sheet: '+ss.getName()+' | '+ss.getSheets().length+' tabs');}catch(e){throw new Error('Sheet open failed: '+e.message);}
  Logger.log('═══════════════════════════════  SETUP COMPLETE ✅  Next → DC_INSTALL_P1_FINAL_()');
}

function DC_INSTALL_P1_FINAL_() {
  const ss=DC_GET_SS_();
  Object.keys(P1_TAB_MAP).forEach(name=>{if(!ss.getSheetByName(name))ss.insertSheet(name);P1_ENSURE_HEADERS_(ss.getSheetByName(name),P1_TAB_MAP[name]());});
  ['AVATAR_ACTIVITY_LOG','NOTIFY_QUEUE'].forEach(n=>{if(!ss.getSheetByName(n))ss.insertSheet(n);});
  SYNC_SOURCE_NAME_MASTER_();
  P1_CLIENT_DOCS_ROOT_();
  const managed=['MIS_PIPELINE_RUN_','SYNC_MASTER_CONTROL_CENTER_','SEND_EVENING_MIS_REPORT_','ATTENDANCE_EOD_REPORT_','HR_DAILY_ONBOARDING_FOLLOWUP_','P1_ROLE_DASHBOARD_DAILY_','P1_MAP_HTML_LINKS_','onEdit','P1_ON_EDIT_INSTALLABLE','P1_FORM_SUBMIT'];
  ScriptApp.getProjectTriggers().forEach(t=>{if(managed.includes(t.getHandlerFunction()))ScriptApp.deleteTrigger(t);});
  ScriptApp.newTrigger('MIS_PIPELINE_RUN_').timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger('SYNC_MASTER_CONTROL_CENTER_').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('SEND_EVENING_MIS_REPORT_').timeBased().atHour(19).everyDays(1).create();
  ScriptApp.newTrigger('ATTENDANCE_EOD_REPORT_').timeBased().atHour(20).everyDays(1).create();
  ScriptApp.newTrigger('HR_DAILY_ONBOARDING_FOLLOWUP_').timeBased().atHour(10).everyDays(1).create();
  ScriptApp.newTrigger('P1_ROLE_DASHBOARD_DAILY_').timeBased().atHour(6).everyDays(1).create();
  ScriptApp.newTrigger('P1_MAP_HTML_LINKS_').timeBased().atHour(5).everyDays(1).create();
  try{ScriptApp.newTrigger('P1_ON_EDIT_INSTALLABLE').forSpreadsheet(ss).onEdit().create();}catch(_){}
  try{ScriptApp.newTrigger('P1_FORM_SUBMIT').forSpreadsheet(ss).onFormSubmit().create();}catch(_){}
  P1_SET_TG_WEBHOOK_();
  SYNC_MASTER_CONTROL_CENTER_();
  try{P1_MAP_HTML_LINKS_();}catch(e){LOG_ERR_('DC_INSTALL_P1_FINAL_','P1_MAP_HTML_LINKS_',e.message);}
  Logger.log('✅ DC_INSTALL_P1_FINAL_ complete');
  return'INSTALL_OK';
}

function MIS_PIPELINE_RUN_() {
  const lock=LockService.getScriptLock(); if(!lock.tryLock(60000)){Logger.log('MIS: lock busy.');return;}
  try{
    FETCH_AND_PROCESS_MIS_MAILS_();
    MIS_15MIN_FULL_SYNC_();
    try{P1_PROCESS_AUTO_PROVISION_();}catch(_){}
    PropertiesService.getScriptProperties().setProperty('MIS_LAST_RUN',new Date().toISOString());
    Logger.log('✅ MIS done');
  }
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
    if(MailApp.getRemainingDailyQuota()>0)MailApp.sendEmail({to:DC_CFG.COMPANY.MD_EMAIL,cc:DC_CFG.COMPANY.FOUNDER_EMAIL+','+DC_CFG.COMPANY.HR_EMAIL,subject:'[DAILY MIS] Divyanshi Capital — '+today,body:tgMsg.replace(/\*/g,'').replace(/_/g,''),name:'Divyanshi Assistant'});
    Logger.log('✅ Evening MIS sent: '+today);
  } catch(e){ LOG_ERR_('SEND_EVENING_MIS_REPORT','',e.message); }
}

function ATTENDANCE_EOD_REPORT_LEGACY_() {
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
    /* Legacy title rows are retained below only to avoid an unsafe bulk rewrite.
    if(page==='form'||page==='apply')return HtmlService.createHtmlOutputFromFile('smart_form').setTitle('Divyanshi Capital AI Based OS — Smart Intake').addMetaTag('viewport','width=device-width,initial-scale=1).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    if(page==='calling'&&P1_VALIDATE_ACCESS_TOKEN_(emp,p.access_token))return P1_HTML_FROM_FILES_(['DC_CALLING_APP','calling']).setTitle('Divyanshi Capital AI Based OS — Calling').addMetaTag('viewport','width=device-width,initial-scale=1,maximum-scale=1);
    if(page==='voice'&&P1_VALIDATE_ACCESS_TOKEN_(emp,p.access_token))return HtmlService.createHtmlOutputFromFile('voice').setTitle('Divyanshi Capital AI Based OS — Voice').addMetaTag('viewport','width=device-width,initial-scale=1,maximum-scale=1);
    */
    if(page==='form'||page==='apply')return HtmlService.createHtmlOutputFromFile('smart_form').setTitle('Divyanshi Capital AI Based OS - Smart Intake').addMetaTag('viewport','width=device-width,initial-scale=1').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    if(page==='calling'&&P1_VALIDATE_ACCESS_TOKEN_(emp,p.access_token))return P1_HTML_FROM_FILES_(['DC_CALLING_APP','calling']).setTitle('Divyanshi Capital AI Based OS - Calling').addMetaTag('viewport','width=device-width,initial-scale=1,maximum-scale=1');
    if(page==='voice'&&P1_VALIDATE_ACCESS_TOKEN_(emp,p.access_token))return HtmlService.createHtmlOutputFromFile('voice').setTitle('Divyanshi Capital AI Based OS - Voice').addMetaTag('viewport','width=device-width,initial-scale=1,maximum-scale=1');
    const bootData={baseUrl:base,page,emp,products:GET_ACTIVE_LOAN_PRODUCTS_(),banks:P1_GET_BANK_OPTIONS_MAP_(),staff:P1_GET_STAFF_PUBLIC_DATA_(emp),dashboard:page==='dashboard'&&P1_VALIDATE_ACCESS_TOKEN_(emp,p.access_token)?P1_GET_STAFF_DASHBOARD_DATA_(emp):null,eligibility:page==='elig'&&p.income?P1_CHECK_ELIGIBILITY_({MONTHLY_INCOME:Number(p.income),EXISTING_EMI:Number(p.emi||0),AGE:Number(p.age||28),LOAN_TYPE:p.loan||''}):null};
    let html=HtmlService.createHtmlOutputFromFile('index').getContent();
    html=html.split('__P1_BOOT_DATA_JSON__').join(JSON.stringify(bootData).replace(/</g,'\\u003c'));
    return HtmlService.createHtmlOutput(html).setTitle('Divyanshi Capital Loan OS').addMetaTag('viewport','width=device-width,initial-scale=1,maximum-scale=1');
  } catch(err){ const ref='ERR_'+Date.now();LOG_ERR_('doGet',ref,err.message); return HtmlService.createHtmlOutput(`<div style="font-family:Arial;padding:40px"><h2 style="color:#dc2626">Page unavailable</h2><p>Please retry or contact support. Reference: ${ref}</p></div>`); }
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
      const tgSecret=String(PropertiesService.getScriptProperties().getProperty('TG_WEBHOOK_SECRET')||'').trim();
      if(!tgSecret||!P1_CONST_EQ_(tgSecret,String(e.parameter&&e.parameter.tg_secret||'')))return ContentService.createTextOutput('UNAUTHORIZED');
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
    if (action === 'health_check') return jsonResp_(P1_PUBLIC_HEALTH_());

    // ── Auth gate ──
    if (!auth) return jsonResp_({ ok: false, err: 'Unauthorized' });

    // ── payload resolved once for all authenticated actions ──
    const payload = (body.payload && typeof body.payload === 'object') ? body.payload : body;

    // ── Authenticated actions ──
    if (action === 'chat')             { const actor=P1_REQUIRE_API_ACTOR_(payload); if(!actor)return jsonResp_({ok:false,err:'Employee session required'}); payload.empCode=actor.EMP_CODE; payload.accessToken=payload.accessToken||payload.access_token; return jsonResp_({ ok: true, reply: BULBHUL_CHAT_API_(payload) }); }
    if (action === 'check_elig')       return jsonResp_({ ok: true, result: P1_CHECK_ELIGIBILITY_(payload) });
    if (action === 'manager_checkin')  { const actor=P1_REQUIRE_API_ACTOR_(payload); if(!actor)return jsonResp_({ok:false,err:'Employee session required'}); return jsonResp_(MANAGER_SELFIE_CHECKIN_(actor.EMP_CODE, payload.half || 1)); }
    if (action === 'get_dashboard')    { const actor=P1_REQUIRE_API_ACTOR_(payload); return jsonResp_(actor?P1_GET_STAFF_DASHBOARD_DATA_(actor.EMP_CODE):{ok:false,err:'Employee session required'}); }
    if (action === 'get_master_control') { const actor=P1_REQUIRE_API_ACTOR_(payload); return jsonResp_(actor?P1_GET_MASTER_CONTROL_(actor.EMP_CODE):{ok:false,err:'Employee session required'}); }
    if (action === 'update_lead')      { const actor=P1_REQUIRE_API_ACTOR_(payload),lead=actor&&GET_MASTER_SNAPSHOT_().find(c=>String(c.LEAD_ID||'').toUpperCase()===String(payload.query||'').toUpperCase()||DC_CLEAN_MOBILE_(c.CLIENT_MOBILE||'')===DC_CLEAN_MOBILE_(payload.query||'')); return jsonResp_(actor&&lead&&P1_CALLING_CAN_ACCESS_(actor,lead)?UPDATE_LEAD_STATUS_(lead.LEAD_ID,payload.status,payload.remark):{ok:false,err:'Employee session or case access denied'}); }
    if (action === 'run_mis')          { const actor=P1_REQUIRE_API_ACTOR_(payload); if(!actor||!P1_HAS_MASTER_ACCESS_(actor))return jsonResp_({ok:false,err:'Master access required'}); MIS_PIPELINE_RUN_(); return jsonResp_({ ok: true, msg: 'MIS triggered' }); }
    if (action === 'clear_cache')      { const actor=P1_REQUIRE_API_ACTOR_(payload); if(!actor||!P1_HAS_MASTER_ACCESS_(actor))return jsonResp_({ok:false,err:'Master access required'}); INVALIDATE_ALL_CACHES_(); return jsonResp_({ ok: true, msg: 'All caches cleared' }); }
    if (action === 'get_avatar_profile') { const actor=P1_REQUIRE_API_ACTOR_(payload); return jsonResp_(actor?P1_GET_AVATAR_PROFILE_(actor.EMP_CODE):{ok:false,err:'Employee session required'}); }
    if (action === 'generate_post')    { const actor=P1_REQUIRE_API_ACTOR_(payload); return jsonResp_(actor?GENERATE_LOAN_POST_(actor.EMP_CODE, payload.loanType, payload.sourceName, payload.customMsg):{ok:false,err:'Employee session required'}); }
    if (action === 'post_facebook')    { const actor=P1_REQUIRE_API_ACTOR_(payload); return jsonResp_(actor?POST_TO_FACEBOOK_(actor.EMP_CODE, payload.message, payload.imageUrl):{ok:false,err:'Employee session required'}); }
    if (action === 'post_instagram')   { const actor=P1_REQUIRE_API_ACTOR_(payload); return jsonResp_(actor?POST_TO_INSTAGRAM_(actor.EMP_CODE, payload.caption, payload.imageUrl):{ok:false,err:'Employee session required'}); }
    if (action === 'avatar_learn')     { const actor=P1_REQUIRE_API_ACTOR_(payload); if(!actor)return jsonResp_({ok:false,err:'Employee session required'}); AVATAR_LEARN_(actor.EMP_CODE, payload.type, payload.data || {}); return jsonResp_({ ok: true }); }
    if (action === 'website_lead')     return jsonResp_(P1_WEBSITE_LEAD_SUBMIT_(payload));
    if (action === 'voice_notify')     return jsonResp_(GET_VOICE_NOTIFICATION_(payload.event, payload.data));
    if (action === 'verify_emp') return jsonResp_(P1_VERIFY_ACCESS(payload.empCode, payload.pin));
    if (action === 'change_pin')       { const actor=P1_REQUIRE_API_ACTOR_(payload); return jsonResp_(actor?P1_CHANGE_PIN(actor.EMP_CODE,payload.accessToken,payload.currentPin,payload.newPin):{ok:false,err:'Employee session required'}); }
    if (action === 'forgot_pin')       return jsonResp_(P1_FORGOT_PIN(payload.empCode,payload.email));
    if (action === 'verify_pin_otp')   return jsonResp_(P1_VERIFY_OTP(payload.empCode,payload.otp));
    if (action === 'reset_pin')        return jsonResp_(P1_RESET_PIN(payload.empCode,payload.resetToken,payload.newPin));
    if (action === 'logout')            return jsonResp_(P1_LOGOUT(payload.empCode,payload.accessToken));

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

function BULBHUL_CHAT_API(d)          { d=d||{};return P1_VALIDATE_ACCESS_TOKEN_(d.empCode,d.accessToken)?BULBHUL_CHAT_API_(d):'Employee access expired. Verify EMP_CODE and PIN again.'; }
function GET_ACTIVE_LOAN_PRODUCTS()   { return GET_ACTIVE_LOAN_PRODUCTS_(); }
function P1_GET_BANK_OPTIONS_MAP()    { return P1_GET_BANK_OPTIONS_MAP_(); }
function MANAGER_CHECKIN_API(d)       { const a=P1_REQUIRE_API_ACTOR_(d||{}); return a?MANAGER_SELFIE_CHECKIN_(a.EMP_CODE,d.half||1):{ok:false,err:'Employee session required'}; }
function RUN_MIS_PIPELINE_NOW()       { if(!P1_ACTIVE_ADMIN_())throw new Error('Master access required'); MIS_PIPELINE_RUN_(); }
function RUN_MIS_EVENING_REPORT()     { if(!P1_ACTIVE_ADMIN_())throw new Error('Master access required'); SEND_EVENING_MIS_REPORT_(); }
function CLEAR_CACHE_NOW()            { if(!P1_ACTIVE_ADMIN_())throw new Error('Master access required'); INVALIDATE_ALL_CACHES_(); Logger.log('✅ All caches cleared'); }

function P1_MAP_HTML_LINKS_() {
  const sh = SHEET_('ALL_EMPLOYEES');
  if (!sh) throw new Error('ALL_EMPLOYEES missing');
  const data = sh.getDataRange().getValues();
  if (data.length < 2) throw new Error('ALL_EMPLOYEES empty');

  const headers = data[0].map(DC_NORM_);
  const base = P1_GET_EXEC_URL_(),portal=String(PropertiesService.getScriptProperties().getProperty('EMPLOYEE_PORTAL_URL')||'').trim().replace(/\/$/,'');

  function ensureCol(name) {
    const norm = DC_NORM_(name);
    let i = headers.indexOf(norm);
    if (i === -1) {
      const newCol = sh.getLastColumn() + 1;
      sh.getRange(1, newCol).setValue(name);
      i = newCol - 1;
      headers.push(norm);
    }
    return i;
  }

  const iCode = headers.indexOf(DC_NORM_('EMP_CODE'));
  const iEmail = headers.indexOf(DC_NORM_('EMPLOYEE_EMAIL'));
  const iName = headers.indexOf(DC_NORM_('EMPLOYEES_NAME'));
  if (iCode === -1) throw new Error('EMP_CODE column missing in ALL_EMPLOYEES');

  const p1Cols = {
    web: ensureCol('P1_WEBSITE_URL'),
    card: ensureCol('P1_DIGITAL_CARD_URL'),
    form: ensureCol('P1_SMART_FORM_URL'),
    dash: ensureCol('P1_DASHBOARD_URL'),
    workspace: ensureCol('P1_WORKSPACE_URL'),
    call: ensureCol('P1_CALLING_URL'),
    voice: ensureCol('P1_VOICE_URL'),
    avt: ensureCol('P1_AVATAR_URL'),
    sync: ensureCol('P1_SYNC_STATUS'),
    at: ensureCol('P1_LAST_SYNC_AT')
  };

  let updated = 0;
  for (let i = 1; i < data.length; i++) {
    const code = String(data[i][iCode] || '').trim().toUpperCase();
    if (!code) continue;
    const name = String(iName > -1 ? data[i][iName] : code).trim() || code;
    const e = encodeURIComponent(code);
    const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=d4af37&color=0a2540&size=160`;
    const row = i + 1;
    const employee = FIND_EMPLOYEE_FULL_(code);
    const canCall = P1_ROLE_CAN_USE_CALLING_(employee);

    const cardUrl=`${base}?page=card&emp=${e}`;
    sh.getRange(row, p1Cols.web + 1).setFormula(`=HYPERLINK("${cardUrl}","🌐 Digital Profile")`);
    sh.getRange(row, p1Cols.card + 1).setFormula(`=HYPERLINK("${cardUrl}","🪪 Card")`);
    const routeEmail = iEmail>-1 ? DC_CLEAN_EMAIL_(data[i][iEmail]) : '';
    const routeSig = routeEmail ? P1_ROUTE_SIGNATURE_(code,routeEmail) : '';
    const route = `&manager_email_id=${encodeURIComponent(routeEmail)}&route_signature=${encodeURIComponent(routeSig)}`;
    sh.getRange(row, p1Cols.form + 1).setFormula(`=HYPERLINK("${base}?page=form&emp=${e}${route}","📝 Form")`);
    sh.getRange(row, p1Cols.dash + 1).setFormula(`=HYPERLINK("${base}?page=dashboard&emp=${e}","📊 Dashboard")`);
    const workspaceCell=sh.getRange(row, p1Cols.workspace + 1);if(portal)workspaceCell.setFormula(`=HYPERLINK("${portal}?emp=${e}","🔐 Staff Workspace")`);else workspaceCell.clearContent();
    const callingCell=sh.getRange(row,p1Cols.call+1),voiceCell=sh.getRange(row,p1Cols.voice+1);
    if(canCall){
      callingCell.setFormula(`=HYPERLINK("${base}?page=calling&emp=${e}","📞 Calling")`);
      voiceCell.setFormula(`=HYPERLINK("${base}?page=voice&emp=${e}","🎙️ Voice")`);
    }else{callingCell.clearContent();voiceCell.clearContent();}
    sh.getRange(row, p1Cols.avt + 1).setValue(avatar);
    sh.getRange(row, p1Cols.sync + 1).setValue('CONNECTED');
    sh.getRange(row, p1Cols.at + 1).setValue(new Date());
    updated++;
  }

  INVALIDATE_ALL_CACHES_();
  styleHeaderRow_(sh, sh.getLastColumn());
  Logger.log(`✅ Links mapped: ${updated} employees`);
  return `HTML links mapped: ${updated}`;
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
  chk('DC002 master identity',()=>{const md=FIND_EMPLOYEE_FULL_('DC002');if(!md||!P1_HAS_MASTER_ACCESS_(md))throw new Error('DC002 must be active with ROLE MD/FOUNDER or ACCESS_LEVEL ALL');return md.NAME+' | '+md.ROLE+' | '+md.DASHBOARD_ACCESS;});
  chk('ScriptCache',()=>{SC_.put('HC_TEST','1',10);const v=SC_.get('HC_TEST');if(v!=='1')throw new Error('Failed');SC_.remove('HC_TEST');return'OK';});
  Logger.log('════════════════════════════');
  Logger.log('  '+p+' PASS | '+f+' FAIL');
  Logger.log(f===0?'  ✅ HEALTHY':'  ❌ Fix above');
  Logger.log('════════════════════════════');
  return{pass:p,fail:f};
}

function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('🤖 Divyanshi Assistant')
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
    Logger.log('⚠ Run this from the Sheet menu, not Script Editor.\nOpen Sheet → 🤖 Divyanshi Assistant → 🛠 Technical Fixes');
    return;
  }
  const props = PropertiesService.getScriptProperties();
  
  // ── Option picker ──
  const pick = ui.alert(
    '🛠 Divyanshi Assistant Technical Fixes',
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
        const result = fixIndividualStaff_(code);
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
    else if (pick2 === ui.Button.NO)     { CLEAR_CACHE_NOW();              ui.toast('Caches cleared','Divyanshi Assistant',3); }
    else if (pick2 === ui.Button.CANCEL) { const r=HEALTH_CHECK_();        ui.alert('Health Check', r.pass+' PASS | '+r.fail+' FAIL', ui.ButtonSet.OK); }
  }

  ui.toast('Technical Fixes session complete', 'Divyanshi Assistant', 3);
}

function _techFix_ScriptProperties_(ui, props) {
  const keys = [
    'MASTER_FILE_ID','P1_EXEC_URL','MALLIK_API_KEY',
    'DEEPSEEK_API_KEY','OPENAI_API_KEY','GEMINI_API_KEY',
    'TG_TOKEN','META_WA_TOKEN','META_WA_PHONE_ID',
    'MD_TG_CHAT_ID','FOUNDER_TG_CHAT_ID','HR_TG_CHAT_ID','ACCOUNTS_TG_CHAT_ID','MD_TG_EMP_CODE','FOUNDER_TG_EMP_CODE','HR_TG_EMP_CODE','ACCOUNTS_TG_EMP_CODE','TG_WEBHOOK_SECRET',
    'TEMPLATE_PERSONAL_FILE_ID','ONBOARDING_DRIVE_FOLDER_ID',
    'HR_TC_FILE_ID','HR_TC_URL','HR_ICARD_FILE_ID','COMPANY_WEBSITE_URL','EMPLOYEE_PORTAL_URL','PRIVACY_NOTICE_URL','PRIVACY_CONTACT_EMAIL','GRIEVANCE_OFFICER_NAME','CLIENT_RETENTION_DAYS','CANDIDATE_RETENTION_DAYS','CONSENT_VERSION','CLIENT_DOCS_FOLDER_ID','FREEPBX_WEBHOOK_URL','FREEPBX_API_TOKEN','WEBSITE_MANAGER_EMAIL_ID'
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

  P1_MIGRATE_CORE_PROPERTIES_();

  // Auto-detect the canonical Apps Script URL if empty.
  if (!props.getProperty('P1_EXEC_URL')) {
    try {
      const url = ScriptApp.getService().getUrl();
      if (url) {
        props.setProperty('P1_EXEC_URL', url);
        updated++;
      }
    } catch(_){}
  }

  // Generate a server-side API key once when it is not configured.
  if (!props.getProperty('MALLIK_API_KEY')) {
    props.setProperty('MALLIK_API_KEY',(Utilities.getUuid()+Utilities.getUuid()).replace(/-/g,'')); updated++;
  }

  INVALIDATE_ALL_CACHES_();
  ui.toast(`${updated} propert${updated===1?'y':'ies'} saved. Cache cleared.`, 'Divyanshi Assistant', 4);
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
function fixIndividualStaff_(empCodeOrSheet, empCodeArg) {
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
    const iSync   = headers.indexOf('P1_SYNC_STATUS');
    const iAt     = headers.indexOf('P1_LAST_SYNC_AT');
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
      const base = P1_GET_EXEC_URL_(),portal=String(PropertiesService.getScriptProperties().getProperty('EMPLOYEE_PORTAL_URL')||'').trim().replace(/\/$/,'');
      const e    = encodeURIComponent(empCode);
      const name = emp.NAME || empCode;
      const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=d4af37&color=0a2540&size=160`;
      const personalUrl = fileId ? `https://docs.google.com/spreadsheets/d/${fileId}/edit` : '';
      const qrUrl = `${base}?page=card&emp=${e}`;
      const routeEmail = DC_CLEAN_EMAIL_(emp.EMAIL||'');
      const routeQuery = routeEmail ? `&manager_email_id=${encodeURIComponent(routeEmail)}&route_signature=${encodeURIComponent(P1_ROUTE_SIGNATURE_(empCode,routeEmail))}` : '';
      const canCall = P1_ROLE_CAN_USE_CALLING_(emp);

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
        P1_WEBSITE_URL    : `=HYPERLINK("${base}?page=card&emp=${e}","🌐 Digital Profile")`,
        P1_SMART_FORM_URL : `=HYPERLINK("${base}?page=form&emp=${e}${routeQuery}","📝 Form")`,
        P1_DIGITAL_CARD_URL:`=HYPERLINK("${base}?page=card&emp=${e}","🪪 Card")`,
        P1_DASHBOARD_URL  : `=HYPERLINK("${base}?page=dashboard&emp=${e}","📊 Dash")`,
        P1_WORKSPACE_URL  : portal?`=HYPERLINK("${portal}?emp=${e}","🔐 Workspace")`:'',
        P1_CALLING_URL    : canCall?`=HYPERLINK("${base}?page=calling&emp=${e}","📞 Calling")`:'',
        P1_VOICE_URL      : canCall?`=HYPERLINK("${base}?page=voice&emp=${e}","🎙️ Voice")`:'',
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

// Safe liveness/readiness payload for AI Studio and uptime monitors. It never
// returns IDs, emails, secrets, sheet data or employee workload.
function P1_PUBLIC_HEALTH_() {
  const props=PropertiesService.getScriptProperties(),privacy=String(props.getProperty('PRIVACY_NOTICE_URL')||'').trim(),voice=String(props.getProperty('FREEPBX_WEBHOOK_URL')||'').trim();
  return {ok:true,version:'V9.3.0-FAST',timestamp:new Date().toISOString(),deployed:!!P1_GET_EXEC_URL_(),aiConfigured:[DC_CFG.DEEPSEEK_KEY,DC_CFG.OPENAI_KEY,DC_CFG.GEMINI_KEY].some(Boolean),privacyConfigured:/^https:\/\//i.test(privacy),voiceConfigured:/^https:\/\//i.test(voice)&&!!props.getProperty('FREEPBX_API_TOKEN')};
}

function fixIndividualStaff(empCodeOrSheet, empCodeArg) {
  if(!P1_ACTIVE_ADMIN_())throw new Error('Master access required');
  return fixIndividualStaff_(empCodeOrSheet,empCodeArg);
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
  'INSTAGRAM_HANDLE','FACEBOOK_PAGE_ID',
  'LINKEDIN_HANDLE','LINKEDIN_TOKEN',
  'YOUTUBE_HANDLE','TWITTER_HANDLE',
  'AVATAR_TAGLINE','AVATAR_STYLE','CAMPAIGN_ACTIVE'
];

/* ── Role-based HI greeting (shown on personal website) ── */
const HI_GREETINGS_ = {
  'MD'           : n=>`Namaste! Main ${n} hoon — MD, Divyanshi Capital. Loan, team, aur growth — sab meri zimmedaari hai. Divyanshi Assistant mera partner hai.`,
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

    // Hands-free voice data uses the employee's real assigned workload only.
    const latestLead=myLeads.slice().sort((a,b)=>new Date(b.LAST_UPDATED||b.TIMESTAMP||0)-new Date(a.LAST_UPDATED||a.TIMESTAMP||0))[0]||null;
    const breachedLead=myLeads.find(r=>/BREACH|OVERDUE|DELAY/.test(String(r.TAT_STATUS||'').toUpperCase()))||null;
    const completedTarget=Number(emp.TARGET||0);
    const voiceData = {
      greeting  : `Namaste ${emp.NAME}! Main Divyanshi Assistant hoon, aapka AI partner. Aaj ${myLeads.length} total leads hain, ${open} open hain.`,
      newLead   : latestLead?GET_VOICE_NOTIFICATION_('NEW_LEAD',latestLead):'',
      disbursal : latestLead&&/DISBURS/.test(String(latestLead.CASE_CATEGORY||'').toUpperCase())?GET_VOICE_NOTIFICATION_('DISBURSAL',latestLead):'',
      tatBreach : breachedLead?GET_VOICE_NOTIFICATION_('TAT_BREACH',breachedLead):'',
      target    : completedTarget?GET_VOICE_NOTIFICATION_('TARGET',{achieved:approved,target:completedTarget}):''
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
    const token = String(PropertiesService.getScriptProperties().getProperty('FB_PAGE_TOKEN_'+String(empCode||'').toUpperCase())||'').trim();
    const pgId  = String(emp['FACEBOOK_PAGE_ID']||'').trim();
    if(!token||!pgId) return{ok:false,err:`Facebook page ID or server token is not configured for ${empCode}`};
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
    const token = String(PropertiesService.getScriptProperties().getProperty('IG_TOKEN_'+String(empCode||'').toUpperCase())||'').trim();
    const igId  = String(emp['INSTAGRAM_HANDLE']||'').trim();
    if(!token||!igId) return{ok:false,err:`Instagram ID or server token is not configured for ${empCode}`};
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

function P1_REQUIRE_API_ACTOR_(payload){
  payload=payload||{};
  const code=String(payload.actorEmpCode||payload.empCode||'').trim().toUpperCase(),token=String(payload.accessToken||payload.access_token||'').trim();
  if(!code||!P1_VALIDATE_ACCESS_TOKEN_(code,token))return null;
  return FIND_EMPLOYEE_FULL_(code);
}

function P1_ACTIVE_ADMIN_(){
  try{const email=DC_CLEAN_EMAIL_(Session.getActiveUser().getEmail());if(!email)return false;const emp=FIND_EMPLOYEE_FULL_(email);return !!(emp&&P1_HAS_MASTER_ACCESS_(emp))||email===DC_CFG.COMPANY.MD_EMAIL||email===DC_CFG.COMPANY.FOUNDER_EMAIL;}catch(_){return false;}
}

function SYNC_SOURCE_NAME_MASTER_(){
  const sh=GET_OR_CREATE_('SOURCE_NAME'),h=P1_ENSURE_HEADERS_(sh,P1_TAB_MAP.SOURCE_NAME());
  const rows=[
    ['Sales Team','SALES','YES'],['Manual Calling','SALES','YES'],['AI Auto Calling','SALES','YES'],
    ['WhatsApp','SALES','YES'],['Website','SALES','YES'],['Referral','SALES','YES'],['Walk-in','SALES','YES'],
    ['Instagram','SALES','YES'],['Facebook','SALES','YES'],['LinkedIn','SALES','YES'],
    ['Email Campaign','SALES','YES'],['Bank Referral','SALES','YES'],['GoDial Auto Calling','SALES','YES'],
    ['DSA','LOGIN DEPARTMENT','YES'],['MIS UPDATE','REPORT','YES'],['NEW STAFF ENTRY','HR','YES'],
    ['INTERVIEW ENTRY','HR','YES'],['BANKER ENTRY','LOGIN DEPARTMENT','YES'],
    ['SEND TO LOGIN','LOGIN DEPARTMENT','YES'],['COMPLETED','LOGIN DEPARTMENT','YES'],['OTHER','HR','YES']
  ];
  if(sh.getLastRow()>1)sh.getRange(2,1,sh.getLastRow()-1,sh.getLastColumn()).clearContent();
  sh.getRange(2,1,rows.length,h.length).setValues(rows.map(r=>P1_BUILD_ROW_(h,{SOURCE_NAME:r[0],DATA_FLOW:r[1],ACTIVE:r[2]})));
  SC_.remove('SRC_ROUTING_V1');ROUTING_CACHE_=null;
  return 'SOURCE_NAME_SYNCED';
}

function P1_CALLING_CAN_ACCESS_(emp,lead){
  if(!emp||!lead)return false;
  if(P1_HAS_MASTER_ACCESS_(emp))return true;
  if(String(lead.ASSIGNED_COORDINATOR||'').toUpperCase()===String(emp.EMP_CODE||'').toUpperCase())return true;
  const work=(String(emp.ROLE||'')+' '+String(emp.DEPARTMENT||'')).toUpperCase();
  if(!/SALES|CALL|RELATIONSHIP|LOGIN|COORDINATOR|MANAGER|HEAD/.test(work))return false;
  const ownerCode=String(lead.EMP_CODE||'').toUpperCase();if(!ownerCode)return false;
  const owner=FIND_EMPLOYEE_FULL_(ownerCode);return owner?P1_CAN_SEE_EMP_(emp,owner):ownerCode===emp.EMP_CODE;
}

function P1_B64URL_(bytes){return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/,'');}
function P1_CONST_EQ_(a,b){a=String(a||'');b=String(b||'');if(!a||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
function P1_HASH_SECRET_(secret,salt){let value=String(salt||'')+'|'+String(secret||'');for(let i=0;i<500;i++)value=P1_B64URL_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,value,Utilities.Charset.UTF_8));return value;}
function P1_AUTH_VERSION_(empCode){return Number(PropertiesService.getScriptProperties().getProperty('AUTH_VERSION_'+String(empCode||'').toUpperCase())||1);}
function P1_BUMP_AUTH_VERSION_(empCode){const p=PropertiesService.getScriptProperties(),key='AUTH_VERSION_'+String(empCode||'').toUpperCase(),next=P1_AUTH_VERSION_(empCode)+1;p.setProperty(key,String(next));return next;}
function P1_STORE_PIN_HASH_(empCode,pin){const code=String(empCode||'').toUpperCase(),p=PropertiesService.getScriptProperties(),salt=Utilities.getUuid().replace(/-/g,'');p.setProperties({['PIN_SALT_'+code]:salt,['PIN_HASH_'+code]:P1_HASH_SECRET_(pin,salt)});p.deleteProperty('PIN_'+code);}
function P1_VERIFY_PIN_(empCode,pin){
  const code=String(empCode||'').toUpperCase(),entered=String(pin||''),p=PropertiesService.getScriptProperties(),salt=p.getProperty('PIN_SALT_'+code)||'',hash=p.getProperty('PIN_HASH_'+code)||'';
  if(salt&&hash)return P1_CONST_EQ_(hash,P1_HASH_SECRET_(entered,salt));
  const legacy=p.getProperty('PIN_'+code)||'';
  if(legacy&&P1_CONST_EQ_(legacy,entered)){P1_STORE_PIN_HASH_(code,entered);return true;}
  return false;
}
function P1_ISSUE_ACCESS_TOKEN_(empCode){const code=String(empCode||'').toUpperCase(),token=Utilities.getUuid().replace(/-/g,'');CacheService.getScriptCache().put('P1_ACCESS_'+token,JSON.stringify({emp:code,version:P1_AUTH_VERSION_(code),issuedAt:Date.now()}),1800);return token;}
function P1_VALIDATE_ACCESS_TOKEN_(empCode,token){
  const code=String(empCode||'').trim().toUpperCase();token=String(token||'').trim();if(!code||!token)return false;
  try{const raw=CacheService.getScriptCache().get('P1_ACCESS_'+token),meta=raw?JSON.parse(raw):null;return!!meta&&meta.emp===code&&Number(meta.version)===P1_AUTH_VERSION_(code)&&!!FIND_EMPLOYEE_FULL_(code);}catch(_){return false;}
}
function P1_REVOKE_ACCESS_TOKEN_(token){token=String(token||'').trim();if(token)CacheService.getScriptCache().remove('P1_ACCESS_'+token);}
function P1_CAN_ACT_FOR_(actor,targetCode){const target=FIND_EMPLOYEE_FULL_(String(targetCode||'').toUpperCase());return!!target&&P1_CAN_SEE_EMP_(actor,target);}
function P1_CHANGE_PIN(empCode,accessToken,currentPin,newPin){
  const code=String(empCode||'').trim().toUpperCase();if(!P1_VALIDATE_ACCESS_TOKEN_(code,accessToken))return{ok:false,err:'Employee session expired'};
  if(!P1_VERIFY_PIN_(code,currentPin))return{ok:false,err:'Current PIN is incorrect'};
  if(!/^\d{6,12}$/.test(String(newPin||'')))return{ok:false,err:'New PIN must be 6 to 12 digits'};
  P1_STORE_PIN_HASH_(code,String(newPin));P1_BUMP_AUTH_VERSION_(code);P1_REVOKE_ACCESS_TOKEN_(accessToken);P1_LOG_AVATAR_ACTIVITY_(code,'SECURITY','PIN changed','SESSION_REVOKED',100);return{ok:true,msg:'PIN changed. Sign in again.'};
}
function P1_LOGOUT(empCode,accessToken){const valid=P1_VALIDATE_ACCESS_TOKEN_(empCode,accessToken);P1_REVOKE_ACCESS_TOKEN_(accessToken);return{ok:valid,msg:'Signed out'};}
function P1_FORGOT_PIN(empCode,email){
  const code=String(empCode||'').trim().toUpperCase(),mail=DC_CLEAN_EMAIL_(email),generic={ok:true,msg:'If the employee code and registered email match, a verification code has been sent.'},cache=CacheService.getScriptCache(),cool='P1_OTP_COOL_'+P1_IDEMPOTENCY_CACHE_KEY_(code+'|'+mail).replace('P1_SUBMIT_','');
  if(cache.get(cool))return generic;cache.put(cool,'1',120);
  const emp=FIND_EMPLOYEE_FULL_(code);if(!emp||!mail||mail!==DC_CLEAN_EMAIL_(emp.EMAIL))return generic;
  const otp=String(Math.floor(100000+Math.random()*900000)),salt=Utilities.getUuid().replace(/-/g,''),key='P1_OTP_'+code;
  cache.put(key,JSON.stringify({hash:P1_HASH_SECRET_(otp,salt),salt,attempts:0,version:P1_AUTH_VERSION_(code)}),600);
  if(!P1_MAIL_QUOTA_(1,'PIN_RESET_OTP'))return generic;
  MailApp.sendEmail({to:mail,subject:'Divyanshi Capital PIN reset verification',htmlBody:`<p>Your one-time verification code is <b>${otp}</b>.</p><p>It expires in 10 minutes. If you did not request this, contact HR immediately.</p>`});return generic;
}
function P1_VERIFY_OTP(empCode,otp){
  const code=String(empCode||'').trim().toUpperCase(),cache=CacheService.getScriptCache(),key='P1_OTP_'+code,raw=cache.get(key);if(!raw)return{ok:false,err:'Verification code expired or invalid'};
  try{const meta=JSON.parse(raw);if(Number(meta.attempts||0)>=5){cache.remove(key);return{ok:false,err:'Verification code expired or invalid'};}if(!P1_CONST_EQ_(meta.hash,P1_HASH_SECRET_(String(otp||''),meta.salt))){meta.attempts=Number(meta.attempts||0)+1;cache.put(key,JSON.stringify(meta),600);return{ok:false,err:'Verification code expired or invalid'};}cache.remove(key);const resetToken=Utilities.getUuid().replace(/-/g,'');cache.put('P1_RESET_'+resetToken,JSON.stringify({emp:code,version:meta.version}),600);return{ok:true,resetToken};}catch(_){cache.remove(key);return{ok:false,err:'Verification code expired or invalid'};}
}
function P1_RESET_PIN(empCode,resetToken,newPin){
  const code=String(empCode||'').trim().toUpperCase(),token=String(resetToken||'').trim(),cache=CacheService.getScriptCache(),key='P1_RESET_'+token,raw=cache.get(key);cache.remove(key);
  if(!raw||!/^\d{6,12}$/.test(String(newPin||'')))return{ok:false,err:'Reset session invalid or new PIN format is wrong'};
  try{const meta=JSON.parse(raw);if(meta.emp!==code||Number(meta.version)!==P1_AUTH_VERSION_(code))return{ok:false,err:'Reset session expired'};P1_STORE_PIN_HASH_(code,String(newPin));P1_BUMP_AUTH_VERSION_(code);P1_LOG_AVATAR_ACTIVITY_(code,'SECURITY','PIN reset','ALL_SESSIONS_REVOKED',100);return{ok:true,msg:'PIN reset. Sign in with the new PIN.'};}catch(_){return{ok:false,err:'Reset session invalid'};}
}

function P1_GET_CALLING_QUEUE_(empCode,accessToken){
  try{
    if(!P1_VALIDATE_ACCESS_TOKEN_(empCode,accessToken))return{ok:false,err:'Calling session expired. Verify EMP_CODE and PIN again.'};
    const emp=FIND_EMPLOYEE_FULL_(String(empCode||'').trim().toUpperCase());if(!emp)return{ok:false,err:'Valid active employee required'};
    const full=P1_HAS_MASTER_ACCESS_(emp),work=(String(emp.ROLE||'')+' '+String(emp.DEPARTMENT||'')).toUpperCase();
    if(!full&&!/SALES|CALL|RELATIONSHIP|LOGIN|COORDINATOR|MANAGER|HEAD/.test(work))return{ok:false,err:'Calling is not assigned to this role'};
    const complete={APPROVED:1,DISBURSED:1,DISBURSE:1,COMPLETED:1,CLOSED:1,REJECTED:1,SEND_TO_LOGIN:1,'SEND TO LOGIN':1},all=GET_MASTER_SNAPSHOT_(),visible=all.filter(c=>P1_CALLING_CAN_ACCESS_(emp,c)),pending=visible.filter(c=>!complete[String(c.CASE_CATEGORY||'OPEN').toUpperCase()]);
    const queue=pending.slice(0,200).map(c=>({leadId:c.LEAD_ID||'',name:c.CLIENT_NAME||'',mobile:DC_CLEAN_MOBILE_(c.CLIENT_MOBILE||''),type:c.LOAN_TYPE||'',amount:c.REQUIRED_LOAN_AMOUNT||0,bank:c.PREFERRED_BANK||'',status:String(c.CASE_CATEGORY||'OPEN').toUpperCase(),tatStatus:c.TAT_STATUS||'ACTIVE',docStatus:c.DOC_STATUS||''}));
    const tz='Asia/Kolkata',today=Utilities.formatDate(new Date(),tz,'yyyy-MM-dd'),doneToday=P1_SHEET_OBJECTS_('AVATAR_ACTIVITY_LOG').filter(a=>String(a.EMP_CODE||'').toUpperCase()===emp.EMP_CODE&&String(a.ACTIVITY_TYPE||'').toUpperCase()==='CALL_DISPOSITION'&&Utilities.formatDate(new Date(a.TIMESTAMP||0),tz,'yyyy-MM-dd')===today).length,tatBreaches=pending.filter(c=>/BREACH|OVERDUE|DELAY/.test(String(c.TAT_STATUS||'').toUpperCase())).length,avatar=P1_MASTER_CONTROL_SNAPSHOT_(false).avatars.find(a=>a.EMP_CODE===emp.EMP_CODE);
    return{ok:true,staff:{empCode:emp.EMP_CODE,name:emp.NAME,role:emp.ROLE,department:emp.DEPARTMENT},queue,stats:{pending:queue.length,doneToday,tatBreaches,tatHealth:queue.length?Math.max(0,Math.round((queue.length-tatBreaches)/queue.length*100)):100,performance:avatar?avatar.PERFORMANCE_PCT:0},aiAvailable:!!(DC_CFG.DEEPSEEK_KEY||DC_CFG.OPENAI_KEY||DC_CFG.GEMINI_KEY)};
  }catch(e){LOG_ERR_('P1_GET_CALLING_QUEUE',empCode,e.message);return{ok:false,err:e.message};}
}

function P1_CALLING_UPDATE_(data){
  try{
    data=data||{};const employeeCode=String(data.agent||data.empCode||'').trim().toUpperCase();if(!P1_VALIDATE_ACCESS_TOKEN_(employeeCode,data.accessToken))return{ok:false,err:'Calling session expired'};const emp=FIND_EMPLOYEE_FULL_(employeeCode);if(!emp)return{ok:false,err:'Valid active employee required'};
    const query=String(data.leadId||data.mobile||data.query||'').trim(),lead=GET_MASTER_SNAPSHOT_().find(c=>String(c.LEAD_ID||'').toUpperCase()===query.toUpperCase()||DC_CLEAN_MOBILE_(c.CLIENT_MOBILE||'')===DC_CLEAN_MOBILE_(query));if(!lead)return{ok:false,err:'Assigned lead not found'};
    if(!P1_CALLING_CAN_ACCESS_(emp,lead))return{ok:false,err:'This case is not assigned to your role/team'};
    const requested=String(data.status||'').trim().toUpperCase(),statusMap={HOT:'INTERESTED',NOT_INTERESTED:'REJECTED'},status=statusMap[requested]||requested,allowed=['INTERESTED','CALLBACK','REJECTED','NO_ANSWER','SEND_TO_LOGIN'];if(!allowed.includes(status))return{ok:false,err:'Invalid disposition'};
    const remark=String(data.remarks||'').trim(),result=status==='SEND_TO_LOGIN'?P1_MOVE_CASE_TO_LOGIN_(lead,remark):UPDATE_LEAD_STATUS_(lead.LEAD_ID,status,remark);
    if(result.ok){const updatedLead=result.lead||Object.assign({},lead,{CASE_CATEGORY:status}),owner=FIND_EMPLOYEE_FULL_(lead.EMP_CODE),coordinator=FIND_EMPLOYEE_FULL_(updatedLead.ASSIGNED_COORDINATOR);if(owner&&owner.PERSONAL_FILE_ID)SYNC_PERSONAL_FILE_FAST_(owner,updatedLead,result.row);if(coordinator&&coordinator.PERSONAL_FILE_ID&&(!owner||coordinator.EMP_CODE!==owner.EMP_CODE))SYNC_PERSONAL_FILE_FAST_(coordinator,updatedLead,result.row);const rawDuration=Number(data.durationSec),durationSec=Number.isFinite(rawDuration)?Math.min(14400,Math.max(0,Math.floor(rawDuration))):0;P1_LOG_AVATAR_ACTIVITY_(emp.EMP_CODE,'CALL_DISPOSITION',`${lead.LEAD_ID}|${status}|${durationSec}`,'SAVED',100);RECORD_TASK_FOR_ATTENDANCE_(emp.EMP_CODE);}
    SC_.remove('MASTER_CONTROL_V1');return result;
  }catch(e){LOG_ERR_('P1_CALLING_UPDATE','',e.message);return{ok:false,err:e.message};}
}

function P1_CALLING_START_(data){
  data=data||{};if(!P1_VALIDATE_ACCESS_TOKEN_(data.empCode,data.accessToken))return{ok:false,err:'Calling session expired'};const emp=FIND_EMPLOYEE_FULL_(String(data.empCode||'').trim().toUpperCase()),lead=GET_MASTER_SNAPSHOT_().find(c=>String(c.LEAD_ID||'').toUpperCase()===String(data.leadId||'').toUpperCase());if(!P1_CALLING_CAN_ACCESS_(emp,lead))return{ok:false,err:'Calling access denied'};P1_LOG_AVATAR_ACTIVITY_(emp.EMP_CODE,'CALL_STARTED',lead.LEAD_ID,'DIALER_OPENED',0);return{ok:true};
}

function P1_CALLING_AI_REMARK_(data){
  try{data=data||{};if(!P1_VALIDATE_ACCESS_TOKEN_(data.empCode,data.accessToken))return{ok:false,err:'Calling session expired'};const emp=FIND_EMPLOYEE_FULL_(String(data.empCode||'').trim().toUpperCase()),lead=GET_MASTER_SNAPSHOT_().find(c=>String(c.LEAD_ID||'').toUpperCase()===String(data.leadId||'').toUpperCase());if(!P1_CALLING_CAN_ACCESS_(emp,lead))return{ok:false,err:'Case access denied'};const fallback=`Follow up on ${lead.LOAN_TYPE||'loan'} requirement. Confirm current interest, pending documents, preferred bank and next callback time.`;if(!(DC_CFG.DEEPSEEK_KEY||DC_CFG.OPENAI_KEY||DC_CFG.GEMINI_KEY))return{ok:true,remark:fallback,mode:'RULES'};const prompt='Create one short factual call-note suggestion from these redacted case facts:\n'+JSON.stringify({loan:lead.LOAN_TYPE,bank:lead.PREFERRED_BANK,status:lead.CASE_CATEGORY,tat:lead.TAT_STATUS,docStatus:lead.DOC_STATUS,amount:lead.REQUIRED_LOAN_AMOUNT});const remark=MULTI_BRAIN_REPLY_(prompt,'You assist an authorised loan calling employee. Suggest only; do not claim a call happened or documents were verified. No commands, no personal data.');return{ok:true,remark:String(remark||fallback).slice(0,500),mode:'AI'};}catch(e){LOG_ERR_('P1_CALLING_AI_REMARK','',e.message);return{ok:false,err:e.message};}
}

function P1_PROCESS_VOICE_COMMAND_(data){
  try{
    data=data||{};const empCode=String(data.empCode||'').trim().toUpperCase();if(!P1_VALIDATE_ACCESS_TOKEN_(empCode,data.accessToken))return{ok:false,err:'Voice session expired. Verify EMP_CODE and PIN again.'};
    const emp=FIND_EMPLOYEE_FULL_(empCode),mobile=DC_CLEAN_MOBILE_(data.mobile||''),leadId=String(data.leadId||'').trim().toUpperCase();if(!emp||!mobile)return{ok:false,err:'Valid employee and 10-digit mobile required'};
    const lead=GET_MASTER_SNAPSHOT_().find(c=>(!leadId||String(c.LEAD_ID||'').toUpperCase()===leadId)&&DC_CLEAN_MOBILE_(c.CLIENT_MOBILE||'')===mobile);if(!lead)return{ok:false,err:'Mobile is not present in an assigned case'};
    if(!P1_CALLING_CAN_ACCESS_(emp,lead))return{ok:false,err:'This client is not assigned to your role/team'};
    const cache=CacheService.getScriptCache(),cooldown='VOICE_CALL_'+empCode+'_'+String(lead.LEAD_ID||mobile).replace(/[^A-Z0-9]/gi,'');if(cache.get(cooldown))return{ok:false,err:'Call request already sent. Wait one minute before retrying.'};
    const props=PropertiesService.getScriptProperties(),url=String(props.getProperty('FREEPBX_WEBHOOK_URL')||'').trim(),token=String(props.getProperty('FREEPBX_API_TOKEN')||'').trim();if(!/^https:\/\//i.test(url)||!token)return{ok:false,err:'FreePBX bridge is not configured by the administrator'};
    cache.put(cooldown,'1',60);
    const response=UrlFetchApp.fetch(url,{method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+token},muteHttpExceptions:true,payload:JSON.stringify({mobile:'+91'+mobile,leadId:lead.LEAD_ID||'',empCode:emp.EMP_CODE,loanType:lead.LOAN_TYPE||'',preferredBank:lead.PREFERRED_BANK||'',source:'DIVYANSHI_BULBHUL_VOICE'})});
    const code=response.getResponseCode();if(code<200||code>=300){cache.remove(cooldown);LOG_ERR_('FREEPBX_VOICE',empCode,'HTTP '+code);return{ok:false,err:'Voice bridge rejected the request (HTTP '+code+')'};}
    P1_LOG_AVATAR_ACTIVITY_(emp.EMP_CODE,'AI_VOICE_CALL',String(lead.LEAD_ID||mobile),'REQUEST_ACCEPTED',100);return{ok:true,message:`Assigned case ${lead.LEAD_ID||''} sent to the voice bridge`};
  }catch(e){LOG_ERR_('P1_PROCESS_VOICE_COMMAND','',e.message);return{ok:false,err:e.message};}
}

function P1_GET_CALLING_QUEUE(empCode,accessToken){return P1_GET_CALLING_QUEUE_(empCode,accessToken);}
function P1_CALLING_UPDATE(data){return P1_CALLING_UPDATE_(data);}
function P1_CALLING_START(data){return P1_CALLING_START_(data);}
function P1_CALLING_AI_REMARK(data){return P1_CALLING_AI_REMARK_(data);}
function P1_PROCESS_VOICE_COMMAND(data){return P1_PROCESS_VOICE_COMMAND_(data);}
function processVoiceCommand(data){return P1_PROCESS_VOICE_COMMAND_(typeof data==='string'?{mobile:data}:data);}
function MLA_UPDATE_MINI_STATUS(data){return P1_CALLING_UPDATE_(data);}

function P1_VERIFY_ACCESS(empCode,pin) {
  const code=String(empCode||'').trim().toUpperCase(),attemptKey='P1_LOGIN_FAIL_'+code;
  const lock=LockService.getScriptLock();if(!lock.tryLock(5000))return{ok:false,err:'Sign-in service busy. Retry shortly.'};
  try{
    const attempts=Number(SC_.get(attemptKey)||0);if(attempts>=5)return{ok:false,err:'Too many failed attempts. Try again after 5 minutes.'};
    const emp=FIND_EMPLOYEE_FULL_(code),valid=!!emp&&P1_VERIFY_PIN_(code,String(pin||'').trim());
    if(!valid){SC_.put(attemptKey,String(attempts+1),300);return{ok:false,err:'Invalid employee code or PIN'};}
    SC_.remove(attemptKey);
    return{ok:true,empCode:emp.EMP_CODE,name:emp.NAME,role:emp.ROLE,department:emp.DEPARTMENT||'',email:emp.EMAIL||'',manager_email_id:emp.MANAGER_EMAIL||'',accessToken:P1_ISSUE_ACCESS_TOKEN_(emp.EMP_CODE),err:''};
  }finally{lock.releaseLock();}
}

/* ── SYNC_ROLE_DASHBOARDS_ENGINE — authenticated compatibility alias ── */
function P1_ROLE_DASHBOARD_WRITE_(emp) {
  if (!emp || !emp.PERSONAL_FILE_ID) return {ok:false, skipped:true};
  const dashboard=P1_GET_STAFF_DASHBOARD_DATA_(emp.EMP_CODE);
  if (!dashboard || !dashboard.ok) return {ok:false,err:(dashboard&&dashboard.err)||'Dashboard data unavailable'};
  const pss=P1_OPEN_SS_SAFE_(emp.PERSONAL_FILE_ID),sh=pss.getSheetByName('ROLE_DASHBOARD')||pss.insertSheet('ROLE_DASHBOARD'),stats=dashboard.stats||{};
  const rows=[['DIVYANSHI CAPITAL AI BASED OS — ROLE DASHBOARD'],['GENERATED_AT',new Date()],['EMP_CODE',emp.EMP_CODE],['NAME',emp.NAME||''],['ROLE',emp.ROLE||''],['DESIGNATION',emp.DESIGNATION||emp.ROLE||''],['DEPARTMENT',emp.DEPARTMENT||''],['ACCESS_SCOPE',dashboard.access||'SELF'],[],['METRIC','VALUE'],['TOTAL_CASES',Number(stats.total||0)],['APPROVED_CASES',Number(stats.approved||0)],['UNDER_REVIEW',Number(stats.review||0)],['TOTAL_VOLUME',Number(stats.volume||0)],[],['LEAD_ID','CLIENT_NAME','LOAN_TYPE','AMOUNT','BANK','STATUS','TAT_STATUS']];
  (dashboard.cases||[]).slice(0,100).forEach(c=>rows.push([c.leadId||'',c.clientName||'',c.loanType||'',c.amount||'',c.bank||'',c.status||'',c.tatStatus||'']));
  try{sh.getRange(1,1,Math.max(1,sh.getMaxRows()),7).breakApart();}catch(_){}
  sh.clearContents();sh.getRange(1,1,rows.length,7).setValues(rows.map(r=>{const out=r.slice();while(out.length<7)out.push('');return out;}));
  sh.getRange(1,1,1,7).mergeAcross().setBackground('#0d2260').setFontColor('#ffffff').setFontWeight('bold');
  sh.getRange(10,1,1,2).setBackground('#d4af37').setFontWeight('bold');sh.getRange(16,1,1,7).setBackground('#0d2260').setFontColor('#ffffff').setFontWeight('bold');
  sh.setFrozenRows(16);sh.autoResizeColumns(1,7);LOCK_MY_CASES_(sh,emp.EMP_CODE);return{ok:true,cases:Number(stats.total||0)};
}
function P1_SYNC_ROLE_DASHBOARDS_(){const lock=LockService.getScriptLock();if(!lock.tryLock(30000))return{ok:false,err:'Dashboard sync is already running'};try{const map=DC_BUILD_EMP_MAP_(true),result={ok:true,synced:0,skipped:0,errors:[]};Object.keys(map).forEach(code=>{const emp=map[code];if(!emp.PERSONAL_FILE_ID){result.skipped++;return;}try{const write=P1_ROLE_DASHBOARD_WRITE_(emp);if(write.ok)result.synced++;else result.skipped++;}catch(err){result.errors.push(code+': '+String(err.message||err).slice(0,120));}});return result;}finally{lock.releaseLock();}}
function P1_ROLE_DASHBOARD_DAILY_(){try{return P1_SYNC_ROLE_DASHBOARDS_();}catch(err){LOG_ERR_('P1_ROLE_DASHBOARD_DAILY','',err.message);return{ok:false,err:err.message};}}
function SYNC_ROLE_DASHBOARDS_ENGINE(d){if(d&&typeof d==='object'&&Object.keys(d).length){const actor=P1_REQUIRE_API_ACTOR_(d);if(!actor||!P1_HAS_MASTER_ACCESS_(actor))return{ok:false,err:'Master access required'};}else if(!P1_ACTIVE_ADMIN_())throw new Error('Master access required');return P1_SYNC_ROLE_DASHBOARDS_();}

// Every active employee is visible in the daily attendance report. A missing
// verified activity is NO_ACTIVITY, not a silent omission or assumed payroll decision.
function ATTENDANCE_EOD_REPORT_() {
  try {
    const sh=GET_OR_CREATE_('ATTENDANCE_LOG');
    P1_ENSURE_HEADERS_(sh,P1_TAB_MAP.ATTENDANCE_LOG());
    const today=Utilities.formatDate(new Date(),'Asia/Kolkata','yyyy-MM-dd');
    const data=sh.getDataRange().getValues(),h=data[0].map(DC_NORM_);
    const iDate=h.indexOf('DATE'),iCode=h.indexOf('EMP_CODE'),iName=h.indexOf('EMP_NAME'),iSt=h.indexOf('ATTENDANCE_STATUS'),todayRows={};
    for(let i=1;i<data.length;i++){
      try{
        if(Utilities.formatDate(new Date(data[i][iDate]||0),'Asia/Kolkata','yyyy-MM-dd')===today){
          todayRows[String(data[i][iCode]||'').toUpperCase()]={name:data[i][iName]||data[i][iCode],status:String(data[i][iSt]||'NO_ACTIVITY').toUpperCase()};
        }
      }catch(_){}
    }
    let rpt=`Attendance — ${today}\n\n`,present=0,half=0,working=0,noActivity=0;
    Object.values(DC_BUILD_EMP_MAP_(true)).forEach(emp=>{
      const row=todayRows[emp.EMP_CODE]||{name:emp.NAME||emp.EMP_CODE,status:'NO_ACTIVITY'},st=row.status;
      rpt+=`• ${row.name}: ${st}\n`;
      if(st==='PRESENT')present++;else if(st==='HALF_DAY')half++;else if(st==='WORKING')working++;else noActivity++;
    });
    DC_SEND_TG_(rpt+`\nPresent:${present} | Half:${half} | Working:${working} | No activity:${noActivity}`);
  } catch(e){ LOG_ERR_('ATTENDANCE_EOD_REPORT','',e.message); }
}
