import { describe, expect, it } from 'vitest';
import { loadGameData } from '../data';
import type { DisasterResult } from '../sim/state';
import { quizFeedback, yearVerdict } from './copy';

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

  it('frames the change as everyone making the same choice, never blaming one household', () => {
    const f = quizFeedback(question, worse.id);
    expect(f.footprintLine).toMatch(/^Assuming everyone makes the same choice you do, the carbon footprint/);
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
