/**
 * Player-facing text built from sim state. Pure functions (no Phaser) so the
 * framing rules can be checked in one place:
 * - the player's choices (in the roles the questions give them) move the carbon footprint; never say a choice
 *   caused a specific flood or landslide;
 * - every review covers cause → effect → what helped or would have helped;
 * - placeholder numbers are "game values", never real-world data.
 */
import type { Area, Disaster, GameData, Mod, QuizPriority, QuizQuestion } from '../data/schemas';
import { bestMissingMod } from '../sim/advice';
import { damageIfHit } from '../sim/damage';
import { formatMoney, formatTonnes } from '../sim/format';
import {
  getArea,
  getHouse,
  activeMods,
  type DisasterResult,
  type GameState,
  type HouseState,
  type YearRecord,
} from '../sim/state';

/** The calendar year shown for game year `year` (1-based), e.g. 2026. */
export function calendarYear(data: GameData, year: number): number {
  return data.balance.startYear + year - 1;
}

/** The calendar year the game ends in, e.g. 2035. */
export function lastCalendarYear(data: GameData): number {
  return calendarYear(data, data.balance.gameLengthYears);
}

export const DISASTER_NAME: Record<Disaster, string> = { flood: 'Flood', landslide: 'Landslide' };
const lower = (d: Disaster) => DISASTER_NAME[d].toLowerCase();

/** The line shown once the year has passed: each disaster that hit, or that none did. */
export function yearVerdict(results: DisasterResult[]): string {
  const hits = results.filter((r) => r.hit);
  if (hits.length === 0) return 'You were lucky: there were no climate disasters this year.';
  const names = listJoin(hits.map((r) => `a ${lower(r.disaster)}`));
  return `Unfortunately, ${names} ${hits.length > 1 ? 'hit' : 'hits'} your home.`;
}
const plural = (d: Disaster) => `${lower(d)}s`;

export function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function signedTonnes(t: number): string {
  return `${t > 0 ? '+' : t < 0 ? '−' : '±'}${formatTonnes(Math.abs(t))}`;
}

export function areaHazardLine(area: Area): string {
  const hazards = listJoin(area.disasters.map(plural));
  const causes = area.floodCauses.length ? ` Floods here come from ${listJoin(area.floodCauses)}.` : '';
  return `Hazard: ${hazards}.${causes}`;
}

/**
 * Tooltip for a mod in an upgrade window: what it is and whether it lasts.
 * Deliberately says nothing about how much it reduces damage (players find that out in the year review).
 */
export function modTooltip(mod: Mod): string {
  const kind =
    mod.type === 'consumable'
      ? 'Used up when its disaster hits; restock it afterwards. Adds nothing to the house value.'
      : 'Permanent: stays with this house and adds to its value.';
  return `${mod.blurb}\n${kind}`;
}

/** "Damage if hit" for each of the area's disasters, e.g. "Flood 15%". */
export function damageIfHitLine(data: GameData, house: HouseState): string {
  const area = getArea(data, getHouse(data, house.houseId).areaId);
  return area.disasters.map((d) => `${DISASTER_NAME[d]} ${damageIfHit(data, house, d)}%`).join(' · ');
}

/** What the year's choice did to the carbon footprint, and so to the odds, in words (no figures). */
/** How a review box reads at a glance; the words always say the same thing, so colour is never the only signal. */
export type ReviewTone = 'good' | 'warn' | 'bad';

export interface ReviewBox {
  text: string;
  tone: ReviewTone;
}

/** What the year's choice did to the carbon footprint, by the answer's own change. */
function footprintCause(rec: YearRecord): ReviewBox {
  const delta = rec.quiz.footprintDelta;
  if (delta < 0) return { text: 'Your choice decreased the carbon footprint.', tone: 'good' };
  if (delta > 0) return { text: 'Your choice increased the carbon footprint.', tone: 'bad' };
  return { text: "Your choice didn't affect the carbon footprint.", tone: 'warn' };
}

/** Why a disaster like this happens here, tied to climate change but never to the player's choice. */
function disasterWhy(area: Area, disaster: Disaster): string {
  if (disaster === 'landslide') {
    return 'Heavy rain soaked the slope until the ground gave way, and heavier downpours are one of the consequences of climate change.';
  }
  const causes = area.floodCauses.length ? `Floods here come from ${listJoin(area.floodCauses)}. ` : '';
  return `${causes}Climate change is bringing heavier rain and stronger storms, so floods like this are becoming more common.`;
}

const TONE_RANK: Record<ReviewTone, number> = { good: 0, warn: 1, bad: 2 };
const worst = (tones: ReviewTone[]): ReviewTone => tones.reduce((w, t) => (TONE_RANK[t] > TONE_RANK[w] ? t : w), 'good');

/**
 * Year review: three short boxes in words, no figures, each with a tone for its colour:
 * what the year's choice did to the carbon footprint → whether a disaster damaged the
 * house (and why) → how well prepared the house was, without naming upgrades.
 */
