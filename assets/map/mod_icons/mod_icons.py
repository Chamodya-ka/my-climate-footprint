"""Plus marker + one icon per modification, same style as the HUD icons. Writes icons/mods/*.svg and mods.json."""
import json, math, os
OUT = "/home/claude/map/icons/mods"
os.makedirs(OUT, exist_ok=True)
INK = "#4F463D"
SOIL, SOIL_D, GRASS, GRASS_D = "#C79566", "#A97A4E", "#8FD85F", "#6CC04F"
WATER, WATER_L, CONC = "#3A9EF5", "#9FDDF2", "#B8BEC8"
SW = 4.5

def P(pts, fill, sw=SW, extra=""):
    return f'<polygon points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in pts)}" fill="{fill}" stroke="{INK}" stroke-width="{sw}" {extra}/>'
def R(x, y, w, h, fill, rx=3, sw=SW, extra=""):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{INK}" stroke-width="{sw}" {extra}/>'
def C(cx, cy, r, fill, sw=SW):
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}" stroke="{INK}" stroke-width="{sw}"/>'
def L(x1, y1, x2, y2, col=INK, sw=SW):
    return f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{col}" stroke-width="{sw}"/>'
def shadow(rx=38):
    return f'<ellipse cx="64" cy="115" rx="{rx}" ry="5.5" fill="#23384D" opacity="0.18"/>'
def drop(cx, cy, s=1.0):
    return (f'<path d="M{cx} {cy - 11 * s} C{cx + 2 * s} {cy - 6 * s} {cx + 8 * s} {cy - 1 * s} {cx + 8 * s} {cy + 4 * s} '
            f'A{8 * s} {8 * s} 0 0 1 {cx - 8 * s} {cy + 4 * s} C{cx - 8 * s} {cy - 1 * s} {cx - 2 * s} {cy - 6 * s} {cx} {cy - 11 * s} Z" '
            f'fill="{WATER}" stroke="{INK}" stroke-width="{3.5 * s:.1f}"/>'
            f'<ellipse cx="{cx - 3 * s}" cy="{cy + 2 * s}" rx="{1.8 * s}" ry="{3 * s}" fill="#FFFFFF" opacity="0.8"/>')
def waves(y, x0=8, x1=120, fill=WATER_L):
    d = f"M{x0} {y}"
    for x in range(x0, x1, 16):
        d += f" q4 -5 8 0 q4 5 8 0"
    d += f" L{x1} 112 L{x0} 112 Z"
    return f'<path d="{d}" fill="{fill}" stroke="{INK}" stroke-width="{SW}"/>'
def wrap(body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128" '
            f'stroke-linejoin="round" stroke-linecap="round">{body}</svg>')

icons = {}

# ---- plus marker (where a modification can go)
icons["plus"] = (f'<ellipse cx="64" cy="112" rx="30" ry="5" fill="#23384D" opacity="0.2"/>'
                 + C(64, 62, 42, "#2DB54F", 5)
                 + '<path d="M36 46 A32 32 0 0 1 60 28" fill="none" stroke="#9BE7AE" stroke-width="6"/>'
                 + P([(55, 36), (73, 36), (73, 53), (90, 53), (90, 71), (73, 71), (73, 88), (55, 88), (55, 71), (38, 71), (38, 53), (55, 53)], "#FFFFFF", 4.5))

# ---- solar panels (roof)
corners = [(16, 62), (82, 42), (110, 80), (44, 100)]
def lerp(a, b, t): return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
grid = ""
for t in (1 / 3, 2 / 3):
    p, q = lerp(corners[0], corners[1], t), lerp(corners[3], corners[2], t)
    grid += L(*p, *q, "#9FC3F0", 2.5)
