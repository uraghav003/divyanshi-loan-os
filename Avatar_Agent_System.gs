// ═══════════════════════════════════════════════════════════════
//  BULBHUL — AVATAR AGENT SYSTEM (Plug-in Module)
//  Divyanshi Capital Pvt Ltd
//  Version: 1.0-FAST
//  Master: Bulbhul = Brain | Avatars = Per-Employee Virtual Buddies
//  Activates: When PERSONAL_FILE_ID has data
//  Tracks: MY_CASES + SALES_ACTIVITY + Dashboard + TAT + Attendance
//  Knowledge: Role/Department based SKILL_LIBRARY
// ═══════════════════════════════════════════════════════════════

// ─── SKILL LIBRARY — ROLE-BASED KNOWLEDGE BASE ─────────────────
const SKILL_LIBRARY_ = {
  SALES: {
    title: "Sales Representative Skills",
    skills: [
      "Lead Qualification: BANT (Budget, Authority, Need, Timeline)",
      "CIBIL Requirements: 650+ for PL, 700+ for HL, 750+ for BL",
      "Bank Fitment: Match client profile to bank eligibility",
      "Document Checklist: PAN, Aadhaar, Salary Slip (3 months), Bank Statement (6 months), ITR (2 years)",
      "Objection Handling: Rate too high → show ROI comparison | Documents missing → explain importance | Processing time → explain TAT",
      "Closing Techniques: Assumptive close, Alternative close, Urgency close",
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
      "Target Setting: Monthly target = 20% above last month, Weekly = Monthly/4",
      "Escalation Handling: TAT breach → reassign | Client complaint → direct call | Bank rejection → find alternative",
      "Recruitment: Interview checklist, 30-60-90 day onboarding plan",
      "Reporting: Daily activity report, Weekly pipeline report, Monthly P&L"
    ],
    dailyTargets: { teamCalls: 100, teamLeads: 30, teamLogins: 10, teamDisbursals: 5 },
    kpi: ["teamConversionRate", "teamProductivity", "attritionRate", "revenuePerEmployee"]
  },
  "LOGIN DEPARTMENT": {
    title: "Login / Operations Skills",
    skills: [
      "File Preparation: Complete document checklist, Duly filled application form, Bank-specific format",
      "Bank Portal Login: HDFC (NetBanking Pro), ICICI (iBizz), Axis (Axis Direct), SBI (YONO)",
      "CIBIL Pull: Soft pull first, Hard pull after client consent",
      "Verification: Employment verification call, Address verification (physical/ digital), Bank statement analysis",
      "TAT Monitoring: Track each stage, Escalate delays, Update client proactively",
      "Rejection Analysis: Document reason, Suggest alternative bank, Re-file if possible",
      "Disbursal Coordination: PDC/ECS setup, Insurance mandate, Agreement signing"
    ],
    dailyTargets: { filesLogged: 10, cibilPulled: 15, verificationsDone: 8, disbursalsProcessed: 3 },
    kpi: ["fileToSanctionRate", "tatCompliance", "rejectionRate", "disbursalAccuracy"]
  },
  HR: {
    title: "HR Skills",
    skills: [
      "Recruitment: Job posting, Resume screening, Interview scheduling, Offer negotiation",
      "Onboarding: Document collection, ID card, System access, Buddy assignment",
      "Attendance Management: Biometric integration, Leave approval, Half-day tracking",
      "Payroll: Salary calculation, TDS, PF, ESIC, Bonus, Incentive processing",
      "Performance Review: Monthly 1:1, Quarterly appraisal, PIP for underperformers",
      "Exit Process: Resignation acceptance, F&F settlement, Experience letter, Exit interview"
    ],
    dailyTargets: { interviewsScheduled: 3, onboardingsCompleted: 1, attendanceVerified: 100, queriesResolved: 10 },
    kpi: ["timeToHire", "retentionRate", "attendanceCompliance", "employeeSatisfaction"]
  },
  ACCOUNTS: {
    title: "Accounts Skills",
    skills: [
      "Disbursal Verification: Match bank credit with case ID, Verify commission %, TDS deduction",
      "Commission Calculation: Bank-wise slab, Sales-wise split, Manager override",
      "Invoice Generation: GST-compliant, PAN-linked, Digital signature",
      "Reconciliation: Daily bank reconciliation, Monthly commission reconciliation, Quarterly audit",
      "Payout Processing: NEFT/RTGS, TDS certificate, Monthly statement",
      "Reporting: Daily disbursal report, Monthly P&L, Quarterly tax filing"
    ],
    dailyTargets: { disbursalsVerified: 10, invoicesGenerated: 8, reconciliationsDone: 1, payoutsProcessed: 5 },
    kpi: ["disbursalAccuracy", "commissionErrorRate", "reconciliationTimeliness", "auditCompliance"]
  },
  MD: {
    title: "Managing Director Skills",
    skills: [
      "Strategic Planning: Monthly board review, Quarterly strategy, Annual budget",
      "P&L Management: Revenue tracking, Cost control, ROI analysis",
      "Bank Relations: Rate negotiation, Volume commitment, Exclusive tie-ups",
      "Risk Management: NPA monitoring, Fraud detection, Compliance audit",
      "Team Leadership: Vision setting, Culture building, Crisis management",
      "Stakeholder Management: Investor relations, Regulatory compliance, Brand building"
    ],
    dailyTargets: { decisionsMade: 5, reviewsCompleted: 3, meetingsAttended: 4, strategyNotes: 2 },
    kpi: ["revenueGrowth", "profitMargin", "npRatio", "teamRetention"]
  },
  FOUNDER: {
    title: "Founder Skills",
    skills: [
      "Vision & Mission: Long-term direction, Market expansion, Product innovation",
      "Capital Management: Fund raising, Investor relations, Cash flow optimization",
      "Governance: Board meetings, Compliance oversight, Ethical standards",
      "Brand Building: PR strategy, Digital presence, Industry awards",
      "Network Building: Industry associations, Government liaison, Strategic partnerships"
    ],
    dailyTargets: { strategicCalls: 3, investorUpdates: 1, boardPrep: 1, visionNotes: 2 },
    kpi: ["companyValuation", "marketShare", "brandRecall", "strategicMilestones"]
  },
  ADMIN: {
    title: "Admin Skills",
    skills: [
      "System Management: User access, Password resets, Software updates",
      "Data Security: Backup verification, Access logs, GDPR compliance",
      "Vendor Management: AMC tracking, License renewal, Service escalation",
      "Infrastructure: Office maintenance, IT support, Asset tracking"
    ],
    dailyTargets: { ticketsResolved: 10, backupsVerified: 1, accessReviews: 5, vendorCalls: 2 },
    kpi: ["systemUptime", "ticketResolutionTime", "securityIncidents", "costOptimization"]
  },
  STAFF: {
    title: "General Staff Skills",
    skills: [
      "Data Entry: Accuracy > 99%, Speed > 30 WPM, Zero duplication",
      "Communication: Professional email, Clear WhatsApp, Courteous calls",
      "Time Management: Priority matrix, Deadline adherence, Proactive updates",
      "Learning: Product updates, Process changes, New bank tie-ups"
    ],
    dailyTargets: { entriesCompleted: 50, errorsZero: 1, learningMinutes: 15 },
    kpi: ["accuracyRate", "productivity", "learningIndex", "attendancePunctuality"]
  }
};

