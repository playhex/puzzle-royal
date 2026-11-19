/**
 * Lists puzzles sorted by elimination rate (hardest first).
 *
 * Usage: pnpm puzzles:stats [limit]
 */
import { queryPuzzleStats } from '../api.js';
import { closeDb } from '../db/index.js';

const limit = Number(process.argv[2] ?? 50);

try {
    const rows = (await queryPuzzleStats()).slice(0, limit);

    if (rows.length === 0) {
        console.log('No puzzle played online yet.');
    }

    console.table(rows.map(r => ({
        id: r.id,
        solution: r.puzzle.solution,
        'elim %': Math.round(r.eliminationRate * 100),
        shown: r.timesShown,
        present: r.playersPresent,
        eliminated: r.playersEliminated,
        'all fell': r.roundsAllFell,
        'none fell': r.roundsNoneFell,
        'avg reach s': r.avgReachMs === null ? '-' : (r.avgReachMs / 1000).toFixed(1),
        'worst cell': r.mostWrongCell ? `${r.mostWrongCell.cell} (${r.mostWrongCell.count})` : '-',
        'rating elim': r.avgEliminatedRating === null ? '-' : Math.round(r.avgEliminatedRating),
        'rating surv': r.avgSurvivorRating === null ? '-' : Math.round(r.avgSurvivorRating),
    })));
} finally {
    await closeDb();
}
