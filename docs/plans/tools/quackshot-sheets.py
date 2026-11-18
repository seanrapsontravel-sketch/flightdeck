# Quackshot look-dev sheets, called by quackshot-lookdev.cjs: turnaround sheets per variant, the lineup, 1:1 close-ups,
# master-distance 1:1 crops, silhouette-vs-reference overlays, tin + target sheets and one contact sheet.
# usage: python3 quackshot-sheets.py <outDir with stills/> <reference dir>
import sys, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

OUT, REF = sys.argv[1], sys.argv[2]
S = os.path.join(OUT, 'stills')
V = ['A', 'B', 'C']
LABEL = {'A': 'A · Classic', 'B': 'B · Chubby', 'C': 'C · Vintage'}
VIEWS = ['front', 'side', '34', 'back', 'top']
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

# 1. turnaround sheet per variant: studio / blue hour / silhouette × front side 3/4 back top
for v in V:
    cells = [(im(f'duck-{v}-{l}-{vw}'), f'{l} · {vw}') for l in ['studio', 'blue', 'sil'] for vw in VIEWS]
    grid(cells, 5, 640, 360, f'Rubber duck {LABEL[v]} — turnaround').save(f'{OUT}/turnaround-{v}.jpg', quality=90)

# 2. lineup (same scale, side by side)
grid([(im('lineup-studio-side'), 'studio · side'), (im('lineup-studio-34'), 'studio · 3/4'), (im('lineup-sil-side'), 'silhouette · side')], 1, 1920, 1080,
     'The three variants at the same scale — A Classic · B Chubby · C Vintage').save(f'{OUT}/lineup.jpg', quality=90)

# 3. 1:1 close-ups (no scaling): the centre 960×1080 of the head shots, studio | blue hour
for v in V:
    a, b = im(f'duck-{v}-studio-head'), im(f'duck-{v}-blue-head')
    C = Image.new('RGB', (1920, 1080)); C.paste(a.crop((480, 0, 1440, 1080)), (0, 0)); C.paste(b.crop((480, 0, 1440, 1080)), (960, 0))
    label(C, f'{LABEL[v]} — head at 1:1 (studio | blue hour)'); C.save(f'{OUT}/closeup-1to1-{v}.png')

# 4. master distance at 1:1: a 0.25 m parade duck from 12 m (≈40 px), LOD1 and LOD2, plus a 4× nearest-neighbour blow-up
F = Image.new('RGB', (3 * 640, 2 * 360 + 60), (24, 24, 28)); label(F, 'Master distance (12 m) — top: 1:1 pixels · bottom: 4× blow-up of the same pixels (each variant: LOD1 left, LOD2 right)', (20, 12), SMALL)
for i, v in enumerate(V):
    for j, lod in enumerate(['far', 'farlod2']):
        a = im(f'duck-{v}-blue-{lod}')
        w, h = (320, 360) if j == 0 else (320, 360)
        cx, cy = 960, 540
        crop = a.crop((cx - 160, cy - 180, cx + 160, cy + 180))
        F.paste(crop, (i * 640 + j * 320, 60))
        small = a.crop((cx - 40, cy - 45, cx + 40, cy + 45)).resize((320, 360), Image.NEAREST)
        F.paste(small, (i * 640 + j * 320, 60 + 360))
    label(F, f'{LABEL[v]}', (i * 640 + 12, 70), SMALL)
F.save(f'{OUT}/master-distance-1to1.png')

# 5. silhouette vs reference: the bg photo's hanging duck (and the bowl photo), our side silhouette over it at 50%
def mask_sil(name):
    a = np.asarray(im(name).convert('L')) < 128
    return a
def bbox(m):
    ys, xs = np.nonzero(m); return xs.min(), ys.min(), xs.max(), ys.max()
# hand-measured reference boxes (beak tip x, head top y, tail tip x) in each photo's own pixels; the hanging duck is
# seen a little from below and the bowl duck's base is under water, so align on length and head top, not height
refs = [('bg photo (hanging duck)', 'bg-hanging-profile.png', False, (18, 55, 465)),
        ('photo (duck in bowl, flipped)', 'wm-duck-bowl.jpg', True, (779 - 518, 95, 779 - 135))]
