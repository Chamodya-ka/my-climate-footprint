"""Bright cartoon valley map, v2: subtle hills in Hillysides, roads, bridges and a town centre.
Uses terrain.npz + regions_mask.png. Draws at 2x and downsamples.
Outputs: cartoon_base.png, cartoon_overlay.png, cartoon_regions.png, region_labels.json"""
import json
import numpy as np
from scipy import ndimage
from PIL import Image, ImageDraw, ImageFont

S = 2
d = np.load("/home/claude/map/terrain.npz")
H0, W0 = d["elev"].shape
H, W = H0 * S, W0 * S
rng = np.random.default_rng(42)
up = lambda a, o=1: ndimage.zoom(a.astype(np.float32), S, order=o)

REGIONS = {
    "coastal":    dict(name="Coastal",    hazard="Coastal flooding",         rgb=(245, 166, 80),  tint=(255, 178, 64)),
    "riverside":  dict(name="Riverside",  hazard="River and urban flooding", rgb=(90, 170, 245),  tint=(64, 170, 255)),
    "hillysides": dict(name="Hillysides", hazard="Landslips",                rgb=(196, 120, 230), tint=(205, 110, 245)),
}
mask_rgb = np.array(Image.open("/home/claude/map/regions_mask.png").convert("RGB").resize((W, H), Image.NEAREST))
masks = {k: np.all(mask_rgb == v["rgb"], axis=2) for k, v in REGIONS.items()}
any_region = np.any(np.stack(list(masks.values())), axis=0)

def hexc(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float32) / 255

def smooth_noise(sigma, seed):
    r = np.random.default_rng(seed)
    n = ndimage.gaussian_filter(r.random((H, W)).astype(np.float32), sigma)
    return (n - n.mean()) / n.std()

# ---------- elevation, with subtle hills added inside Hillysides ----------
elev = ndimage.gaussian_filter(up(d["elev"], 3), 5)
hill_weight = ndimage.gaussian_filter(masks["hillysides"].astype(np.float32), 22 * S)
hills = np.clip(smooth_noise(10 * S, 77), -0.3, None)
elev = elev + 0.14 * hill_weight * hills

sd = up(d["sd"]) * S
land = sd > 0
t = up(d["t"])
d_river = up(d["d_river"]) * S
river_half = (3.2 + 8.5 * t ** 1.3) * S
river = land & (d_river < river_half)

# ---------- land colour bands + cel shading ----------
bands = [(0.05, "#B5E86F"), (0.15, "#98DC62"), (0.29, "#76CB55"), (0.46, "#5BB74E"),
         (0.64, "#4CA151"), (0.86, "#A7A3C9")]
noise = smooth_noise(18, 1)
e = elev + 0.012 * noise
idx = np.digitize(e, [b[0] for b in bands])
snow = e >= 0.97 + 0.03 * noise
palette = np.stack([hexc(c) for _, c in bands] + [hexc("#A7A3C9")])
col = palette[np.clip(idx, 0, len(bands) - 1)]
col[idx >= len(bands)] = hexc("#B4B0D2")

gy, gx = np.gradient(ndimage.gaussian_filter(elev, 3) * 260)
nrm = np.dstack([-gx, -gy, np.ones_like(gx)]); nrm /= np.linalg.norm(nrm, axis=2, keepdims=True)
L = np.array([-1.0, -1.0, 1.4]); L /= np.linalg.norm(L)
shade = (nrm * L).sum(2)
col = col * np.where(shade < 0.55, 0.84, np.where(shade > 0.82, 1.07, 1.0))[..., None]
col[snow] = np.where((shade[snow] < 0.62)[:, None], hexc("#D4DEF7"), hexc("#FFFFFF"))
band_id = np.where(snow, 99, idx)
edge = (ndimage.maximum_filter(band_id, 3) != ndimage.minimum_filter(band_id, 3)) & land
col[edge] *= 0.86
beach = land & (sd < 9 * S) & (elev < 0.1)
col[beach] = hexc("#FBE7A6")

