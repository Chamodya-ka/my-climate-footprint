"""House sprites for the game, in the same flat cartoon style as the map.
Each sprite is an SVG whose parts are grouped by zone:
  roof (solar) | door (seal doors, food, sandbags) | garden (retaining wall, soil nailing, trees, drainage)
  foundation (foundation improvement, raise on stilts) | none (walls, windows, decoration)
Writes svg/<id>.svg. render_sprites.py turns them into PNG sprites + zone masks."""
import json, os

OUT = "/home/claude/map/svg"
os.makedirs(OUT, exist_ok=True)
INK = "#4F463D"
GRASS, GRASS_D, SOIL, SOIL_D = "#98DC62", "#6CC04F", "#C79566", "#8C6440"
GLASS, GLASS_D = "#BFE6F5", "#8CCBE6"
_uid = [0]

def uid(p):
    _uid[0] += 1
    return f"{p}{_uid[0]}"

def rect(x, y, w, h, fill, rx=0, sw=3, extra=""):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{INK}" stroke-width="{sw}" {extra}/>'

def poly(pts, fill, sw=3):
    return f'<polygon points="{" ".join(f"{x},{y}" for x, y in pts)}" fill="{fill}" stroke="{INK}" stroke-width="{sw}" stroke-linejoin="round"/>'

def line(x1, y1, x2, y2, col=INK, sw=2):
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{col}" stroke-width="{sw}" stroke-linecap="round" class="so"/>'

def circle(cx, cy, r, fill, sw=2.5):
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}" stroke="{INK}" stroke-width="{sw}"/>'

def clipped(shape_pts, inner):
    cid = uid("c")
    pts = " ".join(f"{x},{y}" for x, y in shape_pts)
    return f'<clipPath id="{cid}"><polygon points="{pts}"/></clipPath><g clip-path="url(#{cid})">{inner}</g>'

def boards(x, y, w, h, fill, col, step=10, vertical=False):
    """Weatherboard / vertical board cladding."""
    s = rect(x, y, w, h, fill)
    if vertical:
        s += "".join(line(xx, y + 2, xx, y + h - 2, col, 1.5) for xx in range(int(x) + step, int(x + w) - 2, step))
    else:
        s += "".join(line(x + 2, yy, x + w - 2, yy, col, 1.5) for yy in range(int(y) + step, int(y + h) - 2, step))
    return s

def tri_boards(pts, fill, col, step=10):
    ys = [p[1] for p in pts]; xs = [p[0] for p in pts]
    inner = "".join(line(min(xs), yy, max(xs), yy, col, 1.5) for yy in range(int(min(ys)) + step, int(max(ys)), step))
    return poly(pts, fill) + clipped(pts, inner)

def roof_iron(pts, fill, rib, step=11):
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    inner = "".join(line(xx, min(ys), xx, max(ys), rib, 1.5) for xx in range(int(min(xs)) + 6, int(max(xs)), step))
    return poly(pts, fill) + clipped(pts, inner)

def roof_tiles(pts, fill, rowc, step=12):
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    inner = ""
    for i, yy in enumerate(range(int(min(ys)) + step, int(max(ys)), step)):
        inner += line(min(xs), yy, max(xs), yy, rowc, 2)
        off = 0 if i % 2 else 9
        inner += "".join(line(xx, yy - step + 3, xx, yy - 2, rowc, 1.2) for xx in range(int(min(xs)) + off, int(max(xs)), 18))
    return poly(pts, fill) + clipped(pts, inner)

def window(x, y, w, h, cols=2, rows=1, frame="#FFFFFF", glass=GLASS, sill=True):
    s = rect(x, y, w, h, frame, 2)
    gx, gy, gw, gh = x + 5, y + 5, w - 10, h - 10
    s += rect(gx, gy, gw, gh, glass, 1, 2)
    for c in range(1, cols):
        xx = gx + gw * c / cols
        s += line(xx, gy, xx, gy + gh, frame, 4) + line(xx, gy, xx, gy + gh, INK, 1)
    for r in range(1, rows):
        yy = gy + gh * r / rows
        s += line(gx, yy, gx + gw, yy, frame, 4) + line(gx, yy, gx + gw, yy, INK, 1)
    s += line(gx + 6, gy + gh - 8, gx + min(gw, gh) * 0.45, gy + 6, "#FFFFFF", 3)
    if sill:
        s += rect(x - 4, y + h, w + 8, 6, frame, 2, 2)
    return s

