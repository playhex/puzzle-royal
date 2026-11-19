import { describe, expect, it } from 'vitest';
import { defaultGameConfig } from '../src/shared/config.js';
import { distance, moveCenter, UNIT } from '../src/shared/geometry.js';
import type { PlayerProfile } from '../src/shared/profile.js';
import { LiveGameModel } from '../src/client/game/LiveGameModel.js';
import type { ServerClock } from '../src/client/game/ServerClock.js';

const profile = (id: string): PlayerProfile => ({
    publicId: id, pseudo: id, slug: id, isGuest: false, avatarUrl: null, countryFlag: null, rating: 1500, ratingDeviation: 350,
});

describe('LiveGameModel own dot', () => {
    it('leaves on click, then catches up server trajectory without jump nor going backwards', () => {
        let now = 1000; // server game time, startedAt = 0
        const clock = { now: () => now } as unknown as ServerClock;
        const sent: unknown[] = [];
        const model = new LiveGameModel({
            gameId: 'g',
            startedAt: 0,
            config: defaultGameConfig,
            players: [profile('me'), profile('other')],
            startPositions: [moveCenter('a1'), moveCenter('d4')],
            rounds: [],
            inputs: [],
            spectators: 0,
            over: false,
        }, 'me', clock, target => sent.push(target));

        const dropAt = model.simulation.getCurrentRoundTimes().dropAt;
        const target = moveCenter('g1'); // 6 cells to the right, along x
        const start = model.ownPosition(dropAt);

        model.click(target);
        expect(sent).toHaveLength(1);

        // Leaves immediately, before server confirmation
        now += 50;
        const before = model.ownPosition(dropAt);
        expect(before.x).toBeGreaterThan(start.x);

        // Server received click 50ms after it was clicked
        model.onInput([1050, 0, target.x, target.y]);
        const after = model.ownPosition(dropAt);
        expect(distance(before, after)).toBeLessThan(UNIT * 0.01);

        // Never goes backwards, and ends on server trajectory
        let previous = after.x;

        for (let i = 0; i < 100; ++i) {
            now += 5;
            const pos = model.ownPosition(dropAt);

            expect(pos.x).toBeGreaterThanOrEqual(previous);
            previous = pos.x;
        }

        expect(distance(model.ownPosition(dropAt), model.simulation.positionAt(0, now))).toBeLessThan(UNIT * 0.01);
    });

    it('waits for the last click confirmation, even when an older click had the same target', () => {
        let now = 1000;
        const clock = { now: () => now } as unknown as ServerClock;
        const model = new LiveGameModel({
            gameId: 'g',
            startedAt: 0,
            config: defaultGameConfig,
            players: [profile('me'), profile('other')],
            startPositions: [moveCenter('d4'), moveCenter('a1')],
            rounds: [],
            inputs: [],
            spectators: 0,
            over: false,
        }, 'me', clock, () => {});

        const a = moveCenter('g1'), b = moveCenter('a7');

        model.click(a);
        now += 20;
        model.click(b);
        now += 20;
        model.click(a);

        // Confirmations of first clicks: last click (A) still predicted
        model.onInput([1030, 0, a.x, a.y]);
        expect(model.pendingTarget()).toEqual(a);
        model.onInput([1050, 0, b.x, b.y]);
        expect(model.pendingTarget()).toEqual(a);

        // Last click confirmed
        model.onInput([1070, 0, a.x, a.y]);
        expect(model.pendingTarget()).toBeNull();
    });
});

