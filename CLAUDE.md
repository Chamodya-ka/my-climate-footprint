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
  scenes/     Boot, Title, RegionSelect, HouseSelect, House (incl. the year's question), Roll, YearReview, FinalReport
  ui/         HUD, buttons (Button + FocusNav), panels, houseArt, houseAssets, copy, theme, a11y, icons, spots,
              regionMap + mapView + mapMarkers (the valley map), audio (music + sound effects)
  data/       areas.json, houses.json, weather.json, mods.json, quiz.json, balance.json, schemas.ts, index.ts
assets/       map (valley map art, house_and_region_assets: house sprites + zone masks + zoomed region views), sprites, audio (source recordings; game/ holds the processed files), LICENSES.md
tools/audio/process.sh   builds assets/audio/game/ from the source recordings (ffmpeg)
tools/blender/house_sprites.py   (obsolete placeholder; house sprites now come from assets/map/house_and_region_assets)
```

## Game flow

1. Title screen → **Region select** → **House select** → buy if within budget.
2. **Yearly turn loop:**
   1. **Year start:** `balance.yearlyIncome` is added to the bank, and action points reset to `balance.actionsPerTurn`.
   2. **The year's question:** "What would you do?" (phase `quiz`). Upgrades, repairs and selling are locked until it's answered. The answer is recorded in `thisYear.quiz`; it doesn't change the footprint yet.
   3. **Action phase:** apply modifications or repair the house (1 action each), or sell and move (returns to Region select; moving doesn't ask the question again).
   4. **End turn ("Skip Upgrades", or "Finish Upgrades" once an upgrade has been bought that year), then update the carbon footprint:** add this year's change, using the recorded answer.
   5. **Weather roll:** look up disaster odds from the updated footprint, then roll.
   6. **Resolution:** apply damage as a loss of house value, use up consumables. House value only rises through permanent upgrades (see Money and value).
   7. **Year review:** explain what happened, why, and what helped.
   8. **End check:** if the house was destroyed, it's **game over** (loss). If the last year has been survived, it's a **win**. Otherwise continue to the next year.
3. **Final report:** win or loss, plus the stats listed under Winning and losing.

## World

Use fictional area names only. **The game must not name any real place**: no real suburbs, towns, cities, regions, councils or street addresses in game data, copy or UI (areas, houses, quiz answers, titles, `source` fields). Data `source` fields describe the kind of source and point to "Hazard data sources" below.

| Region  | Area (in-game name)        | Houses (standard / luxury)                                   | Disaster  | Flood cause (copy only)     |
|---------|----------------------------|--------------------------------------------------------------|-----------|-----------------------------|
| Coastal | Shoreline Flats            | Seaside villa                                                | Flood     | Storm surge, swell, surface |
| Coastal | Harbour Bays               | Restored double-bay villa (luxury)                           | Flood     | Storm surge, swell          |
| Urban   | River Valley               | 1950s weatherboard bungalow / Renovated bungalow with garage | Flood     | River, surface              |
| Urban   | Town Centre                | New-build townhouse / Architect-designed townhouse           | Flood     | Surface                     |
| Hills   | Ridgeside                  | Hillside weatherboard home / Glass-and-concrete hillside house | Landslide | n/a                       |

Eight houses: 4 urban (map region "riverside"), 2 coastal and 2 hills (map region "hillysides"). Each has a standard and a luxury tier; `houses.json` also records bedrooms, floor area, year built and floor height (shown to players only, no rule uses it). The luxury coastal villa sits in the eastern bay on the map, so it's in Harbour Bays. The asset packs' own `houses.json` files still carry real-place `inspiredBy` notes; the game doesn't read them.

The game has one flood mechanic. The "flood cause" column exists only for year-review text. It teaches that different places flood for different reasons without adding rules.

**Coastal and Urban areas roll floods only. Hills areas roll landslides only.** Store this per area in `areas.json` as `"disasters": ["flood"]`, never hardcode it. It's an array so a future area could have both.

## Weather model

There are two disasters: **flood** and **landslide**.

- Each year, the house's area disaster gets one roll.
- Odds depend only on the **carbon footprint** (tonnes of carbon), via these bands:

| Footprint band (t) | 8–8.5 | 8.5–9 | 9–9.5 | 9.5–10 | 10–10.5 |
|--------------------|-------|-------|-------|--------|---------|
| Flood %            | 20    | 35    | 50    | 75     | 100     |
| Landslide %        | 20    | 35    | 50    | 75     | 100     |

Band rules:
- Bands include their lower bound and exclude their upper bound: 8.5 t falls in the 8.5–9 band.
- At 10.5 t and above, use the 10–10.5 values (100%).
- The footprint can't go below `balance.minFootprint` (8 t), so the first band starts there (checked at boot).

The flipping-calendar animation is cosmetic. The outcome comes from a seeded roll against these percentages.

There are **no severity tiers** in the MVP. Each disaster has one fixed damage value.

## Damage

Base damage is a percentage of the house's **full value** (its purchase price plus the cost of every permanent upgrade built on it):

| Disaster  | Base damage |
|-----------|-------------|
| Flood     | 40%         |
| Landslide | 50%         |

```
effective% = max(balance.minDamagePercent, base% - sum of reductions from active mods for that disaster)
valueLost  = fullValue × effective% / 100
houseValue = max(0, houseValue - valueLost)
```

- `balance.minDamagePercent` is 10.
- **Every disaster that hits does at least 10% damage**, however well prepared the house is.
- **Unrepaired damage stacks.** Each new hit takes another share of the full value.
- **When house value reaches 0 or below, the house is destroyed.** In other words, if `fullValue - damage × n ≤ 0` over n unrepaired hits, the house is gone.
  - Example: an unprepared flood house (40% per hit) is destroyed by its third unrepaired flood.
  - Example: a fully prepared one (10% per hit) survives nine and is destroyed by the tenth.
  - Preparation buys time; only repairing resets the clock.
- If an area ever lists both disasters and both hit in the same year, apply each one in turn.

**Worked examples, for a house bought for $800,000:**
- **Seal doors and sandbags, flood hits:** 40 − 20 − 5 = 15%. The house loses $120,000 and is worth $680,000 until repaired.
- **Retaining wall, landslide hits:** 50 − 50 = 0%, which is below the floor, so damage is 10%. The house loses $80,000.

## Repairs

- **Repairing is an action.** It costs exactly 1 action and restores the house to its full value in one go, however many unrepaired hits it has taken.
- **Money:** a repair costs `balance.repairCostRate × (fullValue - houseValue)`.
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
| Planting trees              |                 | −10                 | Permanent                 |
| Drainage over loose soil    |                 | −5                  | Permanent                 |

Rules for mods:
- Each permanent mod can be applied once per house.
- Consumables are used up when the disaster they protect against hits, and can be restocked for 1 action.
- All mods are available in every area. Choosing a mod that doesn't fit the area is part of the learning, and the year review should point it out.
- "Drainage" and "Drainage over loose soil" are separate mods with separate IDs.
- **Diminishing returns.** Once a house reaches the 10% floor for its disaster, further mods for that disaster add nothing.
  - Example: seal doors plus elevating already gives 40 − 50 → 10% for floods.
  - Don't show "damage if hit" percentages, reductions, or "won't help here / won't reduce damage further" notes when choosing upgrades (design decision: players discover the effects in the year review). The upgrade window shows each mod's description, whether it's permanent or consumable, and its price.
  - Don't block extra mods.
  - When a mod can't be bought, show why on its row in the upgrade window (e.g. "✕ No actions left this year."), not only on focus.
- Mods stay with the house when it is sold. The player starts fresh in the new house.

**Copy rule for store food.** Describe it as reducing recovery costs (staying home safely, not buying emergency supplies), not as protecting the building. Players should not leave thinking pantry food protects walls.

## Carbon footprint and quiz

The game tracks one footprint value, shown to players as the **carbon footprint**, framed as if everyone made the same choices the player does.

- **Start:** `balance.startingFootprint` (tonnes).
- **Each year:** `footprint += footprint × balance.baseYearlyIncreasePercent / 100 + quizAnswerDelta + sum of active mod footprint deltas`.
  - `baseYearlyIncreasePercent` is 1.2: the yearly rise compounds and is a share of the current footprint (about 0.1 t a year at 8 t).
  - The footprint never goes below `balance.minFootprint` (8 t).
  - No mod changes the footprint: planting trees has no effect on the disaster model (`footprintDelta: 0`; it still reduces landslide damage). The `footprintDelta` field stays on mods so a future mod could use it.
- **Quiz format:** a "What would you do?" scenario with one answer per year, asked at the start of the year.
- **Every question has exactly 4 answers:** 1 correct (−0.25 t), 1 neutral (0 t) and 2 wrong (+0.5 t). The kinds, counts and deltas live in `balance.quizAnswers`; each answer's `footprintDelta` in `quiz.json` must be one of them, and boot fails loudly if a question has a different mix. Vary where the correct answer sits, so it isn't always first.
- **Question dialog** (`src/ui/questionDialog.ts`): a speech bubble that grows out of the HUD's carbon footprint box (which pulses while it's open), over the dimmed house. It can't be dismissed. Before answering it shows only the question and answers: no hint of how an answer changes the footprint. After answering, the same bubble shows short feedback (`quizFeedback()` in `src/ui/copy.ts`): ✓/✗ whether the choice was correct (correct = the lowest `footprintDelta` among the options; ties count; a wrong answer names the best one), which way it moves the carbon footprint ("Assuming everyone makes the same choice you do, the carbon footprint would go down."), and the chosen option ("▶ label") with its `explanation` from `quiz.json`. Other options aren't explained, and the feedback shows no tonne figures. At the same moment the HUD shows the change arrow. Continue closes it and unlocks the upgrades.

Example entry in `quiz.json`:

```json
{
  "id": "commute-1",
  "prompt": "Would you change your habits? How will you get to work this year?",
  "answers": [
    { "id": "cycle",   "label": "Cycle",                "footprintDelta": -0.25, "explanation": "..." },
    { "id": "drive",   "label": "Drive",                "footprintDelta":  0.5,  "explanation": "..." },
    { "id": "carpool", "label": "Carpool",              "footprintDelta":  0,    "explanation": "..." },
    { "id": "taxi",    "label": "Take a taxi each day", "footprintDelta":  0.5,  "explanation": "..." }
  ],
  "source": "placeholder"
}
```

**Framing rule for all player-facing copy:**
- Say "assuming everyone makes the same choice you do...".
- Never imply that one household caused a specific flood or landslide.

## Winning and losing

- **Win:** survive all `balance.gameLengthYears` years (N, configurable, default 10) with the house standing.
- **Calendar years:** players see calendar years, never "Year N". Game year 1 is `balance.startYear` (2026), so 10 years run 2026–2035. Use `calendarYear()` / `lastCalendarYear()` from `src/ui/copy.ts`; the sim keeps counting years from 1.
- **Loss:** the house is destroyed. This is game over immediately, even mid-game.
- There is no other score. Bank balance, footprint and net worth do not decide the outcome.
- **Final report**, shown for both outcomes:
  - years survived;
  - disasters faced and how much damage each did;
  - repairs made;
  - mods built;
  - final bank balance;
  - carbon footprint trend with the quiz choices that drove it.
- In the report, show what would have changed the outcome, e.g. "a retaining wall would have halved every landslide".

## Money and value

- The player starts with `balance.startingBudget`.
- **Income:** each year starts with `balance.yearlyIncome` added to the bank.
  - The core money decision is how to split limited income between preparing (mods) and recovering (repairs).
- The bank pays for houses, modifications and repairs.
- **The bank never goes negative.** Disable any action the player can't afford, and say why.
- **House value rises only through permanent upgrades.** Each permanent upgrade adds its full dollar cost to both the house value and its full value (`HouseState.fullValue`); consumables add nothing, since they get used up. `purchasePrice` never changes.
  - Value never exceeds the full value. Damage takes a share of the full value, repairs restore it, and selling returns the current (upgraded, possibly damaged) value.
  - Upgrading a damaged house adds value but doesn't fix the damage: the repair cost stays the same.
  - Do not add appreciation, market trends or other value changes.
- **Selling:**
  - The player receives the current value.
  - Selling plus buying uses the whole turn (default, pending open question 3). After moving, actions are 0 and the player can't sell again that year.
  - The player can't buy back the house they just sold.
  - Only allow selling if the bank plus the sale value can afford at least one other house. Otherwise the player could end up homeless, a state the game has no rules for.
- **HUD** (`src/ui/HUD.ts`, shown on the RegionSelect, HouseSelect, House, Roll and YearReview screens):
  - Top left box: carbon footprint, as a gauge with no numbers: a bar from `balance.minFootprint` (8 t) to `balance.footprintGaugeMax` (11 t), green → yellow → red, with ticks at the band edges and a white marker at the current value. To its right, once this year's question is answered and until the year ends, an arrow for the answer's change: green ▼ (lower), red ▲ (higher) or grey = (no change); shape carries the meaning, not just colour. It pops in when the answer is chosen (`hud.showFootprintChange()`). The white marker slides by the answer's change as soon as the answer is chosen, then pulses. The sim still applies the footprint when the year ends, so until then the gauge shows a display-only preview (`displayedFootprint()`). On the Roll screen's reveal the marker slides the rest of the way: the yearly rise plus any upgrade effects (`drawHUD(..., { footprintFrom })`). The bar is 200 px for 3 t (about 67 px per tonne). The final report's footprint chart uses the same range, stretched if the footprint goes past 11 t.
  - Top centre, no box: the calendar year (e.g. "2026") in large white text with a dark outline. Hidden in year 0 (before the first house is bought).
  - Top right box: bank, house value (current dollar value only), total repair cost (the cost to repair the house fully right now; $0 when undamaged). All three rows always show; house value and repair cost are $0 with no house (choosing or moving). `drawHUD()` returns the box's bottom edge (`rightBottom`) so side panels can sit below it.
  - Not in the HUD: odds (shown in the Roll panel and year review), actions left (in upgrade windows only), damage if hit and hits left (year review only).

## Screen layout

- **House, Roll, YearReview:** the player's house is drawn full screen as the background (`FULL_SCREEN_ART` / `drawBackdrop` in `src/ui/houseArt.ts`). Content sits along the bottom, so the house stays visible above it.
  - House: round "+" markers on the house open upgrade windows, one per zone of the house sprite: door (seal doors, sandbags, store food), foundation (foundation improvement, elevate) and garden (drainage, retaining wall, soil nailing, planting trees, drainage over loose soil). The roof zone has no marker (solar panels are out; open question 4). Each mod's `spot` in `mods.json` decides its marker; positions come from the sprite's measured zones via `spotPositions()` in `houseArt.ts`. Markers have no text label; the spot name and upgrades in place (e.g. "Door upgrades, 1/3 in place") are announced to screen readers on focus. The upgrades open in a compact popover that grows out of its "+" marker with a tail pointing at it (above the marker if it fits, else below, else beside it; kept on screen); the house isn't dimmed. It's titled "Property Upgrades" (never the zone name), with "You have N upgrade(s) left for this year." below, and lists that spot's mods, each with its icon, price (or why it can't be bought) and a tooltip. A round red × on its top-right corner closes it (`CloseIcon` in `src/ui/closeIcon.ts`, focusable like any button; the × shape carries the meaning, not just the red); so do Escape and clicking outside. It's modal for the keyboard, and reopens in place, without the grow-in, after a purchase. Keep the House view minimal: no text panel, just single-line buttons (no subtext) tiled horizontally and centred along the bottom: "Repair the house" (only while the house is damaged; shown with ✕ if unaffordable, and the reason is announced on focus or click), "Sell and Move" (asks for confirmation first, via `confirmDialog()` in `src/ui/confirm.ts`) and "Skip Upgrades" / "Finish Upgrades" (the label changes once an upgrade is bought that year; either ends the action phase and rolls the weather). Repair cost is in the HUD.
  - Roll: "One year goes by…" with "You have earned" and, below that, the bank icon and the year's income (e.g. "+$50,000") (income actually arrives at the start of next year, so it's left out when the game ends this year), and a desk calendar (cosmetic, drawn in `src/ui/calendar.ts`) whose pages flip from January to December to show the year passing; no odds, roll numbers or percentages. The same light rain falls every year while it flips, so the weather doesn't give the outcome away. Once it reaches December, a short line beside it (`yearVerdict()` in `copy.ts`): "Unfortunately, a flood hits your home." (naming every disaster that hit), or "You were lucky: there were no climate disasters this year." (never naming the disaster that didn't happen); no ✓/! marks, the words carry the meaning. A hit then plays the designer's flood or landslip animation over the house (see Assets), then the continue button. The HUD and house show the pre-roll state until then, so the result isn't spoiled.
  - YearReview: Cause, Effect and What helped boxes side by side. The font shrinks if needed so the dock stays clear of the HUD.
- **FinalReport:** stats in a left column, footprint chart and quiz choices in a right column, the house (or rubble) between them.
- **HUD tour:** at the start of each new game (`startNewGame()` / `takeHudTour()` in `session.ts`), RegionSelect first shows four short callouts (`showCoachMarks()` in `src/ui/coachMarks.ts`, text from `hudIntro()` in `copy.ts`), one each for carbon footprint, bank, house value and total repair cost, each pointing at its HUD row. Next / Got it, Skip or Escape. The "Where will you live?" panel appears after it. It doesn't repeat when returning from HouseSelect.
- **RegionSelect:** the valley map (`assets/map`) fills the screen. Each region has a label (name and hazards, drawn from game data, not the labels baked into `cartoon_regions.png`). Hovering anywhere in a region highlights it and fills the info panel in the top-right corner, below the HUD's bank box; clicking anywhere in it, or its label, selects it.
- **HouseSelect:** the map zooms into the region's crop (`zoom_data.json`), then cross-fades to the close-up art `zoom/zoom_<mapRegion>_clean.png`, top-aligned so houses near the top clear the HUD. Each house is drawn as its sprite at its `zoom_data` pin with a price tag ("$595k / Standard"); focus order is left to right. Choosing a house opens a modal window with a preview, facts, area hazard and "Buy for $X" / Close. "Back to the map" (bottom left) returns to RegionSelect. Unaffordable houses are dimmed but can still be opened, so the window can say why.
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
  - Confirmation dialogs for irreversible actions focus Cancel first, so a stray Enter never confirms; Escape or clicking outside also cancels.
  - Focus is shown by a thick outline plus a ▶ marker; unavailable buttons show ✕ and dimmed text, and focusing one shows why it's unavailable.
  - Only pointer movement moves focus, so a resting mouse can't steal keyboard focus when a screen opens.
  - Focused text is mirrored to an aria-live region (`#sr-live`) for screen readers.
  - Text is readable at small sizes.
  - **Contrast:** text in boxes meets WCAG AAA (at least 7:1). Boxes with text are fully opaque, so a bright background behind them can't lower the contrast. Current pairs (`src/ui/theme.ts`; recheck with the WCAG formula if you change a colour):

    | Text | Background | Ratio |
    |------|-----------|-------|
    | text `#ffffff` | panel `#132430` | 15.9 |
    | textDim `#d3dde5` | panel | 11.5 |
    | text | button `#1b4058` | 10.9 |
    | textDim (button detail line) | button | 7.9 |
    | textDisabled `#b3bdc6` | buttonDisabled `#252d34` | 7.3 |
    | good `#9ff0b4` / warn `#ffd166` / bad `#ffa89c` | panel | 11.8 / 11.0 / 8.6 |
    | map label secondary text `#3a4757` | white | 9.5 |

## Map

- `assets/map/cartoon_base.png` (art) and `cartoon_overlay.png` (region outlines; each region filled with its `tint`) are 1600×1000. `region_labels.json` gives each map region's label position and tint.
- `areas.json` regions name their map shape with `mapRegion` (`coastal`, `riverside`, `hillysides`).
- At boot, `buildRegionMap()` (`src/ui/regionMap.ts`) classifies every overlay pixel by nearest tint into a hit-test lookup, builds a highlight texture and bounding box per region, and fails loudly if a `mapRegion` is unknown or a house pin isn't inside its own region.
- `MapView` (`src/ui/mapView.ts`) draws the map (cover-fit), zooms to a region and converts screen ↔ map pixels. Map labels and pins are in `src/ui/mapMarkers.ts`.
- **Houses** (`assets/map/house_and_region_assets`): `sprites/<id>.png` (1200×900, transparent) and `sprites/<id>_zones.png` (same size; roof red, door yellow, garden green, foundation blue, walls black), `zoom/zoom_<mapRegion>_clean.png` (1600×1000 close-ups without houses) and `zoom_data.json` (crop rectangle per region, and per house a pin: position in the close-up, sprite display size, anchor, tag placement, and its spot on the overview map). Game houses link to these with `sprite` (the asset id, e.g. `riverside_bungalow`).
- At boot, `buildHouseAssets()` (`src/ui/houseAssets.ts`) measures every zone mask (bounding box and centre per zone) and fails loudly if a house has no sprite, mask, zone or pin, or if a pin's map spot isn't inside its region.
- `houseArt.ts` draws the house on its designer background (see Assets). Mod overlays are positioned from the zones (wall-mounted ones use the walls and door, because on stilted and hillside houses the foundation zone runs far down the slope); "+" markers use the designer's positions from `disaster_assets/houses.json`. The full-screen view is shifted up 40 px so the house clears the bottom buttons.
- Unused here: `cartoon_regions.png` (baked labels), `assets/map/zoom_*.png` (same views with houses and tags painted in) and the duplicate `region_labels.json`/`cartoon2.py` inside `house_and_region_assets`.
- `assets/map/cartoon2.py` regenerates the map. It reads `terrain.npz` and `regions_mask.png`, which aren't in the repo, and has hard-coded output paths.

## Phaser 4 notes

- `GeometryMask` only works in the Canvas renderer. Keep particles inside an area with a `deathZone` instead.
- Tweening a Rectangle's `height` doesn't redraw it. Tween `scaleY` instead.
- The keyboard plugin can replay queued keydown events. `FocusNav` uses a plain `window` keydown listener instead.
- Browsers pause `requestAnimationFrame` in background tabs, which freezes the game. `devtools.ts` steps the loop by hand while the tab is hidden, so scripted browser tests keep running.

## Dev helpers

In `npm run dev`, `window.dev` drives the game from the console or browser tests:
`await dev.start(regionIndex, houseIndex)`, `await dev.answer(answerIndex)`, `await dev.endYear(answerIndex)` (answers first if the question is still open), `await dev.nextYear()`, `dev.click(label => ...)`, `dev.state()`.

## Hazard data sources

The odds and damage values above are game-design numbers set by the team. Hazard maps are used to decide which areas are flood-prone and which are landslide-prone, and to inform educational copy.

- **Hutt City Council:** District Plan natural hazard overlays.
- **Greater Wellington Regional Council:** flood hazard maps.
- **Earth Sciences New Zealand** (GNS Science and NIWA, merged July 2025): landslide and climate data.

## Assets

- **Disaster art** (`assets/map/disaster_assets`, unpacked from `files_bg_urban/disaster_assets.zip`, the newest of the three copies; it only differs in the urban backgrounds): per house `sprites/<id>.png`, `<id>_dmg1.png`, `<id>_dmg2.png` (1200×900), `backgrounds/<id>_normal.png`, `_post.png` and, for flood houses, `_post_fg.png` (1600×1000), `houses.json` (damage kind, "+" positions in 600×450 design units, `slipPath` in stage px for hillside houses), and `animation/house-transitions.js` (the flood / landslip / repair animation, used unchanged).
  - Stage layout: everything is drawn on a 1600×1000 stage, background → sprite (at 173, 30, 1253×940) → mod overlays → foreground (`placeStage()` / `placeSprite()` in `houseArt.ts`).
  - Picture by `HouseState.unrepairedHits`: 0 → `_normal` + clean sprite; 1 → `_post` + `_dmg1` (+ `_post_fg`); 2 or more (or destroyed) → `_post` + `_dmg2` (+ `_post_fg`).
  - `src/ui/houseTransitions.ts` wraps `house-transitions.js`: it draws into a canvas texture driven by a Phaser tween. Roll plays `flood` / `landslip` when a disaster hits; House plays `repair` after a repair. The script respects `prefers-reduced-motion`.
  - Clean sprites come from the disaster pack, which matches the newer `files_bg/house_and_region_assets.zip`; zone masks and zoom views still come from `house_and_region_assets`.
- **Mod icons** (`assets/map/mod_icons/png/<icon>_128.png`, linked by `icon` in `mods.json`): shown beside each upgrade in the upgrade windows; `plus_128.png` is the "+" marker. Solar panels' icon is unused (open question 4).
- At boot, `buildHouseAssets()` fails loudly if a house is missing any sprite, damage sprite, background, foreground (flood houses), "+" position or slip path, if its damage kind doesn't match its area, or if a mod's icon is missing.
- **Draw remaining effects in code**: light rain while the calendar flips, and the flipping calendar itself; disaster and repair animations come from the designer's script.
- **Placeholder art** may use Kenney (CC0) packs.
- Record the licence of every third-party asset in `assets/LICENSES.md`.
- **Audio** (`src/ui/audio.ts`) plays files from `assets/audio/game/`, built by `tools/audio/process.sh` from the recordings in `assets/audio/` (silent edges trimmed, music loudness-matched, MP3 for the web). Re-run the script after replacing a recording.
  - Music: menu music plays on the Title screen and the map until the player picks an area. Then it crossfades to that region's looping track (coastal, riverside → urban, hillysides → hills), which crossfades again if they pick a different region and keeps playing through the house and year screens (and back on the map, e.g. after selling). Returning to the Title screen brings back the menu music.
  - Click: plays on every pointer press on the game canvas.
  - Disasters: the Roll scene plays the flood or landslide sound when its effect starts. The landslide sound is cut to the length of the slip animation, with fades; the flood sound fades out if the player leaves the Roll screen before it ends.
  - Fades run on the game loop, not scene tweens, so they carry on through scene changes.

## Tests that must exist in src/sim

- **Band lookup:** exact boundaries (8, 8.5, 9, 9.5, 10, 10.5) and values above 10.5 for both disasters.
- **Area mapping:** Hills houses never roll floods; Coastal and Urban houses never roll landslides.
- **Damage:** single mod, stacked mods, reductions past the floor give exactly 10%, no mods gives base damage.
- **Actions:** a mod costs 1 action, the player can't exceed `actionsPerTurn`, a permanent mod can't be applied twice.
- **Repairs:** cost 1 action, restore exactly the full value (including upgrades), charge `repairCostRate` × value lost, are unavailable when the house is undamaged or the bank can't cover the cost.
- **Money:** income is added at year start; no action can take the bank below 0.
- **Value:** permanent upgrades add their cost to value and full value, consumables add nothing; value never exceeds the full value; selling returns the upgraded value; the house is destroyed exactly when value reaches 0 or below (test 40% × 3 and 10% × 10).
- **Consumables:** used up only when their disaster hits.
- **Unrepaired hits:** each hit adds one, a repair resets to 0, a year with no disaster leaves it unchanged.
- **Footprint:** quiz delta, mod deltas, never below `balance.minFootprint`, odds use the updated value; planting trees doesn't change it; every question has 1 correct, 1 neutral and 2 wrong answers.
- **Year's question:** each year opens with it; actions are locked until it's answered; it can be answered once a year; the answer changes the footprint only when the year ends.
- **Outcome:** destruction ends the game as a loss immediately; surviving year N is a win; selling is blocked when no other house would be affordable or the player has already moved this year.
- **Data:** the bundled data validates; a missing `source`, unknown area or gap between weather bands fails loudly.
- **Determinism:** the same seed and same choices give the same game.

## Open questions

Do not invent answers to these. Use the default and leave a `TODO(open-question)` comment.

1. **Severity tiers.** These were requested earlier, but the new model has one damage value per disaster.
   - Default: no tiers in the MVP.
2. **Missing numbers:**
   - Starting footprint and yearly base increment.
   - Mod dollar costs.
   - Starting budget, yearly income and house prices.
   - Game length N.
   - Defaults: placeholders.
3. **Selling.** Does selling cost actions?
   - Default: selling plus buying uses the whole turn.
4. **Solar panels.** These were in the earlier summary but are not in the new mod list.
   - Default: leave them out.
