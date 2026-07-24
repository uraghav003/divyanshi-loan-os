import os

src_path = r'C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os\.agents\explorer_m1\smart_form.html'
dest_path = r'C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os\smart_form.html'

with open(src_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update <select id="entry_type"> to <select id="entry_type" name="entry_type">
content = content.replace(
    '<select id="entry_type" onchange="toggleFields()">',
    '<select id="entry_type" name="entry_type" onchange="toggleFields()">'
)

# 2. Add <form id="smartIntakeForm" onsubmit="return false;"> around form-card
old_start = '<div class="form-card one-page-mode" id="formCard">'
new_start = '<form id="smartIntakeForm" onsubmit="return false;">\n  <div class="form-card one-page-mode" id="formCard">'
content = content.replace(old_start, new_start)

# 3. Add closing </form> tag before <script>
if '</form>' not in content:
    content = content.replace('<script>\nconst $ = id =>', '</form>\n\n<script>\nconst $ = id =>')

# 4. Ensure ends with </html>
content = content.strip()
if not content.endswith('</html>'):
    content += '\n</html>'

with open(dest_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("smart_form.html written successfully.")

# Verify criteria
with open(dest_path, 'r', encoding='utf-8') as f:
    res = f.read()

print("Criteria check:")
print("  has </form>:", "</form>" in res)
print("  has </html>:", res.endswith("</html>"))
print("  has select name='entry_type':", "name=\"entry_type\"" in res or 'name="entry_type"' in res)
options = res.count("<option value=")
print(f"  option count: {options}")
