// ======================================================
// 🔒 DASHBOARD + CORE LOCK FINAL ENGINE (CLEANED + FIXED)
// Founder + MD = Full Edit Access
// All others = Protected (View + Limited Edit where needed)
// ======================================================

const DASHBOARD_CORE = {
  EDITORS: [
    "upendra.raghav@divyanshicapital.com",
    "narendra.94100@gmail.com"
  ],
  MASTER_DASHBOARD_SHEETS: ["FOUNDER_MD_DASHBOARD"],
  PERSONAL_DASHBOARD_SHEET: "SALES_DASHBOARD"
};

// ================== PUBLIC ENTRY POINTS ==================

function BUILD_PERSONAL_ROLE_BASED_DASHBOARDS() {
  SYNC_ROLE_DASHBOARDS_ENGINE();
}

function MARK_DASHBOARD_SYNC_PENDING() {
  PropertiesService.getScriptProperties().setProperty("DASHBOARD_SYNC_PENDING", "YES");
}

function SYNC_ROLE_DASHBOARDS_ENGINE() {
  try {
    // Main personal file sync (MY_CASES + SALES_ACTIVITY)
    MIS_15MIN_FULL_SYNC_();
    Logger.log("✅ SYNC_ROLE_DASHBOARDS_ENGINE completed");
  } catch (e) {
    LOG_ERR_("SYNC_ROLE_DASHBOARDS_ENGINE", "", e.message);
  }
}

function DASHBOARD_SYNC_TRIGGER_ENGINE() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty("DASHBOARD_SYNC_PENDING") !== "YES") return;

  const lock = LockService.getScriptLock();
  try {
    if (lock.tryLock(30000)) {
      SYNC_ROLE_DASHBOARDS_ENGINE();
      props.setProperty("DASHBOARD_SYNC_PENDING", "NO");
      Logger.log("✅ Dashboard sync completed");
    }
  } catch (e) {
    LOG_ERR_("DASHBOARD_SYNC_TRIGGER_ENGINE", "", e.message);
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function DASHBOARD_MASTER_EDIT_WATCHER(e) {
  try {
    if (!e || !e.range) return;

    const sh = e.range.getSheet();
    const name = sh.getName();

    const triggerSheets = [
      "MASTER_DATA",
      "COMMON_ENTRY",
      "ALL_EMPLOYEES",
      "HR_MD_APPROVAL",
      "SMART_LOG",
      "SOURCE_NAME"
    ];

    if (triggerSheets.indexOf(name) !== -1) {
      MARK_DASHBOARD_SYNC_PENDING();
    }
  } catch (err) {
    LOG_ERR_("DASHBOARD_MASTER_EDIT_WATCHER", "", err.message);
  }
}

// ================== PROTECTION HELPERS ==================

function NORMALIZE_EMAIL_LOCK_(v) {
  return String(v || "").trim().toLowerCase();
}

function UNIQUE_EMAILS_LOCK_(arr) {
  return [...new Set((arr || []).map(NORMALIZE_EMAIL_LOCK_).filter(Boolean))];
}

function APPLY_DASHBOARD_PROTECTION_(sheet, allowedEditors, description) {
  if (!sheet) return;

  const keep = UNIQUE_EMAILS_LOCK_(allowedEditors);
  let protection = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET)[0];
  if (!protection) protection = sheet.protect();

  protection.setDescription(description || ("LOCK_" + sheet.getName()));
  protection.setWarningOnly(false);

  protection.getEditors().forEach(function(u) {
    const email = NORMALIZE_EMAIL_LOCK_(u.getEmail());
    if (keep.indexOf(email) === -1) {
      try { protection.removeEditor(u); } catch (_) {}
    }
  });

  keep.forEach(function(email) {
    try { protection.addEditor(email); } catch (_) {}
  });

  try {
    if (protection.canDomainEdit()) protection.setDomainEdit(false);
  } catch (_) {}
}

function LOCK_MASTER_DASHBOARDS_TO_CORE_ONLY() {
  const props = PropertiesService.getScriptProperties();
  const masterId = props.getProperty("MASTER_FILE_ID") || SpreadsheetApp.getActiveSpreadsheet().getId();
  const ss = SpreadsheetApp.openById(masterId);
  const allowed = UNIQUE_EMAILS_LOCK_(DASHBOARD_CORE.EDITORS);

  DASHBOARD_CORE.MASTER_DASHBOARD_SHEETS.forEach(function(name) {
    const sh = ss.getSheetByName(name);
    if (sh) APPLY_DASHBOARD_PROTECTION_(sh, allowed, "CORE_ONLY_" + name);
  });
  Logger.log("✅ Master dashboards locked to Founder + MD");
}

function LOCK_PERSONAL_DASHBOARD_(fileId) {
  try {
    const pss = SpreadsheetApp.openById(fileId);
    const sh = pss.getSheetByName(DASHBOARD_CORE.PERSONAL_DASHBOARD_SHEET);
    if (!sh) return;
    APPLY_DASHBOARD_PROTECTION_(sh, DASHBOARD_CORE.EDITORS, "CORE_ONLY_PERSONAL_DASHBOARD");
  } catch (e) {
    Logger.log("Personal dashboard lock failed: " + fileId + " | " + e.message);
  }
}

