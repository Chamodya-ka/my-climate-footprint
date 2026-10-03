"""Backgrounds for the house close-up, normal and post-disaster, one pair per house (1600x1000, 16:10 like the game stage).
The house sprite sits centred at 94% of the stage height (its ground tile top lands at y~765, bottom at y~940).
Flood scenes also get a transparent foreground (<id>_post_fg.png) with water lapping in front of the sprite's ground tile.
Writes bg/<id>_normal.png, bg/<id>_post.png, bg/<id>_post_fg.png (flood only) and preview composites."""
import json, math, os, zlib
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

D = json.load(open("/home/claude/map/houses.json"))
OUT = "/home/claude/map/bg"; os.makedirs(OUT, exist_ok=True)
INK = "#4F463D"
BW, BH = 1600, 1000

def cloud(x, y, s, col, rr, outline=True):
    parts = [(0, 0, 1.0), (-0.9, 0.25, 0.7), (0.9, 0.25, 0.75), (-0.4, -0.35, 0.75), (0.45, -0.3, 0.7)]
    st = f'stroke="{INK}" stroke-width="3"' if outline else ""
    base = f'<rect x="{x - 1.4 * s}" y="{y + 0.1 * s}" width="{2.8 * s}" height="{0.6 * s}" rx="{0.3 * s}" fill="{col}" {st}/>'
    blobs = "".join(f'<circle cx="{x + dx * s}" cy="{y + dy * s}" r="{r * s * 0.62}" fill="{col}" {st}/>' for dx, dy, r in parts)
    cover = "".join(f'<circle cx="{x + dx * s}" cy="{y + dy * s}" r="{r * s * 0.62 - 3}" fill="{col}"/>' for dx, dy, r in parts)
    return base + blobs + cover + f'<rect x="{x - 1.4 * s + 3}" y="{y + 0.1 * s}" width="{2.8 * s - 6}" height="{0.6 * s - 3}" rx="{0.3 * s}" fill="{col}"/>'

def rain(rr, n=260, col="#DCE6F2", op=0.55):
    s = ""
    for _ in range(n):
        x, y = rr.uniform(-100, BW), rr.uniform(-40, BH)
        L = rr.uniform(26, 50)
        s += f'<line x1="{x:.0f}" y1="{y:.0f}" x2="{x + L * 0.35:.0f}" y2="{y + L:.0f}" stroke="{col}" stroke-width="2.5" stroke-linecap="round" opacity="{op}"/>'
    return s

def ridge(y0, amp, col, rr, n=9, outline=True, x0=-20, x1=BW + 20, bottom=BH):
    xs = np.linspace(x0, x1, n)
    ys = [y0 - amp * rr.uniform(0.2, 1.0) for _ in xs]
    d = f"M{x0} {bottom} L{xs[0]:.0f} {ys[0]:.0f}"
    for i in range(1, n):
        mx = (xs[i - 1] + xs[i]) / 2
        d += f" Q{mx:.0f} {min(ys[i - 1], ys[i]) - amp * 0.3:.0f} {xs[i]:.0f} {ys[i]:.0f}"
    d += f" L{x1} {bottom} Z"
    st = f'stroke="{INK}" stroke-width="3"' if outline else ""
    return f'<path d="{d}" fill="{col}" {st} stroke-linejoin="round"/>'

def snow_peaks(rr, y0, col="#B4B0D2", snow="#FFFFFF", dim=False):
    s = ""
    for cx in np.linspace(80, 1520, 6) + rr.uniform(-60, 60, 6):
        h = rr.uniform(110, 190); w = rr.uniform(220, 320)
        s += f'<polygon points="{cx - w / 2:.0f},{y0} {cx:.0f},{y0 - h:.0f} {cx + w / 2:.0f},{y0}" fill="{col}" stroke="{INK}" stroke-width="3" stroke-linejoin="round"/>'
        s += (f'<polygon points="{cx - w * 0.16:.0f},{y0 - h * 0.68:.0f} {cx:.0f},{y0 - h:.0f} {cx + w * 0.16:.0f},{y0 - h * 0.68:.0f} '
              f'{cx + w * 0.07:.0f},{y0 - h * 0.6:.0f} {cx - w * 0.02:.0f},{y0 - h * 0.7:.0f} {cx - w * 0.09:.0f},{y0 - h * 0.6:.0f}" fill="{snow}" stroke="{INK}" stroke-width="2.5" stroke-linejoin="round"/>')
    return s