for v in V:
    sil = mask_sil(f'duck-{v}-sil-side'); x0, y0, x1, y1 = bbox(sil); sil = sil[y0:y1 + 1, x0:x1 + 1]
    panels = []
    for t, f, flip, (bx0, by0, bx1) in refs:
        r = Image.open(os.path.join(REF, f)).convert('RGB')
        if flip: r = r.transpose(Image.FLIP_LEFT_RIGHT)
        W = 760; k = W / (bx1 - bx0)                     # reference length → 760 px
        rr = r.resize((int(r.width * k), int(r.height * k)), Image.LANCZOS)
        P = Image.new('RGB', (1000, 820), (24, 24, 28))
        P.paste(rr, (120 - int(bx0 * k), 90 - int(by0 * k)))
        sw = W; sh_h = int(sil.shape[0] * sw / sil.shape[1])
        sh = Image.fromarray((sil * 255).astype(np.uint8)).resize((sw, sh_h), Image.LANCZOS)
        tint = Image.new('RGB', sh.size, (20, 60, 255)); P.paste(tint, (120, 90), sh.point(lambda p: int(p * 0.5)))
        label(P, f'{LABEL[v]} (blue, 50%) over {t}', font=SMALL); label(P, 'aligned on beak→tail length and head top', (18, 44), SMALL); panels.append(P)
    O = Image.new('RGB', (2000, 820)); O.paste(panels[0], (0, 0)); O.paste(panels[1], (1000, 0)); O.save(f'{OUT}/overlay-{v}.jpg', quality=90)

# 6. silhouettes side by side with the references
sils = [(im(f'duck-{v}-sil-{vw}'), f'{LABEL[v]} · {vw}') for v in V for vw in ['side', '34', 'front']]
grid(sils, 3, 640, 360, 'Solid silhouettes — side, 3/4, front').save(f'{OUT}/silhouettes.jpg', quality=90)
refimgs = []
for f in ['bg-hanging-profile.png', 'bg-hanging-right.png', 'bg-counter-34.png', 'wm-duck-bowl.jpg', 'wm-yellow-duck-1.jpg', 'wm-duck-flickr.jpg']:
    r = Image.open(os.path.join(REF, f)).convert('RGB'); c = Image.new('RGB', (640, 480), (24, 24, 28)); r.thumbnail((640, 480)); c.paste(r, ((640 - r.width) // 2, (480 - r.height) // 2)); refimgs.append((c, f))
grid(refimgs, 3, 640, 480, 'Reference — the 2D page bg photo (crops) and real rubber ducks (Wikimedia Commons, free licences)').save(f'{OUT}/reference.jpg', quality=90)

# 7. tin duck + target concept
grid([(im('tin-studio-side'), 'studio · side'), (im('tin-studio-34'), 'studio · 3/4'), (im('tin-blue-side'), 'blue hour · side'), (im('tin-sil-side'), 'silhouette')], 2, 960, 540,
     'Tin prize ducks — enamel (left) and the golden duck (right), pressed tin with rolled edges on a hinge').save(f'{OUT}/tin.jpg', quality=90)
grid([(im('target-concept-A'), 'master, at rest (pilot flames)'), (im('target-bull-A'), 'bull + parade close-up'), (im('target-fire-A'), 'Ring of Fire roaring')], 1, 1920, 1080,
     'Target concept (rough) — water outer board, Ring of Fire on the treble, duck parade on the inner singles, tin ducks on the bull').save(f'{OUT}/target-concept.jpg', quality=88)

# 8. one contact sheet of the headline images
heads = [(im(f'duck-{v}-studio-34'), LABEL[v] + ' · studio 3/4') for v in V] + [(im(f'duck-{v}-blue-34'), LABEL[v] + ' · blue hour 3/4') for v in V] + \
        [(im(f'duck-{v}-sil-side'), LABEL[v] + ' · silhouette') for v in V] + [(im('tin-studio-34'), 'tin prize ducks'), (im('target-concept-A'), 'target concept'), (im('target-bull-A'), 'bull close-up')]
grid(heads, 3, 640, 360, 'Quackshot M0 — the ducks').save(f'{OUT}/contact.jpg', quality=90)
print('sheets written to', OUT)
