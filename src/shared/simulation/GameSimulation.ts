import type { Move } from '@playhex/move-notation';
import { roundDurationMs, type GameConfig } from '../config.js';
import { cellAt, clampTarget, distance, SQRT3_2, toFixed, type Vec } from '../geometry.js';
import type { Rng } from '../rng.js';
import type { Input, Phase, RoundResult, RoundTimes, Segment, Elimination } from './types.js';

export const getRoundTimes = (config: GameConfig, roundIndex: number): RoundTimes => {
    const appearAt = roundIndex * roundDurationMs(config);
    const playAt = appearAt + config.appearMs;
    const dropAt = playAt + config.playMs;

    return { appearAt, playAt, dropAt, endAt: dropAt + config.dropMs };
};

export type PhaseInfo = {
    roundIndex: number;
    phase: Phase;
    times: RoundTimes;
};

/**
 * Round and phase at time t (ms since game start), null before game start.
 */
export const getPhaseAt = (config: GameConfig, t: number): null | PhaseInfo => {
    if (t < 0) {
        return null;
    }

    const roundIndex = Math.floor(t / roundDurationMs(config));
    const times = getRoundTimes(config, roundIndex);
    const phase: Phase = t < times.playAt ? 'appear' : t < times.dropAt ? 'play' : 'drop';

    return { roundIndex, phase, times };
};

/**
 * Position on a segment at time t. Only uses + - * / sqrt and rounds to integers,
 * so result is the same on every JS engine.
 */
export const positionOnSegment = (segment: Segment, t: number, speed: number): Vec => {
    if (t <= segment.t0) {
        return segment.from;
    }

    const length = distance(segment.from, segment.to);
    const travelled = speed * (t - segment.t0) * 10; // UNIT / 1000 = 10, cells/s -> fixed units/ms

    if (travelled >= length) {
        return segment.to;
    }

    const f = travelled / length;

    return {
        x: Math.round(segment.from.x + (segment.to.x - segment.from.x) * f),
        y: Math.round(segment.from.y + (segment.to.y - segment.from.y) * f),
    };
};

/**
 * Random start positions anywhere on the board, at least a bit inside a cell.
 */
export const createStartPositions = (playersCount: number, boardsize: number, rng: Rng): Vec[] => {
    const min = -0.3, max = boardsize - 0.7;

    return Array.from({ length: playersCount }, () => {
        const row = rng.range(min, max);
        const col = rng.range(min, max);

        return {
            x: toFixed(col + row / 2),
            y: toFixed(row * SQRT3_2),
        };
    });
};

const stationary = (t0: number, pos: Vec): Segment => ({ t0, from: pos, to: pos });

/** Sampling step to compute when a survivor last arrived on the solution cell. */
const REACH_SAMPLE_MS = 10;

/**
 * Deterministic Hex Fall game: players positions, phases, eliminations and places.
 * Knows nothing about puzzles except the solution, given when a round is resolved.
 * Same code runs on server (authoritative), on client (display), in tutorial and in replays.
 */
export class GameSimulation {
    private segments: Segment[];

    /** Segments of current round, per player, to compute reach time. */
    private roundHistory: Segment[][];

    readonly alive: boolean[];
    readonly eliminatedRound: (null | number)[];
    readonly places: (null | number)[];

    /** Round not yet resolved */
    currentRound = 0;

    over = false;

    readonly results: RoundResult[] = [];

    constructor(
        readonly config: GameConfig,
        readonly startPositions: Vec[],
    ) {
        this.segments = startPositions.map(pos => stationary(0, pos));
        this.roundHistory = this.segments.map(s => [s]);
        this.alive = startPositions.map(() => true);
        this.eliminatedRound = startPositions.map(() => null);
        this.places = startPositions.map(() => null);
    }

    get playersCount(): number {
        return this.startPositions.length;
    }

    getAliveIndexes(): number[] {
        return this.alive.flatMap((a, idx) => a ? [idx] : []);
    }

    getCurrentRoundTimes(): RoundTimes {
        return getRoundTimes(this.config, this.currentRound);
    }

    /**
     * Whether player can change target at time t.
     */
    canMove(idx: number, t: number): boolean {
        if (this.over || !this.alive[idx]) {
            return false;
        }

        const { dropAt, appearAt } = this.getCurrentRoundTimes();

        return t >= appearAt && t < dropAt && t >= this.segments[idx].t0;
    }

