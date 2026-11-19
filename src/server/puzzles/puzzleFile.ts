import { parseMove, validateMove, type Move } from '@playhex/move-notation';
import { isOnBoard } from '../../shared/geometry.js';
import { parseStones } from '../../shared/puzzle.js';

const BOARDSIZE = 7;

/**
 * A puzzle in an import json file (the file is a list of them). Same fields as `puzzle` table.
 * Always 7x7, red to play and win in one move.
 *
 * [
 *     { "redStones": "a7 b3 c3 c5 d5 e3 e4", "blueStones": "b6 c6 d2 d3 d4 d6 e5 f6", "lastMove": "b6", "solution": "a6" }
 * ]
 */
export type PuzzleFile = {
    /** Space separated cells */
    redStones: string;

    /** Space separated cells */
    blueStones: string;

    /** Last blue move, highlighted, or null */
    lastMove: null | string;

    /** The only winning move for red */
    solution: string;
};

export class PuzzleFileError extends Error {}

/** Sorted stones, so that a same position is always written the same way (used to dedupe) */
const normalizeStones = (stones: Move[]): string => stones
    .map(move => ({ move, coords: parseMove(move) }))
    .sort((a, b) => a.coords.row - b.coords.row || a.coords.col - b.coords.col)
    .map(s => s.move)
    .join(' ');

const checkMove = (value: unknown, field: string): Move => {
    if (typeof value !== 'string' || !validateMove(value) || !isOnBoard(parseMove(value as Move), BOARDSIZE)) {
        throw new PuzzleFileError(`${field}: invalid cell "${String(value)}"`);
    }

    return value as Move;
};

/**
 * Validates a parsed puzzle and returns it normalized, ready to insert.
 *
 * @throws {PuzzleFileError}
 */
export const parsePuzzleFile = (input: unknown): PuzzleFile => {
    if (typeof input !== 'object' || input === null) {
        throw new PuzzleFileError('not an object');
    }

    const file = input as Record<string, unknown>;

    for (const field of ['redStones', 'blueStones'] as const) {
        if (typeof file[field] !== 'string') {
            throw new PuzzleFileError(`${field}: expected a string of space separated cells`);
        }
    }

    const red = parseStones(file.redStones as string).map(m => checkMove(m, 'redStones'));
    const blue = parseStones(file.blueStones as string).map(m => checkMove(m, 'blueStones'));
    const occupied = new Set<string>();

    for (const move of [...red, ...blue]) {
        if (occupied.has(move)) {
            throw new PuzzleFileError(`${move} is occupied twice`);
        }

        occupied.add(move);
    }

    const lastMove = file.lastMove === null || file.lastMove === undefined || file.lastMove === ''
        ? null
        : checkMove(file.lastMove, 'lastMove');

    if (lastMove !== null && !blue.includes(lastMove)) {
        throw new PuzzleFileError(`lastMove ${lastMove} must be a blue stone`);
    }

    const solution = checkMove(file.solution, 'solution');

    if (occupied.has(solution)) {
        throw new PuzzleFileError(`solution ${solution} is not an empty cell`);
    }

    return {
        redStones: normalizeStones(red),
        blueStones: normalizeStones(blue),
        lastMove,
        solution,
    };
};
