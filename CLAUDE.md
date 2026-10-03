# CLAUDE.md

## Project

A 2D browser game that builds awareness of climate-driven floods and landslides. The setting is inspired by Lower Hutt, Wellington, New Zealand. The player buys a house, prepares it within limited actions and money, and lives through years of weather rolled by the game.

**Audience:** residents and prospective homeowners. 

**Learning goals.** Every feature should serve at least one of these:
1. Where you live determines which hazards you face.
2. Preparation reduces damage, but the right preparation depends on the hazard.
3. The neighbourhood's everyday choices change how often disasters happen.

## Tech stack and commands

- TypeScript (strict), Vite, Phaser (2D), Vitest for tests, zod for validating data files.
- Static site with no backend.

Commands:

```
npm install
npm run dev      # local dev server (http://127.0.0.1:5173)
npm run build    # typecheck + production build to dist/
npm test         # Vitest
npm run lint     # ESLint + typecheck
```

Versions: Phaser 4, Vite 8, Vitest 5, zod 4. TypeScript is pinned to 6.0 because typescript-eslint doesn't support TypeScript 7 yet.

## Architecture rules

- `src/sim/` holds all game logic: state, rules, rolls, scoring.
  - No Phaser imports.
  - Deterministic for a given seed.
  - Every rule is unit-tested here.
- `src/scenes/` holds Phaser scenes. Scenes render state and send player intents to the sim; they contain no rules.
- `src/data/` holds JSON content files plus zod schemas. Validate at boot and fail loudly on invalid data.
- **No magic numbers in code.** Every number in this file lives in `src/data/*.json`, so designers can rebalance without touching code.
- Use a seeded RNG passed through the sim. Never call `Math.random` inside `src/sim/`.
- Game state is one serialisable object.
- Every player intent has a `check*` function (used to disable buttons and explain why) and an action that returns a new state. Scenes send results through `session.apply()`; they never change state themselves.
- Player-facing text built from state lives in `src/ui/copy.ts` (pure, no Phaser), so the framing rules are kept in one place.
- ESLint forbids Phaser imports and `Math.random` inside `src/sim/`.

```
src/
  main.ts     Phaser game config
  session.ts  holds the current GameData and GameState; scenes apply sim results here
  devtools.ts dev-only console/test helpers (window.dev), never in production builds
  sim/        state.ts, turn.ts, weather.ts, damage.ts, footprint.ts, economy.ts, rng.ts,
              advice.ts (what helped / would have helped), format.ts, *.test.ts
  scenes/     Boot, Title, RegionSelect, HouseSelect, House, Quiz, Roll, YearReview, FinalReport
  ui/         HUD, buttons (Button + FocusNav), panels, houseArt, copy, theme, a11y, icons, spots,
              regionMap + mapView + mapMarkers (the valley map)
  data/       areas.json, houses.json, weather.json, mods.json, quiz.json, balance.json, schemas.ts, index.ts
assets/       map (valley map art + cartoon2.py), sprites, audio, LICENSES.md
tools/blender/house_sprites.py   (placeholder; houses are drawn in code for now)
```

## Game flow

1. Title screen → **Region select** → **House select** → buy if within budget.
2. **Yearly turn loop:**
   1. **Year start:** `balance.yearlyIncome` is added to the bank, and action points reset to `balance.actionsPerTurn`.
   2. **Action phase:** apply modifications or repair the house (1 action each), or sell and move (returns to Region select).
   3. **End turn:** "What would you do?" quiz. The answer sets this year's footprint change.
   4. **Update neighbourhood footprint:** add this year's change.
   5. **Weather roll:** look up disaster odds from the updated footprint, then roll.
   6. **Resolution:** apply damage as a loss of house value, use up consumables. House value never appreciates.
   7. **Year review:** explain what happened, why, and what helped.
   8. **End check:** if the house was destroyed, it's **game over** (loss). If the last year has been survived, it's a **win**. Otherwise continue to the next year.
3. **Final report:** win or loss, plus the stats listed under Winning and losing.

## World

Use fictional "inspired by" area names. **Never use real street addresses.**