// ─── BULBHUL MASTER AGENT — THE BRAIN ──────────────────────────
// Tracks all avatars, receives evening reports, manages master file
function BULBHUL_MASTER_AGENT_() {
  const now = new Date();
  const hour = now.getHours();
  const min = now.getMinutes();
  const allEmps = DC_BUILD_EMP_MAP_();
  const activeAvatars = [];
  const inactiveAvatars = [];
  const reports = [];

  // Scan all employees and activate avatars
  Object.keys(allEmps).forEach(code => {
    const emp = allEmps[code];
    const avatar = AVATAR_AGENT_(code);
    if (avatar.isActive) {
      activeAvatars.push(avatar);
      // Run avatar intelligence
      const intel = avatar.runIntelligence();
      reports.push({ code, name: emp.NAME, role: emp.ROLE, dept: emp.DEPARTMENT, ...intel });
    } else {
      inactiveAvatars.push({ code, name: emp.NAME, reason: avatar.inactiveReason });
    }
  });

  // Bulbhul's own master-level checks
  const masterChecks = BULBHUL_MASTER_CHECKS_();

  // Store report for evening summary
  const reportData = {
    timestamp: now,
    activeCount: activeAvatars.length,
    inactiveCount: inactiveAvatars.length,
    avatars: reports,
    master: masterChecks,
    alerts: BULBHUL_GENERATE_ALERTS_(reports, masterChecks)
  };

  // Save to AVATAR_ACTIVITY_LOG
  const log = GET_OR_CREATE_("AVATAR_ACTIVITY_LOG");
  P1_ENSURE_HEADERS_(log, ["TIMESTAMP", "AVATAR_COUNT", "ACTIVE_COUNT", "INACTIVE_COUNT", "ALERTS", "MASTER_STATUS"]);
  log.appendRow([now, activeAvatars.length + inactiveAvatars.length, activeAvatars.length, inactiveAvatars.length, JSON.stringify(reportData.alerts.slice(0, 5)), "MASTER_SCAN_COMPLETE"]);

  // If it's evening (after 6 PM), send consolidated report
  if (hour >= 18) {
    EVENING_AVATAR_REPORT_(reportData);
  }

  return reportData;
}

