import { describe, expect, it } from 'vitest';
import { loadGameData } from '../data';
import type { DisasterResult } from '../sim/state';
import { dataWith, FLOOD_HOUSE, LANDSLIDE_HOUSE, startedGame, YEAR1_QUESTION } from '../sim/testHelpers';
import { applyMod, endTurn, expectOk, newGame, sell } from '../sim/turn';
import { kiwiIntro, kiwiRegionLine, kiwiWhereToLive, quizFeedback, yearReview, yearVerdict } from './copy';

const data = loadGameData();
const question = data.quiz[0]!;
const { correct, neutral, wrong } = data.balance.quizAnswers;
const byDelta = (delta: number) => question.answers.find((a) => a.footprintDelta === delta)!;
const best = byDelta(correct.footprintDelta);
const worse = byDelta(wrong.footprintDelta);

describe('quizFeedback', () => {
  it('marks the lowest-footprint answer as correct', () => {
    const f = quizFeedback(question, best.id);
    expect(f.correct).toBe(true);
    expect(f.verdict).toMatch(/^✓/);
    expect(f.footprintLine).toContain('go down');
  });

  it('marks other answers as incorrect and names the best one', () => {
    const f = quizFeedback(question, worse.id);
    expect(f.correct).toBe(false);
    expect(f.verdict).toMatch(/^✗/);
    expect(f.verdict).toContain(`"${best.label}"`);
    expect(f.footprintLine).toContain('go up');
  });

  it('shows no tonne figures', () => {
    for (const a of question.answers) expect(quizFeedback(question, a.id).footprintLine).not.toMatch(/\d/);
  });

  it('describes a zero change as staying the same', () => {
    expect(quizFeedback(question, byDelta(neutral.footprintDelta).id).footprintLine).toContain('stay the same');
  });

  it("frames the change as the player's choice, never blaming it for a specific disaster", () => {
    expect(quizFeedback(question, best.id).footprintLine).toMatch(/^You made the right call, so the carbon footprint/);
    expect(quizFeedback(question, worse.id).footprintLine).toMatch(/^With this choice, the carbon footprint/);
    for (const a of question.answers) expect(quizFeedback(question, a.id).footprintLine).not.toMatch(/flood|landslide/i);
  });
});

describe('every COP31 priority', () => {
  it('has at least one question', () => {
    for (const p of data.quizPriorities) expect(data.quiz.some((q) => q.priority === p.id)).toBe(true);
  });
});

describe('yearVerdict', () => {
  const result = (disaster: DisasterResult['disaster'], hit: boolean) => ({ disaster, hit }) as DisasterResult;

  it('says the player was lucky when nothing hit, without naming a disaster', () => {
    const v = yearVerdict([result('flood', false)]);
    expect(v).toBe('You were lucky: there were no climate disasters this year.');
  });

  it('names each disaster that hit', () => {
    expect(yearVerdict([result('flood', true)])).toBe('Unfortunately, a flood hits your home.');
    expect(yearVerdict([result('flood', true), result('landslide', true)])).toBe(
      'Unfortunately, a flood and a landslide hit your home.',
    );
  });
});

