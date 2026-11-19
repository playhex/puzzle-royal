import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
    replayGame, replayInputs, replayPlayer, replayRound, playerStats, playerSurvivedOpponent, puzzleStats, puzzleWrongCell,
} from '../db/schema.js';
import { inputToTuple } from '../../shared/simulation/types.js';
import { computePlayerGameStats, computeRoundStats, computeSurvivedOpponents } from '../stats/computeStats.js';
import type { GameRecord } from './GameServer.js';

/**
 * Saves a finished game, its replay data, and updates puzzles and players stats.
 */
export const saveGame = async (record: GameRecord): Promise<void> => {
    const ratings = record.players.map(p => p.rating);
    const results = record.rounds.map(r => r.result);

    await db.transaction(async tx => {
        const [{ id: gameId }] = await tx.insert(replayGame).values({
            publicId: record.gameId,
            startedAt: record.startedAt,
            endedAt: record.endedAt,
            seed: record.seed,
            config: record.config,
            playersCount: record.players.length,
            roundsCount: record.rounds.length,
        }).$returningId();

        await tx.insert(replayPlayer).values(record.players.map((p, idx) => ({
            gameId,
            idx,
            playerPublicId: p.publicId,
            pseudo: p.pseudo,
            avatarUrl: p.avatarUrl,
            countryFlag: p.countryFlag,
            rating: p.rating,
            ratingDeviation: p.ratingDeviation,
            startX: record.startPositions[idx].x,
            startY: record.startPositions[idx].y,
            eliminatedRound: record.eliminatedRound[idx],
            finalPlace: record.places[idx] ?? 1,
        })));

        if (record.rounds.length > 0) {
            await tx.insert(replayRound).values(record.rounds.map(r => ({
                gameId,
                roundIndex: r.roundIndex,
                puzzleId: r.puzzleId,
                originCell: r.origin,
                appearMs: r.times.appearAt,
                playMs: r.times.playAt,
                dropMs: r.times.dropAt,
                endMs: r.times.endAt,
                aliveBefore: r.result.aliveBefore.length,
                eliminatedCount: r.result.eliminated.length,
            })));
        }

        await tx.insert(replayInputs).values({ gameId, inputs: record.inputs.map(inputToTuple) });

        // Puzzle stats
        for (const round of record.rounds) {
            const s = computeRoundStats(round.result, ratings);
            const inc = (column: keyof typeof s & keyof typeof puzzleStats.$inferInsert) =>
                sql`${sql.identifier(puzzleStats[column].name)} + ${s[column]}`;

            await tx.insert(puzzleStats).values({
                puzzleId: round.puzzleId,
                timesShown: s.timesShown,
                playersPresent: s.playersPresent,
                roundsWithElimination: s.roundsWithElimination,
                playersEliminated: s.playersEliminated,
                roundsAllFell: s.roundsAllFell,
                roundsNoneFell: s.roundsNoneFell,
                survivorReachMsSum: s.survivorReachMsSum,
                survivorReachCount: s.survivorReachCount,
                eliminatedRatingSum: s.eliminatedRatingSum,
                survivorRatingSum: s.survivorRatingSum,
                survivorsCount: s.survivorsCount,
            }).onDuplicateKeyUpdate({ set: {
                timesShown: inc('timesShown'),
                playersPresent: inc('playersPresent'),
                roundsWithElimination: inc('roundsWithElimination'),
                playersEliminated: inc('playersEliminated'),
                roundsAllFell: inc('roundsAllFell'),
                roundsNoneFell: inc('roundsNoneFell'),
                survivorReachMsSum: inc('survivorReachMsSum'),
                survivorReachCount: inc('survivorReachCount'),
                eliminatedRatingSum: inc('eliminatedRatingSum'),
                survivorRatingSum: inc('survivorRatingSum'),
                survivorsCount: inc('survivorsCount'),
            } });

            for (const [cell, count] of Object.entries(s.wrongCells)) {
                await tx.insert(puzzleWrongCell).values({ puzzleId: round.puzzleId, cell, count })
                    .onDuplicateKeyUpdate({ set: { count: sql`${sql.identifier('count')} + ${count}` } });
            }
        }

        // Player stats
        for (const s of computePlayerGameStats(results, record.places)) {
            await tx.insert(playerStats).values({
                playerPublicId: record.players[s.playerIdx].publicId,
                gamesPlayed: 1,
                wins: s.won ? 1 : 0,
                puzzlesSolved: s.puzzlesSolved,
                opponentsSurvivedTotal: s.opponentsSurvived,
            }).onDuplicateKeyUpdate({ set: {
                gamesPlayed: sql`${sql.identifier('games_played')} + 1`,
                wins: sql`${sql.identifier('wins')} + ${s.won ? 1 : 0}`,
                puzzlesSolved: sql`${sql.identifier('puzzles_solved')} + ${s.puzzlesSolved}`,
                opponentsSurvivedTotal: sql`${sql.identifier('opponents_survived_total')} + ${s.opponentsSurvived}`,
            } });
        }

        for (const s of computeSurvivedOpponents(results)) {
            const opponent = record.players[s.opponentIdx];

            await tx.insert(playerSurvivedOpponent).values({
                playerPublicId: record.players[s.playerIdx].publicId,
                opponentPublicId: opponent.publicId,
                opponentPseudo: opponent.pseudo,
                count: s.count,
            }).onDuplicateKeyUpdate({ set: {
                opponentPseudo: opponent.pseudo,
                count: sql`${sql.identifier('count')} + ${s.count}`,
            } });
        }
    });
};
