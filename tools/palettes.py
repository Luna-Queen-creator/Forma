"""Theme palettes for Forma. Generates CSS and checks contrast.
Each palette lists the same tokens for light and dark mode."""
import re, sys

COMMON_LIGHT = {'surface': '#ffffff', 'hero-item': 'rgba(255, 255, 255, .07)'}
COMMON_DARK = {'hero-item': 'rgba(255, 255, 255, .06)', 'backdrop': 'rgba(0, 0, 0, .6)'}

P = {
 'rose': {
  'light': {'bg':'#faf4f6','surface-2':'#f8eef2','surface-3':'#f1e1e8','ink':'#431a2e','ink-strong':'#2f0f1f','muted':'#79586a',
    'line':'#eedde4','line-strong':'#dfc4cf','accent':'#8a1d4e','accent-ink':'#ffffff','lime':'#ffc9de','lime-ink':'#4d0f2c',
    'focus':'#b2386f','hero-bg':'#6d1740','hero-ink':'#ffffff','hero-muted':'#f2c6d8','hero-line':'#924067','hero-accent':'#ffc9de',
    'hero-btn-bg':'#ffc9de','hero-btn-ink':'#4d0f2c','note-bg':'#f9edf2','note-ink':'#6e4a5b','bm-primary':'#b2386f','bm-secondary':'#f7a8c8',
    'bm-base':'#f3e8ec','bm-stroke':'#d8b9c6','bm-muscle':'#ead2dc','grid':'#f2e7ec','mark-bg':'#6d1740','mark-ink':'#ffc9de',
    'brand-dot':'#e46ea3','toast-bg':'#6d1740','backdrop':'rgba(60, 15, 35, .45)'},
  'dark': {'bg':'#170d12','surface':'#22141b','surface-2':'#2b1a23','surface-3':'#36222d','ink':'#f3e3ea','ink-strong':'#fff4f8','muted':'#bf9fae',
    'line':'#3d2733','line-strong':'#523443','accent':'#ffb3d1','accent-ink':'#3d0c24','lime':'#ffb3d1','lime-ink':'#3d0c24',
    'focus':'#f58db9','hero-bg':'#43172d','hero-ink':'#fff4f8','hero-muted':'#e2b6c9','hero-line':'#63304a','hero-accent':'#ffb3d1',
    'hero-btn-bg':'#ffb3d1','hero-btn-ink':'#3d0c24','note-bg':'#2b1a23','note-ink':'#d9bfcb','bm-primary':'#f58db9','bm-secondary':'#ffd0e2',
    'bm-base':'#33212a','bm-stroke':'#573a48','bm-muscle':'#45303b','grid':'#2e1d26','mark-bg':'#6d1740','mark-ink':'#ffc9de',
    'brand-dot':'#e46ea3','toast-bg':'#5a2340'}},
 'lavender': {
  'light': {'bg':'#f6f4fa','surface-2':'#f1eef8','surface-3':'#e7e2f3','ink':'#2c2148','ink-strong':'#1d1435','muted':'#655c7d',
    'line':'#e2dcef','line-strong':'#cdc4e2','accent':'#45318c','accent-ink':'#ffffff','lime':'#dccfff','lime-ink':'#2a1b5c',
    'focus':'#6a52c2','hero-bg':'#35266e','hero-ink':'#ffffff','hero-muted':'#d3cbf0','hero-line':'#5b4b96','hero-accent':'#dccfff',
    'hero-btn-bg':'#dccfff','hero-btn-ink':'#2a1b5c','note-bg':'#f0edf8','note-ink':'#5a5175','bm-primary':'#6a52c2','bm-secondary':'#b9a8f2',
    'bm-base':'#ece8f5','bm-stroke':'#c4bada','bm-muscle':'#ddd6ee','grid':'#ece8f4','mark-bg':'#35266e','mark-ink':'#dccfff',
    'brand-dot':'#9b84e8','toast-bg':'#35266e','backdrop':'rgba(30, 20, 60, .45)'},
  'dark': {'bg':'#110e19','surface':'#1b1726','surface-2':'#231e31','surface-3':'#2d273d','ink':'#e9e4f6','ink-strong':'#f7f4ff','muted':'#a9a0c2',
    'line':'#302945','line-strong':'#42395b','accent':'#cbbaff','accent-ink':'#1f1446','lime':'#cbbaff','lime-ink':'#1f1446',
    'focus':'#a68ff0','hero-bg':'#2a2150','hero-ink':'#f7f4ff','hero-muted':'#c4bbe3','hero-line':'#463a77','hero-accent':'#cbbaff',
    'hero-btn-bg':'#cbbaff','hero-btn-ink':'#1f1446','note-bg':'#231e31','note-ink':'#c6bfdc','bm-primary':'#a68ff0','bm-secondary':'#ddd2ff',
    'bm-base':'#2a2438','bm-stroke':'#4a4063','bm-muscle':'#3a3250','grid':'#262036','mark-bg':'#35266e','mark-ink':'#dccfff',
    'brand-dot':'#9b84e8','toast-bg':'#3b2f73'}},
 'ocean': {
  'light': {'bg':'#f3f6f9','surface-2':'#edf2f7','surface-3':'#e1e9f1','ink':'#14324a','ink-strong':'#0b2236','muted':'#566a7b',
    'line':'#dae3ec','line-strong':'#c1cfdc','accent':'#0f4c75','accent-ink':'#ffffff','lime':'#a9e8ff','lime-ink':'#083049',
    'focus':'#1f78a8','hero-bg':'#0e3a5a','hero-ink':'#ffffff','hero-muted':'#c2d8e8','hero-line':'#34617f','hero-accent':'#a9e8ff',
    'hero-btn-bg':'#a9e8ff','hero-btn-ink':'#083049','note-bg':'#ecf2f7','note-ink':'#4a6275','bm-primary':'#1f78a8','bm-secondary':'#8fd3f0',
    'bm-base':'#e6edf3','bm-stroke':'#b3c6d6','bm-muscle':'#cfdce7','grid':'#e6edf3','mark-bg':'#0e3a5a','mark-ink':'#a9e8ff',
    'brand-dot':'#3fa7d6','toast-bg':'#0e3a5a','backdrop':'rgba(10, 30, 50, .45)'},
  'dark': {'bg':'#0c131a','surface':'#141e28','surface-2':'#1a2733','surface-3':'#22313f','ink':'#e1ebf3','ink-strong':'#f4f9fc','muted':'#9cb1c3',
    'line':'#24323f','line-strong':'#344656','accent':'#9fe0fb','accent-ink':'#082436','lime':'#9fe0fb','lime-ink':'#082436',
    'focus':'#6cc4ec','hero-bg':'#12324b','hero-ink':'#f4f9fc','hero-muted':'#b3cbdc','hero-line':'#2a4d68','hero-accent':'#9fe0fb',
    'hero-btn-bg':'#9fe0fb','hero-btn-ink':'#082436','note-bg':'#1a2733','note-ink':'#b9cad8','bm-primary':'#6cc4ec','bm-secondary':'#c4eeff',
    'bm-base':'#1e2b37','bm-stroke':'#3a4f62','bm-muscle':'#2c3d4c','grid':'#1c2934','mark-bg':'#0e3a5a','mark-ink':'#a9e8ff',
    'brand-dot':'#3fa7d6','toast-bg':'#1d4766'}},
 'kitty': {
  'light': {'bg':'#fff5f9','surface-2':'#fff0f6','surface-3':'#ffe3ef','ink':'#5c2342','ink-strong':'#471632','muted':'#8e5874',
    'line':'#fbdce9','line-strong':'#f4c3d8','accent':'#c2356f','accent-ink':'#ffffff','lime':'#ffd3e5','lime-ink':'#6a1c45',
    'focus':'#c93b78','hero-bg':'#ffd6e7','hero-ink':'#4f1a37','hero-muted':'#7a3d5e','hero-line':'#f2a7c8','hero-accent':'#b02f66',
    'hero-btn-bg':'#c2356f','hero-btn-ink':'#ffffff','hero-item':'rgba(255, 255, 255, .6)','note-bg':'#fff0f6','note-ink':'#7f4864',
    'bm-primary':'#e0558f','bm-secondary':'#ffb5d2','bm-base':'#fff0f6','bm-stroke':'#f2c3d7','bm-muscle':'#fbdbe8','grid':'#fde9f1',
    'mark-bg':'#ff8fbd','mark-ink':'#ffffff','brand-dot':'#ff8fbd','toast-bg':'#c2356f','backdrop':'rgba(92, 35, 66, .35)'},
  'dark': {'bg':'#1c1117','surface':'#271820','surface-2':'#301e28','surface-3':'#3b2532','ink':'#ffe6f0','ink-strong':'#fff5f9','muted':'#c9a2b5',
    'line':'#43283a','line-strong':'#583448','accent':'#ff9cc6','accent-ink':'#3d0d25','lime':'#ff9cc6','lime-ink':'#3d0d25',
    'focus':'#ff8cbc','hero-bg':'#4a1d35','hero-ink':'#ffe6f0','hero-muted':'#e0b0c6','hero-line':'#6e3352','hero-accent':'#ff9cc6',
    'hero-btn-bg':'#ff9cc6','hero-btn-ink':'#3d0d25','note-bg':'#301e28','note-ink':'#dfc0ce','bm-primary':'#ff8cbc','bm-secondary':'#ffd0e3',
    'bm-base':'#33212b','bm-stroke':'#5b3a4c','bm-muscle':'#47303c','grid':'#2e1c26','mark-bg':'#ff8fbd','mark-ink':'#ffffff',
    'brand-dot':'#ff8fbd','toast-bg':'#8a2c58'}},
}

