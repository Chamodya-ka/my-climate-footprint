"""Render svg/*.svg into sprites/<id>.png (2x, transparent) and sprites/<id>_zones.png (zone colour mask, same size)."""
import json, os
from playwright.sync_api import sync_playwright

D = json.load(open("/home/claude/map/houses.json"))
os.makedirs("/home/claude/map/sprites", exist_ok=True)

def mask_css():
    css = "svg.mask *{shape-rendering:crispEdges!important;opacity:1!important;fill-opacity:1!important}"
    css += 'svg.mask [data-zone="none"] *{fill:#000!important;stroke:#000!important}'
    for z, info in D["zones"].items():
        r, g, b = info["maskColor"]
        css += f'svg.mask [data-zone="{z}"] *{{fill:rgb({r},{g},{b})!important;stroke:rgb({r},{g},{b})!important}}'
    css += "svg.mask .so{fill:none!important}"
    return css

with sync_playwright() as p:
    br = p.chromium.launch()
    pg = br.new_page(viewport={"width": 1200, "height": 900}, device_scale_factor=1)
    for h in D["houses"]:
        svg = open(f"/home/claude/map/svg/{h['id']}.svg").read().replace('width="600" height="450"', 'width="1200" height="900"')
        for mode in ("sprite", "mask"):
            cls = ' class="mask"' if mode == "mask" else ""
            html = (f"<html><head><style>html,body{{margin:0;background:transparent}}{mask_css()}</style></head>"
                    f"<body>{svg.replace('<svg ', '<svg' + cls + ' ', 1)}</body></html>")
            pg.set_content(html)
            name = h["id"] + ("" if mode == "sprite" else "_zones")
            pg.locator("svg").screenshot(path=f"/home/claude/map/sprites/{name}.png", omit_background=True)
    br.close()
print("rendered", len(D["houses"]))
