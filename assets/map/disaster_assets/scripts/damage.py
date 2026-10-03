"""Damaged versions of every house sprite.
Coastal + Riverside houses get FLOOD damage, Hillysides houses get LANDSLIP damage, each at two levels:
  level 1 = damaged (one hit), level 2 = badly damaged (stacked hits, close to destroyed).
Inspired by storm-surge, minor-flood and landslide photos: tide/water lines on walls, silt and gravel washed over
the lawn, driftwood and broken planks, smashed windows, missing roofing, mud tongues, slip scars, fallen trees.
Clipped effects (stains, cracks, holes) are painted with numpy using the zone masks; loose debris is SVG.
Output: sprites/<id>_dmg1.png, sprites/<id>_dmg2.png (same size and zones as the clean sprite)."""
import json, math, zlib
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from playwright.sync_api import sync_playwright

D = json.load(open("/home/claude/map/houses.json"))
INK = "#4F463D"
W, H = 1200, 900          # sprite pixels; geometry below is in 600x450 sprite units (x2)
rng = np.random.default_rng(7)

GEOM = {
    "coastal_villa":           dict(kind="flood", coast=True,  floor=328, top=214, ground=352, x0=117, x1=470),
    "coastal_villa_lux":       dict(kind="flood", coast=True,  floor=328, top=214, ground=352, x0=72,  x1=526),
    "riverside_bungalow":      dict(kind="flood", coast=False, floor=330, top=236, ground=352, x0=123, x1=475),
    "riverside_bungalow_lux":  dict(kind="flood", coast=False, floor=330, top=236, ground=352, x0=88,  x1=528),
    "riverside_townhouse":     dict(kind="flood", coast=False, floor=334, top=150, ground=352, x0=198, x1=450),
    "riverside_townhouse_lux": dict(kind="flood", coast=False, floor=334, top=150, ground=352, x0=168, x1=430),
    "hillysides_house":        dict(kind="slip", profile=[(24, 230), (120, 244), (210, 272), (320, 312), (420, 344), (576, 360)],
                                    hx0=196, hx1=420, floor=262, top=172),
    "hillysides_house_lux":    dict(kind="slip", profile=[(24, 196), (90, 204), (150, 226), (214, 262), (236, 280), (236, 362), (576, 368)],
                                    hx0=236, hx1=472, floor=360, top=270),
}

def zones(hid):
    m = np.array(Image.open(f"/home/claude/map/sprites/{hid}_zones.png").convert("RGBA")).astype(int)
    a = m[..., 3] > 200
    z = {k: (np.abs(m[..., :3] - v["maskColor"]).max(2) < 30) & a for k, v in D["zones"].items()}
    z["none"] = (m[..., :3].max(2) < 30) & a
    return z

def surface(profile, x):
    for (xa, ya), (xb, yb) in zip(profile, profile[1:]):
        if xa <= x <= xb and xb > xa:
            return ya + (yb - ya) * (x - xa) / (xb - xa)
    return profile[-1][1] if x > profile[-1][0] else profile[0][1]

def blend(img, mask, color, alpha):
    a = (mask.astype(np.float32) * alpha)[..., None]
    img[..., :3] = img[..., :3] * (1 - a) + np.array(color, np.float32) * a
    return img

def noise(sigma, seed):
    r = np.random.default_rng(seed)
    from scipy import ndimage
    n = ndimage.gaussian_filter(r.random((H, W)).astype(np.float32), sigma)
    return (n - n.mean()) / n.std()

def lines_layer(draw_fn):
    """Draw jagged lines at 2x then downsample for anti-aliasing; returns float alpha mask + rgb layer."""
    big = Image.new("RGBA", (W * 2, H * 2), (0, 0, 0, 0))
    draw_fn(ImageDraw.Draw(big))
    small = big.resize((W, H), Image.LANCZOS)
    return np.array(small).astype(np.float32) / 255

