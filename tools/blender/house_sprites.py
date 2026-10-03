"""Renders house sprites and aligned mod overlays for My Climate Footprint.

Planned pipeline (see CLAUDE.md, "Assets"):
- Fixed orthographic camera, transparent PNG output to assets/sprites/.
- One base render per house style (bungalow, beachfront, villa, townhouse, hillside).
- One overlay per mod, rendered with the house set as a holdout so every
  layer lines up when stacked in Phaser.

Run with:  blender --background --python tools/blender/house_sprites.py

TODO: not implemented yet. Until then the game draws placeholder houses in
code (src/ui/houseArt.ts).
"""

HOUSE_STYLES = ["bungalow", "beachfront", "villa", "townhouse", "hillside"]

if __name__ == "__main__":
    raise SystemExit("house_sprites.py is a placeholder; see the module docstring.")