| Region  | Area (inspired by)         | House               | Disaster  | Flood cause (copy only)     |
|---------|----------------------------|---------------------|-----------|-----------------------------|
| Coastal | Coastal flats (Petone)     | Near the beach      | Flood     | Storm surge, swell, surface |
| Coastal | Bays (Eastbourne)          | Beachfront          | Flood     | Storm surge, swell          |
| Urban   | Valley floor (Hutt Valley) | Valley house        | Flood     | River, surface              |
| Urban   | City centre (Hutt CBD)     | Townhouse/apartment | Flood     | Surface                     |
| Hills   | Hillside (Wainuiomata)     | Near a slope        | Landslide | n/a                         |

The game has one flood mechanic. The "flood cause" column exists only for year-review text. It teaches that different places flood for different reasons without adding rules.

**Coastal and Urban areas roll floods only. Hills areas roll landslides only.** Store this per area in `areas.json` as `"disasters": ["flood"]`, never hardcode it. It's an array so a future area could have both.

## Weather model

There are two disasters: **flood** and **landslide**.

- Each year, the house's area disaster gets one roll.
- Odds depend only on the **neighbourhood footprint** (tonnes of carbon), via these bands:

| Footprint band (t) | 0–4 | 4–8 | 8–12 | 12–16 | 16–20 |
|--------------------|-----|-----|------|-------|-------|
| Flood %            | 10  | 20  | 30   | 50    | 75    |
| Landslide %        | 10  | 15  | 20   | 30    | 40    |

Band rules:
- Bands include their lower bound and exclude their upper bound: 4.0 t falls in the 4–8 band.
- At 20 t and above, use the 16–20 values.

The dice animation is cosmetic. The outcome comes from a seeded roll against these percentages.

There are **no severity tiers** in the MVP. Each disaster has one fixed damage value.

## Damage

Base damage is a percentage of the house's **original value** (its purchase price):

| Disaster  | Base damage |
|-----------|-------------|
| Flood     | 40%         |
| Landslide | 50%         |

```
effective% = max(balance.minDamagePercent, base% - sum of reductions from active mods for that disaster)
valueLost  = originalValue × effective% / 100
houseValue = max(0, houseValue - valueLost)
```

- `balance.minDamagePercent` is 10.
- **Every disaster that hits does at least 10% damage**, however well prepared the house is.
- **Unrepaired damage stacks.** Each new hit takes another share of the original value.
- **When house value reaches 0 or below, the house is destroyed.** In other words, if `originalValue - damage × n ≤ 0` over n unrepaired hits, the house is gone.
  - Example: an unprepared flood house (40% per hit) is destroyed by its third unrepaired flood.
  - Example: a fully prepared one (10% per hit) survives nine and is destroyed by the tenth.
  - Preparation buys time; only repairing resets the clock.
- If an area ever lists both disasters and both hit in the same year, apply each one in turn.

**Worked examples, for a house bought for $800,000:**
- **Seal doors and sandbags, flood hits:** 40 − 20 − 5 = 15%. The house loses $120,000 and is worth $680,000 until repaired.
- **Retaining wall, landslide hits:** 50 − 50 = 0%, which is below the floor, so damage is 10%. The house loses $80,000.

## Repairs

- **Repairing is an action.** It costs exactly 1 action and restores the house to its original value in one go, however many unrepaired hits it has taken.
- **Money:** a repair costs `balance.repairCostRate × (originalValue - houseValue)`.
  - `repairCostRate` is 1.0, so a repair costs exactly the value it restores: the house value goes back up and the bank goes down by the same amount.
  - Keep the rate configurable.
- Repair is only available when the house is damaged and the bank can cover the full cost. There are no partial repairs.
- **This is the core tension after a disaster:** every action spent repairing is an action not spent preparing. The year review and House view should make that trade-off visible.
- **If the house is not repaired:**
  - Its value stays reduced.
  - Further hits stack until the house is destroyed.
  - Selling it returns the damaged value.
- A destroyed house cannot be repaired or sold.

## Modifications

- Every modification costs **exactly 1 action**, whatever it is.
- The player has `balance.actionsPerTurn` actions per turn (configurable, default 3).
- Dollar costs in `mods.json` are placeholders until provided.