export function yearReview(data: GameData, state: GameState, rec: YearRecord): ReviewBox[] {
  const area = getArea(data, rec.areaId);
  const house = state.house!;
  const effect: string[] = [];
  const effectTones: ReviewTone[] = [];
  const help: string[] = [];
  const helpTones: ReviewTone[] = [];
  for (const r of rec.results) {
    const what = lower(r.disaster);
    if (!r.hit) {
      effect.push(`Your house wasn't damaged by a ${what} this year.`);
      effectTones.push('good');
      // Preparation is described in general terms, without naming upgrades.
      const helping = activeMods(data, house).filter((m) => (m.reductions[r.disaster] ?? 0) > 0);
      const canDoMore = bestMissingMod(data, [...house.permanentMods, ...house.consumables], r.disaster) !== null;
      if (helping.length === 0) {
        help.push(`You don't have any upgrades to protect against ${plural(r.disaster)} yet.`);
        helpTones.push('bad');
      } else if (canDoMore) {
        help.push(`Your upgrades will help when a ${what} comes, but you could do more to prepare.`);
        helpTones.push('warn');
      } else {
        help.push(`You've done all you could to prepare for ${plural(r.disaster)}.`);
        helpTones.push('good');
      }
      continue;
    }

    effect.push(`Your house was damaged by a ${what}. ${disasterWhy(area, r.disaster)}`);
    effectTones.push('bad');
    const canDoMore = bestMissingMod(data, r.helpedBy, r.disaster) !== null;
    if (r.helpedBy.length === 0) {
      help.push(`You didn't have any upgrades to protect against ${plural(r.disaster)}, so the house took the full hit.`);
      helpTones.push('bad');
    } else if (canDoMore) {
      help.push('Your upgrades helped reduce the damage, but you could do more to prepare.');
      helpTones.push('warn');
    } else {
      help.push('Your upgrades helped reduce the damage, and you did all you could.');
      helpTones.push('good');
    }
  }
  if (rec.destroyed) effect.push('The damage added up, and your house has been destroyed.');

  return [
    footprintCause(rec),
    { text: effect.join('\n'), tone: worst(effectTones) },
    { text: help.join('\n'), tone: worst(helpTones) },
  ];
}

export const PLACEHOLDER_NOTE = 'Prices, footprints and odds are game values, not real-world data.';

/** A region's hazards for map labels, e.g. "Floods" or "Floods and landslides". */
export function regionHazardLabel(data: GameData, regionId: string): string {
  const disasters = [...new Set(data.areas.filter((a) => a.regionId === regionId).flatMap((a) => a.disasters))];
  const text = listJoin(disasters.map(plural));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export interface QuizFeedback {
  /** True when the answer has the lowest footprint change of the options (ties count). */
  correct: boolean;
  verdict: string;
  /** What the choice does to the carbon footprint (direction only, no figures). */
  footprintLine: string;
  /** The lowest-footprint answers. */
  best: QuizQuestion['answers'];
}

/** Feedback shown after answering the year's question. */
export function quizFeedback(question: QuizQuestion, answerId: string): QuizFeedback {
  const chosen = question.answers.find((a) => a.id === answerId)!;
  const lowest = Math.min(...question.answers.map((a) => a.footprintDelta));
  const best = question.answers.filter((a) => a.footprintDelta === lowest);
  const correct = chosen.footprintDelta === lowest;
  // No tonne figures here: the HUD arrow and gauge show the change.
  const change = chosen.footprintDelta < 0 ? 'go down' : chosen.footprintDelta > 0 ? 'go up' : 'stay the same';
  return {
    correct,
    best,
    verdict: correct
      ? '✓ Good choice: the lowest-footprint option.'
      : `✗ Not the best choice: ${listJoin(best.map((a) => `"${a.label}"`))} would be lower.`,
    footprintLine: correct
      ? `You made the right call, so the carbon footprint would ${change}.`
      : `With this choice, the carbon footprint would ${change}.`,
  };
}

export interface HudIntroStep {
  key: 'footprint' | 'bank' | 'houseValue' | 'repairCost';
  title: string;
  body: string;
}

/** The short tour of the HUD boxes, shown at the start of a new game. */
export function hudIntro(data: GameData): HudIntroStep[] {
  const { startingBudget, incomePercentOfHouseValue, actionsPerRepair } = data.balance;
  return [
    {
      key: 'footprint',
      title: 'Carbon footprint',
      body:
        'The carbon added each year, in tonnes. ' +
        'The choices you make push it up or down, and a bigger footprint makes floods and landslides more likely.',
    },
    {
      key: 'bank',
      title: 'Bank',
      body:
        `Your money. You start with ${formatMoney(startingBudget)}, and each year starts with ${incomePercentOfHouseValue}% of what you paid for your house added. ` +
        `It pays for your house, upgrades and repairs, and can't go below $0.`,
    },
    {
      key: 'houseValue',
      title: 'House value',
      body:
        "What your house is worth. Each flood or landslide that hits takes a share of it, and if it falls to $0 the " +
        "house is destroyed and the game ends. It's $0 until you buy a house.",
    },
    {
      key: 'repairCost',
      title: 'Total repair cost',
      body:
        `What it would cost to fix all the damage right now. Repairing takes ${actionsPerRepair} action and brings the house ` +
        'back to full value, so each year you choose between repairing and preparing.',
    },
  ];
}

/** After answering: the COP31 priority behind the question and its global goal. */
export function cop31Line(priority: QuizPriority): string {
  return `COP31 priority: ${priority.name}. Goal: ${priority.goal}`;
}

/** The title screen's pitch: a two-line tagline and a short how-to-play. */
export function titleIntro(data: GameData): { tagline: string; body: string } {
  return {
    tagline: 'Your choices change how often disaster strikes.\nYour preparation decides how much it hurts.',
    body:
      `Buy a home in a valley-and-harbour city and keep it standing from ${data.balance.startYear} to ${lastCalendarYear(data)}.\n\n` +
      'Each year starts with a big decision. Make the right call, ' +
      'and floods and landslides come less often.\n\n' +
      `Then get ready: you have ${data.balance.actionsPerTurn} actions a year to upgrade or repair. ` +
      'Prepare for the hazards where you live, and the next storm does far less damage.',
  };
}
