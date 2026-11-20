import { and, asc, count, desc, eq, gt, gte, inArray, isNull, sql } from 'drizzle-orm';
import express, { Router, type NextFunction, type Request, type Response } from 'express';
import type { Move } from '@playhex/move-notation';
import { db } from './db/index.js';
import { player as playerTable, replayGame, replayInputs, replayPlayer, replayRound, playerStats, playerSurvivedOpponent, puzzle, puzzleStats, puzzleWrongCell } from './db/schema.js';
import { env } from './env.js';
import { getSessionPlayer, refreshPlayerIfNeeded } from './auth/sessions.js';
import { toAvatarUrl, toProfile, toSettings, type PlayerRow } from './players.js';
import { rowToPuzzle } from './game/puzzleProvider.js';

export const apiRouter = Router();

const currentPlayer = async (req: Request): Promise<null | PlayerRow> => getSessionPlayer(req.headers.cookie);

/**
 * Logged in player, refreshing profile from PlayHex if needed.
 */
apiRouter.get('/me', async (req, res) => {
    let player = await currentPlayer(req);

    if (player) {
        player = await refreshPlayerIfNeeded(player);
    }

    if (!player) {
        res.json(null);
        return;
    }

    res.json({
        profile: toProfile(player),
        settings: toSettings(player),
        isAdmin: env.adminPublicIds.includes(player.publicId),
    });
});

/**
 * Winner of each game (none when last players fell together), by game internal id.
 */
const gamesWinners = async (gameIds: number[]) => {
    const winners = gameIds.length === 0 ? [] : await db.select().from(replayPlayer)
        .where(and(inArray(replayPlayer.gameId, gameIds), eq(replayPlayer.finalPlace, 1)));

    return (gameId: number) => winners
        .filter(w => w.gameId === gameId)
        .map(w => ({ publicId: w.playerPublicId, pseudo: w.pseudo, countryFlag: w.countryFlag }));
};

apiRouter.get('/puzzles/count', async (_req, res) => {
    const [{ n }] = await db.select({ n: count() }).from(puzzle);

    res.json({ count: n });
});

apiRouter.get('/games/recent', async (_req, res) => {
    const games = await db.select().from(replayGame).orderBy(desc(replayGame.endedAt)).limit(20);
    const winnersOf = await gamesWinners(games.map(g => g.id));

    res.json(games.map(g => ({
        gameId: g.publicId,
        endedAt: g.endedAt,
        playersCount: g.playersCount,
        roundsCount: g.roundsCount,
        winners: winnersOf(g.id),
    })));
});

/**
 * All data needed to replay a game.
 */
apiRouter.get('/games/:gameId', async (req, res) => {
    const [g] = await db.select().from(replayGame).where(eq(replayGame.publicId, req.params.gameId)).limit(1);

    if (!g) {
        res.status(404).json({ error: 'game_not_found' });
        return;
    }

    const [players, rounds, [inputs]] = await Promise.all([
        db.select().from(replayPlayer).where(eq(replayPlayer.gameId, g.id)).orderBy(replayPlayer.idx),
        db.select().from(replayRound).innerJoin(puzzle, eq(puzzle.id, replayRound.puzzleId))
            .where(eq(replayRound.gameId, g.id)).orderBy(replayRound.roundIndex),
        db.select().from(replayInputs).where(eq(replayInputs.gameId, g.id)),
    ]);

    res.json({
        gameId: g.publicId,
        startedAt: g.startedAt,
        endedAt: g.endedAt,
        config: g.config,
        players: players.map(p => ({
            profile: {
                publicId: p.playerPublicId,
                pseudo: p.pseudo,
                slug: '',
                isGuest: false,
                avatarUrl: p.avatarUrl,
                countryFlag: p.countryFlag,
                rating: p.rating,
                ratingDeviation: p.ratingDeviation,
            },
            finalPlace: p.finalPlace,
            eliminatedRound: p.eliminatedRound,
        })),
        startPositions: players.map(p => ({ x: p.startX, y: p.startY })),
        rounds: rounds.map(({ replay_round: r, puzzle: pz }) => {
            const { redStones, blueStones, lastMove, solution } = rowToPuzzle(pz);

            return {
                roundIndex: r.roundIndex,
                puzzle: { redStones, blueStones, lastMove },
                solution,
                origin: r.originCell as null | Move,
                times: { appearAt: r.appearMs, playAt: r.playMs, dropAt: r.dropMs, endAt: r.endMs },
            };
        }),
        inputs: inputs?.inputs ?? [],
    });
});