p, q = lerp(corners[0], corners[3], 0.5), lerp(corners[1], corners[2], 0.5)
grid += L(*p, *q, "#9FC3F0", 2.5)
icons["solar_panels"] = (shadow(34) + R(58, 96, 12, 16, "#8E98AB", 2) + R(44, 108, 40, 6, "#8E98AB", 3)
                         + C(100, 24, 12, "#F5C542")
                         + "".join(L(100 + 17 * math.cos(math.radians(a)), 24 + 17 * math.sin(math.radians(a)),
                                     100 + 23 * math.cos(math.radians(a)), 24 + 23 * math.sin(math.radians(a)), "#E0A92E", 4)
                                   for a in range(0, 360, 45))
                         + P(corners, "#2F5DA8", 5) + grid
                         + L(30, 64, 58, 56, "#CFE2FA", 3.5))

# ---- seal doors (door)
icons["seal_doors"] = (shadow() + R(34, 14, 60, 96, "#FFFFFF", 3) + R(41, 21, 46, 89, "#C98B55", 2)
                       + R(47, 28, 34, 26, "#E2B17E", 2, 3) + C(79, 66, 3.5, "#F5C542", 2.5)
                       + waves(100, 8, 120)
                       + R(26, 72, 76, 32, WATER, 5) + R(26, 72, 76, 9, "#2C7FCC", 4, 3)
                       + "".join(C(x, y, 3.2, "#E4EAF2", 2.5) for x, y in ((33, 92), (95, 92), (33, 77), (95, 77))))

# ---- store food (door)
icons["store_food"] = (shadow(40)
                       + R(30, 36, 20, 32, "#E5566B", 4) + R(30, 44, 20, 12, "#FFFFFF", 0, 3)
                       + R(56, 20, 18, 48, WATER_L, 6) + R(59, 13, 12, 9, "#3A9EF5", 3, 3) + L(60, 34, 60, 58, "#FFFFFF", 3)
                       + R(80, 40, 20, 28, "#5BB74E", 4) + R(80, 48, 20, 10, "#F5E9C9", 0, 3)
                       + P([(18, 62), (30, 52), (98, 52), (110, 62)], "#E4B37A")
                       + R(18, 62, 92, 48, "#D9A066", 4) + R(56, 62, 16, 48, "#EBC995", 0, 3)
                       + L(28, 100, 46, 100, "#B9834F", 3))

# ---- sandbags (door)
def sack(x, y, w=50, h=28):
    return (R(x, y, w, h, "#D8B77A", 13)
            + P([(x - 6, y + h / 2 - 7), (x + 4, y + h / 2), (x - 6, y + h / 2 + 7)], "#B8945A", 3.5)
            + P([(x + w + 6, y + h / 2 - 7), (x + w - 4, y + h / 2), (x + w + 6, y + h / 2 + 7)], "#B8945A", 3.5)
            + L(x + 14, y + 9, x + w - 14, y + 9, "#EBD3A3", 3))
icons["sandbags"] = shadow(46) + sack(14, 80) + sack(64, 80) + sack(39, 52) + sack(39, 24, 50, 28).replace("#D8B77A", "#E2C48A")

# ---- retaining wall (garden)
blocks = ""
for row in range(4):
    y = 44 + row * 16
    off = 0 if row % 2 == 0 else 6
    for col in range(2):
        blocks += R(64 + off * (col == 0) + col * 14 - (6 if row % 2 and col == 1 else 0), y, 14 + (0 if row % 2 else 0), 16, "#A9AEB8" if (row + col) % 2 else "#BEC3CC", 2, 3)
icons["retaining_wall"] = (shadow(48)
                           + P([(10, 44), (64, 44), (64, 108), (10, 108)], SOIL)
                           + "".join(C(x, y, 3, SOIL_D, 2.5) for x, y in ((24, 66), (44, 82), (30, 96), (52, 60)))
                           + P([(8, 38), (66, 38), (66, 48), (8, 48)], GRASS, 4)
                           + R(62, 40, 32, 68, "#BEC3CC", 3)
                           + "".join(L(62, y, 94, y, INK, 3) for y in (57, 74, 91))
                           + L(78, 40, 78, 57, INK, 3) + L(70, 57, 70, 74, INK, 3) + L(86, 57, 86, 74, INK, 3)
                           + L(78, 74, 78, 91, INK, 3) + L(70, 91, 70, 108, INK, 3) + L(86, 91, 86, 108, INK, 3)
                           + P([(94, 100), (122, 100), (122, 110), (94, 110)], GRASS, 4))