describe('yearReview', () => {
  const always = dataWith((d) => {
    d.weather.bands.forEach((b) => (b.odds = { flood: 100, landslide: 100 }));
    d.balance.startingBudget = Math.max(...d.houses.map((h) => h.price));
  });
  const never = dataWith((d) => d.weather.bands.forEach((b) => (b.odds = { flood: 0, landslide: 0 })));
  const review = (d: typeof data, houseId: string, answerIndex = 0) => {
    const s = expectOk(endTurn(startedGame(houseId, d, 1, answerIndex), d));
    return yearReview(d, s, s.history[0]!);
  };
  const indexOf = (delta: number) => YEAR1_QUESTION.answers.findIndex((a) => a.footprintDelta === delta);
  const { correct, neutral, wrong } = data.balance.quizAnswers;

  it('has three boxes with no figures', () => {
    for (const d of [always, never]) {
      for (const houseId of [FLOOD_HOUSE, LANDSLIDE_HOUSE]) {
        const boxes = review(d, houseId);
        expect(boxes).toHaveLength(3);
        for (const box of boxes) expect(box.text).not.toMatch(/\d|%|\$/);
      }
    }
  });

  it('box 1 says whether the choice decreased, increased or didn\'t affect the footprint, coloured to match', () => {
    expect(review(never, FLOOD_HOUSE, indexOf(correct.footprintDelta))[0]).toEqual({
      text: 'Your choice decreased the carbon footprint.',
      tone: 'good',
    });
    expect(review(never, FLOOD_HOUSE, indexOf(wrong.footprintDelta))[0]).toEqual({
      text: 'Your choice increased the carbon footprint.',
      tone: 'bad',
    });
    expect(review(never, FLOOD_HOUSE, indexOf(neutral.footprintDelta))[0]).toEqual({
      text: "Your choice didn't affect the carbon footprint.",
      tone: 'warn',
    });
  });

  it('box 2 only says whether a disaster damaged the house, and why', () => {
    expect(review(never, FLOOD_HOUSE)[1]).toEqual({ text: "Your house wasn't damaged by a flood this year.", tone: 'good' });
    const flood = review(always, FLOOD_HOUSE)[1]!;
    expect(flood.tone).toBe('bad');
    expect(flood.text).toMatch(/^Your house was damaged by a flood\. .*climate change/i);
    expect(flood.text).not.toMatch(/unrepaired/i);
    expect(review(always, LANDSLIDE_HOUSE)[1]!.text).toMatch(/^Your house was damaged by a landslide\. Heavy rain.*climate change/);
  });

  it('box 3 never names upgrades; red with none, yellow if more could be done', () => {
    const sealed = expectOk(applyMod(startedGame(FLOOD_HOUSE, always), always, 'seal-doors'));
    const s = expectOk(endTurn(sealed, always));
    const help = yearReview(always, s, s.history[0]!)[2]!;
    for (const m of data.mods) expect(help.text).not.toContain(m.name);
    expect(help).toEqual({ text: 'Your upgrades helped reduce the damage, but you could do more to prepare.', tone: 'warn' });
    const none = review(always, FLOOD_HOUSE)[2]!;
    expect(none.tone).toBe('bad');
    expect(none.text).toMatch(/^You didn't have any upgrades to protect against floods/);
  });
});

describe('kiwiIntro', () => {
  const steps = kiwiIntro(data);
  const all = steps.map((s) => s.text).join(' ');

  it('explains the carbon footprint, money and how the game works', () => {
    expect(steps.map((s) => s.key).filter(Boolean)).toEqual(['footprint', 'bank', 'houseValue', 'repairCost']);
    expect(all).toMatch(/carbon footprint/);
    expect(all).toMatch(/upgrades or repairs/);
    expect(all).toMatch(/to win/);
  });

  it('takes its numbers from the game data', () => {
    expect(all).toContain('$1,500,000');
    expect(all).toContain(`${data.balance.incomePercentOfHouseValue}%`);
    expect(all).toContain(`${data.balance.actionsPerTurn} actions`);
    expect(all).toContain(`${data.balance.startYear + data.balance.gameLengthYears - 1}`);
  });

  it('speaks in short sentences', () => {
    const MAX_WORDS = 16;
    for (const sentence of all.split(/(?<=[.!?])\s+/)) expect(sentence.split(/\s+/).length).toBeLessThanOrEqual(MAX_WORDS);
  });
});

describe("Kiwi's question on the region map", () => {
  const MAX_WORDS = 16;
  const short = (text: string) => {
    for (const sentence of text.split(/(?<=[.!?])\s+/)) expect(sentence.split(/\s+/).length).toBeLessThanOrEqual(MAX_WORDS);
  };

  it('asks where to live, in short sentences', () => {
    const line = kiwiWhereToLive(newGame(data, 1));
    expect(line.heading).toBe('Where will you live?');
    short(line.text);
  });

  it('asks where to move after selling, with the sale value', () => {
    const sold = expectOk(sell(startedGame(), data));
    const line = kiwiWhereToLive(sold);
    expect(line.heading).toBe('Where will you move?');
    expect(line.text).toContain(`$${sold.thisYear.move!.saleValue.toLocaleString('en-NZ')}`);
    short(line.text);
  });

  it('describes each region briefly and names its hazard', () => {
    for (const region of data.regions) {
      const line = kiwiRegionLine(data, region);
      expect(line.heading).toBeUndefined();
      expect(line.text).not.toContain(region.name);
      expect(line.text).toMatch(/Watch out for (floods|landslides)\.$/);
      short(line.text);
    }
  });
});
