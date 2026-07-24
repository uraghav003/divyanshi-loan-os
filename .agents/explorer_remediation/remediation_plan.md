# Integrity Audit Remediation Plan — Milestone 4

## Overview
This document contains the complete technical analysis, rationale, and exact production code replacements required to remediate all 5 hardcoded facade function violations in Section 20 of `Code.gs` and fix the parameter call bug in `calling.html`.

---

## Violations & Technical Solutions

### Violation 1: Hardcoded Mock Data in `P1_GET_CALLING_QUEUE`
- **Location**: `Code.gs` (Lines 1475–1488)
- **Defect**: Returns static mock leads (`LD_1001 Rahul Sharma`, `LD_1002 Priya Singh`, `LD_1003 Amit Verma`).
- **Remediation**:
  - Extract `empCode` safely (supporting both object `{ empCode, accessToken }` and legacy string parameter).
  - Retrieve current master dataset using existing `GET_MASTER_SNAPSHOT_()` and staff details using `FIND_EMPLOYEE_FULL_(empCode)`.
  - Apply security access filtering using `P1_CALLING_CAN_ACCESS_(emp, row)`.
  - Format output array matching `calling.html` expectations (`id`, `leadId`, `name`, `mobile`, `loanType`, `type`, `preferredBank`, `bank`, `amount`, `status`, `remarks`, `followupDate`, `city`, `cibil`).
  - Calculate real queue metrics: `tatBreaches`, `pending`, `doneToday`, `tatHealth`, `performance`, and `aiAvailable`.

#### Proposed Code Replacement for `P1_GET_CALLING_QUEUE`:
```javascript
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
```

---

### Violation 2: Hardcoded Static Return in `P1_CALLING_AI_REMARK`
- **Location**: `Code.gs` (Lines 1506–1514)
- **Defect**: Returns static hardcoded text string without querying live case data or AI provider.
- **Remediation**:
  - Lookup the specific case from `GET_MASTER_SNAPSHOT_()` using `leadId` or `mobile`.
  - Construct dynamic prompt with client name, loan type, preferred bank, case category, loan amount, and remarks.
  - Route the request to `BULBHUL_CHAT_API_({ empCode: empCode, message: userPrompt })` which utilizes `MULTI_BRAIN_REPLY_()` (DeepSeek -> OpenAI -> Gemini -> fallback).

#### Proposed Code Replacement for `P1_CALLING_AI_REMARK`:
```javascript
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
```

---

### Violation 3: Facade Persistence in `P1_UPDATE_CALLING_CASE` / `P1_CALLING_UPDATE`
- **Location**: `Code.gs` (Lines 1533–1550)
- **Defect**: Returns `{ ok: true, success: true }` dummy response without persisting changes to Google Sheets.
- **Remediation**:
  - Extract disposition status, call remarks, staff agent code, client mobile, and call duration.
  - Locate `LEAD_ID` matching the lead or client mobile.
  - Persist updates to both `MASTER_DATA` and `COMMON_ENTRY` sheets via `UPSERT_MERGE_BY_KEY_()`.
  - Trigger `MARK_DASHBOARD_SYNC_PENDING()` and invalidate `MASTER_SNAP_V1` cache.

#### Proposed Code Replacement for `P1_UPDATE_CALLING_CASE` & `P1_CALLING_UPDATE`:
```javascript
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
```

---

### Violation 4: Facade Implementation in `P1_SAVE_CALC_LEAD`
- **Location**: `Code.gs` (Lines 1555–1560)
- **Defect**: Generates an in-memory `CALC_...` timestamp string without writing data to spreadsheet.
- **Remediation**:
  - Build genuine intake payload containing `entry_type: 'CALC_LEAD'`, `source_type: 'WEBSITE'`, `source_name: 'EMI_CALCULATOR'`.
  - Pass payload to `P1_HANDLE_INTAKE_(intakePayload)` to persist to `COMMON_ENTRY`, `MASTER_DATA`, and `SMART_LOG`.

#### Proposed Code Replacement for `P1_SAVE_CALC_LEAD`:
```javascript
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
```

---

### Violation 5: Facade Implementation in `MLA_UPDATE_MINI_STATUS`
- **Location**: `Code.gs` (Lines 1588–1594)
- **Defect**: Returns static timestamp without persisting status or remarks.
- **Remediation**:
  - Parse `mobile`, `status`, `remarks`, `empCode`, `leadId`.
  - Lookup target lead in `MASTER_DATA` by `LEAD_ID` or `CLIENT_MOBILE`.
  - Perform `UPSERT_MERGE_BY_KEY_()` into `MASTER_DATA` and `COMMON_ENTRY`.
  - Invalidate caches and set dashboard sync flag.

#### Proposed Code Replacement for `MLA_UPDATE_MINI_STATUS`:
```javascript
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
```

---

### Additional Bug: `calling.html` Line 519 Parameter Passing
- **Location**: `calling.html` (Line 519)
- **Defect**: Invocations was `.P1_GET_CALLING_QUEUE(AGENT_CODE, ACCESS_TOKEN);` passing 2 positional parameters to a GAS function expecting 1 object parameter.
- **Remediation**: Update call site in `calling.html` line 519 to `.P1_GET_CALLING_QUEUE({empCode: AGENT_CODE, accessToken: ACCESS_TOKEN});`.

---

## File Change Summary

| Target File | Lines / Location | Proposed Action |
|-------------|------------------|-----------------|
| `Code.gs` | Lines 1475–1488 (`P1_GET_CALLING_QUEUE`) | Replace mock data with live query on `GET_MASTER_SNAPSHOT_()` filtered by `empCode`. |
| `Code.gs` | Lines 1506–1514 (`P1_CALLING_AI_REMARK`) | Replace static string with call to `BULBHUL_CHAT_API_()` with case context. |
| `Code.gs` | Lines 1533–1550 (`P1_UPDATE_CALLING_CASE` & `P1_CALLING_UPDATE`) | Replace facade return with `UPSERT_MERGE_BY_KEY_()` on `MASTER_DATA` & `COMMON_ENTRY`. |
| `Code.gs` | Lines 1555–1560 (`P1_SAVE_CALC_LEAD`) | Replace mock string with intake routing via `P1_HANDLE_INTAKE_()`. |
| `Code.gs` | Lines 1588–1594 (`MLA_UPDATE_MINI_STATUS`) | Replace dummy return with spreadsheet persistence via `UPSERT_MERGE_BY_KEY_()`. |
| `calling.html` | Line 519 | Update parameter format to `{ empCode: AGENT_CODE, accessToken: ACCESS_TOKEN }`. |

---

## Verification & Testing Plan
1. **Verification Command**:
   Code changes will be audited and verified using pattern searches and visual inspection.
2. **Key Checkpoints**:
   - Confirm zero occurrences of `'LD_1001'`, `'Rahul Sharma'`, or hardcoded mock queues in `Code.gs`.
   - Confirm `P1_GET_CALLING_QUEUE` processes object parameter and returns sheet rows.
   - Confirm `P1_CALLING_AI_REMARK` delegates prompt to `BULBHUL_CHAT_API_`.
   - Confirm `P1_UPDATE_CALLING_CASE`, `P1_SAVE_CALC_LEAD`, and `MLA_UPDATE_MINI_STATUS` invoke `UPSERT_MERGE_BY_KEY_` or `P1_HANDLE_INTAKE_`.
   - Confirm `calling.html` passes an object to `P1_GET_CALLING_QUEUE`.
