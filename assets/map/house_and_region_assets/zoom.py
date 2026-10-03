"""Zoomed region views. For each region: crop the 2x map to the region, dim everything outside it,
and mark the houses for sale. Outputs zoom_<region>.png (with pins), zoom_<region>_clean.png (no pins)
and zoom_data.json (crop rectangle in map coordinates + pin positions in zoom-image coordinates)."""
import json
import numpy as np
from scipy import ndimage
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT_W, OUT_H = 1600, 1000
big = Image.open("/home/claude/map/cartoon_base_2x_zoom.png").convert("RGB")
S = big.width / 1600
mask = np.array(Image.open("/home/claude/map/regions_mask.png").convert("RGB"))
labels = json.load(open("/home/claude/map/region_labels.json"))["regions"]
hp = json.load(open("/home/claude/map/house_points.json"))
houses = json.load(open("/home/claude/map/houses.json"))["houses"]
f_price = ImageFont.truetype("/home/claude/map/Fredoka.ttf", 30); f_price.set_variation_by_name("SemiBold")
f_tier = ImageFont.truetype("/home/claude/map/Fredoka.ttf", 18); f_tier.set_variation_by_name("Medium")
town = np.array(hp["townCentre"])

def pick_spots(key, n_types):
    pts = np.array(hp["houses"][key], float)
    m = np.all(mask == labels[key]["maskColor"], axis=2)
    inner = ndimage.distance_transform_edt(m)
    pts = pts[[inner[int(y), int(x)] > 28 for x, y in pts]]       # away from region edges
    chosen = []
    if key == "riverside":
        dt = np.hypot(*(pts - town).T)
        near = pts[np.argsort(dt)]
        chosen += [near[0]]
        chosen += [next(p for p in near if np.hypot(*(p - chosen[0])) > 110)]
        far = pts[dt > 280]
        chosen += [far[np.argmax(np.hypot(*(far - town).T) * (far[:, 1] < 640))]]
        chosen += [next(p for p in far[np.argsort(np.hypot(*(far - chosen[2]).T))] if np.hypot(*(p - chosen[2])) > 150)]
        chosen = chosen[2:] + chosen[:2]          # bungalows out in the suburbs, townhouses near the town centre
    else:
        c = pts.mean(0)
        chosen.append(pts[np.argmin(np.hypot(*(pts - c).T))])
        while len(chosen) < n_types:
            d = np.min([np.hypot(*(pts - q).T) for q in chosen], axis=0)
            d[d > 330] = 0                                             # stay in the same neighbourhood
            chosen.append(pts[np.argmax(d)])
    return [tuple(map(float, p)) for p in chosen]

