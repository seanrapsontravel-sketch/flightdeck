# Shanghai look-dev sheets, called by shanghai-lookdev.cjs: turnaround sheets per pagoda variant, the lineup, 1:1
# eave close-ups, master-distance 1:1 crops, silhouette-vs-photo overlays, gate / lantern / concept sheets and one
# contact sheet.
# usage: python3 shanghai-sheets.py <outDir with stills/> <reference dir>
import sys, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

OUT, REF = sys.argv[1], sys.argv[2]
S = os.path.join(OUT, 'stills')
V = ['A', 'B', 'C']
LABEL = {'A': 'A · Jiangnan sweep', 'B': 'B · Northern', 'C': 'C · Slender'}
VIEWS = ['front', 'corner', '34', 'low', 'top']
LIGHTS = ['studio', 'sunset', 'night', 'sil']
try:
    FONT = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 34)
    SMALL = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 24)
except OSError:
    FONT = SMALL = ImageFont.load_default()

def im(name): return Image.open(os.path.join(S, name + '.png')).convert('RGB')
def label(img, text, xy=(18, 12), font=None, fill=(255, 255, 255)):
    d = ImageDraw.Draw(img); f = font or FONT
    x, y = xy; d.text((x + 2, y + 2), text, font=f, fill=(0, 0, 0)); d.text((x, y), text, font=f, fill=fill)
    return img