def door(x, y, w, h, fill, glass_top=False, knob=True):
    s = rect(x, y, w, h, fill, 2)
    if glass_top:
        s += rect(x + 6, y + 8, w - 12, h * 0.35, GLASS, 1, 2)
    if knob:
        s += circle(x + w - 8, y + h * 0.55, 2.5, "#F2C94C", 1.5)
    return s

def bush(cx, cy, r, col=GRASS_D):
    return circle(cx - r * 0.6, cy, r * 0.75, col) + circle(cx + r * 0.6, cy, r * 0.75, col) + circle(cx, cy - r * 0.45, r * 0.85, col)

def tree(cx, base_y, h=110, r=34, col="#4FAE52"):
    return (rect(cx - 5, base_y - h * 0.55, 10, h * 0.55, "#8C6440", 2)
            + circle(cx, base_y - h * 0.62, r, col) + circle(cx - r * 0.55, base_y - h * 0.5, r * 0.7, col)
            + circle(cx + r * 0.55, base_y - h * 0.5, r * 0.7, col)
            + f'<circle cx="{cx - r * 0.3}" cy="{base_y - h * 0.75}" r="{r * 0.25}" fill="#B9E89A" opacity="0.8"/>')

def flax(cx, base_y, col="#4C8F4A"):
    s = ""
    for ang in (-50, -28, -10, 8, 26, 48):
        import math
        a = math.radians(ang)
        x2, y2 = cx + 34 * math.sin(a), base_y - 40 * math.cos(a)
        s += f'<path d="M{cx} {base_y} Q{cx + 10 * math.sin(a)} {base_y - 22} {x2} {y2}" fill="none" stroke="{col}" stroke-width="5" stroke-linecap="round" class="so"/>'
    return s

def cabbage_tree(cx, base_y):
    import math
    s = rect(cx - 4, base_y - 90, 8, 90, "#8C7355", 2)
    for ang in range(-80, 81, 20):
        a = math.radians(ang)
        s += f'<line x1="{cx}" y1="{base_y - 90}" x2="{cx + 28 * math.sin(a)}" y2="{base_y - 90 - 22 * math.cos(a)}" stroke="#5E9E4A" stroke-width="4" stroke-linecap="round" class="so"/>'
    return s

