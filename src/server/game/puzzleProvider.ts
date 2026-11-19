import { notInArray, sql } from 'drizzle-orm';
import { parseStones, type Puzzle } from '../../shared/puzzle.js';
import { db } from '../db/index.js';
import { puzzle } from '../db/schema.js';
import type { Move } from '@playhex/move-notation';

export type ServerPuzzle = Puzzle & { id: number };

export type PuzzleRow = typeof puzzle.$inferSelect;

export const rowToPuzzle = (row: PuzzleRow): ServerPuzzle => ({
    id: row.id,
    redStones: parseStones(row.redStones),
    blueStones: parseStones(row.blueStones),
    lastMove: row.lastMove as null | Move,
    solution: row.solution as Move,
});

/**
 * Random puzzles, not already played in this game.
 * Single entry point to later choose puzzles by difficulty.
 */
export const pickRandomPuzzles = async (count: number, excludeIds: number[] = []): Promise<ServerPuzzle[]> => {
    const rows = await db.select().from(puzzle)
        .where(excludeIds.length > 0 ? notInArray(puzzle.id, excludeIds) : undefined)
        .orderBy(sql`RAND()`)
        .limit(count);

    return rows.map(rowToPuzzle);
};