# Strength is Forma's "brand" category, so its tint follows the palette. Where that would clash
# with another category's colour, that category borrows Forest's green instead.
GREEN = {'light': ('#e8efda', '#5f8a2d'), 'dark': ('#25301d', '#7fae45')}
CATS = {
 'rose':     {'strength': {'light': ('#f6dfe9', '#c2457e'), 'dark': ('#3a1d2b', '#e46ea3')}},
 'kitty':    {'strength': {'light': ('#ffe0ec', '#e0558f'), 'dark': ('#3d1f2f', '#ff8fbd')}},
 'lavender': {'strength': {'light': ('#e6e0f7', '#6a52c2'), 'dark': ('#2a2342', '#9b84e8')}, 'yoga': GREEN},
 'ocean':    {'strength': {'light': ('#dbeaf5', '#1f78a8'), 'dark': ('#182b3b', '#3fa7d6')}, 'mobility': GREEN},
}
for _name, _cats in CATS.items():
    for _cat, _modes in _cats.items():
        for _mode in ('light', 'dark'):
            P[_name][_mode][f'cat-{_cat}'], P[_name][_mode][f'dot-{_cat}'] = _modes[_mode]

def lum(h):
    h = h.lstrip('#'); r, g, b = (int(h[i:i+2], 16) / 255 for i in (0, 2, 4))
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
def contrast(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True); return (la + 0.05) / (lb + 0.05)