apiRouter.get('/players/:publicId/stats', async (req, res) => {
    const publicId = req.params.publicId;
    const [[playerRow], [stats], games, opponents] = await Promise.all([
        db.select().from(playerTable).where(eq(playerTable.publicId, publicId)),
        db.select().from(playerStats).where(eq(playerStats.playerPublicId, publicId)),
        db.select({
            id: replayGame.id,
            gameId: replayGame.publicId,
            endedAt: replayGame.endedAt,
            playersCount: replayGame.playersCount,
            roundsCount: replayGame.roundsCount,
            place: replayPlayer.finalPlace,
        }).from(replayPlayer).innerJoin(replayGame, eq(replayGame.id, replayPlayer.gameId))
            .where(eq(replayPlayer.playerPublicId, publicId)).orderBy(desc(replayGame.endedAt)).limit(10),
        db.select().from(playerSurvivedOpponent).where(eq(playerSurvivedOpponent.playerPublicId, publicId))
            .orderBy(desc(playerSurvivedOpponent.count)).limit(8),
    ]);
    const winnersOf = await gamesWinners(games.map(g => g.id));

    res.json({
        player: playerRow ? toProfile(playerRow) : null,
        avatarOriginalUrl: playerRow ? toAvatarUrl(playerRow.avatarPath ?? playerRow.avatarThumbnailPath) : null,
        gamesPlayed: stats?.gamesPlayed ?? 0,
        wins: stats?.wins ?? 0,
        puzzlesSolved: stats?.puzzlesSolved ?? 0,
        opponentsSurvivedTotal: stats?.opponentsSurvivedTotal ?? 0,
        opponentsSurvived: opponents.map(o => ({ publicId: o.opponentPublicId, pseudo: o.opponentPseudo, count: o.count })),
        games: games.map(({ id, ...g }) => ({ ...g, winners: winnersOf(id) })),
    });
});

/**
 * Top players of the last 365 days, by wins then fewer games played.
 */
apiRouter.get('/leaderboard', async (_req, res) => {
    const wins = sql<number>`CAST(SUM(${replayPlayer.finalPlace} = 1) AS UNSIGNED)`;
    const gamesPlayed = count();

    // Opponents eliminated before player in each game, fell together count as same place.
    // Written raw: drizzle does not qualify columns in correlated subqueries.
    const opponentsSurvived = sql<number>`CAST(SUM((
        SELECT COUNT(*) FROM replay_player opponent
        WHERE opponent.game_id = replay_player.game_id AND opponent.final_place > replay_player.final_place
    )) AS UNSIGNED)`;

    const rows = await db.select({ player: playerTable, wins, gamesPlayed, opponentsSurvived })
        .from(replayPlayer)
        .innerJoin(replayGame, eq(replayGame.id, replayPlayer.gameId))
        .innerJoin(playerTable, eq(playerTable.publicId, replayPlayer.playerPublicId))
        .where(gte(replayGame.endedAt, new Date(Date.now() - 365 * 24 * 3600 * 1000)))
        .groupBy(replayPlayer.playerPublicId)
        .orderBy(desc(wins), asc(gamesPlayed))
        .limit(50);

    res.json(rows.map(r => ({ player: toProfile(r.player), wins: Number(r.wins), gamesPlayed: r.gamesPlayed, opponentsSurvived: Number(r.opponentsSurvived) })));
});

/**
 * Puzzles sorted by elimination rate (admin only).
 */
