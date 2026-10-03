import { z } from 'zod';

export const DISASTERS = ['flood', 'landslide'] as const;
export const disasterSchema = z.enum(DISASTERS);
export type Disaster = z.infer<typeof disasterSchema>;

const id = z.string().regex(/^[a-z0-9-]+$/, 'ids are lower-case kebab-case');
const source = z.string().min(1, 'every data entry records a source');
const percent = z.number().min(0).max(100);
const money = z.number().int().nonnegative();

/** A partial map from disaster to a number, e.g. `{ "flood": 20 }`. */
const perDisaster = z.partialRecord(disasterSchema, percent);
const fullPerDisaster = z.record(disasterSchema, percent);

export const balanceSchema = z.strictObject({
  startingBudget: money,
  /** Each year starts with this percentage of the house's current value added to the bank. */
  incomePercentOfHouseValue: z.number().nonnegative(),
  actionsPerTurn: z.number().int().positive(),
  actionsPerMod: z.number().int().positive(),
  actionsPerRepair: z.number().int().positive(),
  minDamagePercent: percent,
  repairCostRate: z.number().nonnegative(),
  gameLengthYears: z.number().int().positive(),
  /** Calendar year of game year 1, for display (e.g. 2026; with 10 years the game ends in 2035). */
  startYear: z.number().int().positive(),
  startingFootprint: z.number().nonnegative(),
  /** The footprint never goes below this (tonnes); the first weather band starts here. */
  minFootprint: z.number().nonnegative(),
  /** Right-hand end of the HUD's footprint gauge (tonnes); the left end is minFootprint. */
  footprintGaugeMax: z.number().positive(),
  /** Every question has exactly these answers: `count` of each kind, each with its footprint change. */
  quizAnswers: z.record(
    z.enum(['correct', 'neutral', 'wrong']),
    z.strictObject({ footprintDelta: z.number(), count: z.number().int().positive() }),
  ),
  /** Each year the footprint rises by this percentage of its current value, before the answer and mods. */
  baseYearlyIncreasePercent: z.number(),
  source,
});

export const weatherSchema = z.strictObject({
  bands: z
    .array(
      z.strictObject({
        min: z.number().nonnegative(),
        max: z.number().positive(),
        odds: fullPerDisaster,
      }),
    )
    .min(1),
  baseDamagePercent: fullPerDisaster,
  source,
});

export const areasSchema = z.strictObject({
  regions: z
    .array(
      z.strictObject({
        id,
        name: z.string().min(1),
        /** Key of this region's shape in assets/map/region_labels.json. */
        mapRegion: z.string().min(1),
        blurb: z.string().min(1),
      }),
    )
    .min(1),
  areas: z
    .array(
      z.strictObject({
        id,
        regionId: id,
        name: z.string().min(1),
        disasters: z.array(disasterSchema).min(1),
        floodCauses: z.array(z.string().min(1)),
        source,
      }),
    )
    .min(1),
});

export const housesSchema = z.strictObject({
  houses: z
    .array(
      z.strictObject({
        id,
        areaId: id,
        /** Asset id in assets/map/house_and_region_assets (sprites/<sprite>.png, its _zones mask, and zoom_data pins). */
        sprite: z.string().regex(/^[a-z0-9_]+$/),
        name: z.string().min(1),
        tier: z.enum(['standard', 'luxury']),
        price: money.positive(),
        bedrooms: z.number().int().positive(),
        /** Square metres. */
        floorArea: z.number().positive(),
        built: z.string().min(1),
        /** Floor height above the ground, in metres. Shown to players; not used by the rules. */
        floorHeight: z.number().nonnegative(),
        blurb: z.string().min(1),
        source,
      }),
    )
    .min(2, 'selling needs at least one other house to move to'),
});

/** Where on the house a mod's "+" marker sits: a zone in the house sprite's _zones mask. */
export const SPOTS = ['door', 'foundation', 'garden'] as const;
export type Spot = (typeof SPOTS)[number];

export const modsSchema = z.strictObject({
  mods: z
    .array(
      z.strictObject({
        id,
        name: z.string().min(1),
        /** Icon in assets/map/mod_icons/png (<icon>_128.png). */
        icon: z.string().regex(/^[a-z_]+$/),
        spot: z.enum(SPOTS),
        type: z.enum(['permanent', 'consumable']),
        cost: money,
        reductions: perDisaster,
        footprintDelta: z.number(),
        blurb: z.string().min(1),
        source,
      }),
    )
    .min(1),
});

export const quizSchema = z.strictObject({
  questions: z
    .array(
      z.strictObject({
        id,
        prompt: z.string().min(1),
        answers: z
          .array(
            z.strictObject({
              id,
              label: z.string().min(1),
              footprintDelta: z.number(),
              /** Shown after answering: why this choice raises or lowers the footprint. */
              explanation: z.string().min(1),
            }),
          )
          .min(2),
        source,
      }),
    )
    .min(1),
});

export type Balance = z.infer<typeof balanceSchema>;
export type Weather = z.infer<typeof weatherSchema>;
export type WeatherBand = Weather['bands'][number];
export type Region = z.infer<typeof areasSchema>['regions'][number];
export type Area = z.infer<typeof areasSchema>['areas'][number];
export type House = z.infer<typeof housesSchema>['houses'][number];
export type Mod = z.infer<typeof modsSchema>['mods'][number];
export type QuizQuestion = z.infer<typeof quizSchema>['questions'][number];
export type QuizAnswer = QuizQuestion['answers'][number];

