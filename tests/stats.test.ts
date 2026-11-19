import { describe, expect, it } from 'vitest';
import type { RoundResult } from '../src/shared/simulation/types.js';
import { computePlayerGameStats, computeRoundStats, computeSurvivedOpponents } from '../src/server/stats/computeStats.js';

const round = (partial: Partial<RoundResult>): RoundResult => ({
    roundIndex: 0, solution: 'd4', aliveBefore: [], survivors: [], eliminated: [], reachMs: {}, places: {}, gameOver: false,
    ...partial,
});

describe('puzzle stats', () => {
    const ratings = [1500, 1700, 1300, 1900];

    it('computes round stats', () => {
        const stats = computeRoundStats(round({
            aliveBefore: [0, 1, 2, 3],
            survivors: [1, 3],
            eliminated: [{ idx: 0, cell: 'c4' }, { idx: 2, cell: 'c4' }],
            reachMs: { 1: 2000, 3: 3000 },
        }), ratings);

        expect(stats).toEqual({
            timesShown: 1,
            playersPresent: 4,
            roundsWithElimination: 1,
            playersEliminated: 2,
            roundsAllFell: 0,
            roundsNoneFell: 0,
            survivorReachMsSum: 5000,
            survivorReachCount: 2,
            eliminatedRatingSum: 2800,
            survivorRatingSum: 3600,
            survivorsCount: 2,
            wrongCells: { c4: 2 },
        });
    });

    it('counts all fell, none fell and out of board', () => {
        const allFell = computeRoundStats(round({ aliveBefore: [0, 1], eliminated: [{ idx: 0, cell: null }, { idx: 1, cell: 'a1' }] }), ratings);

        expect(allFell.roundsAllFell).toBe(1);
        expect(allFell.roundsNoneFell).toBe(0);
        expect(allFell.wrongCells).toEqual({ out: 1, a1: 1 });

        const noneFell = computeRoundStats(round({ aliveBefore: [0, 1], survivors: [0, 1], reachMs: { 0: 1, 1: 1 } }), ratings);

        expect(noneFell.roundsAllFell).toBe(0);
        expect(noneFell.roundsNoneFell).toBe(1);
        expect(noneFell.roundsWithElimination).toBe(0);
    });
});

describe('survived opponents', () => {
    const results = [
        round({ aliveBefore: [0, 1, 2, 3], survivors: [0, 1, 2], eliminated: [{ idx: 3, cell: 'a1' }] }),
        round({ roundIndex: 1, aliveBefore: [0, 1, 2], survivors: [0], eliminated: [{ idx: 1, cell: 'a1' }, { idx: 2, cell: 'b1' }] }),
    ];

    it('counts opponents seen falling during a round the player solved', () => {
        const survived = computeSurvivedOpponents(results);

        expect(survived).toEqual(expect.arrayContaining([
            { playerIdx: 0, opponentIdx: 3, count: 1 },
            { playerIdx: 1, opponentIdx: 3, count: 1 },
            { playerIdx: 2, opponentIdx: 3, count: 1 },
            { playerIdx: 0, opponentIdx: 1, count: 1 },
            { playerIdx: 0, opponentIdx: 2, count: 1 },
        ]));
        expect(survived).toHaveLength(5);
    });

    it('does not count opponents falling in the same round as the player', () => {
        const survived = computeSurvivedOpponents([
            round({ aliveBefore: [0, 1], eliminated: [{ idx: 0, cell: null }, { idx: 1, cell: null }] }),
        ]);

        expect(survived).toEqual([]);
    });

    it('computes player game stats', () => {
        const stats = computePlayerGameStats(results, [1, 2, 2, 4]);

        expect(stats[0]).toEqual({ playerIdx: 0, place: 1, won: true, puzzlesSolved: 2, opponentsSurvived: 3 });
        expect(stats[1]).toEqual({ playerIdx: 1, place: 2, won: false, puzzlesSolved: 1, opponentsSurvived: 1 });
        expect(stats[3]).toEqual({ playerIdx: 3, place: 4, won: false, puzzlesSolved: 0, opponentsSurvived: 0 });
    });
});
