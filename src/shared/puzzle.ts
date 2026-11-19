import type { Move } from '@playhex/move-notation';

/**
 * Puzzle as displayed during a round: red to play and win in one move.
 * Solution is only sent to clients on drop phase.
 */
export type PublicPuzzle = {
    redStones: Move[];
    blueStones: Move[];
    lastMove: null | Move;
};

export type Puzzle = PublicPuzzle & {
    solution: Move;
};

export const occupiedCells = (puzzle: PublicPuzzle): Set<Move> => new Set([...puzzle.redStones, ...puzzle.blueStones]);

export const parseStones = (stones: string): Move[] => stones.trim().split(/\s+/).filter(Boolean) as Move[];
