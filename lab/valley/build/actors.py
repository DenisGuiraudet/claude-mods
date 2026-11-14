# Packs the Ninja Adventure actors (CC0, Pixel-boy and AAA) used by the Valley into one small
# palette PNG each: 4 columns (down, up, left, right) x 5 rows (4 walk frames, then attack).
# Outlines are moved from near-black to the Kenney outline colour so both packs sit together.
# Usage: python3 -I actors.py <pack root> <out .js>
import sys, os, io, base64, json
from PIL import Image

ROOT, OUT = sys.argv[1], sys.argv[2]
ROLES = {
    'hero_opus': 'Character/NinjaMageBlack', 'hero_sonnet': 'Character/Knight',
    'hero_haiku': 'Character/Hunter', 'hero_fable': 'Character/Princess',
    'v1': 'Character/Villager', 'v2': 'Character/Villager2', 'v3': 'Character/Woman', 'v4': 'Character/OldWoman',
    'smith': 'Character/Caveman', 'carpenter': 'Character/Villager3', 'scribe': 'Character/OldMan',
    'courier': 'Character/Boy', 'banker': 'Character/Noble', 'farmer': 'Character/Villager4',
    'guard': 'Character/SamuraiBlue', 'adv': 'Character/NinjaBlue',
    'merchant': 'Character/Inspector', 'bard': 'Character/Monk', 'fisher': 'Character/OldMan3',
    'ghost': 'Monster/Spirit/SpriteSheet.png', 'slime': 'Monster/Slime/Slime.png',
    'goblin': 'Monster/Bamboo/SpriteSheet.png', 'ogre': 'Monster/Beast/Beast.png',
}
OUTLINE = (0x3f, 0x26, 0x31, 255)

def load(path):
    p = os.path.join(ROOT, 'Actor', path)
    if p.endswith('.png'):
        walk = Image.open(p).convert('RGBA').crop((0, 0, 64, 64))
        attack = walk.crop((0, 16, 64, 32))  # monsters have no attack row: reuse walk frame 1
    elif os.path.exists(os.path.join(p, 'SeparateAnim', 'Walk.png')):
        walk = Image.open(os.path.join(p, 'SeparateAnim', 'Walk.png')).convert('RGBA')
        attack = Image.open(os.path.join(p, 'SeparateAnim', 'Attack.png')).convert('RGBA')
    else:  # full sheet: rows 0-3 walk, row 4 attack
        sheet = Image.open(os.path.join(p, 'SpriteSheet.png')).convert('RGBA')
        walk, attack = sheet.crop((0, 0, 64, 64)), sheet.crop((0, 64, 64, 80))
    im = Image.new('RGBA', (64, 80), (0, 0, 0, 0))
    im.paste(walk, (0, 0)); im.paste(attack, (0, 64))
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a and r + g + b < 110 and max(r, g, b) < 50:
                px[x, y] = OUTLINE
    return im

def palette_png(im):
    cols = [c for _, c in im.getcolors(4096)]
    idx = {c: i for i, c in enumerate(cols)}
    p = Image.new('P', im.size)
    p.putdata([idx[c] for c in im.getdata()])
    flat = []
    for r, g, b, a in cols: flat += [r, g, b]
    p.putpalette(flat)
    buf = io.BytesIO()
    p.save(buf, 'PNG', optimize=True, transparency=bytes(a for *_, a in cols))
    return buf.getvalue()

out, total = {}, 0
for role, path in ROLES.items():
    data = palette_png(load(path))
    total += len(data)
    out[role] = 'data:image/png;base64,' + base64.b64encode(data).decode()
with open(OUT, 'w') as f:
    f.write('// Walk cycles from Ninja Adventure (Pixel-boy and AAA, CC0), packed by build/actors.py.\n')
    f.write('// Each: 64x80, columns down/up/left/right, rows 4 walk frames then attack.\n')
    f.write('const ACTORS=' + json.dumps(out) + ';\n')
print(len(out), 'actors,', total, 'bytes png, avg', total // len(out))