    /**
     * Apply a click. Inputs must be applied in time order.
     *
     * @returns Whether input has been accepted
     */
    applyInput(input: Input): boolean {
        if (input.idx < 0 || input.idx >= this.playersCount || !this.canMove(input.idx, input.t)) {
            return false;
        }

        const target = clampTarget({ x: input.x, y: input.y }, this.config.boardsize, this.config.targetMargin);
        const segment: Segment = {
            t0: input.t,
            from: this.positionAt(input.idx, input.t),
            to: target,
        };

        this.segments[input.idx] = segment;
        this.roundHistory[input.idx].push(segment);

        return true;
    }

    getSegment(idx: number): Segment {
        return this.segments[idx];
    }

    getTarget(idx: number): Vec {
        return this.segments[idx].to;
    }

    /**
     * Player position at time t. Positions are frozen during drop phase.
     */
    positionAt(idx: number, t: number): Vec {
        const { dropAt } = this.getCurrentRoundTimes();

        return positionOnSegment(this.segments[idx], Math.min(t, dropAt), this.config.speed);
    }

    /**
     * End of play phase of current round: eliminates players not on the solution cell.
     */
    resolveRound(solution: Move): RoundResult {
        if (this.over) {
            throw new Error('Game is over');
        }

        const roundIndex = this.currentRound;
        const { appearAt, dropAt } = this.getCurrentRoundTimes();
        const aliveBefore = this.getAliveIndexes();
        const survivors: number[] = [];
        const eliminated: Elimination[] = [];
        const reachMs: Record<number, number> = {};

        for (const idx of aliveBefore) {
            const pos = this.positionAt(idx, dropAt);
            const cell = cellAt(pos, this.config.boardsize);

            if (cell === solution) {
                survivors.push(idx);
                reachMs[idx] = this.computeReachMs(idx, solution, appearAt, dropAt);
            } else {
                eliminated.push({ idx, cell });
            }

            this.segments[idx] = stationary(dropAt, pos);
        }

        // Players falling together share the worst place of their group: being 1st requires winning.
        // E.g. 8 players, 2 fall: both are 8th. 3 left and all fall: all 3rd, no winner.
        const places: Record<number, number> = {};

        for (const { idx } of eliminated) {
            this.alive[idx] = false;
            this.eliminatedRound[idx] = roundIndex;
            places[idx] = aliveBefore.length;
            this.places[idx] = places[idx];
        }

        this.currentRound++;
        this.over = survivors.length <= 1 || this.currentRound >= this.config.maxRounds;

        if (this.over) {
            // Single survivor wins. Several survivors (max rounds reached): tied, nobody won.
            for (const idx of survivors) {
                places[idx] = survivors.length;
                this.places[idx] = survivors.length;
            }
        }

        this.roundHistory = this.segments.map(s => [s]);

        const result: RoundResult = {
            roundIndex,
            solution,
            aliveBefore,
            survivors,
            eliminated,
            reachMs,
            places,
            gameOver: this.over,
        };

        this.results.push(result);

        return result;
    }

    private positionInHistory(idx: number, t: number): Vec {
        const history = this.roundHistory[idx];
        let segment = history[0];

        for (const s of history) {
            if (s.t0 <= t) {
                segment = s;
            }
        }

        return positionOnSegment(segment, t, this.config.speed);
    }

    private computeReachMs(idx: number, solution: Move, appearAt: number, dropAt: number): number {
        for (let t = dropAt; t >= appearAt; t -= REACH_SAMPLE_MS) {
            if (cellAt(this.positionInHistory(idx, t), this.config.boardsize) !== solution) {
                return Math.min(dropAt, t + REACH_SAMPLE_MS) - appearAt;
            }
        }

        return 0;
    }
}

/**
 * Replays a whole game from recorded inputs.
 */
export const replayGame = (
    config: GameConfig,
    startPositions: Vec[],
    solutions: Move[],
    inputs: Input[],
): GameSimulation => {
    const simulation = new GameSimulation(config, startPositions);
    const sorted = [...inputs].sort((a, b) => a.t - b.t);
    let i = 0;

    for (const solution of solutions) {
        if (simulation.over) {
            break;
        }

        const { dropAt } = simulation.getCurrentRoundTimes();

        while (i < sorted.length && sorted[i].t < dropAt) {
            simulation.applyInput(sorted[i++]);
        }

        simulation.resolveRound(solution);
    }

    return simulation;
};
