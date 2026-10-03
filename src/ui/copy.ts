/**
 * Player-facing text built from sim state. Pure functions (no Phaser) so the
 * framing rules can be checked in one place:
 * - talk about the carbon footprint as if everyone made the player's choices, never one household causing a disaster;
 * - every review covers cause → effect → what helped or would have helped;
 * - placeholder numbers are "game values", never real-world data.
 */
import type { Area, Disaster, GameData, Mod, QuizPriority, QuizQuestion } from '../data/schemas';
import { bestMissingMod, modsThatDontFit } from '../sim/advice';
import { damageIfHit, hitsLeft, reductionFrom } from '../sim/damage';
import { repairCost } from '../sim/economy';
import { formatMoney, formatTonnes } from '../sim/format';
import {
  getArea,
  getHouse,
  getMod,
  getQuestion,
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
      : `Permanent: stays with this house and adds ${formatMoney(mod.cost)} to its value.`;
  return `${mod.blurb}\n${kind}`;
}

/** "Damage if hit" for each of the area's disasters, e.g. "Flood 15%". */
export function damageIfHitLine(data: GameData, house: HouseState): string {
  const area = getArea(data, getHouse(data, house.houseId).areaId);
  return area.disasters.map((d) => `${DISASTER_NAME[d]} ${damageIfHit(data, house, d)}%`).join(' · ');
}

function footprintCause(data: GameData, rec: YearRecord): string {
  const q = getQuestion(data, rec.quiz.questionId);
  const answer = q.answers.find((a) => a.id === rec.quiz.answerId);
  const parts = [`yearly rise ${signedTonnes(rec.baseIncrement)}`];
  parts.push(`the "${answer?.label ?? rec.quiz.answerId}" choice ${signedTonnes(rec.quiz.footprintDelta)}`);
  if (rec.modFootprintDelta !== 0) parts.push(`mods ${signedTonnes(rec.modFootprintDelta)}`);
  return (
    `Assuming everyone made the same choices you did, the carbon footprint went from ${formatTonnes(rec.footprintBefore)} ` +
    `to ${formatTonnes(rec.footprintAfter)} (${parts.join(', ')}).`
  );
}

export interface ReviewSection {
  title: string;
  body: string;
}

/** Year review: cause → effect → what helped / would have helped. */
export function yearReview(data: GameData, state: GameState, rec: YearRecord): ReviewSection[] {
  const area = getArea(data, rec.areaId);
  const house = state.house!;
  const sections: ReviewSection[] = [];

  const causeLines = [footprintCause(data, rec)];
  for (const r of rec.results) {
    causeLines.push(
      `That set the ${lower(r.disaster)} chance at ${r.chancePercent}%. ` +
        (r.hit
          ? `A ${lower(r.disaster)} hit ${area.name}.` +
            (r.disaster === 'flood' && area.floodCauses.length
              ? ` Here, floods come from ${listJoin(area.floodCauses)}.`
              : r.disaster === 'landslide'
                ? ' Heavy rain soaked the slope until the ground gave way.'
                : '')
          : `No ${lower(r.disaster)} this year.`),
    );
  }
  sections.push({ title: 'Cause', body: causeLines.join('\n') });

  const effectLines: string[] = [];
  const helpLines: string[] = [];
  for (const r of rec.results) {
    if (!r.hit) {
      effectLines.push(`The house wasn't damaged by a ${lower(r.disaster)}.`);
      const tip = bestMissingMod(data, [...house.permanentMods, ...house.consumables], r.disaster);
      helpLines.push(
        tip
          ? `To prepare for next time: ${tip.mod.name} would cut ${lower(r.disaster)} damage from ${tip.actualPercent}% to ${tip.withModPercent}%.`
          : `The house is as prepared for ${plural(r.disaster)} as it can be: ${plural(r.disaster)} would do the ${data.balance.minDamagePercent}% minimum.`,
      );
      continue;
    }
    const reductions = r.helpedBy.map((id) => {
      const mod = getMod(data, id);
      return `${mod.reductions[r.disaster]} (${mod.name})`;
    });
    const sum = reductionFrom(r.helpedBy.map((id) => getMod(data, id)), r.disaster);
    const maths = reductions.length
      ? `${r.basePercent}% − ${reductions.join(' − ')}` +
        (r.basePercent - sum < data.balance.minDamagePercent ? ` → the ${data.balance.minDamagePercent}% minimum` : '') +
        ` = ${r.effectivePercent}%`
      : `${r.effectivePercent}%`;
    effectLines.push(
      `Damage: ${maths} of the house's full value${reductions.length ? '' : `, with no preparation for ${plural(r.disaster)}`}. ` +
        `The house lost ${formatMoney(r.valueLost)}.`,
    );
    if (r.consumablesUsed.length) {
      effectLines.push(`${listJoin(r.consumablesUsed.map((id) => getMod(data, id).name))} got used up. Restocking takes 1 action.`);
    }
    if (r.helpedBy.length) {
      helpLines.push(`What helped: ${listJoin(r.helpedBy.map((id) => getMod(data, id).name))} saved ${r.basePercent - r.effectivePercent} points of damage.`);
    }
    const tip = bestMissingMod(data, r.helpedBy, r.disaster);
    if (tip) {
      helpLines.push(`What would have helped: ${tip.mod.name} would have cut this hit from ${tip.actualPercent}% to ${tip.withModPercent}%.`);
    }
  }

  if (rec.destroyed) {
    effectLines.push('The damage added up: the house has been destroyed.');
  } else {
    effectLines.push(`The house is worth ${formatMoney(house.value)} of its full ${formatMoney(house.fullValue)}.`);
    if (house.value < house.fullValue) {
      const left = Math.min(...area.disasters.map((d) => hitsLeft(data, house, d)));
      effectLines.push(
        `Unrepaired, it can take ${left} more hit${left === 1 ? '' : 's'}. ` +
          `Repairing costs ${formatMoney(repairCost(data, house))} and 1 action, which is an action not spent preparing.`,
      );
    }
  }
  sections.push({ title: 'Effect', body: effectLines.join('\n') });

  const misfits = modsThatDontFit(data, house);
  if (misfits.length) {
    helpLines.push(
      `${listJoin(misfits.map((m) => m.name))} ${misfits.length === 1 ? "doesn't" : "don't"} help here: ` +
        `${area.name} faces ${listJoin(area.disasters.map(plural))}.`,
    );
  }
  sections.push({ title: 'What helped', body: helpLines.join('\n') || 'Nothing to add this year.' });
  return sections;
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
  /** What the choice does to the carbon footprint, in the "assuming everyone makes the same choice" framing. */
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
    footprintLine: `Assuming everyone makes the same choice you do, the carbon footprint would ${change}.`,
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
        'The carbon added each year, in tonnes, assuming everyone makes the same choices you do. ' +
        'Everyday choices push it up or down, and a bigger footprint makes floods and landslides more likely.',
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
