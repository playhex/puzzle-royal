import type { WaitingRoomConfig } from '../../shared/config.js';
import type { PlayerProfile } from '../../shared/profile.js';

export type WaitingPlayer = {
    profile: PlayerProfile;
    ready: boolean;
    connected: boolean;
    disconnectedAt: null | number;
};

/**
 * Registrations for next game.
 *
 * - Countdown starts once there are enough players.
 * - Each newcomer brings countdown back to at least `newcomerMinCountdownMs`, never above `maxCountdownMs`.
 * - When all players are ready, countdown drops to `allReadyCountdownMs`.
 * - Players disconnected for too long are removed.
 * - No countdown while paused (a game is running), it starts when unpaused.
 *
 * Pure logic, time is injected.
 */
export class WaitingRoom {
    private players = new Map<string, WaitingPlayer>();

    /** Time at which game can start, null while not enough players. */
    private deadline: null | number = null;

    /** Paused while a game is running: players can register, but countdown does not start. */
    private paused = false;

    constructor(
        private config: WaitingRoomConfig,
        private now: () => number,
    ) {}

    getPlayers(): WaitingPlayer[] {
        return [...this.players.values()];
    }

    has(publicId: string): boolean {
        return this.players.has(publicId);
    }

    getDeadline(): null | number {
        return this.deadline;
    }

    get count(): number {
        return this.players.size;
    }

    join(profile: PlayerProfile): void {
        const existing = this.players.get(profile.publicId);

        if (existing) {
            existing.profile = profile;
            this.setConnected(profile.publicId, true);
            return;
        }

        this.players.set(profile.publicId, { profile, ready: false, connected: true, disconnectedAt: null });

        const now = this.now();

        if (this.paused || this.players.size < this.config.minPlayers) {
            return;
        }

        if (this.deadline === null) {
            this.deadline = now + this.config.initialCountdownMs;
        } else {
            const remaining = Math.max(this.deadline - now, this.config.newcomerMinCountdownMs);

            this.deadline = now + Math.min(this.config.maxCountdownMs, remaining);
        }

        this.applyAllReady();
    }

    leave(publicId: string): void {
        if (!this.players.delete(publicId)) {
            return;
        }

        this.update();
    }

    setReady(publicId: string, ready: boolean): void {
        const player = this.players.get(publicId);

        if (!player) {
            return;
        }

        player.ready = ready;
        this.applyAllReady();
    }

    /**
     * Brings countdown back to at least `waitMoreMs`, only for registered players.
     */
    waitMore(publicId: string): void {
        if (!this.players.has(publicId) || this.deadline === null) {
            return;
        }

        this.deadline = Math.max(this.deadline, this.now() + this.config.waitMoreMs);
    }

    isPaused(): boolean {
        return this.paused;
    }

    /**
     * Pause while a game is running: countdown is cleared, and restarts from beginning once unpaused.
     */
    setPaused(paused: boolean): void {
        if (this.paused === paused) {
            return;
        }

        this.paused = paused;

        if (paused) {
            this.deadline = null;
        } else {
            this.update();
        }
    }

    setConnected(publicId: string, connected: boolean): void {
        const player = this.players.get(publicId);

        if (!player || player.connected === connected) {
            return;
        }

        player.connected = connected;
        player.disconnectedAt = connected ? null : this.now();
    }

    /**
     * Removes players disconnected for too long.
     *
     * @returns Removed players publicIds
     */
    removeDisconnected(): string[] {
        const now = this.now();
        const removed: string[] = [];

        for (const [publicId, player] of this.players) {
            if (!player.connected && player.disconnectedAt !== null && now - player.disconnectedAt > this.config.disconnectGraceMs) {
                this.players.delete(publicId);
                removed.push(publicId);
            }
        }

        if (removed.length > 0) {
            this.update();
        }

        return removed;
    }

    /**
     * Countdown is over (game must also wait for current game to end).
     */
    isCountdownOver(): boolean {
        return this.deadline !== null && this.now() >= this.deadline;
    }

    /**
     * Empties the room and returns registered players, for game start.
     */
    takePlayers(): WaitingPlayer[] {
        const players = this.getPlayers();

        this.players.clear();
        this.deadline = null;

        return players;
    }

    private update(): void {
        if (this.paused || this.players.size < this.config.minPlayers) {
            this.deadline = null;
            return;
        }

        if (this.deadline === null) {
            this.deadline = this.now() + this.config.initialCountdownMs;
        }

        this.applyAllReady();
    }

    private applyAllReady(): void {
        if (this.deadline === null || this.players.size < this.config.minPlayers) {
            return;
        }

        if (this.getPlayers().every(p => p.ready)) {
            this.deadline = Math.min(this.deadline, this.now() + this.config.allReadyCountdownMs);
        }
    }
}
