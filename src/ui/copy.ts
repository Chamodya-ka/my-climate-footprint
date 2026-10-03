/**
 * Player-facing text built from sim state. Pure functions (no Phaser) so the
 * framing rules can be checked in one place:
 * - talk about the neighbourhood's footprint, never one household causing a disaster;
 * - every review covers cause → effect → what helped or would have helped;
 * - placeholder numbers are "game values", never real-world data.
 */
import type { Area, Disaster, GameData, Mod } from '../data/schemas';
import { bestMissingMod, modsThatDontFit } from '../sim/advice';
import { damageIfHit, hitsLeft, modAddsNothing, modFitsArea, reductionFrom } from '../sim/damage';
import { repairCost } from '../sim/economy';
import { formatMoney, formatTonnes } from '../sim/format';
import { getArea, getHouse, getMod, quizForYear, type GameState, type HouseState, type YearRecord } from '../sim/state';

export const DISASTER_NAME: Record<Disaster, string> = { flood: 'Flood', landslide: 'Landslide' };
const lower = (d: Disaster) => DISASTER_NAME[d].toLowerCase();
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

/** Tooltip for a mod in the House view. */
export function modTooltip(data: GameData, house: HouseState, mod: Mod): string {
  const effects = (Object.entries(mod.reductions) as [Disaster, number][])
    .map(([d, n]) => `${DISASTER_NAME[d]} damage −${n} points`)
    .join(', ');
  const kind = mod.type === 'consumable' ? 'Consumable: used up when its disaster hits.' : 'Permanent: stays with this house.';
  const lines = [mod.blurb, `${effects}. ${kind}`];
  if (mod.footprintDelta !== 0) lines.push(`Neighbourhood footprint ${signedTonnes(mod.footprintDelta)} each year (game value).`);
  const area = getArea(data, getHouse(data, house.houseId).areaId);
  if (!modFitsArea(data, house, mod)) {
    lines.push(`Note: ${area.name} faces ${listJoin(area.disasters.map(plural))}, so this won't reduce damage here.`);
  } else if (modAddsNothing(data, house, mod)) {
    lines.push(`Note: damage is already at the ${data.balance.minDamagePercent}% minimum, so this won't reduce it further.`);
  }
  return lines.join('\n');
}

/** "Damage if hit" for each of the area's disasters, e.g. "Flood 15%". */
export function damageIfHitLine(data: GameData, house: HouseState): string {
  const area = getArea(data, getHouse(data, house.houseId).areaId);
  return area.disasters.map((d) => `${DISASTER_NAME[d]} ${damageIfHit(data, house, d)}%`).join(' · ');
}

function footprintCause(data: GameData, rec: YearRecord): string {
  const q = quizForYear(data, rec.year);
  const answer = q.answers.find((a) => a.id === rec.quiz.answerId);
  const parts = [`yearly rise ${signedTonnes(rec.baseIncrement)}`];
  parts.push(`the "${answer?.label ?? rec.quiz.answerId}" choice ${signedTonnes(rec.quiz.footprintDelta)}`);
  if (rec.modFootprintDelta !== 0) parts.push(`mods ${signedTonnes(rec.modFootprintDelta)}`);
  return (
    `If your neighbourhood made choices like yours, its footprint went from ${formatTonnes(rec.footprintBefore)} ` +
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
      `Damage: ${maths} of the original value${reductions.length ? '' : `, with no preparation for ${plural(r.disaster)}`}. ` +
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
    effectLines.push(`The house is worth ${formatMoney(house.value)} of its original ${formatMoney(house.originalValue)}.`);
    if (house.value < house.originalValue) {
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