// ─── BULBHUL MASTER CHECKS ─────────────────────────────────────
function BULBHUL_MASTER_CHECKS_() {
  const checks = {};
  // Check 1: All personal files accessible
  const allEmps = DC_BUILD_EMP_MAP_();
  checks.personalFileAccess = Object.keys(allEmps).map(code => {
    const emp = allEmps[code];
    let accessible = false;
    try {
      if (emp.PERSONAL_FILE_ID) {
        P1_OPEN_SS_(emp.PERSONAL_FILE_ID);
        accessible = true;
      }
    } catch (e) {}
    return { code, accessible, fileId: emp.PERSONAL_FILE_ID || "MISSING" };
  });
  checks.brokenFiles = checks.personalFileAccess.filter(x => !x.accessible && x.fileId !== "MISSING");
  checks.missingFiles = checks.personalFileAccess.filter(x => x.fileId === "MISSING");

  // Check 2: Master data integrity
  const master = GET_MASTER_ALL_();
  checks.totalLeads = master.length;
  checks.breachedTAT = master.filter(r => String(r.TAT_STATUS || r.tat_status || "").toUpperCase() === "BREACHED").length;
  checks.pendingDisbursal = master.filter(r => ["DISBURSE", "DISBURSED"].includes(String(r.CASE_CATEGORY || r.case_category || "").toUpperCase()) && !(r.DISBURSAL_NOTIFIED || r.disbursal_notified)).length;
  checks.unassignedLeads = master.filter(r => !String(r.EMP_CODE || r.emp_code || "").trim()).length;

  // Check 3: System health
  checks.scriptProps = DC_CFG.PROPS.getProperties();
  checks.missingProps = ["TG_TOKEN", "META_WA_TOKEN", "META_WA_PHONE_ID", "DEEPSEEK_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"].filter(k => !checks.scriptProps[k]);

  return checks;
}

// ─── BULBHUL ALERT GENERATOR ─────────────────────────────────────
function BULBHUL_GENERATE_ALERTS_(avatarReports, masterChecks) {
  const alerts = [];
  // TAT Breaches
  if (masterChecks.breachedTAT > 0) alerts.push("🚨 " + masterChecks.breachedTAT + " TAT breaches detected");
  // Unassigned leads
  if (masterChecks.unassignedLeads > 0) alerts.push("⚠️ " + masterChecks.unassignedLeads + " unassigned leads pending");
  // Broken personal files
  if (masterChecks.brokenFiles.length > 0) alerts.push("🔧 " + masterChecks.brokenFiles.length + " personal files inaccessible: " + masterChecks.brokenFiles.map(x => x.code).join(", "));
  // Missing API keys
  if (masterChecks.missingProps.length > 0) alerts.push("🔑 Missing API keys: " + masterChecks.missingProps.join(", "));
  // Avatar-level alerts
  avatarReports.forEach(r => {
    if (r.tatBreaches > 0) alerts.push("⏰ " + r.name + " (" + r.code + ") has " + r.tatBreaches + " breached cases");
    if (r.missingFollowups > 0) alerts.push("📞 " + r.name + " (" + r.code + ") missing " + r.missingFollowups + " follow-ups");
    if (r.attendanceToday === "ABSENT") alerts.push("🏠 " + r.name + " (" + r.code + ") absent today");
    if (r.attendanceToday === "HALF_DAY") alerts.push("🟡 " + r.name + " (" + r.code + ") half-day today");
  });
  return alerts;
}