| Mod                         | Flood reduction | Landslide reduction | Type                      |
|-----------------------------|-----------------|---------------------|---------------------------|
| Seal doors                  | −20             |                     | Permanent                 |
| Elevate the house           | −30             |                     | Permanent                 |
| Foundation improvement      | −15             |                     | Permanent                 |
| Drainage                    | −15             |                     | Permanent                 |
| Sandbags at house           | −5              |                     | Consumable (default)      |
| Store food                  | −5              | −5                  | Consumable (default)      |
| Retaining wall              |                 | −50                 | Permanent                 |
| Soil nailing                |                 | −20                 | Permanent                 |
| Planting trees              |                 | −10                 | Permanent, cuts footprint |
| Drainage over loose soil    |                 | −5                  | Permanent                 |

Rules for mods:
- Each permanent mod can be applied once per house.
- Consumables are used up when the disaster they protect against hits, and can be restocked for 1 action.
- All mods are available in every area. Choosing a mod that doesn't fit the area is part of the learning, and the year review should point it out.
- "Drainage" and "Drainage over loose soil" are separate mods with separate IDs.
- **Diminishing returns.** Once a house reaches the 10% floor for its disaster, further mods for that disaster add nothing.
  - Example: seal doors plus elevating already gives 40 − 50 → 10% for floods.
  - The House view must show the current "damage if hit" % so players see the floor coming. TODO: since the House view was simplified it isn't shown there (or in the HUD); it appears only in the year review, and upgrade tooltips say when the floor has been reached.
  - Don't block extra mods. Instead, the mod's tooltip should say it won't reduce damage further.
- Mods stay with the house when it is sold. The player starts fresh in the new house.

**Copy rule for store food.** Describe it as reducing recovery costs (staying home safely, not buying emergency supplies), not as protecting the building. Players should not leave thinking pantry food protects walls.

## Neighbourhood footprint and quiz

The game tracks one footprint value, framed in all copy as **the neighbourhood's footprint**.

- **Start:** `balance.startingFootprint` (tonnes).
- **Each year:** `footprint += balance.baseYearlyIncrement + quizAnswerDelta + sum of active mod footprint deltas`.
  - The footprint never goes below 0.
  - Planting trees has a footprint delta. Its value is a placeholder until provided.
- **Quiz format:** a "What would you do?" scenario with one answer per year.

Example entry in `quiz.json`. The deltas are placeholders until provided:

```json
{
  "id": "commute-1",
  "prompt": "Would you change your habits? How will you get to work this year?",
  "answers": [
    { "id": "cycle",   "label": "Cycle",                "footprintDelta": -1.0 },
    { "id": "train",   "label": "Take the train",       "footprintDelta": -0.5 },
    { "id": "bus",     "label": "Take the bus",         "footprintDelta": -0.5 },
    { "id": "carpool", "label": "Carpool",              "footprintDelta":  0.0 },
    { "id": "drive",   "label": "Drive",                "footprintDelta": +1.0 }
  ],
  "source": "placeholder"
}
```

**Framing rule for all player-facing copy:**
- Say "if your neighbourhood made this choice...".
- Never imply that one household caused a specific flood or landslide.

## Winning and losing

- **Win:** survive all `balance.gameLengthYears` years (N, configurable, default 10) with the house standing.
- **Loss:** the house is destroyed. This is game over immediately, even mid-game.
- There is no other score. Bank balance, footprint and net worth do not decide the outcome.
- **Final report**, shown for both outcomes:
  - years survived;
  - disasters faced and how much damage each did;
  - repairs made;
  - mods built;
  - final bank balance;
  - neighbourhood footprint trend with the quiz choices that drove it.
- In the report, show what would have changed the outcome, e.g. "a retaining wall would have halved every landslide".

## Money and value

- The player starts with `balance.startingBudget`.
- **Income:** each year starts with `balance.yearlyIncome` added to the bank.
  - The core money decision is how to split limited income between preparing (mods) and recovering (repairs).
- The bank pays for houses, modifications and repairs.
- **The bank never goes negative.** Disable any action the player can't afford, and say why.
- **House value never appreciates.** Its maximum is the original value.
  - Do not add appreciation, market trends or value bonuses from mods.
- **Selling:**
  - The player receives the current value.
  - Selling plus buying uses the whole turn (default, pending open question 3). After moving, actions are 0 and the player can't sell again that year.
  - The player can't buy back the house they just sold.
  - Only allow selling if the bank plus the sale value can afford at least one other house. Otherwise the player could end up homeless, a state the game has no rules for.
