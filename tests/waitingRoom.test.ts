import { beforeEach, describe, expect, it } from 'vitest';
import { defaultWaitingRoomConfig } from '../src/shared/config.js';
import type { PlayerProfile } from '../src/shared/profile.js';
import { WaitingRoom } from '../src/server/lobby/WaitingRoom.js';

const profile = (id: string): PlayerProfile => ({
    publicId: id, pseudo: id, slug: id, isGuest: false, avatarUrl: null, countryFlag: null, rating: 1500, ratingDeviation: 350,
});

describe('WaitingRoom', () => {
    let now = 0;
    let room: WaitingRoom;
    const remaining = () => room.getDeadline() === null ? null : room.getDeadline()! - now;

    beforeEach(() => {
        now = 1_000_000;
        room = new WaitingRoom(defaultWaitingRoomConfig, () => now);
    });

    it('starts 60s countdown at 2 players', () => {
        room.join(profile('a'));
        expect(remaining()).toBe(null);

        now += 5000;
        room.join(profile('b'));
        expect(remaining()).toBe(60_000);
    });

    it('brings countdown back to at least 20s on newcomer, never above 60s', () => {
        room.join(profile('a'));
        room.join(profile('b'));

        now += 50_000; // 10s remaining
        room.join(profile('c'));
        expect(remaining()).toBe(20_000);

        now += 5_000; // 15s remaining
        room.join(profile('d'));
        expect(remaining()).toBe(20_000);

        room.leave('d');
        room.leave('c');
        room.join(profile('e')); // 20s remaining, stays 20s
        expect(remaining()).toBe(20_000);
    });

    it('newcomer keeps countdown when above 20s', () => {
        room.join(profile('a'));
        room.join(profile('b'));
        now += 10_000;
        room.join(profile('c'));
        expect(remaining()).toBe(50_000);
    });

    it('drops countdown to 5s when all are ready', () => {
        room.join(profile('a'));
        room.join(profile('b'));
        room.setReady('a', true);
        expect(remaining()).toBe(60_000);
        room.setReady('b', true);
        expect(remaining()).toBe(5_000);
    });

    it('keeps countdown under 5s if already lower', () => {
        room.join(profile('a'));
        room.join(profile('b'));
        now += 57_000;
        room.setReady('a', true);
        room.setReady('b', true);
        expect(remaining()).toBe(3_000);
    });

    it('unchecking ready does not reset countdown, newcomer brings it back to 20s', () => {
        room.join(profile('a'));
        room.join(profile('b'));
        room.setReady('a', true);
        room.setReady('b', true);
        room.setReady('b', false);
        expect(remaining()).toBe(5_000);

        room.join(profile('c'));
        expect(remaining()).toBe(20_000);

        room.setReady('c', true);
        expect(remaining()).toBe(20_000);
        room.setReady('b', true);
        expect(remaining()).toBe(5_000);
    });

    it('when not ready player leaves and others are ready, drops to 5s', () => {
        room.join(profile('a'));
        room.join(profile('b'));
        room.join(profile('c'));
        room.setReady('a', true);
        room.setReady('b', true);
        room.leave('c');
        expect(remaining()).toBe(5_000);
    });

    it('removes players disconnected more than 10s', () => {
        room.join(profile('a'));
        room.join(profile('b'));
        room.join(profile('c'));
        room.setConnected('c', false);

        now += 10_000;
        expect(room.removeDisconnected()).toEqual([]);

        now += 1;
        expect(room.removeDisconnected()).toEqual(['c']);
        expect(room.count).toBe(2);
    });

    it('reconnection within grace period keeps player', () => {
        room.join(profile('a'));
        room.join(profile('b'));
        room.setConnected('b', false);
        now += 8_000;
        room.join(profile('b'));
        now += 8_000;
        expect(room.removeDisconnected()).toEqual([]);
        expect(room.count).toBe(2);
    });

    it('stops countdown when going under minimum', () => {
        room.join(profile('a'));
        room.join(profile('b'));
        room.setConnected('b', false);
        now += 11_000;
        room.removeDisconnected();
        expect(remaining()).toBe(null);

        room.join(profile('c'));
        expect(remaining()).toBe(60_000);
    });

    it('countdown over and taking players', () => {
        room.join(profile('a'));
        room.join(profile('b'));
        now += 59_999;
        expect(room.isCountdownOver()).toBe(false);
        now += 1;
        expect(room.isCountdownOver()).toBe(true);
        expect(room.takePlayers().map(p => p.profile.publicId)).toEqual(['a', 'b']);
        expect(room.count).toBe(0);
        expect(room.getDeadline()).toBe(null);
    });

    it('wait more brings countdown back to at least 20s, only for registered players', () => {
        room.join(profile('a'));
        room.join(profile('b'));

        room.waitMore('a');
        expect(remaining()).toBe(60_000);

        now += 50_000; // 10s remaining
        room.waitMore('x');
        expect(remaining()).toBe(10_000);

        room.waitMore('a');
        expect(remaining()).toBe(20_000);

        now += 1_000; // 19s remaining
        room.waitMore('b');
        expect(remaining()).toBe(20_000);
    });
});