export interface GameData {
  balance: Balance;
  weather: Weather;
  regions: Region[];
  areas: Area[];
  houses: House[];
  mods: Mod[];
  quiz: QuizQuestion[];
}

export interface RawGameData {
  balance: unknown;
  weather: unknown;
  areas: unknown;
  houses: unknown;
  mods: unknown;
  quiz: unknown;
}

export class DataValidationError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid game data:\n- ${problems.join('\n- ')}`);
    this.name = 'DataValidationError';
  }
}

function parseFile<T>(file: string, schema: z.ZodType<T>, raw: unknown, problems: string[]): T | null {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  for (const issue of result.error.issues) {
    problems.push(`${file}: ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  }
  return null;
}

function checkUniqueIds(file: string, items: { id: string }[], problems: string[]): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) problems.push(`${file}: duplicate id "${item.id}"`);
    seen.add(item.id);
  }
}

/** Validates every data file plus cross-references. Throws a DataValidationError listing every problem. */
export function parseGameData(raw: RawGameData): GameData {
  const problems: string[] = [];
  const balance = parseFile('balance.json', balanceSchema, raw.balance, problems);
  const weather = parseFile('weather.json', weatherSchema, raw.weather, problems);
  const areas = parseFile('areas.json', areasSchema, raw.areas, problems);
  const houses = parseFile('houses.json', housesSchema, raw.houses, problems);
  const mods = parseFile('mods.json', modsSchema, raw.mods, problems);
  const quiz = parseFile('quiz.json', quizSchema, raw.quiz, problems);

  if (!balance || !weather || !areas || !houses || !mods || !quiz) {
    throw new DataValidationError(problems);
  }

  checkUniqueIds('areas.json regions', areas.regions, problems);
  checkUniqueIds('areas.json areas', areas.areas, problems);
  checkUniqueIds('houses.json', houses.houses, problems);
  checkUniqueIds('mods.json', mods.mods, problems);
  checkUniqueIds('quiz.json', quiz.questions, problems);
  for (const q of quiz.questions) checkUniqueIds(`quiz.json ${q.id} answers`, q.answers, problems);

  const regionIds = new Set(areas.regions.map((r) => r.id));
  for (const area of areas.areas) {
    if (!regionIds.has(area.regionId)) problems.push(`areas.json: area "${area.id}" has unknown region "${area.regionId}"`);
    if (area.disasters.includes('flood') && area.floodCauses.length === 0) {
      problems.push(`areas.json: flood area "${area.id}" needs at least one flood cause for review copy`);
    }
  }
  const areaIds = new Set(areas.areas.map((a) => a.id));
  for (const house of houses.houses) {
    if (!areaIds.has(house.areaId)) problems.push(`houses.json: house "${house.id}" has unknown area "${house.areaId}"`);
  }

  // Bands must be sorted, contiguous and start at the lowest possible footprint.
  weather.bands.forEach((band, i) => {
    if (band.max <= band.min) problems.push(`weather.json: band ${i} max must be above min`);
    const prev = weather.bands[i - 1];
    if (i === 0 && band.min !== balance.minFootprint) {
      problems.push(`weather.json: first band must start at balance.minFootprint (${balance.minFootprint})`);
    }
    if (prev && prev.max !== band.min) problems.push(`weather.json: band ${i} must start where band ${i - 1} ends`);
  });

  if (balance.startingFootprint < balance.minFootprint) {
    problems.push('balance.json: startingFootprint is below minFootprint');
  }
  if (balance.footprintGaugeMax <= balance.minFootprint) {
    problems.push('balance.json: footprintGaugeMax must be above minFootprint');
  }

  // Each question has exactly the configured mix of correct, neutral and wrong answers.
  const kinds = Object.entries(balance.quizAnswers);
  for (const q of quiz.questions) {
    const expected = kinds.reduce((sum, [, k]) => sum + k.count, 0);
    if (q.answers.length !== expected) {
      problems.push(`quiz.json ${q.id}: needs exactly ${expected} answers, has ${q.answers.length}`);
    }
    for (const [kind, k] of kinds) {
      const n = q.answers.filter((a) => a.footprintDelta === k.footprintDelta).length;
      if (n !== k.count) problems.push(`quiz.json ${q.id}: needs ${k.count} ${kind} answer(s) (${k.footprintDelta} t), has ${n}`);
    }
    for (const a of q.answers) {
      if (!kinds.some(([, k]) => k.footprintDelta === a.footprintDelta)) {
        problems.push(`quiz.json ${q.id}: answer "${a.id}" footprintDelta ${a.footprintDelta} isn't one of balance.quizAnswers`);
      }
    }
  }

  if (balance.minDamagePercent > Math.min(...Object.values(weather.baseDamagePercent))) {
    problems.push('balance.json: minDamagePercent is above a base damage value');
  }

  if (problems.length > 0) throw new DataValidationError(problems);

  return {
    balance,
    weather,
    regions: areas.regions,
    areas: areas.areas,
    houses: houses.houses,
    mods: mods.mods,
    quiz: quiz.questions,
  };
}