def tree(x, y, r, col="#4FAE52"):
    return (f'<rect x="{x - r * 0.16}" y="{y - r * 0.4}" width="{r * 0.32}" height="{r * 0.9}" fill="#8C6440" stroke="{INK}" stroke-width="2.5"/>'
            f'<circle cx="{x}" cy="{y - r * 0.8}" r="{r}" fill="{col}" stroke="{INK}" stroke-width="3"/>')

def pohutukawa(x, y, s=1.0, bent=False):
    lean = 40 if bent else 0
    t = f'<path d="M{x} {y} q{-10 * s + lean * 0.3} {-60 * s} {lean * 0.8} {-120 * s}" stroke="#7A5638" stroke-width="{18 * s}" fill="none" stroke-linecap="round"/>'
    t += f'<path d="M{x} {y} q{-10 * s + lean * 0.3} {-60 * s} {lean * 0.8} {-120 * s}" stroke="{INK}" stroke-width="{2.5}" fill="none" opacity="0"/>'
    cx, cy = x + lean * 0.8, y - 150 * s
    for dx, dy, r in ((0, 0, 70), (-60, 20, 50), (60, 18, 52), (-25, -35, 48), (30, -32, 46)):
        t += f'<circle cx="{cx + (dx + lean * 0.4) * s}" cy="{cy + dy * s}" r="{r * s}" fill="#3F8E48" stroke="{INK}" stroke-width="3"/>'
    return t

def sky(top, bottom, horizon):
    return (f'<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{top}"/>'
            f'<stop offset="1" stop-color="{bottom}"/></linearGradient></defs><rect width="{BW}" height="{horizon}" fill="url(#sky)"/>')

def wave_band(y, amp, col, x0=-20, x1=BW + 20, step=60, bottom=BH, stroke=True):
    d = f"M{x0} {y}"
    for x in range(x0, x1, step):
        d += f" q{step / 4} {-amp} {step / 2} 0 q{step / 4} {amp} {step / 2} 0"
    d += f" L{x1} {bottom} L{x0} {bottom} Z"
    st = f'stroke="{INK}" stroke-width="3"' if stroke else ""
    return f'<path d="{d}" fill="{col}" {st}/>'

def plank_f(x, y, L, ang, col="#B9966E"):
    return (f'<g transform="rotate({ang} {x} {y})"><rect x="{x - L / 2}" y="{y - 7}" width="{L}" height="14" rx="3" fill="{col}" stroke="{INK}" stroke-width="2.5"/>'
            f'<line x1="{x - L / 2 + 8}" y1="{y}" x2="{x + L / 2 - 8}" y2="{y}" stroke="#8C6A48" stroke-width="2"/></g>')

