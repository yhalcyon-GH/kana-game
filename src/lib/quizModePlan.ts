import { shuffle } from './shuffle'

export type QuizMode = 'read' | 'recall'

// Builds a shuffled sequence of `count` question modes with Read/Recall as
// evenly split as possible (exactly 4+4 for the normal 8-question session;
// one direction gets a single extra for an odd-length mistake replay).
// Deliberately not an unconstrained per-round coin flip — that could
// accidentally produce an all-Read or all-Recall session.
export function buildQuizModePlan(count: number): QuizMode[] {
  const half = Math.floor(count / 2)
  const remainder = count - half * 2
  const modes: QuizMode[] = [...Array(half).fill('read'), ...Array(half).fill('recall')]
  if (remainder > 0) {
    modes.push(Math.random() < 0.5 ? 'read' : 'recall')
  }
  return shuffle(modes)
}
