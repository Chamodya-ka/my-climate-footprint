# My Climate Footprint

A browser game by **Team Remint** that helps students learn about climate choices and disaster preparedness.

**[Play the game](https://my-climate-footprint.vercel.app/)** · [Read our pitch](docs/pitch-script.md) · [View the presentation slide](theslide.pdf)

Demo video: in preparation.

## Our solution

Players buy a home and try to keep it standing for ten years. Each year, they answer a climate question, spend limited money on upgrades or repairs, and see how their home handles the weather.

The game teaches three ideas:

- **Where you live matters:** coastal and urban homes face floods; hillside homes face landslides.
- **Preparation helps:** suitable upgrades reduce damage, while repairs help a home survive future events.
- **Climate choices matter:** decisions change the game's carbon footprint and disaster odds.

Teachers can use the game to let students discuss choices and learn from the results. Prices and disaster odds are teaching values, not real-world predictions.

## A quick tour

1. Open the game, select **Start**, and choose a region and home.
2. Answer the year's climate question and read Rimu the kiwi's explanation.
3. Use the **+** markers to buy upgrades, then select **Finish Upgrades**.
4. Watch the weather, then select **See the year review** to learn what happened and what helped.

Continue for ten years or try another region to compare hazards.

## Explore the repository

| Location | What you will find |
| --- | --- |
| [src/sim/](src/sim/) | Game rules, weather, damage, money, and tests. Start with [turn.ts](src/sim/turn.ts). |
| [src/data/](src/data/) | Homes, regions, upgrades, and the [climate question bank](src/data/quiz.json). |
| [src/scenes/](src/scenes/) | Game screens, from choosing a home to the final report. |
| [src/ui/](src/ui/) | Controls, explanations, animations, and accessibility helpers. |
| [assets/](assets/) | Artwork and audio. |
| [CLAUDE.md](CLAUDE.md) | Detailed game design and technical notes. |

Built with **TypeScript, Phaser, Vite, Zod, and Vitest**. Runs entirely in the browser.

## Run locally

Use **Node.js 24.x** and npm. From the repository folder:

```bash
npm ci
npm run dev
```

Open **http://localhost:5173**. No API keys or backend setup are needed.

To check the project or create a production build:

```bash
npm test
npm run lint
npm run build
```