# ------------------------------------------------------------------ scenes
def coastal(rr, post, h=None):
    s = sky("#55606E", "#8E99A6", 600) if post else sky("#8FD3F0", "#DDF4FB", 600)
    if not post:
        s += '<circle cx="1330" cy="150" r="70" fill="#FFF3B0" opacity="0.5"/><circle cx="1330" cy="150" r="48" fill="#FFE27A" stroke="#4F463D" stroke-width="3"/>'
    for _ in range(4 if not post else 9):
        s += cloud(rr.uniform(100, 1500), rr.uniform(70, 330), rr.uniform(50, 90) * (1.4 if post else 1),
                   ("#6F7987" if rr.random() < 0.5 else "#5E6875") if post else "#FFFFFF", rr)
    s += ridge(600, 110, "#7E9A8E" if post else "#9CC8B5", rr, 6, True, -20, 640, 610)
    s += f'<path d="M1180 610 Q1300 470 1460 500 Q1560 520 1620 560 L1620 610 Z" fill="{"#6E8A78" if post else "#8DBF9F"}" stroke="{INK}" stroke-width="3"/>'
    sea_top, sea_bot = ("#3E7487", "#5E8E9C") if post else ("#45BDE3", "#8EE0EE")
    s += (f'<defs><linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{sea_top}"/><stop offset="1" stop-color="{sea_bot}"/></linearGradient></defs>'
          f'<rect x="0" y="600" width="{BW}" height="240" fill="url(#sea)" stroke="{INK}" stroke-width="3"/>')
    if post:
        for row, y in enumerate((640, 690, 745)):
            s += wave_band(y, 26 + row * 8, "#4E8494" if row % 2 else "#5B95A5", -60 + row * 30, BW + 60, 120 + row * 20, 840)
            for x in range(-40 + row * 50, BW, 160):
                s += f'<path d="M{x} {y - 2} q30 -26 60 0" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" opacity="0.9"/>'
        s += wave_band(770, 16, "#8C9A94", -20, BW + 20, 90)                       # surge across the beach
        for x in range(0, BW, 140):
            s += f'<path d="M{x} {800 + (x % 3) * 18} q35 -10 70 0" fill="none" stroke="#E8EEF0" stroke-width="4" stroke-linecap="round"/>'
        s += plank_f(260, 880, 120, -12) + plank_f(1380, 860, 100, 18) + plank_f(1250, 940, 140, -6, "#A88560")
        s += pohutukawa(110, 830, 1.05, bent=True)
        s += rain(rr)
        s += '<polyline points="1460,120 1430,200 1455,200 1420,290" fill="none" stroke="#FFE27A" stroke-width="7" stroke-linejoin="round"/>'
    else:
        for _ in range(14):
            x, y = rr.uniform(0, BW), rr.uniform(620, 820)
            s += f'<path d="M{x:.0f} {y:.0f} q12 -8 24 0 q12 8 24 0" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" opacity="0.8"/>'
        s += ('<g transform="translate(1040 640)"><polygon points="0,0 40,0 34,12 6,12" fill="#FFFFFF" stroke="#4F463D" stroke-width="3"/>'
              '<line x1="20" y1="0" x2="20" y2="-50" stroke="#4F463D" stroke-width="3"/><polygon points="22,-48 22,-6 46,-6" fill="#F5A23A" stroke="#4F463D" stroke-width="3"/></g>')
        s += f'<path d="M-20 820 Q400 790 800 805 Q1200 820 1620 795 L1620 1000 L-20 1000 Z" fill="#F3DFA2" stroke="{INK}" stroke-width="3"/>'
        s += '<path d="M-20 828 Q400 800 800 815 Q1200 828 1620 805" fill="none" stroke="#E2C98A" stroke-width="8"/>'
        for x in (60, 230, 1400, 1530):
            s += "".join(f'<path d="M{x + dx} 900 q{dx * 0.6} -30 {dx * 1.2} -48" fill="none" stroke="#7BAA4A" stroke-width="5" stroke-linecap="round"/>' for dx in (-14, -6, 2, 10, 18))
        s += pohutukawa(110, 840, 1.05)
    return s

