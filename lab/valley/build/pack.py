# Downsamples the 3x render to 1x (one sample per 3x3 block) and writes exact palette PNGs.
import sys
from PIL import Image
out = sys.argv[1]
def palette_png(img, dst):
    img = img.convert('RGBA')
    cols = img.getcolors(maxcolors=1 << 16)
    if cols is None or len(cols) > 256:
        q = img.quantize(colors=256, method=Image.Quantize.FASTOCTREE)
        q.save(dst, optimize=True); return len(cols or []), 'quantized'
    pal = [c for _, c in cols]
    idx = {c: i for i, c in enumerate(pal)}
    p = Image.new('P', img.size)
    p.putdata([idx[c] for c in img.getdata()])
    flat = []
    for r, g, b, a in pal: flat += [r, g, b]
    p.putpalette(flat)
    alpha = bytes(a for _, _, _, a in pal)
    if any(a < 255 for a in alpha): p.info['transparency'] = alpha
    p.save(dst, optimize=True, transparency=alpha if any(a < 255 for a in alpha) else None) if any(a < 255 for a in alpha) else p.save(dst, optimize=True)
    return len(pal), 'exact'
big = Image.open(f'{out}/static3x.png').convert('RGBA')
small = big.resize((big.width // 3, big.height // 3), Image.NEAREST)
print('static', small.size, *palette_png(small, f'{out}/static.png'))
print('atlas', *palette_png(Image.open(f'{out}/atlas-raw.png'), f'{out}/atlas.png'))
