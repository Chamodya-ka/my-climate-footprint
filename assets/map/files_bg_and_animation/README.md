# Disaster assets

House pictures for normal, damaged and repaired states, plus the flood, landslip and repair animation that moves between them.

## What's in here

| Folder / file | Contents |
|---|---|
| `sprites/` | `<id>.png` (clean house), `<id>_dmg1.png` (damaged: one hit), `<id>_dmg2.png` (badly damaged: repeated hits). 1200×900, transparent background. Same framing as the clean sprite, so the zone masks and + markers from the house asset pack still line up. |
| `backgrounds/` | `<id>_normal.png` and `<id>_post.png` (1600×1000). Flood houses also have `<id>_post_fg.png`, a transparent water layer drawn **on top of** the house. |
| `animation/` | `house-transitions.js` (the animation), `demo.html` (try it), `repair_icon.png` |
| `previews/` | Before/after stills and `anim_flood.gif`, `anim_landslip.gif`, `anim_repair.gif` |
| `houses.json` | Per house: `region`, `damage.kind` (`flood` or `landslip`), image paths, and `slipPath` for hillside houses |
| `scripts/` | `damage.py` and `backgrounds.py`, which regenerate the pictures |

House ids: `coastal_villa`, `coastal_villa_lux`, `riverside_bungalow`, `riverside_bungalow_lux`, `riverside_townhouse`, `riverside_townhouse_lux`, `hillysides_house`, `hillysides_house_lux`.

## Layout

Everything is drawn on a 1600×1000 stage, in this order: background → house sprite → foreground.

- The sprite goes at x 173, y 30, size 1253×940 (centred, 94% of the stage height).
- If you scale the stage, scale all the layers together.

## Which picture for which state

| Game state | Background | Sprite | Foreground (flood houses only) |
|---|---|---|---|
| Today, or just repaired | `_normal` | `<id>.png` | none |
| Damaged (one unrepaired hit) | `_post` | `_dmg1` | `_post_fg` |
| Badly damaged (two or more unrepaired hits) | `_post` | `_dmg2` | `_post_fg` |

## Try the animation

Open `animation/demo.html`, pick a house, then press **Flood hits** (or **Landslip hits**) and **Repair**.

If the images don't appear when opening the file directly, run `python3 -m http.server` in this folder and go to `http://localhost:8000/animation/demo.html`.

## Use it in a web page

```html
<canvas id="stage" width="1600" height="1000"></canvas>
<script src="animation/house-transitions.js"></script>
<script>
  // image fields are loaded Image objects; fgPost is null for hillside houses; slipPath only matters for hillside houses
  const ht = new HouseTransitions(document.getElementById("stage"), {
    region, bgNormal, bgPost, fgPost, sprite, damaged: { 1: dmg1, 2: dmg2 }, repairIcon, slipPath
  });
  ht.drawStatic(0);
  level = await ht.play("flood", { from: level, to: Math.min(level + 1, 2) });  // or "landslip"
  level = await ht.play("repair", { from: level });                             // back to 0
</script>
```

`play()` resolves with the new damage level and leaves the final still on the canvas. Each animation swaps to the damaged sprite at its most covered moment: under a flash in a flood, under a dust cloud in a landslip.

| Animation | Length | What happens |
|---|---|---|
| `flood` | 3.6 s | sky darkens, rain → water rises over the house → flash, damaged house swapped in → water drains to the foreground level |
| `landslip` | 3.4 s | sky darkens, rain → mud slides down the slope with the ground shaking → dust cloud, damaged house swapped in → dust clears |
| `repair` | 2.6 s | sky clears, rain and water fade → the clean house wipes in from the bottom, with sparkles and the repair icon |

If the player has reduced motion turned on, the animations run faster and without shaking. `ht.frame(type, t, from, to)` draws a single frame, with `t` from 0 to 1, which is handy for recording or for driving the animation from your own timer.

## Use it in Phaser

The animation draws onto any canvas, so give it a canvas texture and refresh that texture each frame. This is an untested sketch:

```js
const tex = this.textures.createCanvas("houseAnim", 1600, 1000);
const ht = new HouseTransitions(tex.getSourceImage(), assets);   // assets: images from this.textures.get(key).getSourceImage()
this.add.image(0, 0, "houseAnim").setOrigin(0);
this.tweens.addCounter({
  from: 0, to: 1, duration: HouseTransitions.DURATION.flood,
  onUpdate: tw => { ht.frame("flood", tw.getValue(), level, Math.min(level + 1, 2)); tex.refresh(); },
  onComplete: () => { level = Math.min(level + 1, 2); ht.drawStatic(level); tex.refresh(); }
});
```
