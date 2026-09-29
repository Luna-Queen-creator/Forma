#!/usr/bin/env python3
"""Build Forma from source/.

Usage:  python3 build.py

Produces two editions:
  docs/        the installable web app (what GitHub Pages serves). Includes an offline
               service worker whose version is a hash of the files, so every change
               becomes an update the app offers to install.
  Forma.html   one self-contained file you can open directly, no web address needed.

source/ also runs as-is (open source/index.html, or serve the folder locally).
"""
import hashlib
import json
import pathlib
import re
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / 'source'
WEB = ROOT / 'docs'
SINGLE = ROOT / 'Forma.html'

# Everything the web app needs; sw.js is generated separately.
WEB_FILES = ['index.html', 'style.css', 'manifest.webmanifest']
WEB_DIRS = ['js', 'icons']


def fail(msg):
    sys.exit('build: ' + msg)


def script_sources(html):
    return re.findall(r'<script defer src="([^"]+)"></script>', html)


def build_single():
    html = (SRC / 'index.html').read_text(encoding='utf-8')
    css = (SRC / 'style.css').read_text(encoding='utf-8')
    link = '<link rel="stylesheet" href="style.css">'
    if link not in html:
        fail('could not find the style.css <link> in index.html')
    html = html.replace(link, '<style>\n' + css + '\n</style>')
    # A single file cannot reference the manifest or icon files next to it.
    html = re.sub(r'\s*<link rel="(manifest|apple-touch-icon)"[^>]*>', '', html)

    # Inline scripts cannot be deferred, so they move to the end of <body> in the same order.
    pattern = re.compile(r'\s*<script defer src="([^"]+)"></script>')
    sources = pattern.findall(html)
    if not sources:
        fail('no <script defer src=...> tags found')
    html = pattern.sub('', html)
    blocks = []
    for src in sources:
        code = (SRC / src).read_text(encoding='utf-8')
        code = re.sub(r'</script', r'<\\/script', code, flags=re.I)
        blocks.append(f'<script>/* {src} */\n{code}\n</script>')
    if '</body>' not in html:
        fail('no </body> in index.html')
    html = html.replace('</body>', '\n'.join(blocks) + '\n</body>')
    SINGLE.write_text(html, encoding='utf-8')
    return len(sources)


def build_web():
    if WEB.exists():
        shutil.rmtree(WEB)
    WEB.mkdir()
    files = []
    for name in WEB_FILES:
        shutil.copy2(SRC / name, WEB / name)
        files.append(name)
    for folder in WEB_DIRS:
        shutil.copytree(SRC / folder, WEB / folder)
        files += sorted(str(p.relative_to(WEB)).replace('\\', '/') for p in (WEB / folder).rglob('*') if p.is_file())

    # Check that every script the page loads was copied.
    html = (SRC / 'index.html').read_text(encoding='utf-8')
    for src in script_sources(html):
        if src not in files:
            fail(f'{src} is referenced by index.html but missing')

    digest = hashlib.sha256()
    for name in files:
        digest.update(name.encode())
        digest.update((WEB / name).read_bytes())
    version = digest.hexdigest()[:12]

    sw = (SRC / 'sw.js').read_text(encoding='utf-8')
    sw = sw.replace("const VERSION = 'dev';", f"const VERSION = '{version}';", 1)
    sw = sw.replace('const PRECACHE = [];', 'const PRECACHE = ' + json.dumps(files) + ';', 1)
    if version not in sw or '"index.html"' not in sw:
        fail('could not stamp sw.js (VERSION / PRECACHE lines changed?)')
    (WEB / 'sw.js').write_text(sw, encoding='utf-8')

    (WEB / 'robots.txt').write_text('User-agent: *\nDisallow: /\n', encoding='utf-8')
    (WEB / '.nojekyll').write_text('', encoding='utf-8')   # serve files exactly as they are
    return version, len(files)


def main():
    n = build_single()
    version, count = build_web()
    print(f'build: Forma.html ({SINGLE.stat().st_size // 1024} KB, {n} scripts) and docs/ ({count} files, release {version})')


if __name__ == '__main__':
    main()