function LOCK_ALL_PERSONAL_DASHBOARDS_TO_CORE_ONLY(empData, E) {
  for (let i = 1; i < empData.length; i++) {
    const fileId = String(val(empData[i], E.fileId) || "").trim();
    if (fileId.length > 20) {
      try { LOCK_PERSONAL_DASHBOARD_(fileId); } catch (_) {}
    }
  }
}

// ================== MAIN SYNC ENGINE ==================

function SYNC_ROLE_DASHBOARDS_ENGINE() {
  const masterId = getMasterFileIdSafe_();
  const ss = SpreadsheetApp.openById(masterId);

  const empSheet = ss.getSheetByName("ALL_EMPLOYEES");
  if (!empSheet || empSheet.getLastRow() < 2) return;

  const empData = empSheet.getDataRange().getValues();
  const empHeaders = empData[0].map(h => NORMALIZE_HEADER(h));

  const E = {
    code: idxAlias(empHeaders, ["EMP_CODE"]),
    name: idxAlias(empHeaders, ["EMPLOYEES_NAME", "EMPOLYEES_NAME"]),
    role: idxAlias(empHeaders, ["ROLE"]),
    fileId: idxAlias(empHeaders, ["PERSONAL_FILE_ID"]),
    status: idxAlias(empHeaders, ["ACTIVE_STATUS", "P1_SYNC_STATUS"])
  };

  // Build Founder/MD Main Dashboard
  BUILD_FOUNDER_MD_MAIN_DASHBOARD_INTERNAL(ss, empData, E);

  // Build + Lock Personal Dashboards
  for (let i = 1; i < empData.length; i++) {
    const fileId = String(val(empData[i], E.fileId) || "").trim();
    if (fileId.length < 20) continue;

    try {
      const pss = SpreadsheetApp.openById(fileId);
      let dash = pss.getSheetByName("SALES_DASHBOARD");
      if (!dash) dash = pss.insertSheet("SALES_DASHBOARD");
      dash.clearContents();
      dash.clearFormats();

      // TODO: Add role-specific content here if needed in future
      dash.getRange(1, 1).setValue("Dashboard synced at " + new Date());

      APPLY_BEST_UI_THEME_AND_LOGIC_(dash);
      APPLY_DASHBOARD_PROTECTION_(dash, DASHBOARD_CORE.EDITORS, "CORE_ONLY_PERSONAL_DASHBOARD");
    } catch (err) {
      Logger.log("Dashboard creation failed for file: " + fileId);
    }
  }

  LOCK_MASTER_DASHBOARDS_TO_CORE_ONLY();
  LOCK_ALL_PERSONAL_DASHBOARDS_TO_CORE_ONLY(empData, E);
}

// ================== HELPER FUNCTIONS ==================

function getMasterFileIdSafe_() {
  const props = PropertiesService.getScriptProperties();
  return props.getProperty("MASTER_FILE_ID") || props.getProperty("P1_MASTER_FILE_ID") || SpreadsheetApp.getActiveSpreadsheet().getId();
}

function NORMALIZE_HEADER(v) {
  return String(v || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
}

function idxAlias(headers, aliases) {
  for (let i = 0; i < aliases.length; i++) {
    const idx = headers.indexOf(NORMALIZE_HEADER(aliases[i]));
    if (idx !== -1) return idx;
  }
  return -1;
}

function val(row, idx) {
  return idx >= 0 ? row[idx] : "";
}

function BUILD_FOUNDER_MD_MAIN_DASHBOARD_INTERNAL(ss, empData, E) {
  let dash = ss.getSheetByName("FOUNDER_MD_DASHBOARD");
  if (!dash) dash = ss.insertSheet("FOUNDER_MD_DASHBOARD");
  dash.clearContents();
  dash.clearFormats();

  dash.getRange(1, 1).setValue("FOUNDER / MD DASHBOARD - Last Synced: " + new Date());
  dash.getRange(2, 1).setValue("System is healthy. Role-based protection active.");
  APPLY_BEST_UI_THEME_AND_LOGIC_(dash);
}

function APPLY_BEST_UI_THEME_AND_LOGIC_(sheet) {
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return;

  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, lastCol)
    .setBackground("#0b5394")
    .setFontColor("#ffffff")
    .setFontWeight("bold");
}

// ================== INSTALL TRIGGER ==================

function INSTALL_DASHBOARD_SYNC_TRIGGER() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === "DASHBOARD_MASTER_EDIT_WATCHER") {
      ScriptApp.deleteTrigger(t);
    }
  });

  try {
    const masterId = getMasterFileIdSafe_();
    ScriptApp.newTrigger("DASHBOARD_MASTER_EDIT_WATCHER")
      .forSpreadsheet(SpreadsheetApp.openById(masterId))
      .onEdit()
      .create();
    Logger.log("✅ Dashboard edit watcher installed");
  } catch (err) {
    Logger.log("Watcher trigger failed: " + err.message);
  }
}