// ─── AVATAR AGENT — PER-EMPLOYEE VIRTUAL BUDDY ─────────────────
// Activates ONLY when PERSONAL_FILE_ID has data
function AVATAR_AGENT_(code) {
  const emp = FIND_EMP_(code);
  if (!emp) return { isActive: false, inactiveReason: "EMPLOYEE_NOT_FOUND" };
  if (!emp.PERSONAL_FILE_ID) return { isActive: false, inactiveReason: "NO_PERSONAL_FILE" };

  let ss;
  try { ss = P1_OPEN_SS_(emp.PERSONAL_FILE_ID); } catch (e) {
    return { isActive: false, inactiveReason: "FILE_INACCESSIBLE: " + e.message };
  }

  // Load role-based skills
  const roleKey = String(emp.ROLE || "STAFF").toUpperCase().trim();
  const deptKey = String(emp.DEPARTMENT || "").toUpperCase().trim();
  const skills = SKILL_LIBRARY_[roleKey] || SKILL_LIBRARY_[deptKey] || SKILL_LIBRARY_["STAFF"];

  // Check sheets exist
  const myCases = ss.getSheetByName("MY_CASES");
  const salesActivity = ss.getSheetByName("SALES_ACTIVITY");
  const hasData = (myCases && myCases.getLastRow() >= 2) || (salesActivity && salesActivity.getLastRow() >= 2);

  if (!hasData) return { isActive: false, inactiveReason: "NO_DATA_IN_PERSONAL_FILE" };

  // Avatar is ACTIVE
  const avatar = {
    isActive: true,
    code: code,
    name: emp.NAME,
    role: emp.ROLE,
    department: emp.DEPARTMENT,
    skills: skills,
    personalFileId: emp.PERSONAL_FILE_ID,

    // ─── INTELLIGENCE ENGINE ─────────────────────────────────
    runIntelligence: function() {
      const intel = {
        code: this.code,
        name: this.name,
        timestamp: new Date(),
        myCasesCount: 0,
        salesActivityCount: 0,
        tatBreaches: 0,
        missingFollowups: 0,
        todayTasks: 0,
        attendanceToday: "UNKNOWN",
        targetProgress: {},
        knowledgeNudge: "",
        actionItems: [],
        pushMessage: ""
      };

      // 1. Read MY_CASES
      if (myCases && myCases.getLastRow() >= 2) {
        const mcData = myCases.getDataRange().getValues();
        const mcH = mcData[0].map(DC_NORM_);
        intel.myCasesCount = mcData.length - 1;
        const cases = mcData.slice(1).map(r => {
          const o = {}; mcH.forEach((k, i) => o[k] = r[i]); return o;
        });
        // TAT analysis
        cases.forEach(c => {
          const ts = String(c.TAT_STATUS || c.tat_status || "").toUpperCase();
          if (ts === "BREACHED") intel.tatBreaches++;
          const status = String(c.CASE_CATEGORY || c.case_category || "").toUpperCase();
          if (["OPEN", "INTERESTED", "CALLBACK"].includes(status)) intel.missingFollowups++;
        });
      }

      // 2. Read SALES_ACTIVITY
      if (salesActivity && salesActivity.getLastRow() >= 2) {
        const saData = salesActivity.getDataRange().getValues();
        intel.salesActivityCount = saData.length - 1;
        const today = Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd");
        saData.slice(1).forEach(r => {
          const ts = r[0]; // TIMESTAMP column
          if (ts && Utilities.formatDate(new Date(ts), "Asia/Kolkata", "yyyy-MM-dd") === today) {
            intel.todayTasks++;
          }
        });
      }

      // 3. Attendance check
      const attLog = SHEET_("ATTENDANCE_LOG");
      if (attLog && attLog.getLastRow() >= 2) {
        const attData = attLog.getDataRange().getValues();
        const attH = attData[0].map(DC_NORM_);
        const iD = attH.indexOf("DATE");
        const iC = attH.indexOf("EMP_CODE");
        const iS = attH.indexOf("ATTENDANCE_STATUS");
        const today = Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd");
        for (let i = 1; i < attData.length; i++) {
          if (Utilities.formatDate(new Date(attData[i][iD] || 0), "Asia/Kolkata", "yyyy-MM-dd") === today &&
              String(attData[i][iC] || "").trim().toUpperCase() === code) {
            intel.attendanceToday = String(attData[i][iS] || "ABSENT").toUpperCase();
            break;
          }
        }
      }

      // 4. Target progress
      if (this.skills && this.skills.dailyTargets) {
        const targets = this.skills.dailyTargets;
        intel.targetProgress = {
          calls: { target: targets.calls || 0, actual: intel.todayTasks },
          leads: { target: targets.leads || 0, actual: intel.myCasesCount },
          followups: { target: targets.followups || 0, actual: intel.todayTasks }
        };
      }

      // 5. Knowledge nudge (role-based tip)
      if (this.skills && this.skills.skills && this.skills.skills.length > 0) {
        const tipIndex = Math.floor(Math.random() * this.skills.skills.length);
        intel.knowledgeNudge = this.skills.skills[tipIndex];
      }

      // 6. Action items
      if (intel.tatBreaches > 0) intel.actionItems.push("URGENT: " + intel.tatBreaches + " TAT breached cases need immediate action");
      if (intel.missingFollowups > 0) intel.actionItems.push("FOLLOW-UP: " + intel.missingFollowups + " leads need follow-up today");
      if (intel.attendanceToday === "ABSENT") intel.actionItems.push("ATTENDANCE: You are marked absent today");
      if (intel.attendanceToday === "HALF_DAY") intel.actionItems.push("ATTENDANCE: Half-day logged, complete full day");

      // 7. Push message (what avatar tells employee)
      intel.pushMessage = this.buildPushMessage_(intel);

      // 8. Send push to employee
      this.pushToEmployee_(intel.pushMessage, emp);

      return intel;
    },

    // ─── PUSH MESSAGE BUILDER ──────────────────────────────────
    buildPushMessage_: function(intel) {
      let msg = "👋 *Hi " + this.name + "! Your Avatar here.*\n\n";
      msg += "📊 *Today's Snapshot:*\n";
      msg += "• Cases: " + intel.myCasesCount + "\n";
      msg += "• Activities: " + intel.todayTasks + "\n";
      msg += "• Attendance: " + intel.attendanceToday + "\n\n";
      if (intel.tatBreaches > 0) msg += "🚨 *URGENT:* " + intel.tatBreaches + " cases TAT breached!\n\n";
      if (intel.missingFollowups > 0) msg += "📞 *Follow-ups:* " + intel.missingFollowups + " pending\n\n";
      if (intel.actionItems.length > 0) msg += "✅ *Action Items:*\n" + intel.actionItems.map(x => "• " + x).join("\n") + "\n\n";
      msg += "💡 *Today's Tip:*\n" + intel.knowledgeNudge + "\n\n";
      msg += "🔗 *Your Links:*\n";
      msg += "Dashboard: " + (emp.P1_DASHBOARD_URL || "N/A") + "\n";
      msg += "Form: " + (emp.P1_SMART_FORM_URL || "N/A") + "\n";
      msg += "File: " + (emp.P1_PERSONAL_FILE_URL || "N/A") + "\n\n";
      msg += "_Powered by Bulbhul AI_";
      return msg;
    },

    // ─── PUSH TO EMPLOYEE ──────────────────────────────────────
    pushToEmployee_: function(message, employee) {
      // Try WhatsApp first
      if (employee.WHATSAPP && employee.WHATSAPP_VERIFIED === "YES") {
        DC_SEND_WA_(employee.WHATSAPP, message);
      }
      // Try Telegram
      if (employee.TG_CHAT_ID) {
        DC_SEND_TG_MESSAGE_(employee.TG_CHAT_ID, message);
      }
      // Log push
      const log = GET_OR_CREATE_("AVATAR_ACTIVITY_LOG");
      P1_ENSURE_HEADERS_(log, ["TIMESTAMP", "CHAT_ID", "USER", "ACTION", "DETAILS", "CHANNEL", "EMP_CODE", "MOBILE"]);
      log.appendRow([new Date(), employee.TG_CHAT_ID || "", employee.NAME, "AVATAR_PUSH", message.slice(0, 500), "AVATAR", code, employee.WHATSAPP || ""]);
    }
  };

  return avatar;
}

