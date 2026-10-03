import type { GameData } from '../data/schemas';
import { shuffle } from './rng';

/**
 * Draws a new game's question order from the bank. The order is random (seeded), but
 * balanced: it goes round the COP31 priorities in rounds, one question from each in a
 * shuffled order, so every priority comes up before any repeats, and the same priority
 * never comes up two years running across a round boundary when it can be avoided.
 */
export function drawQuestionOrder(data: GameData, rngState: number): { order: string[]; rng: number } {
  let rng = rngState;
  const pools = new Map<string, string[]>();
  for (const p of data.quizPriorities) {
    const drawn = shuffle(
      data.quiz.filter((q) => q.priority === p.id).map((q) => q.id),
      rng,
    );
    rng = drawn.state;
    pools.set(p.id, drawn.items);
  }

  const order: string[] = [];
  let lastPriority: string | null = null;
  while ([...pools.values()].some((pool) => pool.length > 0)) {
    const remaining = data.quizPriorities.map((p) => p.id).filter((id) => pools.get(id)!.length > 0);
    const drawn = shuffle(remaining, rng);
    rng = drawn.state;
    const round = drawn.items;
    if (round.length > 1 && round[0] === lastPriority) [round[0], round[1]] = [round[1]!, round[0]!];
    for (const priority of round) order.push(pools.get(priority)!.shift()!);
    lastPriority = round[round.length - 1] ?? lastPriority;
  }
  return { order, rng };
}
