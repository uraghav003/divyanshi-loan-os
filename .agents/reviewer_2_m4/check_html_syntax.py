import os
import sys
import re
from html.parser import HTMLParser

sys.stdout.reconfigure(encoding='utf-8')

workspace_dir = r"C:\Users\aecr\My Drive\Antigravity\divyanshi-loan-os"
html_files = ["index.html", "smart_form.html", "calling.html", "voice.html"]

class CustomHTMLParser(HTMLParser):
    def __init__(self, filename):
        super().__init__()
        self.filename = filename
        self.tags = []
        self.ids = set()
        self.duplicate_ids = set()
        self.void_tags = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}
        self.errors = []

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        if 'id' in attrs_dict:
            elem_id = attrs_dict['id']
            if elem_id in self.ids:
                self.duplicate_ids.add(elem_id)
            else:
                self.ids.add(elem_id)
        if tag.lower() not in self.void_tags:
            self.tags.append((tag.lower(), self.getpos()))

    def handle_endtag(self, tag):
        tag_lower = tag.lower()
        if tag_lower in self.void_tags:
            return
        if not self.tags:
            self.errors.append(f"Unexpected end tag </{tag_lower}> at line {self.getpos()[0]}")
            return
        # Find matching start tag from top of stack
        for idx in range(len(self.tags)-1, -1, -1):
            if self.tags[idx][0] == tag_lower:
                # Close all intermediate unclosed tags if any
                unclosed = self.tags[idx+1:]
                self.tags = self.tags[:idx]
                break

print("=== DETAILED HTML SYNTAX & ID AUDIT ===")

for hf in html_files:
    path = os.path.join(workspace_dir, hf)
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    
    parser = CustomHTMLParser(hf)
    try:
        parser.feed(content)
    except Exception as e:
        print(f"Error parsing {hf}: {e}")
    
    print(f"\n--- {hf} ---")
    print(f"Total Unique IDs: {len(parser.ids)}")
    print(f"Duplicate IDs: {sorted(list(parser.duplicate_ids)) if parser.duplicate_ids else 'NONE'}")
    print(f"Unclosed non-void tags at EOF: {len(parser.tags)}")
    if parser.tags:
        print(f"  Unclosed tag samples: {parser.tags[-5:]}")
    print(f"Parser errors: {parser.errors if parser.errors else 'NONE'}")