// ─── EVENING AVATAR REPORT ─────────────────────────────────────
// Sent to Bulbhul (MD/Founder) every evening
function EVENING_AVATAR_REPORT_(reportData) {
  const now = new Date();
  const today = Utilities.formatDate(now, "Asia/Kolkata", "yyyy-MM-dd");

  let tgMsg = "📊 *EVENING AVATAR REPORT — " + today + "*\n\n";
  tgMsg += "👥 *Active Avatars:* " + reportData.activeCount + "\n";
  tgMsg += "😴 *Inactive:* " + reportData.inactiveCount + "\n";
  tgMsg += "📁 *Total Leads:* " + reportData.master.totalLeads + "\n";
  tgMsg += "⏰ *TAT Breaches:* " + reportData.master.breachedTAT + "\n";
  tgMsg += "💰 *Pending Disbursals:* " + reportData.master.pendingDisbursal + "\n";
  tgMsg += "❓ *Unassigned:* " + reportData.master.unassignedLeads + "\n\n";

  // Top performers
  const topPerformers = reportData.avatars
    .filter(a => a.todayTasks >= 5)
    .sort((a, b) => b.todayTasks - a.todayTasks)
    .slice(0, 5);
  if (topPerformers.length) {
    tgMsg += "🏆 *Top Performers:*\n";
    topPerformers.forEach(p => {
      tgMsg += "• " + p.name + " (" + p.code + "): " + p.todayTasks + " tasks, " + p.myCasesCount + " cases\n";
    });
    tgMsg += "\n";
  }

  // Needs attention
  const needsAttention = reportData.avatars
    .filter(a => a.tatBreaches > 0 || a.attendanceToday === "ABSENT" || a.missingFollowups > 5)
    .slice(0, 5);
  if (needsAttention.length) {
    tgMsg += "⚠️ *Needs Attention:*\n";
    needsAttention.forEach(n => {
      tgMsg += "• " + n.name + " (" + n.code + "): ";
      const issues = [];
      if (n.tatBreaches > 0) issues.push(n.tatBreaches + " TAT breach");
      if (n.attendanceToday === "ABSENT") issues.push("Absent");
      if (n.missingFollowups > 5) issues.push(n.missingFollowups + " missing follow-ups");
      tgMsg += issues.join(", ") + "\n";
    });
    tgMsg += "\n";
  }

  // Alerts
  if (reportData.alerts.length > 0) {
    tgMsg += "🚨 *Alerts:*\n" + reportData.alerts.slice(0, 10).join("\n") + "\n\n";
  }

  tgMsg += "_Report by Bulbhul Master Agent_";

  // Send to Bulbhul channels
  DC_SEND_TG_(tgMsg);

  // Send to MD and Founder
  if (MailApp.getRemainingDailyQuota() > 0) {
    MailApp.sendEmail({
      to: DC_CFG.COMPANY.MD_EMAIL,
      cc: DC_CFG.COMPANY.FOUNDER_EMAIL,
      subject: "[EVENING REPORT] Avatar System — " + today,
      body: tgMsg.replace(/\*/g, ""),
      name: "Bulbhul Master Agent"
    });
  }

  // Save to MIS_FINAL_REPORT
  const reportSheet = GET_OR_CREATE_("MIS_FINAL_REPORT");
  P1_ENSURE_HEADERS_(reportSheet, ["DATE", "REPORT_TYPE", "ACTIVE_AVATARS", "INACTIVE_AVATARS", "TOTAL_LEADS", "TAT_BREACHES", "PENDING_DISBURSAL", "UNASSIGNED", "TOP_PERFORMERS", "NEEDS_ATTENTION", "ALERTS", "RAW_JSON"]);
  reportSheet.appendRow([
    now, "EVENING_AVATAR", reportData.activeCount, reportData.inactiveCount,
    reportData.master.totalLeads, reportData.master.breachedTAT,
    reportData.master.pendingDisbursal, reportData.master.unassignedLeads,
    JSON.stringify(topPerformers.map(p => ({ code: p.code, name: p.name, tasks: p.todayTasks }))),
    JSON.stringify(needsAttention.map(n => ({ code: n.code, name: n.name, issues: [n.tatBreaches > 0 ? "TAT" : "", n.attendanceToday === "ABSENT" ? "ABSENT" : "", n.missingFollowups > 5 ? "FOLLOWUP" : ""].filter(Boolean) }))),
    JSON.stringify(reportData.alerts.slice(0, 10)),
    JSON.stringify(reportData).slice(0, 50000)
  ]);

  return { sent: true, recipients: [DC_CFG.COMPANY.MD_EMAIL, DC_CFG.COMPANY.FOUNDER_EMAIL] };
}

