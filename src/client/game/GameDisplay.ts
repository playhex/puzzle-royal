import type { GameConfig } from '../../shared/config.js';
import type { Vec } from '../../shared/geometry.js';
import type { PlayerProfile } from '../../shared/profile.js';
import type { LiveRound } from '../../shared/protocol.js';
import { getRoundTimes, type GameSimulation } from '../../shared/simulation/GameSimulation.js';

export type DisplayPlayer = {
    profile: PlayerProfile;
    color: number;
};

/**
 * What the game screen displays: live game, tutorial or replay.
 */
export interface GameDisplay {
    readonly config: GameConfig;
    readonly players: DisplayPlayer[];
    readonly simulation: GameSimulation;

    /** Highlighted player ("you", or followed player in replays) */
    myIdx: null | number;

    /** Whether highlighted player is the viewer (shows "you", allows clicking) */
    readonly isMe: boolean;

    /** Round puzzle, with solution once known */
    getRound(roundIndex: number): undefined | LiveRound;

    /** Current display time, ms since game start */
    time(): number;

    /** Viewer clicked on board */
    click?(target: Vec): void;

    /** Called each frame before rendering (tutorial and replay advance their simulation) */
    tick?(): void;

    /** Target of own click not yet confirmed by server */
    pendingTarget?(): null | Vec;

    /**
     * Own dot position at current server time (not delayed like other dots),
     * leaving as soon as clicked, before server confirmation. Positions are frozen at maxT (drop).
     */
    ownPosition?(maxT: number): Vec;
}

export const PLAYER_COLORS = [
    0xf59f00, 0x37b24d, 0xe64980, 0x7048e8, 0x1098ad, 0xf76707, 0x74b816, 0xd6336c,
    0x4263eb, 0x0ca678, 0xae3ec9, 0xfab005, 0x2f9e44, 0xc2255c, 0x5f3dc4, 0x1c7ed6,
];

export const playerColor = (idx: number): number => PLAYER_COLORS[idx % PLAYER_COLORS.length];

export const colorToCss = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

/**
 * Elimination is visible from drop phase of the round the player fell.
 */
export const isEliminatedAt = (display: GameDisplay, idx: number, t: number): boolean => {
    const round = display.simulation.eliminatedRound[idx];

    return round !== null && t >= getRoundTimes(display.config, round).dropAt;
};

/** Game over and last drop animation finished */
export const isOverAt = (display: GameDisplay, t: number): boolean => {
    const sim = display.simulation;

    return sim.over && t >= getRoundTimes(display.config, sim.currentRound - 1).endAt;
};
