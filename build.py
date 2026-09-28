#!/usr/bin/env python3
"""Bundle src/index.html and src/img/*.jpg into one self-contained index.html.

Edit the page in src/index.html (it works on its own when opened in a browser),
put product photos in src/img/, then run:  python3 build.py
"""
import base64, pathlib, re

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"

html = (SRC / "index.html").read_text(encoding="utf-8")
photos = {p.stem: "data:image/jpeg;base64," + base64.b64encode(p.read_bytes()).decode()
          for p in sorted((SRC / "img").glob("*.jpg"))}

def swap(old, new):
    global html
    if html.count(old) != 1:
        raise SystemExit(f"build.py: expected exactly one match for: {old[:60]}")
    html = html.replace(old, new)

swap('<img id="stPhoto" src="img/wt-u1.jpg"', '<img id="stPhoto" src=""')
swap('$("stPhoto").src = `img/wt-${b.toLowerCase()}${O?"-o2":""}${B?(O?"b":"-b"):""}.jpg`;',
     '$("stPhoto").src = PHOTOS[`wt-${b.toLowerCase()}${O?"-o2":""}${B?(O?"b":"-b"):""}`];')
swap('<img src="img/${ph[0]}.jpg"', '<img src="${PHOTOS[ph[0]]}"')
table = "  const PHOTOS = {\n" + ",\n".join(f'    "{k}":"{v}"' for k, v in photos.items()) + "\n  };\n"
swap("(function(){\n", "(function(){\n" + table)

missing = sorted(set(re.findall(r'img/([a-z0-9-]+)\.jpg', html)))
if missing:
    raise SystemExit(f"build.py: photos still referenced by path: {missing}")

(ROOT / "index.html").write_text(html, encoding="utf-8")
print(f"Wrote index.html ({len(html.encode()) // 1024} KB, {len(photos)} photos embedded)")