- **HUD** (`src/ui/HUD.ts`, shown on the RegionSelect, HouseSelect, House, Quiz, Roll and YearReview screens):
  - Top left box: neighbourhood footprint.
  - Top centre, no box: "Year N of M" in large white text with a dark outline. Hidden in year 0 (before the first house is bought).
  - Top right box: bank, house value (current dollar value only), total repair cost (the cost to repair the house fully right now; $0 when undamaged). With no house (choosing or moving), just the bank. `drawHUD()` returns the box's bottom edge (`rightBottom`) so side panels can sit below it.
  - Not in the HUD: odds (shown in the Roll panel and year review), actions left (in upgrade windows only), damage if hit and hits left (year review only).

## Screen layout

- **House, Quiz, Roll, YearReview:** the player's house is drawn full screen as the background (`FULL_SCREEN_ART` / `drawBackdrop` in `src/ui/houseArt.ts`). Content sits along the bottom, so the house stays visible above it.
  - House: round "+" markers on the house open upgrade windows, one per spot (doors, foundations, drains, inside, garden, slope). Each mod's `spot` in `mods.json` decides its marker; positions come from `spotPositions()` in `houseArt.ts`. Markers have no text label; the spot name and upgrades in place (e.g. "Doors upgrades, 1/2 in place") are announced to screen readers on focus. The window is modal: it lists that spot's mods with tooltips; Escape, Close or clicking outside closes it, and it reopens after a purchase. Keep the House view minimal: no text panel, just single-line buttons (no subtext) tiled horizontally and centred along the bottom: "Repair the house" (only while the house is damaged; shown with ✕ if unaffordable, and the reason is announced on focus or click), "Sell and Move" and "Finish Upgrades" (ends the action phase and opens the quiz). Repair cost is in the HUD.
  - Quiz: question, answers in two columns, and an explanation of the focused answer's footprint change.
  - Roll: the year's odds, one die per disaster, then the continue button. The HUD and house show the pre-roll state until the dice land, so the result isn't spoiled.
  - YearReview: Cause, Effect and What helped boxes side by side. The font shrinks if needed so the dock stays clear of the HUD.
- **FinalReport:** stats in a left column, footprint chart and quiz choices in a right column, the house (or rubble) between them.
- **RegionSelect:** the valley map (`assets/map`) fills the screen. Each region has a label (name and hazards, drawn from game data, not the labels baked into `cartoon_regions.png`). Hovering anywhere in a region highlights it and fills the info panel in the top-right corner, below the HUD's bank box; clicking anywhere in it, or its label, selects it.
- **HouseSelect:** the map zooms to fit the chosen region left of a solid right-hand sidebar (bank box, then the house panel), then a pin drops in for each house (`houses.json` `map.x/y`, in map-image pixels). Choosing a pin shows a preview, details and "Buy for $X"; "Back to the map" returns to RegionSelect.
- **Title:** plain dark background.

## Content and tone

- Use NZ English. Keep the tone practical and respectful, never doom-laden.
- Every year review states cause → effect → what helped or would have helped.
- Every data entry records a `source`.
  - Placeholder values must carry `"source": "placeholder"`.
  - Game copy must not present placeholder values as real-world data.
- **Accessibility:**
  - Never use colour as the only signal.
  - All interactions work with a keyboard: Tab/Shift+Tab or arrow keys move focus, Enter/Space chooses. Don't show on-screen key instructions.
  - Modal windows take over the keyboard (`FocusNav.enabled = false` on the main nav) and close on Escape.
  - Focus is shown by a thick outline plus a ▶ marker; unavailable buttons show ✕ and dimmed text, and focusing one shows why it's unavailable.
  - Only pointer movement moves focus, so a resting mouse can't steal keyboard focus when a screen opens.
  - Focused text is mirrored to an aria-live region (`#sr-live`) for screen readers.
  - Text is readable at small sizes.

## Map

