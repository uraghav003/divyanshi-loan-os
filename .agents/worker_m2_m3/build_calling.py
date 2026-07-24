import os

src_path = r'C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os\.agents\explorer_m1\calling.html'
dest_path = r'C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os\calling.html'

with open(src_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Update .ai-metric-label CSS rule
old_css = '.ai-metric-label{font-size:9px;font-weight:700;color:var(--text-muted);margin-top:3px;text-transform:uppercase;letter-spacing:.5px}'
new_css = '.ai-metric-label{font-size: 11px; color: var(--muted); text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px;}'

if old_css in content:
    content = content.replace(old_css, new_css)
else:
    # replace any ai-metric-label CSS rule
    import re
    content = re.sub(r'\.ai-metric-label\s*\{[^}]*\}', new_css, content)

# Ensure ends with </html>
content = content.strip()
if not content.endswith('</html>'):
    content += '\n</html>'

with open(dest_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("calling.html written successfully.")

# Verify criteria
with open(dest_path, 'r', encoding='utf-8') as f:
    res = f.read()

print("Criteria check:")
print("  has .ai-metric-label CSS rule:", new_css in res or "font-size: 11px" in res)
print("  has </html>:", res.endswith("</html>"))
print("  count of </html>:", res.count("</html>"))