// ─── AVATAR KNOWLEDGE PUSH ─────────────────────────────────────
// Pushes role-specific knowledge to employee on demand or schedule
function AVATAR_KNOWLEDGE_PUSH_(code, topic) {
  const emp = FIND_EMP_(code);
  if (!emp) return { success: false, error: "Not found" };
  const roleKey = String(emp.ROLE || "STAFF").toUpperCase().trim();
  const skills = SKILL_LIBRARY_[roleKey] || SKILL_LIBRARY_["STAFF"];
  if (!skills) return { success: false, error: "No skills for role" };

  let msg = "📚 *Knowledge Push for " + emp.NAME + "*\n";
  msg += "Role: " + skills.title + "\n\n";

  if (topic && skills.skills.some(s => s.toLowerCase().includes(topic.toLowerCase()))) {
    const matched = skills.skills.filter(s => s.toLowerCase().includes(topic.toLowerCase()));
    msg += "🔍 *On " + topic + ":*\n" + matched.map(m => "• " + m).join("\n") + "\n\n";
  } else {
    msg += "💡 *Key Skills:*\n" + skills.skills.slice(0, 5).map(s => "• " + s).join("\n") + "\n\n";
  }

  if (skills.dailyTargets) {
    msg += "🎯 *Daily Targets:*\n";
    Object.entries(skills.dailyTargets).forEach(([k, v]) => {
      msg += "• " + k + ": " + v + "\n";
    });
    msg += "\n";
  }

  if (skills.kpi) {
    msg += "📈 *Your KPIs:*\n" + skills.kpi.map(k => "• " + k).join("\n") + "\n\n";
  }

  msg += "_Your Avatar Buddy_";

  // Push
  if (emp.WHATSAPP && emp.WHATSAPP_VERIFIED === "YES") DC_SEND_WA_(emp.WHATSAPP, msg);
  if (emp.TG_CHAT_ID) DC_SEND_TG_MESSAGE_(emp.TG_CHAT_ID, msg);

  return { success: true, pushed: true, topic: topic || "general" };
}