- `assets/map/cartoon_base.png` (art) and `cartoon_overlay.png` (region outlines; each region filled with its `tint`) are 1600×1000. `region_labels.json` gives each map region's label position and tint.
- `areas.json` regions name their map shape with `mapRegion` (`coastal`, `riverside`, `hillysides`).
- At boot, `buildRegionMap()` (`src/ui/regionMap.ts`) classifies every overlay pixel by nearest tint into a hit-test lookup, builds a highlight texture and bounding box per region, and fails loudly if a `mapRegion` is unknown or a house pin isn't inside its own region.
- `MapView` (`src/ui/mapView.ts`) draws the map (cover-fit), zooms to a region and converts screen ↔ map pixels. Map labels and pins are in `src/ui/mapMarkers.ts`.
- `assets/map/cartoon2.py` regenerates the map. It reads `terrain.npz` and `regions_mask.png`, which aren't in the repo, and has hard-coded output paths.

## Phaser 4 notes

- `GeometryMask` only works in the Canvas renderer. Keep particles inside an area with a `deathZone` instead.
- Tweening a Rectangle's `height` doesn't redraw it. Tween `scaleY` instead.
- The keyboard plugin can replay queued keydown events. `FocusNav` uses a plain `window` keydown listener instead.
- Browsers pause `requestAnimationFrame` in background tabs, which freezes the game. `devtools.ts` steps the loop by hand while the tab is hidden, so scripted browser tests keep running.

## Dev helpers

In `npm run dev`, `window.dev` drives the game from the console or browser tests:
`await dev.start(regionIndex, houseIndex)`, `await dev.endYear(answerIndex)`, `await dev.nextYear()`, `dev.click(label => ...)`, `dev.state()`.

## Hazard data sources

The odds and damage values above are game-design numbers set by the team. Hazard maps are used to decide which areas are flood-prone and which are landslide-prone, and to inform educational copy.

- **Hutt City Council:** District Plan natural hazard overlays.
- **Greater Wellington Regional Council:** flood hazard maps.
- **Earth Sciences New Zealand** (GNS Science and NIWA, merged July 2025): landslide and climate data.

## Assets

- **House sprites** come from `tools/blender/house_sprites.py`.
  - Fixed orthographic camera, transparent PNG output.
  - Each mod gets an overlay rendered with the house as a holdout, so all layers align when stacked.
- **Draw effects in code**, not as sprites: rain particles, rising floodwater, slip debris, screen shake.
- **Placeholder art** may use Kenney (CC0) packs.
- Record the licence of every third-party asset in `assets/LICENSES.md`.

## Tests that must exist in src/sim

- **Band lookup:** exact boundaries (0, 4, 8, 12, 16, 20) and values above 20 for both disasters.
- **Area mapping:** Hills houses never roll floods; Coastal and Urban houses never roll landslides.
- **Damage:** single mod, stacked mods, reductions past the floor give exactly 10%, no mods gives base damage.
- **Actions:** a mod costs 1 action, the player can't exceed `actionsPerTurn`, a permanent mod can't be applied twice.
- **Repairs:** cost 1 action, restore exactly the original value, charge `repairCostRate` × value lost, are unavailable when the house is undamaged or the bank can't cover the cost.
- **Money:** income is added at year start; no action can take the bank below 0.
- **Value:** never exceeds the original value; the house is destroyed exactly when value reaches 0 or below (test 40% × 3 and 10% × 10).
- **Consumables:** used up only when their disaster hits.
- **Footprint:** quiz delta, mod deltas, never below 0, odds use the updated value.
- **Outcome:** destruction ends the game as a loss immediately; surviving year N is a win; selling is blocked when no other house would be affordable or the player has already moved this year.
- **Data:** the bundled data validates; a missing `source`, unknown area or gap between weather bands fails loudly.
- **Determinism:** the same seed and same choices give the same game.

## Open questions

Do not invent answers to these. Use the default and leave a `TODO(open-question)` comment.

1. **Severity tiers.** These were requested earlier, but the new model has one damage value per disaster.
   - Default: no tiers in the MVP.
2. **Missing numbers:**
   - Starting footprint and yearly base increment.
   - Quiz answer deltas.
   - Footprint delta for planting trees.
   - Mod dollar costs.
   - Starting budget, yearly income and house prices.
   - Game length N.
   - Defaults: placeholders.
3. **Selling.** Does selling cost actions?
   - Default: selling plus buying uses the whole turn.
4. **Solar panels.** These were in the earlier summary but are not in the new mod list.
   - Default: leave them out.