def flowers(x0, x1, y, col):
    return "".join(circle(xx, y + (6 if (xx // 13) % 2 else 0), 4.5, col, 1.5) for xx in range(int(x0), int(x1), 13))

def picket_fence(x0, x1, y, col="#FFFFFF", h=34, gap_at=None):
    s = rect(x0, y + h * 0.35, x1 - x0, 6, col, 1, 2) + rect(x0, y + h * 0.7, x1 - x0, 6, col, 1, 2)
    for xx in range(int(x0), int(x1), 14):
        if gap_at and gap_at[0] <= xx <= gap_at[1]:
            continue
        s += poly([(xx, y + h), (xx, y + 6), (xx + 4.5, y), (xx + 9, y + 6), (xx + 9, y + h)], col, 2)
    return s

def flat_ground(lawn=GRASS):
    soil = f'<path d="M24 386 L24 404 Q24 436 60 436 L540 436 Q576 436 576 404 L576 386 Z" fill="{SOIL}" stroke="{INK}" stroke-width="3"/>'
    soil += "".join(line(x, 412, x + 18, 412, SOIL_D, 3) for x in (80, 190, 330, 450))
    return soil + rect(24, 352, 552, 44, lawn, 22)

def slope_ground(top_pts, lawn=GRASS):
    pts = [(24, 436)] + top_pts + [(576, 436)]
    d = "M" + " L".join(f"{x} {y}" for x, y in pts) + " Z"
    s = f'<path d="{d}" fill="{SOIL}" stroke="{INK}" stroke-width="3" stroke-linejoin="round"/>'
    grass = [(x, y) for x, y in top_pts]
    gd = "M" + " L".join(f"{x} {y}" for x, y in grass) + " " + " L".join(f"{x} {y + 30}" for x, y in reversed(grass)) + " Z"
    s += f'<path d="{gd}" fill="{lawn}" stroke="{INK}" stroke-width="3" stroke-linejoin="round"/>'
    return s

def piles(x0, x1, y_top, y_bottom_fn, step=34, w=10, col="#9C7B5A"):
    s = ""
    for xx in range(int(x0), int(x1) + 1, step):
        yb = y_bottom_fn(xx)
        s += rect(xx - w / 2, y_top, w, yb - y_top, col, 1, 2.5)
    return s

def sprite(sid, layers, meta):
    body = "".join(f'<g data-zone="{z}">{c}</g>' for z, c in layers)
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 450" width="600" height="450" '
           f'stroke-linejoin="round">{body}</svg>')
    open(f"{OUT}/{sid}.svg", "w").write(svg)
    meta["id"] = sid
    return meta

houses = []

# ------------------------------------------------------------------ COASTAL: villas (Petone / Ohiro Bay)
def villa(lux):
    L = []
    roof_c, rib = ("#5D6474", "#4A5160") if lux else ("#8E98AB", "#77819A")
    wall, wline = ("#ECE7DE", "#D3CCBF") if lux else ("#F6EBD6", "#E2D2B4")
    trim = "#FFFFFF"; accent = "#3D4352" if lux else "#FFFFFF"
    x0, x1 = (64, 536) if lux else (110, 490)
    floor_y = 328
    garden_back = flat_ground()
    if lux:
        garden_back += tree(560, 352, 120, 30, "#5BB74E")
    L.append(("garden", garden_back))
    # foundation: subfloor skirt with lattice vents
    fnd = rect(x0 + 4, floor_y, x1 - x0 - 8, 22, "#9AA3B2", 1)
    fnd += "".join(rect(xx, floor_y + 6, 18, 10, "#6E7787", 1, 1.5) for xx in range(x0 + 24, x1 - 30, 46))
    L.append(("foundation", fnd))
    walls, roofs = "", ""
    bays = [(x0 + 10, x0 + 150), (x1 - 150, x1 - 10)] if lux else [(x1 - 160, x1 - 20)]
    mid0 = bays[0][1] if lux else x0 + 10
    mid1 = bays[-1][0]
    # main hip roof behind
    roofs += roof_iron([(mid0 - 30, 226), (mid0 + 20, 168), (mid1 - 20, 168), (mid1 + 30, 226)], roof_c, rib)
    if not lux:
        roofs += rect(x0 + 50, 128, 20, 46, "#B65A44", 1) + rect(x0 + 46, 124, 28, 8, "#8E4A3A", 1, 2)
    walls += boards(mid0, 226, mid1 - mid0, floor_y - 226, wall, wline)
    for (a, b) in bays:
        walls += boards(a, 214, b - a, floor_y - 214, wall, wline)
        apex = ((a + b) / 2, 142)
        walls += tri_boards([(a, 214), apex, (b, 214)], wall, wline)
        roofs += poly([(a - 14, 222), apex, (apex[0], apex[1] + 16), (a + 4, 222)], roof_c)
        roofs += poly([(b + 14, 222), apex, (apex[0], apex[1] + 16), (b - 4, 222)], roof_c)
        walls += window(a + 22, 238, b - a - 44, 70, cols=3 if lux else 2, rows=2 if lux else 1)
        if lux:
            cx = (a + b) / 2
            walls += "".join(line(cx, 196, cx + dx, 212, accent, 2) for dx in (-28, -14, 0, 14, 28))
            walls += f'<path d="M{a + 6} 214 L{apex[0]} {apex[1] + 22} L{b - 6} 214" fill="none" stroke="{accent}" stroke-width="5" class="so"/>'
            walls += poly([(apex[0] - 5, apex[1] - 2), (apex[0], apex[1] - 22), (apex[0] + 5, apex[1] - 2)], trim, 2)
    # veranda roof + posts + balustrade
    vx0, vx1 = mid0 + 4, mid1 - 4
    roofs += rect(vx0 - 6, 236, vx1 - vx0 + 12, 14, roof_c, 2)
    posts = ""
    nposts = 6 if lux else 4
    for i in range(nposts):
        px = vx0 + 4 + (vx1 - vx0 - 16) * i / (nposts - 1)
        posts += rect(px, 250, 9, floor_y - 250, trim, 1, 2)
        if lux:
            posts += poly([(px - 14, 252), (px, 252), (px, 266)], trim, 2) + poly([(px + 9, 252), (px + 23, 252), (px + 9, 266)], trim, 2)
    door_x = (vx0 + vx1) / 2 - 18
    gap0, gap1 = door_x - 16, door_x + 52          # keep the entrance clear
    rail = rect(vx0, 292, gap0 - vx0, 6, trim, 1, 2) + rect(gap1, 292, vx1 - gap1, 6, trim, 1, 2)
    if lux:
        rail += "".join(line(xx, 298, xx, floor_y, trim, 3) for xx in range(int(vx0) + 8, int(vx1), 9) if not gap0 - 2 <= xx <= gap1 + 2)
        rail += rect(vx0, 252, vx1 - vx0, 10, trim, 1, 2)
        rail += "".join(rect(xx, 254, 3, 6, accent, 0, 0) for xx in range(int(vx0) + 6, int(vx1), 10))
    door_x = (vx0 + vx1) / 2 - 18
    walls += window(vx0 + 18, 258, 54, 52, cols=2)
    if lux:
        walls += window(vx1 - 72, 258, 54, 52, cols=2)
    walls += rect(vx0 - 6, floor_y - 6, vx1 - vx0 + 12, 8, "#D8D2C6", 1, 2)   # veranda deck edge
    L.append(("none", walls))
    L.append(("roof", roofs))
    dr = door(door_x, 256, 36, floor_y - 256, "#2E6F73" if not lux else "#3D4352", glass_top=lux)
    if lux:
        dr += rect(door_x - 12, 256, 9, floor_y - 256, GLASS, 1, 2) + rect(door_x + 39, 256, 9, floor_y - 256, GLASS, 1, 2)
    dr += rect(door_x - 14, floor_y + 2, 64, 10, "#C9C2B6", 2, 2) + rect(door_x - 22, floor_y + 12, 80, 10, "#B9B2A6", 2, 2)
    L.append(("door", dr))
    L.append(("none", posts + rail))
    front = f'<path d="M{door_x - 18} 352 L{door_x + 54} 352 L{door_x + 66} 396 L{door_x - 30} 396 Z" fill="#D9D3C9" stroke="{INK}" stroke-width="2.5"/>'
    if lux:
        front += flowers(x0 + 20, door_x - 30, 346, "#B48BE0") + flowers(door_x + 66, x1 - 20, 346, "#B48BE0")
        front += picket_fence(30, 570, 360, "#FFFFFF", 30, gap_at=(door_x - 30, door_x + 66))
    else:
        front += bush(x0 + 30, 348, 18) + bush(x1 - 40, 346, 16)
        front += picket_fence(30, 570, 364, "#FFFFFF", 26, gap_at=(door_x - 30, door_x + 66))
    L.append(("garden", front))
    return L

houses.append(sprite("coastal_villa", villa(False), dict(
    region="coastal", tier="Standard", name="Seaside villa", price=720000, bedrooms=3, floorArea=110,
    built="1910s", floorHeight=0.5, inspiredBy="Petone and Ohiro Bay villas",
    blurb="A classic weatherboard villa a short walk from the beach, on low piles.")))
houses.append(sprite("coastal_villa_lux", villa(True), dict(
    region="coastal", tier="Luxury", name="Restored double-bay villa", price=1350000, bedrooms=4, floorArea=190,
    built="1905, restored 2022", floorHeight=0.6, inspiredBy="Restored Petone villas",
    blurb="Fully restored with twin bay windows, fretwork veranda and a sea breeze.")))

# ------------------------------------------------------------------ RIVERSIDE: bungalows (Lower Hutt)
def bungalow(lux):
    L = []
    floor_y = 330
    L.append(("garden", flat_ground() + (cabbage_tree(70, 360) if lux else bush(60, 350, 26, "#5BB74E") + bush(110, 352, 22, "#5BB74E"))))
    x0, x1 = (90, 420) if lux else (125, 475)
    fnd = rect(x0 + 2, floor_y, x1 - x0 - 4, 18, "#8FA3B8" if not lux else "#A3A8B0", 1)
    if lux:
        fnd += rect(420, floor_y, 108, 18, "#A3A8B0", 1)
    L.append(("foundation", fnd))
    wall, wline = ("#FBFBF8", "#DDDDD8") if not lux else ("#5C6370", "#4C5260")
    walls = boards(x0, 236, x1 - x0, floor_y - 236, wall, wline)
    roof_c, row = ("#A65B42", "#7E412F") if not lux else ("#454B57", "#2F343E")
    roofs = roof_tiles([(x0 - 22, 240), (x0 + 70, 166), (x1 - 70, 166), (x1 + 22, 240)], roof_c, row)
    roofs += rect(x0 + 40, 132, 20, 54, "#9E9A94" if not lux else "#2F343E", 1) + rect(x0 + 36, 128, 28, 8, "#6E6A64", 1, 2)
    if lux:
        walls += boards(330, 236, 90, floor_y - 236, "#C98B55", "#A86F40", 9, vertical=True)
        walls += window(108, 252, 150, 74, cols=3, frame="#2F343E", sill=False)
        walls += boards(420, 262, 108, floor_y - 262, "#5C6370", "#4C5260")
        walls += rect(436, 276, 76, floor_y - 276, "#D7DBE2", 1) + "".join(line(438, yy, 510, yy, "#AEB4BF", 2) for yy in range(284, floor_y, 8))
        roofs += rect(414, 252, 120, 14, "#3A3F49", 2)
        walls += rect(96, floor_y - 2, 226, 12, "#C9A27A", 1, 2) + "".join(line(xx, floor_y, xx, floor_y + 8, "#9E7650", 1.5) for xx in range(104, 320, 16))
    else:
        walls += window(148, 258, 76, 56, cols=2)
        walls += window(340, 254, 112, 62, cols=3)
        walls += rect(276, 232, 50, 10, "#FFFFFF", 1, 2)
    L.append(("none", walls))
    L.append(("roof", roofs))
    if lux:
        dr = door(352, 256, 34, floor_y - 256, "#8B5A33") + rect(345, floor_y + 2, 48, 9, "#B9B4AC", 2, 2)
    else:
        dr = door(284, 258, 34, floor_y - 258, "#3B3B3F") + rect(276, floor_y, 50, 10, "#8FA3B8", 1, 2) + rect(268, floor_y + 10, 66, 10, "#8FA3B8", 1, 2)
    L.append(("door", dr))
    if lux:
        front = f'<path d="M345 352 L393 352 L405 396 L333 396 Z" fill="#CFCBC4" stroke="{INK}" stroke-width="2.5"/>'
        front += f'<path d="M436 352 L512 352 L530 396 L420 396 Z" fill="#BDB8B0" stroke="{INK}" stroke-width="2.5"/>'
        front += flax(150, 360) + flax(260, 362, "#6A8F3A") + flax(560, 362)
    else:
        front = f'<path d="M282 352 L322 352 L330 396 L274 396 Z" fill="#D7D4CE" stroke="{INK}" stroke-width="2.5"/>'
        front += bush(160, 348, 14) + bush(215, 349, 13) + bush(390, 348, 14) + bush(445, 349, 13)
    L.append(("garden", front))
    return L

houses.append(sprite("riverside_bungalow", bungalow(False), dict(
    region="riverside", tier="Standard", name="1950s weatherboard bungalow", price=650000, bedrooms=3, floorArea=95,
    built="1955", floorHeight=0.4, inspiredBy="Lower Hutt state-house era bungalows",
    blurb="Solid family home on a flat section, close to the river and the shops.")))
houses.append(sprite("riverside_bungalow_lux", bungalow(True), dict(
    region="riverside", tier="Luxury", name="Renovated bungalow with garage", price=980000, bedrooms=4, floorArea=165,
    built="1958, renovated 2020", floorHeight=0.3, inspiredBy="Renovated Lower Hutt bungalows",
    blurb="Opened up with big sliders, a sunny deck and an internal garage.")))

# ------------------------------------------------------------------ RIVERSIDE: townhouses (Hutt Central)
def townhouse(lux):
    L = []
    floor_y = 334
    L.append(("garden", flat_ground()))
    x0, x1 = (170, 430) if lux else (200, 380)
    L.append(("foundation", rect(x0 - 6, floor_y, x1 - x0 + 12 + (0 if lux else 70), 14, "#B7BBC2", 1)))
    roof_c = "#3F4552" if lux else "#565C69"
    apex_y = 46 if lux else 78
    eave_y = 150
    walls = ""
    if lux:
        walls += boards(x0, eave_y, x1 - x0, floor_y - eave_y, "#2F3440", "#252A34", 10, vertical=True)
        walls += tri_boards([(x0, eave_y), ((x0 + x1) / 2, apex_y + 18), (x1, eave_y)], "#2F3440", "#252A34")
        walls += boards(330, eave_y, 100, floor_y - eave_y, "#C98B55", "#A86F40", 9, vertical=True)
        walls += window(194, 166, 120, 70, cols=2, frame="#1F232B", sill=False)
        walls += rect(186, 236, 136, 8, "#C5CBD3", 1, 2)
        walls += f'<rect x="186" y="210" width="136" height="28" fill="#CFEAF7" fill-opacity="0.75" stroke="{INK}" stroke-width="2"/>'
        walls += window(346, 176, 60, 90, cols=1, frame="#1F232B", sill=False)
        walls += window(250, 84, 50, 46, cols=1, frame="#1F232B", sill=False)
        walls += rect(186, 262, 116, floor_y - 262, "#D5D9E0", 1) + "".join(line(188, yy, 300, yy, "#A8AFBA", 2) for yy in range(270, floor_y, 9))
    else:
        walls += boards(x0, eave_y, x1 - x0, floor_y - eave_y, "#FAFAF7", "#E2E2DD")
        walls += tri_boards([(x0, eave_y), ((x0 + x1) / 2, apex_y + 18), (x1, eave_y)], "#FAFAF7", "#E2E2DD")
        walls += boards(300, eave_y, 44, floor_y - eave_y, "#4A505C", "#3E4450", 8, vertical=True)
        walls += window(218, 168, 60, 54, cols=1) + window(218, 250, 60, 54, cols=1)
        walls += window(356, 168, 18, 54, cols=1, sill=False)
        walls += window(272, 96, 36, 36, cols=1, sill=False)
        walls += boards(380, 236, 70, floor_y - 236, "#FAFAF7", "#E2E2DD")
        walls += window(394, 258, 42, 40, cols=1)
    L.append(("none", walls))
    cx = (x0 + x1) / 2
    roofs = poly([(x0 - 18, eave_y + 6), (cx, apex_y), (cx, apex_y + 20), (x0 + 2, eave_y + 6)], roof_c)
    roofs += poly([(x1 + 18, eave_y + 6), (cx, apex_y), (cx, apex_y + 20), (x1 - 2, eave_y + 6)], roof_c)
    if not lux:
        roofs += roof_iron([(376, 238), (452, 222), (458, 232), (376, 248)], roof_c, "#474C58", 9)
    else:
        roofs += rect(324, 142, 112, 12, roof_c, 2)
    L.append(("roof", roofs))
    if lux:
        dr = door(352, 270, 34, floor_y - 270, "#8B5A33") + rect(346, 262, 46, 8, "#1F232B", 1, 2) + rect(344, floor_y + 2, 50, 9, "#B9B4AC", 2, 2)
    else:
        dr = door(306, 262, 32, floor_y - 262, "#9FD3C9", glass_top=True) + rect(298, 252, 48, 9, "#4A505C", 1, 2) + rect(298, floor_y + 2, 48, 9, "#C9C5BE", 2, 2)
    L.append(("door", dr))
    if lux:
        front = f'<path d="M186 352 L302 352 L316 396 L172 396 Z" fill="#BDB8B0" stroke="{INK}" stroke-width="2.5"/>'
        front += rect(440, 342, 90, 20, "#C98B55", 3) + bush(485, 336, 14, "#5BB74E")
        front += rect(60, 342, 90, 20, "#C98B55", 3) + bush(105, 336, 14, "#5BB74E")
    else:
        front = f'<path d="M304 352 L340 352 L348 396 L296 396 Z" fill="#D7D4CE" stroke="{INK}" stroke-width="2.5"/>'
        front += rect(214, 340, 74, 18, "#C9A27A", 3) + flowers(222, 284, 334, "#E5566B")
        front += rect(392, 340, 60, 18, "#C9A27A", 3) + flowers(400, 448, 334, "#E5566B")
        front += picket_fence(40, 180, 364, "#E8E2D6", 26)
    L.append(("garden", front))
    return L

houses.append(sprite("riverside_townhouse", townhouse(False), dict(
    region="riverside", tier="Standard", name="New-build townhouse", price=595000, bedrooms=2, floorArea=88,
    built="2023", floorHeight=0.2, inspiredBy="New townhouses around Hutt Central",
    blurb="Low-maintenance and close to the train, but built on a slab at street level.")))
houses.append(sprite("riverside_townhouse_lux", townhouse(True), dict(
    region="riverside", tier="Luxury", name="Architect-designed townhouse", price=890000, bedrooms=3, floorArea=150,
    built="2024", floorHeight=0.25, inspiredBy="Modern Hutt Central townhouses",
    blurb="Cedar and black cladding, glass balcony and a garage at street level.")))

# ------------------------------------------------------------------ HILLYSIDES: Naenae-style hillside homes
def hillside(lux):
    L = []
    if lux:
        top = [(24, 196), (90, 204), (150, 226), (214, 262), (236, 280), (236, 362), (576, 368)]
    else:
        top = [(24, 230), (120, 244), (210, 272), (320, 312), (420, 344), (576, 360)]
    g = slope_ground(top)
    g += tree(66, 214 if lux else 248, 120, 32, "#4FAE52")
    if lux:
        g += "".join(rect(70 + i * 34, 222 + i * 14, 24, 8, "#D9D3C9", 3, 2) for i in range(5))
        g += bush(150, 236, 16, "#5BB74E") + bush(196, 262, 14, "#6CC04F")
        g += f'<rect x="420" y="360" width="150" height="10" fill="#D8D2C2" stroke="{INK}" stroke-width="2"/>'
    else:
        g += bush(160, 268, 15, "#5BB74E")
    L.append(("garden", g))

    def ground_y(x):
        for (xa, ya), (xb, yb) in zip(top, top[1:]):
            if xa <= x <= xb:
                return ya + (yb - ya) * (x - xa) / max(1, xb - xa)
        return top[-1][1]

    if lux:
        fnd = rect(232, 358, 240, 14, "#A9A9A2", 1) + rect(494, 360, 22, 12, "#A9A9A2", 1, 2)
        L.append(("foundation", fnd))
        walls = rect(236, 270, 236, 90, "#CFCFC9", 1)
        walls += "".join(circle(xx, yy, 2, "#A9A9A2", 0) for xx in range(256, 470, 30) for yy in (290, 320, 346))
        walls += rect(498, 272, 14, 88, "#CFCFC9", 1, 2.5)
        walls += rect(150, 262, 372, 12, "#D8D8D2", 1)
        walls += rect(178, 168, 280, 94, "#C48A4F", 1)
        for i in range(4):
            walls += rect(186 + i * 68, 176, 62, 86, GLASS, 1, 2) + line(196 + i * 68, 240, 216 + i * 68, 190, "#FFFFFF", 3)
        walls += rect(230, 168, 10, 94, "#E6E6E0", 1, 2) + rect(410, 168, 10, 94, "#E6E6E0", 1, 2)
        walls += "".join(line(xx, 236, xx, 262, INK, 1.5) for xx in range(156, 520, 10)) + line(152, 236, 520, 236, INK, 2.5)
        walls += "".join(rect(xx, 246, 14, 14, "#C77A5B", 2, 2) + bush(xx + 7, 242, 7, "#5BB74E") for xx in (170, 300, 440, 480))
        walls += window(380, 288, 70, 50, cols=2, frame="#C48A4F", sill=False)
        L.append(("none", walls))
        L.append(("roof", rect(136, 150, 360, 18, "#D8D8D2", 2) + rect(140, 166, 352, 4, "#B9B9B2", 0, 0)))
        dr = rect(292, 284, 66, 76, "#C48A4F", 1) + rect(298, 290, 26, 70, GLASS, 1, 2) + rect(326, 290, 26, 70, GLASS, 1, 2)
        dr += rect(286, 360, 78, 6, "#B9B9B2", 1, 2)
        L.append(("door", dr))
        L.append(("garden", bush(560, 352, 18, "#5BB74E") + flax(540, 370)))
    else:
        floor_y = 262
        x0, x1 = 196, 420
        fnd = piles(x0 + 10, x1 - 10, floor_y + 6, ground_y, 36, 10)
        fnd += "".join(line(xx, floor_y + 10, xx + 36, ground_y(xx + 36) - 8, "#7E6145", 3) for xx in range(x0 + 46, x1 - 40, 72))
        fnd += rect(x0, floor_y, x1 - x0, 10, "#9C7B5A", 1, 2)
        fnd += piles(440, 500, floor_y + 6, ground_y, 60, 8)
        L.append(("foundation", fnd))
        walls = boards(x0, 172, x1 - x0, floor_y - 172, "#BFD8EA", "#A6C3D9")
        walls += window(214, 192, 70, 52, cols=2) + window(306, 192, 56, 52, cols=2)
        walls += rect(420, floor_y - 4, 90, 10, "#C9A27A", 1, 2)
        walls += "".join(line(xx, floor_y - 30, xx, floor_y - 4, "#FFFFFF", 4) for xx in range(428, 510, 14)) + line(424, floor_y - 30, 508, floor_y - 30, "#FFFFFF", 5)
        L.append(("none", walls))
        L.append(("roof", roof_iron([(x0 - 22, 176), (x0 + 30, 116), (x1 - 30, 116), (x1 + 22, 176)], "#C25B4A", "#A64A3B")))
        dr = door(376, 194, 32, floor_y - 194, "#F2B33D") + rect(368, floor_y - 2, 48, 8, "#C9A27A", 1, 2)
        L.append(("door", dr))
        steps = "".join(rect(506 + i * 10, floor_y + 8 + i * 18, 26, 8, "#C9A27A", 1, 2) for i in range(5))
        L.append(("none", steps))
        L.append(("garden", bush(540, 350, 14) + flax(250, 300, "#6A8F3A")))
    return L

houses.append(sprite("hillysides_house", hillside(False), dict(
    region="hillysides", tier="Standard", name="Hillside weatherboard home", price=560000, bedrooms=3, floorArea=100,
    built="1962", floorHeight=1.5, inspiredBy="Naenae hillside homes",
    blurb="Valley views from a house on timber piles, with a steep section behind.")))
houses.append(sprite("hillysides_house_lux", hillside(True), dict(
    region="hillysides", tier="Luxury", name="Glass-and-concrete hillside house", price=1250000, bedrooms=4, floorArea=210,
    built="2019", floorHeight=0.0, inspiredBy="Modern homes cut into Hutt hillsides",
    blurb="Two levels cut into the slope, with a glass pavilion and a wide terrace.")))

ZONES = {
    "roof":       dict(label="Roof",       maskColor=[255, 59, 48],  mods=["Solar panels"]),
    "door":       dict(label="Door",       maskColor=[255, 204, 0],  mods=["Seal doors", "Store food", "Sandbags at house"]),
    "garden":     dict(label="Garden",     maskColor=[52, 199, 89],  mods=["Retaining wall", "Soil nailing", "Planting trees", "Drainage", "Drainage over loose soil"]),
    "foundation": dict(label="Foundation", maskColor=[0, 122, 255],  mods=["Foundation improvement", "Elevate the house (stilts)"]),
}
json.dump(dict(houses=houses, zones=ZONES), open("/home/claude/map/houses.json", "w"), indent=2)
print(len(houses), "sprites")
