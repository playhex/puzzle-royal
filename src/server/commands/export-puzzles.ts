/**
 * Exports all puzzles with their initial difficulty to a json file, importable with puzzles:import.
 * initialDifficulty is omitted for puzzles not yet rated.
 *
 * Usage: pnpm puzzles:export [file], prints to stdout when no file given
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { asc } from 'drizzle-orm';
import { closeDb, db } from '../db/index.js';
import { puzzle } from '../db/schema.js';
import type { PuzzleFile } from '../puzzles/puzzleFile.js';

const main = async () => {
    const rows = await db.select().from(puzzle).orderBy(asc(puzzle.id));

    const puzzles: PuzzleFile[] = rows.map(row => ({
        redStones: row.redStones,
        blueStones: row.blueStones,
        lastMove: row.lastMove,
        solution: row.solution,
        ...(row.initialDifficulty !== null ? { initialDifficulty: row.initialDifficulty as 1 | 2 | 3 } : {}),
    }));

    // One puzzle per line, like fixtures/puzzles.json
    const json = `[\n${puzzles.map(p => `    ${JSON.stringify(p)}`).join(',\n')}\n]\n`;
    const file = process.argv[2];

    if (!file) {
        process.stdout.write(json);
        return;
    }

    await writeFile(path.resolve(file), json);

    const rated = puzzles.filter(p => p.initialDifficulty !== undefined).length;

    console.log(`${path.resolve(file)}: ${puzzles.length} puzzles exported (${rated} rated)`);
};

try {
    await main();
} finally {
    await closeDb();
}
