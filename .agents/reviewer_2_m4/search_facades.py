import os
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

workspace_dir = r"C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os"
gs_path = os.path.join(workspace_dir, "Code.gs")

with open(gs_path, "r", encoding="utf-8") as f:
    code_gs = f.read()

rpc_funcs = [
    'P1_SMART_FORM_SUBMIT',
    'P1_VERIFY_ACCESS',
    'P1_GET_CALLING_QUEUE',
    'P1_CALLING_START',
    'P1_CALLING_AI_REMARK',
    'P1_MINI_CRM_UPLOAD',
    'P1_UPDATE_CALLING_CASE',
    'P1_CALLING_UPDATE',
    'P1_SAVE_CALC_LEAD',
    'P1_VOICE_CALL',
    'P1_PROCESS_VOICE_COMMAND',
    'MLA_UPDATE_MINI_STATUS',
    'DC_TG_BROADCAST',
    'BULBHUL_CHAT_API'
]

print("=== SEARCHING ALL OCCURRENCES OF RPC FUNCTIONS IN Code.gs ===")
for rpc in rpc_funcs:
    matches = [m.start() for m in re.finditer(re.escape(rpc), code_gs)]
    lines = [code_gs[:m].count('\n') + 1 for m in matches]
    print(f"\n{rpc} found at lines: {lines}")

