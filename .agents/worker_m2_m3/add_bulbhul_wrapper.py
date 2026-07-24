import os

gs_path = r'C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os\Code.gs'

with open(gs_path, 'r', encoding='utf-8') as f:
    content = f.read()

wrapper = """
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
"""

if 'function BULBHUL_CHAT_API(' not in content:
    content = content + wrapper

with open(gs_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Added BULBHUL_CHAT_API wrapper to Code.gs")
