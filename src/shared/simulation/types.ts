import type { Move } from '@playhex/move-notation';
import type { Vec } from '../geometry.js';

export type Phase = 'appear' | 'play' | 'drop';

/**
 * A player moving in straight line, at constant speed, from `from` to `to`, starting at t0.
 * All times are integer milliseconds since game start.
 */
export type Segment = {
    t0: number;
    from: Vec;
    to: Vec;
};

/**
 * A click: player `idx` wants to go to (x, y) (fixed point), at time t (server reception time).
 */
export type Input = {
    t: number;
    idx: number;
    x: number;
    y: number;
};

/** Compact form, as stored and sent over network: [t, idx, x, y] */
export type InputTuple = [number, number, number, number];

export const inputToTuple = (i: Input): InputTuple => [i.t, i.idx, i.x, i.y];
export const tupleToInput = ([t, idx, x, y]: InputTuple): Input => ({ t, idx, x, y });

export type RoundTimes = {
    appearAt: number;
    playAt: number;
    dropAt: number;
    endAt: number;
};

export type Elimination = {
    idx: number;

    /** Cell where player was, null if outside the board. */
    cell: null | Move;
};

export type RoundResult = {
    roundIndex: number;
    solution: Move;

    /** Players alive when round started */
    aliveBefore: number[];

    survivors: number[];
    eliminated: Elimination[];

    /**
     * For each survivor: ms between appear phase start and last arrival on solution cell.
     */
    reachMs: Record<number, number>;

    /**
     * Final places given at this round (eliminated players, and survivors if game is over).
     * Players falling together share the worst place of their group, 1st only for a winner.
     */
    places: Record<number, number>;

    gameOver: boolean;
};
