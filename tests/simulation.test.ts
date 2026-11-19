import { describe, expect, it } from 'vitest';
import type { Move } from '@playhex/move-notation';
import { defaultGameConfig, type GameConfig } from '../src/shared/config.js';
import { moveCenter, UNIT, type Vec } from '../src/shared/geometry.js';
import { GameSimulation, getPhaseAt, getRoundTimes, positionOnSegment, replayGame } from '../src/shared/simulation/GameSimulation.js';
import type { Input } from '../src/shared/simulation/types.js';

const config: GameConfig = { ...defaultGameConfig };

const goTo = (t: number, idx: number, move: Move): Input => ({ t, idx, ...moveCenter(move) });

const startAll = (n: number, move: Move = 'd4'): Vec[] => Array.from({ length: n }, () => moveCenter(move));

describe('phases', () => {
    it('computes round times from config', () => {
        expect(getRoundTimes(config, 0)).toEqual({ appearAt: 0, playAt: 800, dropAt: 8800, endAt: 10600 });
        expect(getRoundTimes(config, 1)).toEqual({ appearAt: 10600, playAt: 11400, dropAt: 19400, endAt: 21200 });
    });

    it('gives phase at time', () => {
        expect(getPhaseAt(config, -1)).toBe(null);
        expect(getPhaseAt(config, 0)?.phase).toBe('appear');
        expect(getPhaseAt(config, 799)?.phase).toBe('appear');
        expect(getPhaseAt(config, 800)?.phase).toBe('play');
        expect(getPhaseAt(config, 8799)?.phase).toBe('play');
        expect(getPhaseAt(config, 8800)?.phase).toBe('drop');
        expect(getPhaseAt(config, 10600)).toMatchObject({ roundIndex: 1, phase: 'appear' });
    });
});

describe('movement', () => {
    it('moves at constant speed in straight line', () => {
        const from = moveCenter('a1');
        const to = moveCenter('d1'); // 3 cells on the right
        const segment = { t0: 1000, from, to };

        expect(positionOnSegment(segment, 1000, 2.4)).toEqual(from);
        // 1 second = 2.4 cells
        const p = positionOnSegment(segment, 2000, 2.4);
        expect((p.x - from.x) / UNIT).toBeCloseTo(2.4, 3);
        expect(p.y).toBe(from.y);
        expect(positionOnSegment(segment, 2250, 2.4)).toEqual(to);
        expect(positionOnSegment(segment, 99999, 2.4)).toEqual(to);
    });

    it('changes target from current position', () => {
        const sim = new GameSimulation(config, [moveCenter('a1')]);

        expect(sim.applyInput(goTo(1000, 0, 'd1'))).toBe(true);
        const at1500 = sim.positionAt(0, 1500);
        expect(sim.applyInput(goTo(1500, 0, 'a1'))).toBe(true);
        expect(sim.positionAt(0, 1500)).toEqual(at1500);
        expect(sim.positionAt(0, 3000)).toEqual(moveCenter('a1'));
    });

    it('ignores inputs during drop and freezes positions', () => {
        const sim = new GameSimulation(config, [moveCenter('a1'), moveCenter('a1')]);

        sim.applyInput(goTo(8000, 0, 'g7'));
        const frozen = sim.positionAt(0, 8800);

        expect(sim.positionAt(0, 9500)).toEqual(frozen);
        expect(sim.applyInput(goTo(8800, 1, 'g7'))).toBe(false);
    });

    it('rejects out of order inputs', () => {
        const sim = new GameSimulation(config, [moveCenter('a1')]);

        expect(sim.applyInput(goTo(2000, 0, 'b1'))).toBe(true);
        expect(sim.applyInput(goTo(1999, 0, 'c1'))).toBe(false);
    });
});