def composite_layer(img, layer, clip):
    a = layer[..., 3:] * clip[..., None]
    img[..., :3] = img[..., :3] * (1 - a) + layer[..., :3] * a
    return img

def crack_path(x, y, length, ang, rr, segs=6):
    pts = [(x, y)]
    for i in range(segs):
        ang += rr.uniform(-0.7, 0.7)
        step = length / segs
        x += math.cos(ang) * step; y += math.sin(ang) * step
        pts.append((x, y))
    return pts

# ---------------------------------------------------------------- SVG debris pieces (600x450 units)
def stone(x, y, r, col):
    return f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="{r:.1f}" ry="{r * 0.72:.1f}" fill="{col}" stroke="{INK}" stroke-width="1.6"/>'
def gravel(x0, x1, y0, y1, n, rr, palette=("#B7B2A8", "#9C978E", "#C9C2B5", "#8A857C", "#D4CDBF")):
    return "".join(stone(rr.uniform(x0, x1), rr.uniform(y0, y1), rr.uniform(2.2, 5.5), palette[rr.integers(len(palette))]) for _ in range(n))
def log(x, y, length, ang, r=5, col="#B08A62"):
    return (f'<g transform="rotate({ang} {x} {y})"><rect x="{x - length / 2}" y="{y - r}" width="{length}" height="{2 * r}" rx="{r}" '
            f'fill="{col}" stroke="{INK}" stroke-width="2.2"/><ellipse cx="{x + length / 2 - r * 0.6}" cy="{y}" rx="{r * 0.55}" ry="{r * 0.85}" '
            f'fill="#D8BC94" stroke="{INK}" stroke-width="1.6"/><line x1="{x - length / 3}" y1="{y - 1}" x2="{x + length / 4}" y2="{y - 1}" stroke="#8C6A48" stroke-width="1.5"/></g>')
def plank(x, y, length, ang, col="#C9A27A", w=7):
    j = length / 2
    return (f'<g transform="rotate({ang} {x} {y})"><polygon points="{x - j},{y - w / 2} {x + j - 6},{y - w / 2} {x + j},{y - 1} {x + j - 4},{y + 1} '
            f'{x + j - 2},{y + w / 2} {x - j},{y + w / 2}" fill="{col}" stroke="{INK}" stroke-width="2"/>'
            f'<line x1="{x - j + 4}" y1="{y}" x2="{x + j - 10}" y2="{y}" stroke="#A8825A" stroke-width="1.2"/></g>')
def puddle(x, y, rx, col="#8FB7C7"):
    return (f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{rx * 0.22}" fill="{col}" stroke="{INK}" stroke-width="1.6" opacity="0.95"/>'
            f'<ellipse cx="{x - rx * 0.3}" cy="{y - rx * 0.05}" rx="{rx * 0.25}" ry="{rx * 0.05}" fill="#FFFFFF" opacity="0.7"/>')
def seaweed(x, y, rr):
    s = ""
    for k in range(3):
        dx = rr.uniform(-8, 8)
        s += f'<path d="M{x + dx} {y} q4 -6 0 -10 q-4 -5 1 -10" fill="none" stroke="#6E7A3A" stroke-width="2.6" stroke-linecap="round"/>'
    return s
def picket(x, y, ang, col="#FFFFFF"):
    return (f'<g transform="rotate({ang} {x} {y})"><polygon points="{x},{y} {x + 26},{y} {x + 32},{y + 4.5} {x + 26},{y + 9} {x},{y + 9}" '
            f'fill="{col}" stroke="{INK}" stroke-width="1.8"/></g>')
def roof_sheet(x, y, ang, col):
    return (f'<g transform="rotate({ang} {x} {y})"><rect x="{x}" y="{y}" width="34" height="14" fill="{col}" stroke="{INK}" stroke-width="1.8"/>'
            + "".join(f'<line x1="{x + i}" y1="{y + 1}" x2="{x + i}" y2="{y + 13}" stroke="#00000033" stroke-width="1.2"/>' for i in range(5, 34, 6)) + "</g>")
