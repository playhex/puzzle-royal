import { and, eq, notInArray, sql, type SQL } from 'drizzle-orm';
import { parseStones, type Puzzle } from '../../shared/puzzle.js';
import { db } from '../db/index.js';
import { puzzle } from '../db/schema.js';
import type { Move } from '@playhex/move-notation';

export type ServerPuzzle = Puzzle & { id: number };

export type PuzzleRow = typeof puzzle.$inferSelect;

export const DIFFICULTY_EASY = 1;
export const DIFFICULTY_MEDIUM = 2;
export const DIFFICULTY_HARD = 3;

export const rowToPuzzle = (row: PuzzleRow): ServerPuzzle => ({
    id: row.id,
    redStones: parseStones(row.redStones),
    blueStones: parseStones(row.blueStones),
    lastMove: row.lastMove as null | Move,
    solution: row.solution as Move,
});

const pick = async (count: number, excludeIds: number[], difficulty?: number): Promise<ServerPuzzle[]> => {
    if (count <= 0) {
        return [];
    }

    const conditions: SQL[] = [];

    if (excludeIds.length > 0) conditions.push(notInArray(puzzle.id, excludeIds));
    if (difficulty !== undefined) conditions.push(eq(puzzle.initialDifficulty, difficulty));

    const rows = await db.select().from(puzzle)
        .where(and(...conditions))
        .orderBy(sql`RAND()`)
        .limit(count);

    return rows.map(rowToPuzzle);
};

/**
 * Random puzzles of any difficulty, not already played in this game.
 */
export const pickRandomPuzzles = async (count: number, excludeIds: number[] = []): Promise<ServerPuzzle[]> => pick(count, excludeIds);

/**
 * Puzzles for a new game: 2 easy, then 2 medium, then random ones of any difficulty.
 * Missing easy or medium puzzles are replaced by random ones.
 */
export const pickGameStartPuzzles = async (count: number): Promise<ServerPuzzle[]> => {
    const result: ServerPuzzle[] = [];
    const ids = () => result.map(p => p.id);

    for (const difficulty of [DIFFICULTY_EASY, DIFFICULTY_MEDIUM]) {
        const wanted = Math.min(2, count - result.length);
        const found = await pick(wanted, ids(), difficulty);

        result.push(...found, ...await pick(wanted - found.length, [...ids(), ...found.map(p => p.id)]));
    }

    result.push(...await pick(count - result.length, ids()));

    return result;
};
