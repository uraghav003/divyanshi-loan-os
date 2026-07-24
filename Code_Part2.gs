
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
