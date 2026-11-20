/**
 * Imports puzzles from a json file containing a list of puzzles (see src/server/puzzles/puzzleFile.ts).
 * Only adds new positions: never duplicates nor touches stats of already imported puzzles.
 * For already imported puzzles, only updates initialDifficulty when present in file.
 *
 * Usage: pnpm puzzles:import [file], defaults to fixtures/puzzles.json
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { closeDb, db } from '../db/index.js';
import { puzzle } from '../db/schema.js';
import { parsePuzzleFile, type PuzzleFile } from '../puzzles/puzzleFile.js';

const defaultFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../fixtures/puzzles.json');

const main = async () => {
    const file = path.resolve(process.argv[2] ?? defaultFile);
    const list: unknown = JSON.parse(await readFile(file, 'utf8'));

    if (!Array.isArray(list)) {
        throw new Error(`${file}: expected a list of puzzles`);
    }

    const puzzles: PuzzleFile[] = [];
    const invalid: string[] = [];

    list.forEach((item, i) => {
        try {
            puzzles.push(parsePuzzleFile(item));
        } catch (e) {
            invalid.push(`#${i}: ${e instanceof Error ? e.message : String(e)}`);
        }
    });

    const positionKey = (p: { redStones: string; blueStones: string }) => `${p.redStones}|${p.blueStones}`;
    const existing = new Map((await db.select({
        redStones: puzzle.redStones,
        blueStones: puzzle.blueStones,
        initialDifficulty: puzzle.initialDifficulty,
    }).from(puzzle)).map(p => [positionKey(p), p.initialDifficulty]));

    const added = puzzles.filter(p => !existing.has(positionKey(p))).length;
    const difficultyUpdated = puzzles.filter(p => existing.has(positionKey(p))
        && p.initialDifficulty !== undefined
        && existing.get(positionKey(p)) !== p.initialDifficulty).length;

    for (let i = 0; i < puzzles.length; i += 200) {
        // Same position already imported: only initial difficulty is updated, if set in file.
        // Stats are in another table, never touched.
        await db.insert(puzzle).values(puzzles.slice(i, i + 200))
            .onDuplicateKeyUpdate({ set: { initialDifficulty: sql`COALESCE(VALUES(\`initial_difficulty\`), \`initial_difficulty\`)` } });
    }

    console.log(`${file}: ${list.length} puzzles`);
    console.log(`  added:   ${added}`);
    console.log(`  already imported: ${puzzles.length - added} (initial difficulty updated: ${difficultyUpdated})`);
    console.log(`  invalid: ${invalid.length}`);
    invalid.forEach(line => console.log(`    ${line}`));
};

try {
    await main();
} finally {
    await closeDb();
}