def fallen_tree(x0, y0, x1, y1, crown_r=30):
    ang = math.degrees(math.atan2(y1 - y0, x1 - x0))
    L = math.hypot(x1 - x0, y1 - y0)
    s = f'<g transform="rotate({ang} {x0} {y0})">'
    s += f'<rect x="{x0}" y="{y0 - 5}" width="{L}" height="10" rx="4" fill="#8C6440" stroke="{INK}" stroke-width="2.2"/>'
    s += "".join(f'<line x1="{x0 + 2}" y1="{y0}" x2="{x0 - 10 + 6 * math.cos(a)}" y2="{y0 + 12 * math.sin(a)}" stroke="#7A5638" stroke-width="2.5" stroke-linecap="round"/>' for a in (-1.2, -0.4, 0.4, 1.2))
    for dx, dy, r in ((L, 0, crown_r), (L - 22, -14, crown_r * 0.75), (L - 20, 14, crown_r * 0.7)):
        s += f'<circle cx="{x0 + dx}" cy="{y0 + dy}" r="{r}" fill="#4FAE52" stroke="{INK}" stroke-width="2.4"/>'
    s += '</g>'
    return s

def debris_svg(hid, g, level):
    rr = np.random.default_rng(zlib.crc32(f'{hid}{level}'.encode()))
    s = ""
    if g["kind"] == "flood":
        gy = g["ground"]
        # silt line + puddles on the lawn, gravel washed up (more at level 2)
        for i in range(2 + level * 2):
            s += puddle(rr.uniform(60, 540), rr.uniform(gy + 14, gy + 36), rr.uniform(16, 30 + 8 * level))
        palette = ("#B7B2A8", "#9C978E", "#C9C2B5", "#8A857C", "#D4CDBF") if g["coast"] else ("#9A7F5E", "#7E6648", "#B39A74", "#6E5A40")
        s += gravel(40, 560, gy + 4, gy + 42, 70 if level == 1 else 150, rr, palette)
        s += log(rr.uniform(120, 220), gy + 30, 70, rr.uniform(-12, 12), 5.5, "#B08A62" if g["coast"] else "#8C6A48")
        if g["coast"]:
            for _ in range(3 + level * 2):
                s += seaweed(rr.uniform(60, 540), rr.uniform(gy + 22, gy + 42), rr)
        if level == 2:
            s += log(rr.uniform(380, 500), gy + 36, 90, rr.uniform(-10, 10), 6.5)
            for _ in range(5):                                   # broken deck / fence boards
                s += plank(rr.uniform(70, 530), rr.uniform(gy + 12, gy + 40), rr.uniform(40, 70), rr.uniform(-35, 35))
            for _ in range(4):
                s += picket(rr.uniform(40, 540), rr.uniform(gy + 18, gy + 38), rr.uniform(-60, 60))
            roof_col = {"coastal_villa": "#8E98AB", "coastal_villa_lux": "#5D6474", "riverside_bungalow": "#A65B42",
                        "riverside_bungalow_lux": "#454B57"}.get(hid, "#565C69")
            for _ in range(3):
                s += roof_sheet(rr.uniform(80, 500), rr.uniform(gy + 14, gy + 34), rr.uniform(-25, 25), roof_col)
            # collapsed porch/deck boards against the house front (storm-surge look)
            cx = (g["x0"] + g["x1"]) / 2 - 90
            for k in range(4):
                s += plank(cx + k * 16, g["floor"] + 8 - k * 3, 70, -28 + k * 6, "#B9966E", 8)
    else:
        prof = g["profile"]
        # mud tongue sliding down the slope (and piling up against the house at level 2)
        xa, xb = 24, (300 if level == 1 else 470)
        top, bot = [], []
        for x in np.linspace(xa, xb, 40):
            t = (x - xa) / (xb - xa)
            th = 10 + 16 * math.sin(math.pi * t) + (rr.uniform(-2, 2))
            if level == 2 and g["hx0"] - 20 <= x <= g["hx0"] + 60:
                th += 40 * (1 - abs(x - (g["hx0"] + 20)) / 60)          # debris heaped against the wall
            sy = surface(prof, x)
            top.append((x, sy - th)); bot.append((x, sy + 8))
        pts = top + list(reversed(bot))
        s += f'<polygon points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in pts)}" fill="#8A5A35" stroke="{INK}" stroke-width="2.4" stroke-linejoin="round"/>'
        s += f'<polyline points="{" ".join(f"{x:.1f},{y + 5:.1f}" for x, y in top[2:-2])}" fill="none" stroke="#A8744A" stroke-width="3" stroke-linecap="round"/>'
        for _ in range(26 if level == 1 else 55):                       # rocks and broken branches in the mud
            x = rr.uniform(xa + 8, xb - 8); sy = surface(prof, x); yy = rr.uniform(sy - 18, sy + 2)
            s += stone(x, yy, rr.uniform(2.5, 7), ("#9C978E", "#7E7468", "#B7AE9F", "#6E655A")[rr.integers(4)])
        for _ in range(4 + level * 3):
            x = rr.uniform(xa + 20, xb - 20); sy = surface(prof, x)
            s += log(x, sy - rr.uniform(6, 16), rr.uniform(26, 50), rr.uniform(-40, 40), 3.2, "#7A5638")
        if level == 2:
            # slip scar: raw soil where the hillside let go, with a headscarp crack
            sx0, sx1 = 30, 200
            scar = [(x, surface(prof, x) - 2) for x in np.linspace(sx0, sx1, 20)]
            scar += [(x, surface(prof, x) + 30) for x in np.linspace(sx1, sx0, 20)]
            s += f'<polygon points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in scar)}" fill="#C08452" stroke="{INK}" stroke-width="2"/>'
            s += f'<path d="M{sx0} {surface(prof, sx0) - 3} Q{(sx0 + sx1) / 2} {surface(prof, (sx0 + sx1) / 2) - 16} {sx1} {surface(prof, sx1) - 3}" fill="none" stroke="#3B2A1E" stroke-width="3"/>'
            # tree from the slope fallen against the roof
            tx = 70
            s += fallen_tree(tx, surface(prof, tx) - 6, g["hx0"] + 40, g["top"] - 20, 26)
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 450" width="1200" height="900">{s}</svg>'