export const queryPuzzleStats = async () => {
    const rows = await db.select({ puzzle, stats: puzzleStats }).from(puzzle)
        .innerJoin(puzzleStats, eq(puzzleStats.puzzleId, puzzle.id))
        .orderBy(desc(sql`${puzzleStats.playersEliminated} / NULLIF(${puzzleStats.playersPresent}, 0)`), desc(puzzleStats.timesShown));

    const wrongCells = rows.length === 0 ? [] : await db.select().from(puzzleWrongCell)
        .where(inArray(puzzleWrongCell.puzzleId, rows.map(r => r.puzzle.id)));

    return rows.map(({ puzzle: p, stats: s }) => {
        const worst = wrongCells.filter(w => w.puzzleId === p.id).sort((a, b) => b.count - a.count)[0] ?? null;
        const eliminatedRatingCount = s.playersEliminated;

        return {
            id: p.id,
            puzzle: rowToPuzzle(p),
            initialDifficulty: p.initialDifficulty,
            timesShown: s.timesShown,
            playersPresent: s.playersPresent,
            roundsWithElimination: s.roundsWithElimination,
            playersEliminated: s.playersEliminated,
            eliminationRate: s.playersPresent > 0 ? s.playersEliminated / s.playersPresent : 0,
            roundsAllFell: s.roundsAllFell,
            roundsNoneFell: s.roundsNoneFell,
            avgReachMs: s.survivorReachCount > 0 ? s.survivorReachMsSum / s.survivorReachCount : null,
            mostWrongCell: worst ? { cell: worst.cell, count: worst.count } : null,
            avgEliminatedRating: eliminatedRatingCount > 0 ? s.eliminatedRatingSum / eliminatedRatingCount : null,
            avgSurvivorRating: s.survivorsCount > 0 ? s.survivorRatingSum / s.survivorsCount : null,
        };
    });
};

/**
 * Rejects non admin players on all /admin routes.
 */
const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
    const player = await currentPlayer(req);

    if (!player || !env.adminPublicIds.includes(player.publicId)) {
        res.status(403).json({ error: 'forbidden' });
        return;
    }

    next();
};

apiRouter.use('/admin', requireAdmin);

apiRouter.get('/admin/check', (_req, res) => {
    res.json({ ok: true });
});

apiRouter.get('/admin/puzzles', async (_req, res) => {
    res.json(await queryPuzzleStats());
});

/**
 * Next puzzle without initial difficulty, with id greater than ?after (to skip puzzles).
 */
apiRouter.get('/admin/puzzles/unrated/next', async (req, res) => {
    const after = Number(req.query.after) || 0;
    const [[row], [{ remaining }]] = await Promise.all([
        db.select().from(puzzle)
            .where(and(isNull(puzzle.initialDifficulty), gt(puzzle.id, after)))
            .orderBy(asc(puzzle.id)).limit(1),
        db.select({ remaining: count() }).from(puzzle).where(isNull(puzzle.initialDifficulty)),
    ]);

    res.json({
        puzzle: row ? { ...rowToPuzzle(row), initialDifficulty: row.initialDifficulty } : null,
        remaining,
    });
});

/**
 * One puzzle with its initial difficulty, to go back and change it.
 */
apiRouter.get('/admin/puzzles/:id', async (req, res) => {
    const [[row], [{ remaining }]] = await Promise.all([
        db.select().from(puzzle).where(eq(puzzle.id, Number(req.params.id) || 0)).limit(1),
        db.select({ remaining: count() }).from(puzzle).where(isNull(puzzle.initialDifficulty)),
    ]);

    if (!row) {
        res.status(404).json({ error: 'puzzle_not_found' });
        return;
    }

    res.json({
        puzzle: { ...rowToPuzzle(row), initialDifficulty: row.initialDifficulty },
        remaining,
    });
});

apiRouter.post('/admin/puzzles/:id/initial-difficulty', express.json(), async (req, res) => {
    const id = Number(req.params.id);
    const difficulty: unknown = req.body?.difficulty;

    if (!Number.isInteger(id) || (difficulty !== null && difficulty !== 1 && difficulty !== 2 && difficulty !== 3)) {
        res.status(400).json({ error: 'invalid_difficulty' });
        return;
    }

    await db.update(puzzle).set({ initialDifficulty: difficulty }).where(eq(puzzle.id, id));

    res.json({ ok: true });
});