# ---- soil nailing (garden)
A_, B_ = (10, 26), (118, 108)
slope = P([(10, 108), A_, B_], SOIL) + L(*A_, *B_, GRASS_D, 9) + L(*A_, *B_, INK, 3)
dvec = (B_[0] - A_[0], B_[1] - A_[1]); n = math.hypot(*dvec); d = (dvec[0] / n, dvec[1] / n)
inward = (-0.9, 0.45); m = math.hypot(*inward); inward = (inward[0] / m, inward[1] / m)
nails = ""
for t in (0.3, 0.55, 0.8):
    p = (A_[0] + dvec[0] * t, A_[1] + dvec[1] * t)
    q = (p[0] + inward[0] * 46, p[1] + inward[1] * 46)
    nails += L(*p, *q, INK, 8) + L(*p, *q, "#C9CFD8", 4)
    ang = math.degrees(math.atan2(d[1], d[0]))
    nails += f'<rect x="{p[0] - 8:.1f}" y="{p[1] - 4:.1f}" width="16" height="8" rx="2" fill="#6E7787" stroke="{INK}" stroke-width="3" transform="rotate({ang:.1f} {p[0]:.1f} {p[1]:.1f})"/>'
icons["soil_nailing"] = shadow(50) + slope + "".join(C(x, y, 3, SOIL_D, 2.5) for x, y in ((22, 60), (30, 94), (60, 100))) + nails

# ---- planting trees (garden)
def leaf(cx, cy, rot, s=1.0):
    return f'<ellipse cx="{cx}" cy="{cy}" rx="{13 * s}" ry="{7 * s}" fill="#5BB74E" stroke="{INK}" stroke-width="3.5" transform="rotate({rot} {cx} {cy})"/>'
icons["planting_trees"] = (shadow(42)
                           + '<path d="M22 108 Q64 84 106 108 Z" fill="#C79566" stroke="#4F463D" stroke-width="4.5"/>'
                           + '<path d="M60 98 C 58 80, 62 62, 60 44" fill="none" stroke="#8C6440" stroke-width="7"/>'
                           + '<path d="M60 98 C 58 80, 62 62, 60 44" fill="none" stroke="#4F463D" stroke-width="2" opacity="0"/>'
                           + leaf(46, 72, -30) + leaf(74, 64, 25) + leaf(48, 50, -40, 0.9) + leaf(72, 42, 35, 0.9) + leaf(60, 30, 90, 0.85)
                           + R(92, 64, 8, 22, "#C98B55", 3, 3.5) + P([(87, 86), (105, 86), (100, 104), (92, 104)], "#B8C4D6", 3.5))

# ---- drainage (garden): grate with water draining in
icons["drainage"] = (shadow(44) + drop(40, 26) + drop(64, 16, 1.1) + drop(88, 28)
                     + R(22, 54, 84, 54, "#8E98AB", 8)
                     + "".join(R(34 + i * 16, 64, 8, 34, "#3D4352", 3, 2.5) for i in range(4))
                     + '<path d="M26 108 Q 64 118 102 108" fill="none" stroke="#7EDCEB" stroke-width="4"/>')

# ---- drainage over loose soil (garden): perforated pipe inside a slope
A2, B2 = (10, 30), (118, 100)
pipe_a, pipe_b = (24, 56), (112, 108)
holes = "".join(C(pipe_a[0] + (pipe_b[0] - pipe_a[0]) * t, pipe_a[1] + (pipe_b[1] - pipe_a[1]) * t, 2.2, "#3D4352", 0) for t in (0.15, 0.3, 0.45, 0.6, 0.75))
icons["drainage_loose_soil"] = (shadow(50) + P([(10, 110), A2, B2, (118, 110)], SOIL)
                                + "".join(C(x, y, 3, SOIL_D, 2.5) for x, y in ((20, 92), (46, 98), (24, 70)))
                                + L(*A2, *B2, GRASS_D, 9) + L(*A2, *B2, INK, 3)
                                + L(*pipe_a, *pipe_b, INK, 14) + L(*pipe_a, *pipe_b, "#E4EAF2", 9) + holes
                                + drop(34, 18, 0.75) + drop(58, 30, 0.75) + drop(82, 46, 0.75)
                                + '<path d="M112 108 q6 2 8 8" fill="none" stroke="#3A9EF5" stroke-width="6"/>')