# ---------------------------------------------------------------- painted, mask-clipped damage
def paint(hid, g, level, z, sprite):
    img = np.array(sprite).astype(np.float32) / 255
    alpha = img[..., 3].copy()
    yy = np.arange(H)[:, None].repeat(W, 1)
    rr = np.random.default_rng(zlib.crc32(f'{hid}p{level}'.encode()))
    building = z["none"] | z["door"] | z["foundation"]
    glass = (np.abs(np.array(sprite)[..., :3].astype(int) - [191, 230, 245]).max(2) < 22) & z["none"]

    if g["kind"] == "flood":
        frac = 0.24 if level == 1 else 0.56
        wl = (g["floor"] - frac * (g["floor"] - g["top"])) * 2
        wobble = (noise(30, 3) * 4)
        under = building & (yy > wl + wobble) & (yy < g["ground"] * 2)
        img = blend(img, under, (0.45, 0.33, 0.20), 0.30)
        tide = building & (np.abs(yy - (wl + wobble)) < 3)
        img = blend(img, tide, (0.36, 0.25, 0.14), 0.75)
        # silt / mud wash on the lawn
        n = noise(14, 5)
        lawn = z["garden"] & (yy > g["ground"] * 2) & (yy < g["ground"] * 2 + 90) & (n > (0.2 if level == 1 else -0.6))
        img = blend(img, lawn, (0.62, 0.55, 0.42) if g["coast"] else (0.52, 0.40, 0.26), 0.55)
    else:
        # cracks in the walls from ground movement
        def cracks(dr):
            for _ in range(3 if level == 1 else 7):
                x = rr.uniform(g["hx0"] + 10, g["hx1"] - 10) * 4
                y = rr.uniform(g["top"] + 20, g["floor"] - 4) * 4
                pts = crack_path(x, y, rr.uniform(60, 140) * (1.4 if level == 2 else 1), rr.uniform(-2.4, -0.7), rr)
                dr.line(pts, fill=(60, 45, 35, 255), width=7, joint="curve")
        layer = lines_layer(cracks)
        img = composite_layer(img, layer, (z["none"] | z["foundation"]).astype(np.float32))
        n = noise(10, 8)
        dirty = building & (yy > (g["floor"] - 30) * 2) & (n > 0.3)
        img = blend(img, dirty, (0.45, 0.30, 0.18), 0.35)

    if level == 2:
        # smashed windows: a crack star in some panes, a few panes knocked out
        from scipy import ndimage
        lab, nlab = ndimage.label(glass)
        sizes = ndimage.sum(glass, lab, range(1, nlab + 1))
        panes = [i + 1 for i, sz in enumerate(sizes) if sz > 300]
        rr.shuffle(panes)
        for k, p in enumerate(panes[: max(2, len(panes) * 2 // 3)]):
            pm = lab == p
            ys_, xs_ = np.nonzero(pm)
            if k % 3 == 0:
                img = blend(img, pm, (0.17, 0.20, 0.25), 0.92)            # pane gone
                continue
            cx, cy = rr.choice(xs_), rr.choice(ys_)
            def star(dr, cx=cx, cy=cy):
                for a in np.linspace(0, 2 * math.pi, 7, endpoint=False):
                    dr.line(crack_path(cx * 2, cy * 2, rr.uniform(50, 120), a + rr.uniform(-.3, .3), rr, 4), fill=(70, 80, 95, 255), width=4)
            img = composite_layer(img, lines_layer(star), pm.astype(np.float32))
        # holes in the roof (wind-stripped sheets/tiles, or a tree strike)
        roof = z["roof"]
        ys_, xs_ = np.nonzero(roof)
        if len(xs_):
            for _ in range(2):
                i = rr.integers(len(xs_)); cx, cy = xs_[i], ys_[i]
                hole = np.zeros((H, W), bool)
                r = rr.uniform(16, 30)
                hole[max(0, int(cy - r)):int(cy + r), max(0, int(cx - r * 1.4)):int(cx + r * 1.4)] = True
                hole &= roof & (noise(6, int(cx)) > -0.8)
                img = blend(img, hole, (0.22, 0.17, 0.14), 0.95)
                battens = hole & ((yy % 14) < 4)
                img = blend(img, battens, (0.55, 0.40, 0.26), 0.95)
    img[..., 3] = alpha
    return Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8), "RGBA")

with sync_playwright() as p:
    br = p.chromium.launch(); pg = br.new_page(viewport={"width": W, "height": H})
    for h in D["houses"]:
        g = GEOM[h["id"]]; z = zones(h["id"])
        base = Image.open(f"/home/claude/map/sprites/{h['id']}.png").convert("RGBA")
        for level in (1, 2):
            painted = paint(h["id"], g, level, z, base)
            pg.set_content(f"<html><body style='margin:0;background:transparent'>{debris_svg(h['id'], g, level)}</body></html>")
            pg.locator("svg").screenshot(path="/tmp/debris.png", omit_background=True)
            debris = Image.open("/tmp/debris.png").convert("RGBA")
            out = Image.alpha_composite(painted, debris)
            out.save(f"/home/claude/map/sprites/{h['id']}_dmg{level}.png")
        h["damage"] = dict(kind="flood" if g["kind"] == "flood" else "landslip",
                           levels={"1": f"sprites/{h['id']}_dmg1.png", "2": f"sprites/{h['id']}_dmg2.png"})
    br.close()
json.dump(D, open("/home/claude/map/houses.json", "w"), indent=2)
print("done")