out = {}
for key in ("coastal", "riverside", "hillysides"):
    m = np.all(mask == labels[key]["maskColor"], axis=2)
    ys, xs = np.nonzero(m)
    x0, x1, y0, y1 = xs.min() - 40, xs.max() + 40, ys.min() - 40, ys.max() + 40
    w, h = x1 - x0, y1 - y0
    if w / h > OUT_W / OUT_H:                                          # match the 16:10 screen
        nh = w * OUT_H / OUT_W; y0 -= (nh - h) / 2; h = nh
    else:
        nw = h * OUT_W / OUT_H; x0 -= (nw - w) / 2; w = nw
    x0 = float(np.clip(x0, 0, 1600 - w)); y0 = float(np.clip(y0, 0, 1000 - h))
    crop = big.crop((int(x0 * S), int(y0 * S), int((x0 + w) * S), int((y0 + h) * S))).resize((OUT_W, OUT_H), Image.LANCZOS)
    k = OUT_W / w
    mz = Image.fromarray(m.astype(np.uint8) * 255).crop((int(x0), int(y0), int(x0 + w), int(y0 + h))).resize((OUT_W, OUT_H), Image.BILINEAR)
    mzf = ndimage.gaussian_filter(np.array(mz, np.float32) / 255, 2)
    arr = np.array(crop, np.float32) / 255
    grey = arr.mean(2, keepdims=True)
    dim = (arr * 0.35 + grey * 0.35) * 0.7 + 0.22                      # washed-out surroundings
    inside = np.clip((mzf - 0.4) / 0.2, 0, 1)[..., None]
    arr = arr * inside + dim * (1 - inside)
    ring = np.clip(1 - np.abs(mzf - 0.5) / 0.12, 0, 1)[..., None]
    arr = arr * (1 - ring) + ring
    clean = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8))
    clean.save(f"/home/claude/map/zoom_{key}_clean.png")

    region_houses = [h for h in houses if h["region"] == key]
    spots = pick_spots(key, len(region_houses))
    pins = []
    img = clean.convert("RGBA")
    tint = tuple(labels[key]["tint"])
    SPR_W, SPR_H, ANCHOR = 136, 102, 0.89          # sprite size in the zoom view; ANCHOR = ground line of the sprite
    placed = []
    for hs, (mx, my) in sorted(zip(region_houses, spots), key=lambda t: t[1][1]):   # draw back-to-front
        zx, zy = (mx - x0) * k, (my - y0) * k
        sx, sy = zx - SPR_W / 2, zy - SPR_H * ANCHOR
        price = f"${hs['price'] / 1e6:.2f}M" if hs["price"] >= 1e6 else f"${hs['price'] // 1000}k"
        sprite = Image.open(f"/home/claude/map/sprites/{hs['id']}.png").convert("RGBA").resize((SPR_W, SPR_H), Image.LANCZOS)
        top = sprite.getchannel("A").getbbox()[1]                                     # where the house actually starts
        tag_below = sy + top - 80 < 8                                                 # no room above: tag goes underneath
        pins.append(dict(houseId=hs["id"], mapX=float(mx), mapY=float(my), x=round(float(zx), 1), y=round(float(zy), 1),
                         spriteW=SPR_W, spriteH=SPR_H, anchorY=ANCHOR, contentTop=round(top / SPR_H, 3), tagBelow=bool(tag_below)))
        placed.append((hs, zx, zy, sx, sy + top, price, tag_below))
        shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
        ImageDraw.Draw(shadow).ellipse([zx - SPR_W * 0.47, zy - 4, zx + SPR_W * 0.47, zy + 22], fill=(20, 50, 40, 90))
        img = Image.alpha_composite(img, shadow.filter(ImageFilter.GaussianBlur(6)))
        img.alpha_composite(sprite, (int(sx), int(sy)))
    dr = ImageDraw.Draw(img, "RGBA")
    for hs, zx, zy, sx, sy, price, tag_below in placed:                              # tags on top of every sprite
        tw = max(dr.textlength(price, font=f_price), dr.textlength(hs["tier"], font=f_tier)) + 36
        bx0 = zx - tw / 2
        if tag_below:
            by0 = zy + SPR_H * (1 - ANCHOR) + 14; by1 = by0 + 68
            tip = [(zx - 10, by0 + 2), (zx + 10, by0 + 2), (zx, by0 - 12)]
        else:
            by1 = sy - 4; by0 = by1 - 68
            tip = [(zx - 10, by1 - 2), (zx + 10, by1 - 2), (zx, by1 + 12)]
        dr.rounded_rectangle([bx0, by0 + 4, bx0 + tw, by1 + 4], 18, fill=(40, 60, 90, 80))
        dr.rounded_rectangle([bx0, by0, bx0 + tw, by1], 18, fill=(255, 255, 255, 255), outline=tint + (255,), width=4)
        dr.polygon(tip, fill=(255, 255, 255, 255))
        dr.text((zx, by0 + 24), price, font=f_price, fill=(38, 52, 72, 255), anchor="mm")
        dr.text((zx, by0 + 50), hs["tier"], font=f_tier, fill=(90, 105, 125, 255), anchor="mm")
    img.convert("RGB").save(f"/home/claude/map/zoom_{key}.png")
    out[key] = dict(crop=dict(x=round(float(x0), 1), y=round(float(y0), 1), w=round(float(w), 1), h=round(float(h), 1)), pins=pins)

json.dump(dict(width=OUT_W, height=OUT_H, regions=out), open("/home/claude/map/zoom_data.json", "w"), indent=2)
print({k: (v["crop"], len(v["pins"])) for k, v in out.items()})
