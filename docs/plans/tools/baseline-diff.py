# usage: python3 baseline-diff.py <dirA> <dirB>
# Pixel comparison of two baseline.cjs runs: for each PNG in A, the share of pixels that differ in B and the max delta.
import sys, os
from PIL import Image, ImageChops

a, b = sys.argv[1], sys.argv[2]
bad = 0
for f in sorted(os.listdir(a)):
    if not f.endswith('.png'):
        continue
    pb = os.path.join(b, f)
    if not os.path.exists(pb):
        print(f'{f}: missing in B'); bad += 1; continue
    A = Image.open(os.path.join(a, f)).convert('RGB'); B = Image.open(pb).convert('RGB')
    d = ImageChops.difference(A, B)
    px = sum(1 for p in (d.get_flattened_data() if hasattr(d,'get_flattened_data') else d.getdata()) if p != (0, 0, 0))
    share = px / (A.width * A.height)
    mx = max(max(c) for c in d.getextrema())
    print(f'{f}: {"IDENTICAL" if px == 0 else f"{share*100:.3f}% differ, max delta {mx}"}')
    bad += px > 0
sys.exit(1 if bad else 0)