# ---------- sea ----------
depth = -sd
sea_col = np.where((depth < 45 * S)[..., None], hexc("#7EDCEB"),
          np.where((depth < 140 * S)[..., None], hexc("#4CC3E6"), hexc("#2FA4DD")))
col = np.where(land[..., None], col, sea_col)
col[(~land) & (depth < 4 * S)] = hexc("#FFFFFF")
ring2 = (~land) & (np.abs(depth - 20 * S) < 1.6 * S) & (noise > -0.2)
col[ring2] = col[ring2] * 0.6 + 0.4

# ---------- river ----------
col[land & ~river & (d_river < river_half + 2.2 * S)] = hexc("#2D93C9")
col[river] = hexc("#4CC3F0")

img = Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8)).convert("RGBA")
draw = ImageDraw.Draw(img, "RGBA")

for _ in range(40):  # wave marks
    x, y = rng.integers(0, W), rng.integers(0, H)
    if not land[y, x] and depth[y, x] > 70 * S:
        w = rng.integers(14, 26) * S
        for x0 in (x - w, x):
            draw.arc([x0, y - w // 3, x0 + w, y + w // 3], 200, 340, fill=(255, 255, 255, 170), width=2 * S)

# ======================================================================
# ROADS
# ======================================================================
def catmull(pts, n=1500):
    pts = np.array(pts, np.float32)
    p = np.vstack([pts[0], pts, pts[-1]])
    out = []
    per = max(2, n // (len(p) - 3))
    for i in range(1, len(p) - 2):
        for tt in np.linspace(0, 1, per, endpoint=False):
            t2, t3 = tt * tt, tt ** 3
            out.append(0.5 * ((2 * p[i]) + (-p[i-1] + p[i+1]) * tt + (2*p[i-1] - 5*p[i] + 4*p[i+1] - p[i+2]) * t2
                              + (-p[i-1] + 3*p[i] - 3*p[i+1] + p[i+2]) * t3))
    out.append(p[-2])
    return np.array(out)

river_pts = [(150, -10), (210, 120), (330, 250), (430, 330), (500, 430), (640, 500),
             (760, 545), (830, 630), (930, 700), (985, 770), (1000, 850)]
rc = catmull(river_pts, 3000)
seg = np.r_[0, np.cumsum(np.hypot(*np.diff(rc, axis=0).T))]
rt = seg / seg[-1]
tang = np.gradient(rc, axis=0); tang /= np.linalg.norm(tang, axis=1, keepdims=True)
tang = ndimage.gaussian_filter1d(tang, 40, axis=0); tang /= np.linalg.norm(tang, axis=1, keepdims=True)
nrm_r = np.stack([tang[:, 1], -tang[:, 0]], 1)          # points to the north-east bank

def river_at(tv):
    i = int(np.clip(np.searchsorted(rt, tv), 0, len(rt) - 1))
    return rc[i], tang[i], nrm_r[i]

def offset_road(t0, t1, off, wiggle=0.0, n=14):
    pts = []
    for k, tv in enumerate(np.linspace(t0, t1, n)):
        p, _, nn = river_at(tv)
        o = off + wiggle * np.sin(k * 1.3)
        pts.append(tuple(p + nn * o))
    return pts

inside = lambda m, x, y: 0 <= int(y * S) < H and 0 <= int(x * S) < W and m[int(y * S), int(x * S)]

# main roads along both banks, 1x coordinates
road_ne = offset_road(0.14, 0.86, 78, 6)
road_sw = offset_road(0.30, 0.90, -82, 6)

# coastal road: follows the shoreline ~45px inland across the coastal strip
coast_xs, coast_ys = [], []
for x in range(540, 1190, 10):
    col_land = land[:, x * S]
    ys = np.nonzero(col_land)[0]
    ys = ys[ys > 600 * S]
    sea_below = np.nonzero(~col_land[600 * S:])[0]
    if len(sea_below):
        y_coast = (600 * S + sea_below[0]) / S
        coast_xs.append(x); coast_ys.append(y_coast - 42)
coast_ys = ndimage.gaussian_filter1d(np.array(coast_ys), 3)
road_coast = list(zip(coast_xs, coast_ys))

# join the bank roads down to the coast road
def nearest_on(path, p):
    a = np.array(path); i = int(np.argmin(np.hypot(*(a - p).T))); return tuple(a[i])
road_ne = road_ne + [nearest_on(road_coast, np.array(road_ne[-1]) + (90, 60))]
road_sw = road_sw + [nearest_on(road_coast, np.array(road_sw[-1]) + (-40, 60))]

# cross-river roads (these get bridges)
cross = []
for tv in (0.42, 0.63, 0.80):
    p, _, nn = river_at(tv)
    cross.append([tuple(p - nn * 82), tuple(p - nn * 30), tuple(p + nn * 30), tuple(p + nn * 78)])

# winding roads up into the hills
hill_roads = []
for tv, side in ((0.30, 1), (0.50, 1), (0.72, 1), (0.48, -1), (0.70, -1), (0.36, -1)):
    p, tg, nn = river_at(tv)
    start = 78 if side > 0 else -82
    pts = [tuple(p + nn * (start + side * k * 26) + tg * 22 * np.sin(k * 1.4)) for k in range(0, 9)]
    pts = [q for q in pts if inside(land, *q)]
    # stop once the road leaves the residential hills
    keep = []
    for q in pts:
        keep.append(q)
        if len(keep) > 2 and not inside(masks["hillysides"] | masks["riverside"], *q):
            break
    hill_roads.append(keep)

# town centre street grid, on the north-east bank around t = 0.58
tc_p, tc_t, tc_n = river_at(0.585)
tc_center = tc_p + tc_n * 80
def local(u, v):            # u along the valley, v across it
    return tuple(tc_center + tc_t * u + tc_n * v)
town_streets = [[local(-120, v), local(120, v)] for v in (-26, 22)] + \
               [[local(u, -50), local(u, 52)] for u in (-80, -25, 30, 85)]

MAIN, MINOR = 6.0, 4.0
road_layers = [(road_ne, MAIN, True), (road_sw, MAIN, True), (road_coast, MAIN, True)] + \
              [(r, MINOR, False) for r in cross + hill_roads + town_streets]

def smooth_path(pts):
    return catmull(pts, 300) if len(pts) >= 3 else np.array(pts, np.float32)

paths = [(smooth_path(p) * S, w * S, dash) for p, w, dash in road_layers if len(p) >= 2]
road_mask_img = Image.new("L", (W, H), 0); rm = ImageDraw.Draw(road_mask_img)
for pth, w, _ in paths:
    rm.line([tuple(q) for q in pth], fill=255, width=int(w + 2 * S), joint="curve")
road_mask = np.array(road_mask_img) > 0

for pth, w, _ in paths:            # outline pass
    draw.line([tuple(q) for q in pth], fill=(140, 128, 112, 255), width=int(w + 2.5 * S), joint="curve")
for pth, w, _ in paths:            # fill pass
    draw.line([tuple(q) for q in pth], fill=(252, 247, 234, 255), width=int(w), joint="curve")
for pth, w, dash in paths:         # centre dashes on main roads
    if dash:
        for i in range(0, len(pth) - 6, 12):
            draw.line([tuple(pth[i]), tuple(pth[i + 5])], fill=(245, 200, 70, 255), width=S)

# bridges where roads cross the river
bridge_zone = ndimage.binary_dilation(river, iterations=int(5 * S))
for pth, w, _ in paths:
    on = np.array([bridge_zone[int(np.clip(q[1], 0, H - 1)), int(np.clip(q[0], 0, W - 1))] for q in pth])
    if not on.any():
        continue
    lab, n = ndimage.label(on)
    for k in range(1, n + 1):
        seg_pts = pth[lab == k]
        if len(seg_pts) < 2:
            continue
        a, b = seg_pts[0], seg_pts[-1]
        dirv = (b - a) / (np.linalg.norm(b - a) + 1e-6); pv = np.array([-dirv[1], dirv[0]])
        hw = w / 2 + 3 * S
        deck = [tuple(a + pv * hw), tuple(b + pv * hw), tuple(b - pv * hw), tuple(a - pv * hw)]
        draw.polygon([tuple(np.array(q) + (2 * S, 3 * S)) for q in deck], fill=(20, 60, 90, 70))  # shadow on water
        draw.polygon(deck, fill=(214, 176, 130, 255), outline=(120, 85, 55, 255))
        for sgn in (1, -1):       # railings
            draw.line([tuple(a + pv * hw * sgn), tuple(b + pv * hw * sgn)], fill=(120, 85, 55, 255), width=int(1.5 * S))
        for f in np.linspace(0.15, 0.85, 4):
            c = a + (b - a) * f
            for sgn in (1, -1):
                q = c + pv * hw * sgn
                draw.ellipse([q[0] - S, q[1] - S, q[0] + S, q[1] + S], fill=(120, 85, 55, 255))

# ======================================================================
# TOWN CENTRE BUILDINGS, HOUSES, TREES
# ======================================================================
town_area_img = Image.new("L", (W, H), 0)
ImageDraw.Draw(town_area_img).polygon([tuple(np.array(local(u, v)) * S) for u, v in
                                       ((-130, -58), (130, -58), (130, 62), (-130, 62))], fill=255)
town_area = np.array(town_area_img) > 0
clear_of_water = ndimage.distance_transform_edt(~(river | ~land)) > 10 * S
road_buffer = ndimage.binary_dilation(road_mask, iterations=int(7 * S))

def scatter(cond, n, min_d, existing=()):
    ys, xs = np.nonzero(cond)
    pts, grid = [], {}
    cell = int(min_d)
    for (x, y) in existing:
        grid.setdefault((x // cell, y // cell), []).append((x, y))
    for i in rng.permutation(len(xs)):
        x, y = xs[i], ys[i]
        gx_, gy_ = x // cell, y // cell
        if all((px - x) ** 2 + (py - y) ** 2 >= min_d ** 2
               for ox in (-1, 0, 1) for oy in (-1, 0, 1) for (px, py) in grid.get((gx_ + ox, gy_ + oy), [])):
            grid.setdefault((gx_, gy_), []).append((x, y)); pts.append((x, y))
            if len(pts) >= n:
                break
    return pts

BUILD_COLS = [((236, 240, 246), (176, 190, 210)), ((250, 226, 196), (214, 172, 130)),
              ((214, 232, 250), (140, 172, 214)), ((246, 214, 214), (204, 150, 150)), ((226, 226, 236), (160, 160, 184))]
def building(x, y, s, tall):
    w = rng.integers(16, 26) * s; dpt = rng.integers(10, 14) * s
    h = (rng.integers(26, 48) if tall else rng.integers(12, 24)) * s
    top, side = BUILD_COLS[rng.integers(len(BUILD_COLS))]
    draw.ellipse([x - w * 0.6, y - 2 * s, x + w * 0.8, y + 6 * s], fill=(25, 60, 45, 55))
    draw.rectangle([x - w / 2, y - h, x + w / 2, y], fill=side + (255,), outline=(80, 85, 100, 255), width=s)
    draw.rectangle([x - w / 2, y - h - dpt, x + w / 2, y - h], fill=top + (255,), outline=(80, 85, 100, 255), width=s)
    for wy in range(int(y - h + 5 * s), int(y - 4 * s), 7 * s):       # windows
        for wx in range(int(x - w / 2 + 4 * s), int(x + w / 2 - 3 * s), 6 * s):
            draw.rectangle([wx, wy, wx + 2 * s, wy + 3 * s], fill=(90, 130, 180, 255))

ROOFS = [(232, 92, 74), (245, 140, 60), (90, 140, 220), (110, 110, 130), (230, 190, 70)]
def house(x, y, s):
    w, h = 12 * s, 9 * s
    draw.ellipse([x - w * 0.7, y + h * 0.55, x + w * 0.9, y + h * 1.05], fill=(25, 70, 40, 50))
    draw.rectangle([x - w / 2, y - h / 4, x + w / 2, y + h * 0.75], fill=(255, 250, 238, 255), outline=(90, 80, 70, 255), width=s)
    roof = ROOFS[rng.integers(len(ROOFS))]
    draw.polygon([(x - w * 0.68, y - h * 0.2), (x, y - h * 0.95), (x + w * 0.68, y - h * 0.2)], fill=roof + (255,), outline=(90, 70, 60, 255))
    draw.rectangle([x - w * 0.12, y + h * 0.25, x + w * 0.12, y + h * 0.75], fill=(110, 80, 60, 255))

def tree(x, y, s):
    r = rng.integers(5, 8) * s
    g = [(52, 145, 72), (62, 160, 78), (44, 128, 66)][rng.integers(3)]
    draw.ellipse([x - r * 0.9, y + r * 0.35, x + r * 1.1, y + r * 1.15], fill=(25, 80, 40, 55))
    draw.rectangle([x - s, y, x + s, y + r], fill=(120, 85, 55, 255))
    draw.ellipse([x - r, y - r * 1.4, x + r, y + r * 0.4], fill=g + (255,), outline=(35, 100, 55, 255), width=s)
    draw.ellipse([x - r * 0.55, y - r * 1.15, x - r * 0.05, y - r * 0.65], fill=(140, 210, 120, 200))

# town centre buildings on a jittered grid between the streets
buildings = []
for u in np.arange(-112, 116, 22):
    for v in np.arange(-46, 50, 15):
        x, y = np.array(local(u + rng.uniform(-4, 4), v + rng.uniform(-3, 3))) * S
        xi, yi = int(x), int(y)
        if 0 <= xi < W and 0 <= yi < H and land[yi, xi] and not river[yi, xi] and not road_buffer[yi, xi] \
                and clear_of_water[yi, xi] and masks["riverside"][yi, xi]:
            tall = np.hypot(u / 112, v / 52) < 0.6
            buildings.append((xi, yi, tall))

# houses: first lined up along roads, then scattered infill
base_ok = land & clear_of_water & ~road_buffer & ~ndimage.binary_dilation(town_area, iterations=8 * S)
roadside = []
for pth, w, _ in paths:
    for i in range(0, len(pth) - 1, 9):
        a, b = pth[i], pth[min(i + 1, len(pth) - 1)]
        dv = b - a; nn = np.array([-dv[1], dv[0]]) / (np.linalg.norm(dv) + 1e-6)
        for sgn in (1, -1):
            q = a + nn * sgn * (w / 2 + 13 * S)
            xi, yi = int(q[0]), int(q[1])
            if 0 <= xi < W and 0 <= yi < H and base_ok[yi, xi] and any_region[yi, xi]:
                roadside.append((xi, yi))
rng.shuffle(roadside)
house_pts = scatter(np.zeros((H, W), bool), 0, 1)
placed = []
for (x, y) in roadside:
    if all((px - x) ** 2 + (py - y) ** 2 >= (24 * S) ** 2 for px, py in placed):
        placed.append((x, y))
for key, n, md in (("riverside", 70, 30), ("coastal", 25, 28), ("hillysides", 35, 36)):
    m = ndimage.binary_erosion(masks[key], iterations=8 * S) & base_ok
    placed += scatter(m, n, md * S, existing=placed)
house_pts = placed

forest = land & ~snow & (idx >= 2) & (idx <= 4) & clear_of_water & ~road_buffer & \
         ~ndimage.binary_dilation(masks["riverside"] | masks["coastal"] | town_area, iterations=4)
tree_pts = scatter(forest, 750, 16 * S, existing=house_pts)
tree_pts += scatter(land & (idx <= 2) & clear_of_water & ~road_buffer & ~any_region & ~town_area, 100, 30 * S)

items = [(y, 0, x, None) for x, y in house_pts] + [(y, 1, x, None) for x, y in tree_pts] + \
        [(y, 2, x, tall) for x, y, tall in buildings]
for y, kind, x, tall in sorted(items, key=lambda z: (z[0], z[1])):
    if kind == 0:
        house(x, y, S)
    elif kind == 1:
        tree(x, y, S)
    else:
        building(x, y, S, tall)

base = img.resize((W0, H0), Image.LANCZOS)
base.convert("RGB").save("/home/claude/map/cartoon_base.png")

# ======================================================================
# REGION OVERLAY + LABELS
# ======================================================================
ov = np.zeros((H0, W0, 4), np.float32)
labels = {}
river1x = d["river"]
for key, info in REGIONS.items():
    m = np.array(Image.fromarray(masks[key].astype(np.uint8) * 255).resize((W0, H0), Image.NEAREST)) > 127
    soft = ndimage.gaussian_filter(m.astype(np.float32), 2.4)
    fill = np.clip((soft - 0.45) / 0.1, 0, 1) * 0.18
    ring = np.clip(1 - np.abs(soft - 0.42) / 0.2, 0, 1)
    inner = np.clip(1 - np.abs(soft - 0.8) / 0.1, 0, 1) * 0.95
    tint = np.array(info["tint"]) / 255
    for a, c in ((fill, tint), (ring, np.ones(3)), (inner, tint)):
        a = a[..., None]; oa = ov[..., 3:]; na = a + oa * (1 - a)
        ov[..., :3] = np.where(na > 0, (c * a + ov[..., :3] * oa * (1 - a)) / np.maximum(na, 1e-6), 0)
        ov[..., 3:] = na
    lab, n = ndimage.label(m)
    sizes = ndimage.sum(m, lab, range(1, n + 1))
    big = lab == int(np.argmax(sizes)) + 1
    avoid = (ndimage.distance_transform_edt(~river1x) > 90)
    if key == "riverside":                 # keep the label off the town centre
        tz = np.array(Image.fromarray(town_area.astype(np.uint8) * 255).resize((W0, H0), Image.NEAREST)) > 127
        avoid &= ndimage.distance_transform_edt(~tz) > 60
    dist = ndimage.distance_transform_edt(big) * avoid
    yy, xx = np.unravel_index(np.argmax(dist), dist.shape)
    labels[key] = dict(name=info["name"], hazard=info["hazard"], x=int(xx), y=int(yy),
                       maskColor=list(info["rgb"]), tint=list(info["tint"]))
overlay = Image.fromarray((np.clip(ov, 0, 1) * 255).astype(np.uint8), "RGBA")
overlay.save("/home/claude/map/cartoon_overlay.png")
json.dump(dict(width=W0, height=H0, regions=labels,
               landmarks=dict(townCentre=[float(tc_center[0]), float(tc_center[1])])),
          open("/home/claude/map/region_labels.json", "w"), indent=2)

out = Image.alpha_composite(base, overlay)
dr = ImageDraw.Draw(out)
f1 = ImageFont.truetype("/home/claude/map/Fredoka.ttf", 30); f1.set_variation_by_name("SemiBold")
f2 = ImageFont.truetype("/home/claude/map/Fredoka.ttf", 17); f2.set_variation_by_name("Medium")
for key, lb in labels.items():
    info = REGIONS[key]
    w = max(dr.textlength(lb["name"], font=f1), dr.textlength(lb["hazard"], font=f2)) + 44
    h = 70
    x0, y0 = lb["x"] - w / 2, lb["y"] - h / 2
    dr.rounded_rectangle([x0, y0 + 4, x0 + w, y0 + h + 4], 20, fill=(40, 60, 90, 90))
    dr.rounded_rectangle([x0, y0, x0 + w, y0 + h], 20, fill=(255, 255, 255, 255), outline=info["tint"] + (255,), width=4)
    dr.ellipse([x0 + 16, y0 + 18, x0 + 30, y0 + 32], fill=info["tint"] + (255,))
    dr.text((x0 + 38, y0 + 7), lb["name"], font=f1, fill=(38, 52, 72, 255))
    dr.text((x0 + 38, y0 + 42), lb["hazard"], font=f2, fill=(90, 105, 125, 255))
out.convert("RGB").save("/home/claude/map/cartoon_regions.png")
print("houses", len(house_pts), "trees", len(tree_pts), "buildings", len(buildings))
