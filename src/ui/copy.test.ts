import { describe, expect, it } from 'vitest';
import { loadGameData } from '../data';
import { quizFeedback } from './copy';

const question = loadGameData().quiz.find((q) => q.id === 'commute-1')!;

describe('quizFeedback', () => {
  it('marks the lowest-footprint answer as correct', () => {
    const f = quizFeedback(question, 'cycle');
    expect(f.correct).toBe(true);
    expect(f.verdict).toMatch(/^✓/);
    expect(f.footprintLine).toContain('go down by 1.0 t');
  });

  it('marks other answers as incorrect and names the best one', () => {
    const f = quizFeedback(question, 'drive');
    expect(f.correct).toBe(false);
    expect(f.verdict).toMatch(/^✗/);
    expect(f.verdict).toContain('"Cycle"');
    expect(f.footprintLine).toContain('go up by 1.0 t');
  });

  it('describes a zero change as staying the same', () => {
    expect(quizFeedback(question, 'carpool').footprintLine).toContain('stay the same');
  });

  it('uses the neighbourhood framing, never blaming one household', () => {
    const f = quizFeedback(question, 'drive');
    expect(f.footprintLine).toMatch(/^If your neighbourhood made this choice/);
  });
});
