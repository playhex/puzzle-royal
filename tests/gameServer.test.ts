import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultGameConfig } from '../src/shared/config.js';
import { moveCenter } from '../src/shared/geometry.js';
import type { PlayerProfile } from '../src/shared/profile.js';
import { replayGame } from '../src/shared/simulation/GameSimulation.js';
import { GAME_START_LEAD_MS, GameServer, type GameRecord } from '../src/server/game/GameServer.js';
import type { ServerPuzzle } from '../src/server/game/puzzleProvider.js';

const profile = (id: string): PlayerProfile => ({
    publicId: id, pseudo: id, slug: id, isGuest: false, avatarUrl: null, countryFlag: null, rating: 1500, ratingDeviation: 350,
});

const puzzles: ServerPuzzle[] = [
    { id: 1, redStones: ['a6', 'c4', 'd6'], blueStones: ['a7', 'd5', 'e3'], lastMove: 'd5', solution: 'b6' },
    { id: 2, redStones: ['b3', 'f2', 'f5'], blueStones: ['b6', 'c7', 'e1', 'f3'], lastMove: 'f3', solution: 'e4' },
    { id: 3, redStones: ['b5', 'd5', 'e3', 'e6'], blueStones: ['b4', 'c7', 'e2', 'f2', 'f4'], lastMove: 'e2', solution: 'c3' },
];

describe('GameServer', () => {
    let now = 0;
    const emitted: { type: string; payload: unknown }[] = [];
    let record: null | GameRecord = null;

    beforeEach(() => {
        vi.useFakeTimers();
        now = 1_000_000;
        emitted.length = 0;
        record = null;
    });

    afterEach(() => vi.useRealTimers());

    const advance = async (ms: number) => {
        now += ms;
        await vi.advanceTimersByTimeAsync(ms);
    };

    const createGame = (
        loadMorePuzzles: (excludeIds: number[]) => Promise<ServerPuzzle[]> = async () => [],
        gamePuzzles = puzzles,
    ) => new GameServer(
        [profile('a'), profile('b'), profile('c')],
        [...gamePuzzles],
        loadMorePuzzles,
        defaultGameConfig,
        42,
        {
            onRoundStart: round => emitted.push({ type: 'roundStart', payload: round }),
            onInput: input => emitted.push({ type: 'input', payload: input }),
            onDrop: event => emitted.push({ type: 'drop', payload: event }),
            onEnd: (event, r) => {
                emitted.push({ type: 'end', payload: event });
                record = r;
            },
        },
        () => now,
    );

    it('plays a game: phases, eliminations, ranking, never leaks solution before drop, replays identically', async () => {
        const game = createGame();

        game.start();

        // Before start: clicks rejected
        expect(game.move('a', moveCenter('b6'))).toBe(false);

        await advance(GAME_START_LEAD_MS + 100);
        expect(emitted.map(e => e.type)).toEqual(['roundStart']);

        // State and round start never contain the solution of current round
        expect(JSON.stringify(emitted)).not.toContain('"solution"');
        expect(JSON.stringify(game.getState(0))).not.toContain('"solution"');

        // Round 1: a and b go to solution b6, c goes elsewhere
        expect(game.move('a', moveCenter('b6'))).toBe(true);
        await advance(10);
        expect(game.move('a', moveCenter('b6'))).toBe(true); // fast clicks are accepted

        // Anti flood: 20 clicks per second max
        for (let i = 0; i < 18; ++i) expect(game.move('a', moveCenter('b6'))).toBe(true);
        expect(game.move('a', moveCenter('b6'))).toBe(false);
        await advance(1000);
        expect(game.move('a', moveCenter('b6'))).toBe(true);
        game.move('b', moveCenter('b6'));
        game.move('c', moveCenter('g1'));
        game.move('unknown', moveCenter('b6'));

        await advance(8800);
        const drop1 = emitted.find(e => e.type === 'drop')!.payload;
        expect(drop1).toEqual({ roundIndex: 0, solution: 'b6', eliminated: [2] });

        // Resolved round solution is now in state
        expect(game.getState(0).rounds[0].solution).toBe('b6');

        // Round 2: only a reaches e4 (b6 -> e4 is 3 cells, ~1.3s)
        await advance(1800);
        expect(emitted.filter(e => e.type === 'roundStart')).toHaveLength(2);
        expect(JSON.stringify(emitted.filter(e => e.type === 'roundStart')[1])).not.toContain('e4');
        game.move('a', moveCenter('e4'));
        game.move('c', moveCenter('e4')); // eliminated, ignored

        await advance(10_600);
        const end = emitted.find(e => e.type === 'end');
        expect(end?.payload).toEqual({ gameId: game.gameId, places: [1, 2, 3], roundsCount: 2 });

        // Replay recorded clicks: same eliminations
        const r = record!;
        const replayed = replayGame(r.config, r.startPositions, r.rounds.map(x => x.solution), r.inputs);

        expect(replayed.results).toEqual(r.rounds.map(x => x.result));
        expect(replayed.places).toEqual(r.places);
    });

    it('goes on with already played puzzles when more puzzles cannot be loaded', async () => {
        const game = createGame(async () => {
            throw new Error('Database is down');
        }, [puzzles[0]]);
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});

        game.start();
        await advance(GAME_START_LEAD_MS + 100);

        // All players go to the solution b6, so that the game goes on
        for (const id of ['a', 'b', 'c']) game.move(id, moveCenter('b6'));

        await advance(defaultGameConfig.appearMs + defaultGameConfig.playMs + defaultGameConfig.dropMs);

        const roundStarts = emitted.filter(e => e.type === 'roundStart');
        expect(roundStarts).toHaveLength(2);
        expect(roundStarts[1].payload).toMatchObject({ roundIndex: 1, puzzle: { lastMove: puzzles[0].lastMove } });
        expect(error).toHaveBeenCalled();

        error.mockRestore();
        game.stop();
    });
});