PAIRS = [('ink','bg',4.5),('ink','surface',4.5),('muted','surface',4.5),('muted','bg',4.5),('accent-ink','accent',4.5),('lime-ink','lime',4.5),
         ('hero-ink','hero-bg',4.5),('hero-muted','hero-bg',4.5),('hero-accent','hero-bg',3.0),('hero-btn-ink','hero-btn-bg',4.5),
         ('note-ink','note-bg',4.5),('focus','surface',3.0),('ink','surface-2',4.5),('accent','surface',3.0)]

def check():
    ok = True
    for name, modes in P.items():
        for mode, t in modes.items():
            full = {**(COMMON_LIGHT if mode == 'light' else COMMON_DARK), **t}
            for a, b, need in PAIRS:
                c = contrast(full[a], full[b])
                if c < need: ok = False; print(f'FAIL {name}/{mode}: {a} on {b} = {c:.2f} (need {need})')
            c = contrast('#ffffff', full['toast-bg'])
            if c < 4.5: ok = False; print(f'FAIL {name}/{mode}: toast text = {c:.2f}')
    return ok

def css():
    out = ['/* ---------------------------------------------------- colour themes --- */',
           '/* Generated by build/palettes.py (contrast-checked). Forest is the default above. */']
    block = lambda sel, t: sel + ' {\n  ' + ' '.join(f'--{k}: {v};' for k, v in t.items()) + '\n}'
    for name, modes in P.items():
        light = {**COMMON_LIGHT, **modes['light']}
        dark = {**COMMON_DARK, **modes['dark']}
        missing = set(light) ^ set(dark)
        if missing: sys.exit(f'{name}: light/dark token mismatch {missing}')
        out.append(block(f':root[data-palette="{name}"]', light))
        out.append('@media (prefers-color-scheme: dark) {\n' + block(f':root[data-palette="{name}"]:not([data-theme="light"])', dark) + '\n}')
        out.append(block(f':root[data-palette="{name}"][data-theme="dark"]', dark))
    return '\n'.join(out) + '\n'

START = '/* ---------------------------------------------------- colour themes --- */'
END = '/* ------------------------------------------------------- colour picker --- */'

if __name__ == '__main__':
    # Usage: python3 tools/palettes.py            check contrast only
    #        python3 tools/palettes.py --write    also replace the themes block in source/style.css
    good = check()
    print('contrast ok' if good else 'contrast problems above')
    if '--write' in sys.argv:
        from pathlib import Path
        path = Path(__file__).resolve().parent.parent / 'source' / 'style.css'
        text = path.read_text()
        a, b = text.index(START), text.index(END)
        path.write_text(text[:a] + css() + '\n' + text[b:])
        print('updated', path)
