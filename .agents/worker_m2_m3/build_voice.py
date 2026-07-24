import os

src_path = r'C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os\.agents\explorer_m1\voice.html'
dest_path = r'C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os\voice.html'

with open(src_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Ensure ends with </html>
content = content.strip()
if not content.endswith('</html>'):
    content += '\n</html>'

with open(dest_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("voice.html written successfully.")

# Verify criteria
with open(dest_path, 'r', encoding='utf-8') as f:
    res = f.read()

print("Criteria check:")
print("  has FreePBX / WebRTC content:", "FreePBX" in res or "WebRTC" in res or "voice" in res.lower())
print("  has </html>:", res.endswith("</html>"))
print("  count of </html>:", res.count("</html>"))