// ─── AVATAR SCHEDULED CHECK ────────────────────────────────────
// Runs every hour to check all avatars
function AVATAR_SCHEDULED_CHECK_() {
  return BULBHUL_MASTER_AGENT_();
}

// ─── AVATAR ON-DEMAND CHECK ────────────────────────────────────
// Triggered when employee opens dashboard or makes edit
function AVATAR_ON_DEMAND_(code) {
  const avatar = AVATAR_AGENT_(code);
  if (!avatar.isActive) return { active: false, reason: avatar.inactiveReason };
  const intel = avatar.runIntelligence();
  return { active: true, intelligence: intel };
}

// ─── BULBHUL DIRECT COMMAND ──────────────────────────────────────
// Bulbhul can command any avatar directly
function BULBHUL_COMMAND_AVATAR_(targetCode, command, params) {
  const emp = FIND_EMP_(targetCode);
  if (!emp) return { success: false, error: "Employee not found" };

  const avatar = AVATAR_AGENT_(targetCode);
  if (!avatar.isActive) return { success: false, error: "Avatar inactive: " + avatar.inactiveReason };

  let result = { command, target: targetCode, executed: false };

  switch (String(command).toUpperCase()) {
    case "PUSH":
      const intel = avatar.runIntelligence();
      result = { ...result, executed: true, pushSent: true, intel: intel };
      break;
    case "KNOWLEDGE":
      const k = AVATAR_KNOWLEDGE_PUSH_(targetCode, params.topic || "");
      result = { ...result, executed: true, knowledgePushed: k };
      break;
    case "CHECK_TAT":
      const myCases = P1_OPEN_SS_(emp.PERSONAL_FILE_ID).getSheetByName("MY_CASES");
      const breaches = [];
      if (myCases && myCases.getLastRow() >= 2) {
        const d = myCases.getDataRange().getValues();
        const h = d[0].map(DC_NORM_);
        const tsIdx = h.indexOf("TAT_STATUS");
        d.slice(1).forEach((r, i) => {
          if (tsIdx > -1 && String(r[tsIdx] || "").toUpperCase() === "BREACHED") {
            breaches.push({ row: i + 2, leadId: r[h.indexOf("LEAD_ID")] || "N/A" });
          }
        });
      }
      result = { ...result, executed: true, breaches: breaches };
      break;
    case "ATTENDANCE_REMINDER":
      const msg = "⏰ *Attendance Reminder*\n" + emp.NAME + ", please complete your check-in. Window: 10:00-10:15 or 14:00-14:15";
      if (emp.WHATSAPP && emp.WHATSAPP_VERIFIED === "YES") DC_SEND_WA_(emp.WHATSAPP, msg);
      if (emp.TG_CHAT_ID) DC_SEND_TG_MESSAGE_(emp.TG_CHAT_ID, msg);
      result = { ...result, executed: true, reminderSent: true };
      break;
    default:
      result = { ...result, executed: false, error: "Unknown command" };
  }

  return result;
}