def grid(cells, cols, w, h, title=None):
    rows = (len(cells) + cols - 1) // cols; top = 64 if title else 0
    G = Image.new('RGB', (cols * w, rows * h + top), (24, 24, 28))
    if title: label(G, title, (20, 14))
    for i, (img, t) in enumerate(cells):
        c = img.resize((w, h), Image.LANCZOS); label(c, t, font=SMALL); G.paste(c, ((i % cols) * w, top + (i // cols) * h))
    return G

# 1. turnaround per variant: studio / sunset (round 1) / night (round 8, 3 tiers lit) / silhouette × five views
for v in V:
    cells = [(im(f'pagoda-{v}-{l}-{vw}'), f'{l} · {vw}') for l in LIGHTS for vw in VIEWS]
    grid(cells, 5, 640, 360, f'Pagoda {LABEL[v]} — turnaround (night = round 3: tiers 1–3 lit)').save(f'{OUT}/turnaround-{v}.jpg', quality=90)

# 2. lineup
grid([(im('lineup-studio-front'), 'studio · front'), (im('lineup-sil-front'), 'silhouette · front'), (im('lineup-sunset-corner'), 'round 1 sunset · corner on'), (im('lineup-night-front'), 'night · 4 tiers lit')], 2, 960, 540,
     'The three variants at the same scale — A Jiangnan sweep · B Northern · C Slender').save(f'{OUT}/lineup.jpg', quality=90)

# 3. 1:1 close-ups (no scaling): the centre 960×1080 of the eave shots: studio | sunset, and night lit
for v in V:
    a, b, c = im(f'pagoda-{v}-studio-eave'), im(f'pagoda-{v}-sunset-eave'), im(f'pagoda-{v}-night-eave')
    C = Image.new('RGB', (2880, 1080))
    for i, x in enumerate([a, b, c]): C.paste(x.crop((480, 0, 1440, 1080)), (i * 960, 0))
    label(C, f'{LABEL[v]} — tier-5 corner at 1:1 (studio | round-1 sunset | night, lit)'); C.save(f'{OUT}/closeup-1to1-{v}.png')

# 4. master distance at 1:1: the tower from 110 m with a 36° lens (how it reads behind the gate), + 3× blow-up
F = Image.new('RGB', (3 * 640, 2 * 540 + 60), (24, 24, 28))
label(F, 'Master distance (110 m, 36° lens) — top: 1:1 pixels (round 1, 1 tier lit) · bottom: night, 5 tiers lit, 1:1', (20, 12), SMALL)
for i, v in enumerate(V):
    for j, l in enumerate(['sunset', 'night']):
        a = im(f'pagoda-{v}-{l}-far')
        F.paste(a.crop((960 - 320, 540 - 380, 960 + 320, 540 + 160)), (i * 640, 60 + j * 540))
    label(F, LABEL[v], (i * 640 + 12, 70), SMALL)
F.save(f'{OUT}/master-distance-1to1.png')

# 5. silhouette vs the bg photo: our low view (same kind of shot, from the courtyard looking up) as a 50% red overlay.
# Aligned on the finial tip and the top roof's span (hook tip to hook tip), measured in each image.
def mask_sil(img):
    return np.asarray(img.convert('L')) < 128
def erode(m, r=4):
    # drop thin things (the spire's chains, bell rods) so they don't count as roof width
    o = m.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            o &= np.roll(np.roll(m, dy, 0), dx, 1)
    return o
def tip_and_span(m):
    ys, xs = np.nonzero(m); top = ys.min()
    m = erode(m)
    widths = m.sum(axis=1); H = ys.max() - top
    # the top roof: first rows below the spire where the silhouette gets wide, then its widest row nearby
    row = next(y for y in range(top, top + H) if widths[y] > 0.45 * widths[top:top + H // 2].max())
    band = range(row, min(row + max(8, H // 25), m.shape[0]))
    best = max(band, key=lambda y: widths[y]); xs_r = np.nonzero(m[best])[0]
    return top, best, xs_r.min(), xs_r.max()
photo = Image.open(os.path.join(REF, 'bg-photo.jpg')).convert('RGB')  # 1920×2880
# hand-measured on the photo: finial tip y, top roof hook tips (x0, x1) at that roof's widest row
P_TIP, P_X0, P_X1 = 300, 452, 1470
for v in V:
    sil = im(f'pagoda-{v}-sil-low'); m = mask_sil(sil)
    top, row, x0, x1 = tip_and_span(m)
    k = (P_X1 - P_X0) / max(1, (x1 - x0))
    ov = np.zeros((m.shape[0], m.shape[1], 4), np.uint8); ov[m] = (230, 30, 30, 128)
    O = Image.fromarray(ov, 'RGBA').resize((int(m.shape[1] * k), int(m.shape[0] * k)), Image.NEAREST)
    base = photo.copy().convert('RGBA')
    base.alpha_composite(O, (int(P_X0 - x0 * k), int(P_TIP - top * k))) if (P_X0 - x0 * k) >= 0 and (P_TIP - top * k) >= 0 else base.paste(O, (int(P_X0 - x0 * k), int(P_TIP - top * k)), O)
    out = base.convert('RGB').resize((960, 1440), Image.LANCZOS)
    side = Image.new('RGB', (1920, 1440 + 64), (24, 24, 28))
    side.paste(photo.resize((960, 1440), Image.LANCZOS), (0, 64)); side.paste(out, (960, 64))
    label(side, f'{LABEL[v]} — bg photo | our silhouette at 50% (aligned on finial + top-roof span)', (20, 14))
    side.save(f'{OUT}/overlay-{v}.jpg', quality=90)

# 6. the gate, the lantern, the concept
grid([(im('gate-sunset-front'), 'round 1 sunset · live 20'), (im('gate-night-front'), 'round 8 night · live 8'), (im('gate-sunset-34'), 'sunset · 3/4'), (im('gate-studio-gong'), 'the gong · studio'),
      (im('gate-sunset-wedge'), 'live wedge · sunset'), (im('gate-night-wedge'), 'live wedge · night'), (im('gate-sunset-gong'), 'the gong · sunset'), (im('gate-studio-front'), 'studio')], 4, 640, 360,
     'The moon-gate board — exact beds, only the live number glows').save(f'{OUT}/gate.jpg', quality=90)
grid([(im('lantern-night-hero'), 'hero · night'), (im('lantern-sunset-hero'), 'hero · sunset'), (im('lantern-night-colours'), 'the six player colours'), (im('lantern-night-flock'), 'a flock (instanced)')], 2, 960, 540,
     'Sky lantern — one per point, in the thrower\'s colour').save(f'{OUT}/lantern.jpg', quality=90)
grid([(im('concept-round1'), 'round 1 — late sunset, tier 1 lit, live 1'), (im('concept-round4'), 'round 4'), (im('concept-round8'), 'round 8 — full night, every tier lit, live 8')], 1, 1920, 1080,
     'Courtyard concept (rough) — the sky clock across the game').save(f'{OUT}/concept.jpg', quality=88)
for r in [1, 8]: im(f'concept-round{r}').save(f'{OUT}/concept-round{r}.jpg', quality=92)

# 7. one contact sheet of the headline frames
heads = [('pagoda-A-sunset-34', 'A · sunset'), ('pagoda-B-sunset-34', 'B · sunset'), ('pagoda-C-sunset-34', 'C · sunset'),
         ('pagoda-A-sil-front', 'A · silhouette'), ('pagoda-B-sil-front', 'B · silhouette'), ('pagoda-C-sil-front', 'C · silhouette'),
         ('pagoda-A-low', None), ('pagoda-A-studio-eave', 'A · eave'), ('pagoda-A-night-front', 'A · night, round 3'),
         ('gate-sunset-front', 'gate · live 20'), ('gate-night-wedge', 'live wedge'), ('lantern-night-hero', 'sky lantern'),
         ('concept-round1', 'concept · round 1'), ('concept-round4', 'concept · round 4'), ('concept-round8', 'concept · round 8')]
cells = []
for n, t in heads:
    if n == 'pagoda-A-low': n, t = 'pagoda-A-sunset-low', 'A · the photo view'
    cells.append((im(n), t))
grid(cells, 3, 640, 360, 'Shanghai 3D — Milestone 0: the pagoda and the gate').save(f'{OUT}/contact.jpg', quality=88)
print('sheets written to', OUT)