# ---- foundation improvement (foundation)
icons["foundation_improvement"] = (shadow(48)
                                   + P([(26, 42), (64, 14), (102, 42)], "#E5675A")
                                   + R(32, 42, 64, 34, "#F6EBD6", 2) + R(42, 50, 16, 14, "#BFE6F5", 2, 3) + R(70, 54, 14, 22, "#2E6F73", 2, 3)
                                   + R(14, 76, 100, 30, CONC, 4)
                                   + "".join(L(x, 84, x + 12, 84, "#7E8696", 3) for x in range(22, 104, 20))
                                   + "".join(L(x, 96, x + 12, 96, "#7E8696", 3) for x in range(30, 104, 20))
                                   + C(24, 80, 0.1, CONC, 0)
                                   + "".join(R(x, 70, 6, 12, "#6E7787", 2, 2.5) + R(x - 3, 68, 12, 4, "#6E7787", 1, 2.5) for x in (24, 98)))

# ---- elevate the house (foundation): house up on stilts above water
icons["elevate_house"] = (waves(94)
                          + "".join(R(x, 62, 8, 46, "#9C7B5A", 2, 3.5) for x in (32, 60, 88))
                          + L(36, 70, 64, 96, "#7E6145", 3.5) + L(92, 70, 64, 96, "#7E6145", 3.5)
                          + R(22, 58, 84, 7, "#C9A27A", 2, 3.5)
                          + P([(20, 36), (64, 10), (108, 36)], "#E5675A")
                          + R(28, 36, 72, 24, "#BFD8EA", 2) + R(38, 42, 16, 12, "#FFFFFF", 2, 3) + R(72, 40, 12, 20, "#F2B33D", 2, 3)
                          + '<path d="M112 22 L112 50 M104 30 L112 22 L120 30" fill="none" stroke="#2DB54F" stroke-width="6"/>')

for k, body in icons.items():
    open(f"{OUT}/{k}.svg", "w").write(wrap(body))

MODS = [  # mirrors the CLAUDE.md table; footprint and costs still placeholders
    dict(id="solar_panels", name="Solar panels", zone="roof", flood=0, landslide=0, type="Permanent", note="Cuts the neighbourhood footprint"),
    dict(id="seal_doors", name="Seal doors", zone="door", flood=-20, landslide=0, type="Permanent"),
    dict(id="store_food", name="Store food", zone="door", flood=-5, landslide=-5, type="Consumable"),
    dict(id="sandbags", name="Sandbags at house", zone="door", flood=-5, landslide=0, type="Consumable"),
    dict(id="retaining_wall", name="Retaining wall", zone="garden", flood=0, landslide=-50, type="Permanent"),
    dict(id="soil_nailing", name="Soil nailing", zone="garden", flood=0, landslide=-20, type="Permanent"),
    dict(id="planting_trees", name="Planting trees", zone="garden", flood=0, landslide=-10, type="Permanent", note="Also cuts the footprint"),
    dict(id="drainage", name="Drainage", zone="garden", flood=-15, landslide=0, type="Permanent"),
    dict(id="drainage_loose_soil", name="Drainage over loose soil", zone="garden", flood=0, landslide=-5, type="Permanent"),
    dict(id="foundation_improvement", name="Foundation improvement", zone="foundation", flood=-15, landslide=0, type="Permanent"),
    dict(id="elevate_house", name="Elevate the house (stilts)", zone="foundation", flood=-30, landslide=0, type="Permanent"),
]
for m in MODS:
    m["icon"] = f"icons/mods/{m['id']}.svg"; m["actionCost"] = 1; m["cost"] = None
json.dump(dict(plusIcon="icons/mods/plus.svg", mods=MODS), open("/home/claude/map/mods.json", "w"), indent=2)
print(len(icons), "icons")
