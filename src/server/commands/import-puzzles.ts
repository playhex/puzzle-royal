/**
 * Imports puzzles from a json file containing a list of puzzles (see src/server/puzzles/puzzleFile.ts).
 * Only adds new positions: never duplicates nor touches stats of already imported puzzles.
 *
 * Usage: pnpm puzzles:import [file], defaults to fixtures/puzzles.json
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { count, sql } from 'drizzle-orm';
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

const countPuzzles = async () => (await db.select({ n: count() }).from(puzzle))[0].n;
    const before = await countPuzzles();

    for (let i = 0; i < puzzles.length; i += 200) {
        // Same position already imported: no-op. Stats are in another table, never touched.
        await db.insert(puzzle).values(puzzles.slice(i, i + 200))
            .onDuplicateKeyUpdate({ set: { id: sql`${puzzle.id}` } });
    }

    const added = await countPuzzles() - before;

    console.log(`${file}: ${list.length} puzzles`);
    console.log(`  added:   ${added}`);
    console.log(`  skipped: ${puzzles.length - added} (already imported)`);
    console.log(`  invalid: ${invalid.length}`);
    invalid.forEach(line => console.log(`    ${line}`));
};

try {
    await main();
} finally {
    await closeDb();
}