describe('eliminations and places', () => {
    it('eliminates players not on solution', () => {
        const sim = new GameSimulation(config, startAll(3));

        sim.applyInput(goTo(100, 1, 'c4'));
        sim.applyInput(goTo(200, 2, 'a1'));
        const result = sim.resolveRound('d4');

        expect(result.survivors).toEqual([0]);
        expect(result.eliminated).toEqual([{ idx: 1, cell: 'c4' }, { idx: 2, cell: 'a1' }]);
        expect(result.places).toEqual({ 1: 3, 2: 3, 0: 1 });
        expect(result.gameOver).toBe(true);
        expect(sim.places).toEqual([1, 3, 3]);
    });

    it('records cell null when outside the board', () => {
        const sim = new GameSimulation(config, startAll(2));

        sim.applyInput({ t: 100, idx: 1, x: -10 * UNIT, y: 0 });
        const result = sim.resolveRound('d4');

        expect(result.eliminated).toEqual([{ idx: 1, cell: null }]);
    });

    it('gives players falling together the worst place of their group, continues while 2+ alive', () => {
        const sim = new GameSimulation(config, startAll(5));

        sim.applyInput(goTo(100, 4, 'a1'));
        let r = sim.resolveRound('d4');
        expect(r.places).toEqual({ 4: 5 });
        expect(r.gameOver).toBe(false);

        // round 2: players 2 and 3 fall
        const { appearAt } = sim.getCurrentRoundTimes();
        sim.applyInput(goTo(appearAt + 100, 2, 'a1'));
        sim.applyInput(goTo(appearAt + 100, 3, 'a1'));
        sim.applyInput(goTo(appearAt + 100, 4, 'd4')); // eliminated, ignored
        r = sim.resolveRound('d4');
        expect(r.places).toEqual({ 2: 4, 3: 4 });
        expect(r.aliveBefore).toEqual([0, 1, 2, 3]);
        expect(sim.over).toBe(false);
    });

    it('has no winner when all remaining players fall together', () => {
        const sim = new GameSimulation(config, startAll(4));

        sim.applyInput(goTo(100, 3, 'a1'));
        sim.resolveRound('d4');
        const r = sim.resolveRound('a7');

        expect(r.survivors).toEqual([]);
        expect(r.places).toEqual({ 0: 3, 1: 3, 2: 3 });
        expect(r.gameOver).toBe(true);
        expect(sim.places).toEqual([3, 3, 3, 4]);
    });

    it('computes time to reach solution', () => {
        const sim = new GameSimulation(config, [moveCenter('a1'), moveCenter('d4')]);

        // a1 -> c1: 2 cells, enters c1 after ~1.5 cells = 417ms at 3.6 cells/s
        sim.applyInput(goTo(1000, 0, 'c1'));
        const r = sim.resolveRound('c1');

        expect(r.survivors).toEqual([0]);
        expect(r.reachMs[0]).toBeGreaterThanOrEqual(1405);
        expect(r.reachMs[0]).toBeLessThanOrEqual(1430);
    });

    it('takes last arrival when player leaves and comes back', () => {
        const sim = new GameSimulation(config, [moveCenter('c1'), moveCenter('d4')]);

        sim.applyInput(goTo(1000, 0, 'g1'));
        sim.applyInput(goTo(3000, 0, 'c1'));
        const r = sim.resolveRound('c1');

        expect(r.reachMs[0]).toBeGreaterThan(3500);
    });
});

describe('replay', () => {
    it('replays inputs to same eliminations and positions', () => {
        const starts = startAll(4);
        const inputs: Input[] = [
            { t: 120, idx: 0, x: 23456, y: 31234 },
            { t: 1337, idx: 1, x: 1, y: 2 },
            { t: 3001, idx: 0, x: moveCenter('d4').x, y: moveCenter('d4').y },
            { t: 5000, idx: 2, x: 70000, y: 50000 },
            { t: 11000, idx: 0, x: 12345, y: 23456 },
            { t: 11500, idx: 3, x: 33333, y: 22222 },
        ];
        const solutions: Move[] = ['d4', 'b3', 'a1'];

        const live = new GameSimulation(config, starts);

        for (const solution of solutions) {
            if (live.over) break;
            const { dropAt } = live.getCurrentRoundTimes();
            inputs.filter(i => i.t < dropAt && i.t >= live.getCurrentRoundTimes().appearAt).forEach(i => live.applyInput(i));
            live.resolveRound(solution);
        }

        const replayed = replayGame(config, starts, solutions, inputs);

        expect(replayed.results).toEqual(live.results);
        expect(replayed.places).toEqual(live.places);
    });
});
