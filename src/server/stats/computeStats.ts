import type { RoundResult } from '../../shared/simulation/types.js';

export type PuzzleStatsIncrement = {
    timesShown: number;
    playersPresent: number;
    roundsWithElimination: number;
    playersEliminated: number;
    roundsAllFell: number;
    roundsNoneFell: number;
    survivorReachMsSum: number;
    survivorReachCount: number;
    eliminatedRatingSum: number;
    survivorRatingSum: number;
    survivorsCount: number;

    /** Cell where eliminated players were ('out' when outside board) => count */
    wrongCells: Record<string, number>;
};

/**
 * Stats of a puzzle for one played round.
 *
 * @param ratings Rating of each player, by player index, at game time
 */
export const computeRoundStats = (result: RoundResult, ratings: number[]): PuzzleStatsIncrement => {
    const eliminatedCount = result.eliminated.length;
    const wrongCells: Record<string, number> = {};

    for (const { cell } of result.eliminated) {
        const key = cell ?? 'out';

        wrongCells[key] = (wrongCells[key] ?? 0) + 1;
    }

    const reachValues = Object.values(result.reachMs);

    return {
        timesShown: 1,
        playersPresent: result.aliveBefore.length,
        roundsWithElimination: eliminatedCount > 0 ? 1 : 0,
        playersEliminated: eliminatedCount,
        roundsAllFell: result.survivors.length === 0 ? 1 : 0,
        roundsNoneFell: eliminatedCount === 0 ? 1 : 0,
        survivorReachMsSum: reachValues.reduce((a, b) => a + b, 0),
        survivorReachCount: reachValues.length,
        eliminatedRatingSum: result.eliminated.reduce((sum, { idx }) => sum + ratings[idx], 0),
        survivorRatingSum: result.survivors.reduce((sum, idx) => sum + ratings[idx], 0),
        survivorsCount: result.survivors.length,
        wrongCells,
    };
};

export type SurvivedOpponent = {
    playerIdx: number;
    opponentIdx: number;
    count: number;
};

/**
 * Opponents a player saw falling during a round they succeeded themselves.
 */
export const computeSurvivedOpponents = (results: RoundResult[]): SurvivedOpponent[] => {
    const counts = new Map<string, SurvivedOpponent>();

    for (const result of results) {
        for (const playerIdx of result.survivors) {
            for (const { idx: opponentIdx } of result.eliminated) {
                const key = `${playerIdx}:${opponentIdx}`;
                const entry = counts.get(key) ?? { playerIdx, opponentIdx, count: 0 };

                entry.count++;
                counts.set(key, entry);
            }
        }
    }

    return [...counts.values()];
};

export type PlayerGameStats = {
    playerIdx: number;
    place: number;
    won: boolean;
    puzzlesSolved: number;
    opponentsSurvived: number;
};

export const computePlayerGameStats = (results: RoundResult[], places: (null | number)[]): PlayerGameStats[] => {
    const survived = computeSurvivedOpponents(results);

    return places.map((place, playerIdx) => ({
        playerIdx,
        place: place ?? 1,
        won: (place ?? 1) === 1,
        puzzlesSolved: results.filter(r => r.survivors.includes(playerIdx)).length,
        opponentsSurvived: survived.filter(s => s.playerIdx === playerIdx).reduce((sum, s) => sum + s.count, 0),
    }));
};