// ─── INSTALL AVATAR SYSTEM ─────────────────────────────────────
// Add this to DC_INSTALL_P1_FINAL() or run separately
function INSTALL_AVATAR_SYSTEM_() {
  const ss = DC_GET_SS_();
  // Ensure AVATAR_ACTIVITY_LOG exists
  if (!ss.getSheetByName("AVATAR_ACTIVITY_LOG")) ss.insertSheet("AVATAR_ACTIVITY_LOG");
  P1_ENSURE_HEADERS_(ss.getSheetByName("AVATAR_ACTIVITY_LOG"), ["TIMESTAMP", "CHAT_ID", "USER", "ACTION", "DETAILS", "CHANNEL", "EMP_CODE", "MOBILE"]);

  // Ensure MIS_FINAL_REPORT exists
  if (!ss.getSheetByName("MIS_FINAL_REPORT")) ss.insertSheet("MIS_FINAL_REPORT");
  P1_ENSURE_HEADERS_(ss.getSheetByName("MIS_FINAL_REPORT"), ["DATE", "REPORT_TYPE", "ACTIVE_AVATARS", "INACTIVE_AVATARS", "TOTAL_LEADS", "TAT_BREACHES", "PENDING_DISBURSAL", "UNASSIGNED", "TOP_PERFORMERS", "NEEDS_ATTENTION", "ALERTS", "RAW_JSON"]);

  // Setup hourly trigger for avatar checks
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "AVATAR_SCHEDULED_CHECK_") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("AVATAR_SCHEDULED_CHECK_").timeBased().everyHours(1).create();

  // Setup evening report trigger (6 PM)
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "BULBHUL_MASTER_AGENT_") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("BULBHUL_MASTER_AGENT_").timeBased().atHour(18).everyDays(1).create();

  return "✅ AVATAR SYSTEM INSTALLED";
}

// ─── WRAPPER FUNCTIONS (for external calls) ─────────────────────
function BULBHUL_MASTER_AGENT() { return BULBHUL_MASTER_AGENT_(); }
function AVATAR_AGENT(code) { return AVATAR_AGENT_(code); }
function AVATAR_KNOWLEDGE_PUSH(code, topic) { return AVATAR_KNOWLEDGE_PUSH_(code, topic); }
function AVATAR_SCHEDULED_CHECK() { return AVATAR_SCHEDULED_CHECK_(); }
function AVATAR_ON_DEMAND(code) { return AVATAR_ON_DEMAND_(code); }
function BULBHUL_COMMAND_AVATAR(targetCode, command, params) { return BULBHUL_COMMAND_AVATAR_(targetCode, command, params || {}); }
function EVENING_AVATAR_REPORT(reportData) { return EVENING_AVATAR_REPORT_(reportData); }
function INSTALL_AVATAR_SYSTEM() { return INSTALL_AVATAR_SYSTEM_(); }