def city_block(x, base, w, h, col, rr, roof=True):
    s = f'<rect x="{x:.0f}" y="{base - h:.0f}" width="{w:.0f}" height="{h:.0f}" fill="{col}" stroke="{INK}" stroke-width="3"/>'
    cols = max(2, int(w // 26))
    for wy in range(int(base - h + 16), int(base - 14), 24):
        for c in range(cols):
            wx = x + 10 + c * (w - 20) / cols
            lit = "#FFF1B8" if rr.random() < 0.12 else "#DDEBF6"
            s += f'<rect x="{wx:.0f}" y="{wy}" width="{max(8, (w - 20) / cols - 8):.0f}" height="12" fill="{lit}" stroke="{INK}" stroke-width="1.5"/>'
    if roof and rr.random() < 0.5:
        s += f'<rect x="{x + w * 0.2:.0f}" y="{base - h - 14:.0f}" width="{w * 0.3:.0f}" height="14" fill="#8E98AB" stroke="{INK}" stroke-width="2.5"/>'
    return s

def street_house(x, base, w, h, wall, roof, two_storey=False):
    """Front of a neighbouring house, drawn at ground level so the edges of the stage feel like a street."""
    s = ""
    if two_storey:
        s += f'<rect x="{x}" y="{base - h}" width="{w}" height="{h}" fill="{wall}" stroke="{INK}" stroke-width="3"/>'
        s += f'<polygon points="{x - 14},{base - h + 4} {x + w / 2},{base - h - w * 0.42} {x + w + 14},{base - h + 4}" fill="{roof}" stroke="{INK}" stroke-width="3"/>'
        for wy in (base - h + 26, base - h / 2 + 10):
            s += f'<rect x="{x + 22}" y="{wy:.0f}" width="{w * 0.3:.0f}" height="{h * 0.22:.0f}" fill="#BFE6F5" stroke="{INK}" stroke-width="2.5"/>'
            s += f'<rect x="{x + w * 0.58:.0f}" y="{wy:.0f}" width="{w * 0.3:.0f}" height="{h * 0.22:.0f}" fill="#BFE6F5" stroke="{INK}" stroke-width="2.5"/>'
    else:
        s += f'<rect x="{x}" y="{base - h}" width="{w}" height="{h}" fill="{wall}" stroke="{INK}" stroke-width="3"/>'
        s += f'<polygon points="{x - 18},{base - h + 4} {x + w * 0.25},{base - h - 70} {x + w * 0.75},{base - h - 70} {x + w + 18},{base - h + 4}" fill="{roof}" stroke="{INK}" stroke-width="3"/>'
        s += f'<rect x="{x + 24}" y="{base - h + 26}" width="{w * 0.32:.0f}" height="{h * 0.4:.0f}" fill="#BFE6F5" stroke="{INK}" stroke-width="2.5"/>'
        s += f'<rect x="{x + w * 0.6:.0f}" y="{base - h + 26}" width="{w * 0.28:.0f}" height="{h * 0.4:.0f}" fill="#BFE6F5" stroke="{INK}" stroke-width="2.5"/>'
    s += f'<rect x="{x + w * 0.42:.0f}" y="{base - h * 0.42:.0f}" width="{w * 0.14:.0f}" height="{h * 0.42:.0f}" fill="#3B3B3F" stroke="{INK}" stroke-width="2.5"/>'
    return s

def power_pole(x, base, h=330):
    return (f'<rect x="{x - 7}" y="{base - h}" width="14" height="{h}" fill="#9C7B5A" stroke="{INK}" stroke-width="3"/>'
            f'<rect x="{x - 44}" y="{base - h + 18}" width="88" height="10" fill="#9C7B5A" stroke="{INK}" stroke-width="2.5"/>'
            + "".join(f'<circle cx="{x + dx}" cy="{base - h + 14}" r="5" fill="#E8EEF0" stroke="{INK}" stroke-width="2"/>' for dx in (-34, 0, 34)))

def car(x, y, col):
    return (f'<g transform="translate({x} {y})"><rect x="0" y="-30" width="170" height="38" rx="14" fill="{col}" stroke="{INK}" stroke-width="3"/>'
            f'<path d="M28 -30 L50 -62 L118 -62 L140 -30 Z" fill="{col}" stroke="{INK}" stroke-width="3"/>'
            f'<path d="M56 -56 L80 -56 L80 -32 L44 -32 Z" fill="#BFE6F5" stroke="{INK}" stroke-width="2"/><path d="M88 -56 L112 -56 L126 -32 L88 -32 Z" fill="#BFE6F5" stroke="{INK}" stroke-width="2"/>'
            f'<circle cx="40" cy="8" r="17" fill="#3B3B3F" stroke="{INK}" stroke-width="3"/><circle cx="130" cy="8" r="17" fill="#3B3B3F" stroke="{INK}" stroke-width="3"/></g>')

def wheelie_bin(x, y, ang, col="#2F8A3E"):
    return (f'<g transform="rotate({ang} {x} {y})"><rect x="{x - 26}" y="{y - 60}" width="52" height="64" rx="5" fill="{col}" stroke="{INK}" stroke-width="3"/>'
            f'<rect x="{x - 30}" y="{y - 70}" width="60" height="12" rx="3" fill="#E5394B" stroke="{INK}" stroke-width="3"/></g>')

def riverside(rr, post, h=None):
    dense = h is not None and "townhouse" in h["id"]          # townhouses sit in the town centre, bungalows in the suburbs
    s = sky("#5B6673", "#9AA4B0", 760) if post else sky("#93D4F0", "#E2F5FB", 760)
    for _ in range(3 if not post else 8):
        s += cloud(rr.uniform(100, 1500), rr.uniform(50, 220), rr.uniform(45, 75) * (1.4 if post else 1),
                   ("#6F7987" if rr.random() < 0.5 else "#5E6875") if post else "#FFFFFF", rr)
    s += ridge(470, 70, "#5E7F62" if post else "#6FA86A", rr, 8, True, -20, BW + 20, 760)      # bush-clad Hutt hills
    s += ridge(520, 40, "#4F7353" if post else "#5B9A58", rr, 10, True, -20, BW + 20, 760)
    # town centre: mid-rise buildings across the whole width, taller in the town-centre version
    x = -30
    while x < BW + 20:
        w = rr.uniform(90, 150); hh = rr.uniform(170, 330) if dense else rr.uniform(90, 200)
        col = ("#B6BDC9", "#C9B9A6", "#A9B8C9", "#D6CFC2", "#9AA3B2")[rr.integers(5)]
        if post:
            col = "#9AA0A8"
        s += city_block(x, 720, w, hh, col, rr)
        x += w + rr.uniform(-10, 18)
    for _ in range(18):                                           # street trees between the buildings
        tx = rr.uniform(0, BW)
        s += f'<circle cx="{tx:.0f}" cy="{rr.uniform(690, 715):.0f}" r="{rr.uniform(16, 26):.0f}" fill="{"#4C8A48" if post else "#4FA64B"}" stroke="{INK}" stroke-width="2.5"/>'
    # stopbank and river glimpse
    s += f'<path d="M-20 760 Q800 712 1620 760 L1620 790 L-20 790 Z" fill="{"#6F9A62" if post else "#8FD85F"}" stroke="{INK}" stroke-width="3"/>'
    s += f'<rect x="-20" y="726" width="{BW + 40}" height="0" fill="none"/>'
    # ground, footpath, road
    s += f'<rect x="-20" y="780" width="{BW + 40}" height="140" fill="#A8E06A" stroke="{INK}" stroke-width="3"/>'
    s += f'<rect x="-20" y="912" width="{BW + 40}" height="30" fill="#D7D4CE" stroke="{INK}" stroke-width="3"/>'
    s += f'<rect x="-20" y="942" width="{BW + 40}" height="80" fill="#8E939C" stroke="{INK}" stroke-width="3"/>'
    s += "".join(f'<rect x="{x}" y="968" width="50" height="7" fill="#F5C542"/>' for x in range(0, BW, 110))
    # neighbours on both sides, so the house sits in a street
    walls = ["#F6EBD6", "#D9E7F2", "#F2D9D0", "#E3E8D5"]; roofs = ["#A65B42", "#565C69", "#8E98AB", "#C25B4A"]
    s += street_house(-110, 900, 270, 170 if not dense else 250, walls[rr.integers(4)], roofs[rr.integers(4)], dense)
    s += street_house(1440, 900, 270, 170 if not dense else 250, walls[rr.integers(4)], roofs[rr.integers(4)], dense)
    s += f'<rect x="-20" y="896" width="{BW + 40}" height="16" fill="#C9A27A" stroke="{INK}" stroke-width="2.5" opacity="0"/>'
    # power poles and sagging lines across the street (very Lower Hutt)
    s += power_pole(170, 930) + power_pole(1430, 930)
    for dy in (-34, 0, 34):
        s += f'<path d="M{170 + dy} 614 Q800 690 {1430 + dy} 614" fill="none" stroke="#3B3B3F" stroke-width="2.5"/>'
        s += f'<path d="M-20 600 Q80 640 {170 + dy} 614" fill="none" stroke="#3B3B3F" stroke-width="2.5"/>'
        s += f'<path d="M{1430 + dy} 614 Q1520 640 1620 600" fill="none" stroke="#3B3B3F" stroke-width="2.5"/>'
    if post:
        s += wave_band(800, 10, "#8E7B60", -20, BW + 20, 100)                    # floodwater fills the street
        for x in range(0, BW, 120):
            s += f'<path d="M{x} {840 + (x % 4) * 30} q30 -8 60 0" fill="none" stroke="#C9B89A" stroke-width="4" stroke-linecap="round"/>'
        s += car(1440, 905, "#E5566B") + wave_band(884, 8, "#8E7B60", 1400, 1640, 70)
        s += wheelie_bin(90, 905, -22) + wheelie_bin(1540, 868, 28, "#3A6FB0")
        s += plank_f(250, 940, 120, 10, "#9C7B5A") + plank_f(1330, 955, 90, -16, "#9C7B5A")
        s += rain(rr)
    else:
        s += car(1450, 965, "#3A9EF5")
        s += tree(60, 905, 40) + wheelie_bin(260, 912, 0)
    return s

def hillysides(rr, post, h=None):
    s = sky("#56606C", "#949FAB", 620) if post else sky("#8FD3F0", "#E1F5FB", 620)
    for _ in range(4 if not post else 9):
        s += cloud(rr.uniform(400, 1550), rr.uniform(60, 260), rr.uniform(50, 85) * (1.4 if post else 1),
                   ("#6F7987" if rr.random() < 0.5 else "#5E6875") if post else "#FFFFFF", rr)
    s += snow_peaks(rr, 520, "#9C98B8" if post else "#B4B0D2", "#E4E8F0" if post else "#FFFFFF")
    s += ridge(560, 60, "#5E9A55" if post else "#8FD85F", rr, 8, True, 500, BW + 20, 760)
    for i in range(12):                                          # little town far below in the valley
        x = 860 + i * 52 + rr.uniform(-6, 6); h = rr.uniform(26, 60)
        s += f'<rect x="{x:.0f}" y="{690 - h:.0f}" width="34" height="{h:.0f}" fill="{("#9AA3B2", "#C9B9A6", "#B6BDC9")[i % 3]}" stroke="{INK}" stroke-width="2"/>'
    s += f'<path d="M820 712 Q1100 700 1620 716" fill="none" stroke="{"#8B7355" if post else "#4CC3F0"}" stroke-width="12"/>'
    hill = "M-20 1000 L-20 380 Q260 380 420 470 Q640 600 900 700 Q1150 790 1620 820 L1620 1000 Z"
    s += f'<path d="{hill}" fill="{"#5E9A55" if post else "#6CC04F"}" stroke="{INK}" stroke-width="3"/>'
    for _ in range(40):
        x = rr.uniform(0, 1300); ytop = 380 + max(0, (x - 0) * 0.33) + (x > 420) * (x - 420) * 0.12
        y = rr.uniform(ytop + 30, ytop + 200)
        if y < 980:
            s += f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{rr.uniform(12, 20):.0f}" fill="{"#4C8A48" if post else "#4FA64B"}" stroke="{INK}" stroke-width="2.5"/>'
    if post:
        for x0, w, L in ((140, 120, 360), (520, 100, 280), (1180, 140, 230)):
            y0 = 380 + x0 * 0.3 + (x0 > 420) * (x0 - 420) * 0.15
            s += (f'<path d="M{x0} {y0} q{w * 0.5} -20 {w} 6 q{-10} {L * 0.5} {w * 0.4} {L} q{-w * 0.7} 20 {-w * 1.2} -4 q{20} {-L * 0.5} {-w * 0.2} {-L} Z" '
                  f'fill="#B8794A" stroke="{INK}" stroke-width="3"/>')
            s += f'<path d="M{x0 + 10} {y0 + 4} q{w * 0.4} -16 {w * 0.8} 4" fill="none" stroke="#3B2A1E" stroke-width="4"/>'
            for _ in range(8):
                s += f'<circle cx="{x0 + rr.uniform(0, w):.0f}" cy="{y0 + rr.uniform(20, L):.0f}" r="{rr.uniform(4, 9):.0f}" fill="#8A7F72" stroke="{INK}" stroke-width="2"/>'
        s += f'<path d="M-20 960 Q400 930 800 950 Q1200 970 1620 940 L1620 1000 L-20 1000 Z" fill="#8A5A35" stroke="{INK}" stroke-width="3"/>'
        s += rain(rr)
    return s

def foreground(rr, kind):
    col = "#8C9A94" if kind == "coastal" else "#8E7B60"
    foam = "#E8EEF0" if kind == "coastal" else "#C9B89A"
    s = wave_band(880, 12, col, -20, BW + 20, 110)
    for x in range(-20, BW, 110):
        s += f'<path d="M{x} 880 q27 -12 55 0" fill="none" stroke="{foam}" stroke-width="5" stroke-linecap="round"/>'
    s += plank_f(470, 950, 130, 8, "#B9966E" if kind == "coastal" else "#9C7B5A")
    s += plank_f(1150, 935, 100, -14, "#A88560")
    s = f'<g opacity="0.92">{s}</g>'
    return s

SCENES = {"coastal": coastal, "riverside": riverside, "hillysides": hillysides}

def svg(body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {BW} {BH}" width="{BW}" height="{BH}" stroke-linejoin="round">{body}</svg>'

with sync_playwright() as p:
    br = p.chromium.launch(); pg = br.new_page(viewport={"width": BW, "height": BH})
    def render(body, path, transparent=False):
        pg.set_content(f"<html><body style='margin:0;background:transparent'>{svg(body)}</body></html>")
        pg.locator("svg").screenshot(path=path, omit_background=transparent)
    for h in D["houses"]:
        seed = zlib.crc32(h["id"].encode())
        scene = SCENES[h["region"]]
        render(scene(np.random.default_rng(seed), False, h), f"{OUT}/{h['id']}_normal.png")
        render(scene(np.random.default_rng(seed), True, h), f"{OUT}/{h['id']}_post.png")
        bgs = dict(normal=f"bg/{h['id']}_normal.png", post=f"bg/{h['id']}_post.png")
        if h["region"] != "hillysides":
            render(foreground(np.random.default_rng(seed + 1), h["region"]), f"{OUT}/{h['id']}_post_fg.png", True)
            bgs["postForeground"] = f"bg/{h['id']}_post_fg.png"
        h["backgrounds"] = bgs
    br.close()
json.dump(D, open("/home/claude/map/houses.json", "w"), indent=2)

# preview composites: sprite centred at 94% of the stage height, as in the game
def place(bg, sprite_path):
    sp = Image.open(sprite_path).convert("RGBA")
    sh = int(BH * 0.94); sw = int(sh * 4 / 3)
    sp = sp.resize((sw, sh), Image.LANCZOS)
    bg.alpha_composite(sp, ((BW - sw) // 2, (BH - sh) // 2))
    return bg
for h in D["houses"]:
    a = place(Image.open(f"{OUT}/{h['id']}_normal.png").convert("RGBA"), f"/home/claude/map/sprites/{h['id']}.png")
    b = place(Image.open(f"{OUT}/{h['id']}_post.png").convert("RGBA"), f"/home/claude/map/sprites/{h['id']}_dmg2.png")
    if "postForeground" in h["backgrounds"]:
        b.alpha_composite(Image.open(f"{OUT}/{h['id']}_post_fg.png").convert("RGBA"))
    pair = Image.new("RGBA", (BW * 2 + 20, BH), (255, 255, 255, 255))
    pair.paste(a, (0, 0)); pair.paste(b, (BW + 20, 0))
    pair.convert("RGB").resize((1620, 500), Image.LANCZOS).save(f"{OUT}/preview_{h['id']}.png")
print("ok")
