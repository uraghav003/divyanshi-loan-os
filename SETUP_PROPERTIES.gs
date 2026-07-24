// @ts-nocheck
/******************************************************************
 * DIVYANSHI CAPITAL PVT LTD
 * SETUP_PROPERTIES.gs — Script Properties Setup & Verification
 * OWNER: Divyanshi Capital (DC002) / Divyanshi Assistant
 *
 * This script initializes non-secret Script Properties idempotently
 * and verifies all 11 required Script Properties for Divyanshi Capital Loan OS.
 ******************************************************************/

/**
 * List of all 11 required Script Properties across Divyanshi Capital Loan OS.
 */
const REQUIRED_SCRIPT_PROPERTY_KEYS = [
  'MALLIK_API_KEY',
  'DEEPSEEK_API_KEY',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'PRIVACY_NOTICE_URL',
  'CONSENT_VERSION',
  'PRIVACY_CONTACT_EMAIL',
  'GRIEVANCE_OFFICER_NAME',
  'HR_TC_URL',
  'COMPANY_WEBSITE_URL',
  'CLIENT_DOCS_FOLDER_ID'
];

/**
 * Non-secret default property values for Divyanshi Capital Loan OS.
 */
const NON_SECRET_PROPERTY_DEFAULTS = {
  PRIVACY_NOTICE_URL: 'https://www.divyanshicapital.com/privacy',
  CONSENT_VERSION: 'v1.0',
  PRIVACY_CONTACT_EMAIL: 'support@divyanshicapital.com',
  GRIEVANCE_OFFICER_NAME: 'Grievance Officer - Divyanshi Capital',
  HR_TC_URL: 'https://www.divyanshicapital.com/hr-terms',
  COMPANY_WEBSITE_URL: 'https://www.divyanshicapital.com'
};

/**
 * SECRET KEYS REFERENCE & INSTRUCTIONS:
 * The following 5 secrets must be set manually in Apps Script Project Settings:
 *
 * 1. MALLIK_API_KEY         : Internal API secret for route URL signing & auth gate
 * 2. DEEPSEEK_API_KEY       : DeepSeek API key (Primary AI brain)
 * 3. OPENAI_API_KEY         : OpenAI API key (Fallback AI brain)
 * 4. GEMINI_API_KEY         : Gemini API key (Fallback AI brain)
 * 5. CLIENT_DOCS_FOLDER_ID  : Google Drive Folder ID for uploads
 */

/**
 * Initializes missing non-secret Script Properties idempotently.
 * Uses PropertiesService.getScriptProperties().getProperty(key) to check existing values.
 * Preserves existing values if already set.
 *
 * @returns {{ set: string[], missing: string[], allValid: boolean }} Summary of property status after setup.
 */
function setupProperties() {
  const props = PropertiesService.getScriptProperties();
  const setKeys = [];
  const skippedKeys = [];

  for (const [key, defaultValue] of Object.entries(NON_SECRET_PROPERTY_DEFAULTS)) {
    const existing = props.getProperty(key);
    if (existing === null || existing === undefined || String(existing).trim() === '') {
      props.setProperty(key, defaultValue);
      setKeys.push(key);
      Logger.log('[SETUP] Set default non-secret property: %s = %s', key, defaultValue);
    } else {
      skippedKeys.push(key);
      Logger.log('[SETUP] Preserved existing non-secret property: %s', key);
    }
  }

  Logger.log('[SETUP] Initialization completed. Newly set: %s keys, Skipped (already set): %s keys.', setKeys.length, skippedKeys.length);
  Logger.log('[SETUP] NOTE: Secret keys (MALLIK_API_KEY, DEEPSEEK_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, CLIENT_DOCS_FOLDER_ID) must be manually configured in Script Properties.');

  return verifyProperties();
}

/**
 * Verifies that all 11 required Script Properties exist and are non-empty.
 * Logs status ([SET] or [MISSING]) for each key to Logger.log().
 *
 * @returns {{ set: string[], missing: string[], allValid: boolean }} Summary object of properties state.
 */
function verifyProperties() {
  const props = PropertiesService.getScriptProperties();
  const setList = [];
  const missingList = [];

  Logger.log('=== DIVYANSHI CAPITAL LOAN OS - SCRIPT PROPERTIES VERIFICATION ===');

  for (const key of REQUIRED_SCRIPT_PROPERTY_KEYS) {
    const val = props.getProperty(key);
    if (val !== null && val !== undefined && String(val).trim() !== '') {
      setList.push(key);
      Logger.log('[SET]     Key: %s', key);
    } else {
      missingList.push(key);
      Logger.log('[MISSING] Key: %s', key);
    }
  }

  const allValid = missingList.length === 0;

  Logger.log('------------------------------------------------------------------');
  Logger.log('VERIFICATION SUMMARY: %s / %s keys configured. allValid = %s', setList.length, REQUIRED_SCRIPT_PROPERTY_KEYS.length, allValid);
  if (!allValid) {
    Logger.log('ACTION REQUIRED: Set the following missing keys in Project Settings -> Script Properties: %s', missingList.join(', '));
  }
  Logger.log('==================================================================');

  return {
    set: setList,
    missing: missingList,
    allValid: allValid
  };
}
