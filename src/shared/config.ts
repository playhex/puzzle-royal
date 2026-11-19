/**
 * All tunable parameters of Hex Fall.
 * Game timings are stored with each recorded game, so replays stay exact if they change.
 */

export type GameConfig = {
    boardsize: number;

    /** Cells appear in a wave, players can already move. */
    appearMs: number;

    /** Players must reach the solution cell. */
    playMs: number;

    /** All cells but the solution fall. */
    dropMs: number;

    /** Player dot speed, in cells per second (distance between two neighbour cell centers = 1). */
    speed: number;

    /** How far outside the board a target can be, in cells. */
    targetMargin: number;

    /** Safety limit: game ends with all remaining players tied after this number of rounds. */
    maxRounds: number;
};

export const defaultGameConfig: GameConfig = {
    boardsize: 7,
    appearMs: 800,
    playMs: 8000,
    dropMs: 1800,
    speed: 3.6,
    targetMargin: 1,
    maxRounds: 200,
};

export type WaitingRoomConfig = {
    /** Countdown starts once this number of players joined. */
    minPlayers: number;

    /** Countdown duration when it starts. */
    initialCountdownMs: number;

    /** Each newcomer brings countdown back to at least this. */
    newcomerMinCountdownMs: number;

    /** Countdown never exceeds this. */
    maxCountdownMs: number;

    /** When all players are ready, countdown drops to this (if higher). */
    allReadyCountdownMs: number;

    /** "Wait more" button brings countdown back to at least this. */
    waitMoreMs: number;

    /** Disconnected players are removed after this delay. */
    disconnectGraceMs: number;

    /** Minimum delay between end of previous game and start of next one. */
    delayAfterGameMs: number;
};

export const defaultWaitingRoomConfig: WaitingRoomConfig = {
    minPlayers: 2,
    initialCountdownMs: 60_000,
    newcomerMinCountdownMs: 20_000,
    maxCountdownMs: 60_000,
    allReadyCountdownMs: 5_000,
    waitMoreMs: 20_000,
    disconnectGraceMs: 10_000,
    delayAfterGameMs: 5_000,
};

export const roundDurationMs = (config: GameConfig): number => config.appearMs + config.playMs + config.dropMs;
