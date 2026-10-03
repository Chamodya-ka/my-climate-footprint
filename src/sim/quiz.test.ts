import { describe, expect, it } from 'vitest';
import { drawQuestionOrder } from './quiz';
import { quizForYear } from './state';
import { data } from './testHelpers';
import { newGame } from './turn';

const priorityOf = (id: string) => data.quiz.find((q) => q.id === id)!.priority;

describe('question order', () => {
  it('uses every question in the bank exactly once', () => {
    const { order } = drawQuestionOrder(data, 1);
    expect([...order].sort()).toEqual(data.quiz.map((q) => q.id).sort());
  });

  it('is the same for the same seed and differs between seeds', () => {
    expect(newGame(data, 7).questionOrder).toEqual(newGame(data, 7).questionOrder);
    const orders = new Set([1, 2, 3, 4, 5].map((seed) => newGame(data, seed).questionOrder.join()));
    expect(orders.size).toBeGreaterThan(1);
  });

  it('covers every COP31 priority before repeating one', () => {
    for (const seed of [1, 2, 3, 42, 999]) {
      const { order } = drawQuestionOrder(data, seed);
      const n = data.quizPriorities.length;
      for (let round = 0; round + n <= order.length; round += n) {
        expect(new Set(order.slice(round, round + n).map(priorityOf)).size).toBe(n);
      }
    }
  });

  it('never asks about the same priority two years running', () => {
    for (const seed of [1, 2, 3, 42, 999]) {
      const { order } = drawQuestionOrder(data, seed);
      for (let i = 1; i < order.length; i++) expect(priorityOf(order[i]!)).not.toBe(priorityOf(order[i - 1]!));
    }
  });

  it("each year's question follows the game's order", () => {
    const s = newGame(data, 5);
    for (let year = 1; year <= data.balance.gameLengthYears; year++) {
      expect(quizForYear(data, { ...s, year }).id).toBe(s.questionOrder[year - 1]);
    }
  });
});
