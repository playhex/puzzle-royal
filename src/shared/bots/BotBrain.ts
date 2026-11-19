import type { Move } from '@playhex/move-notation';
import type { GameConfig } from '../config.js';
import { allMoves, cellAt, distance, moveCenter, neighbours, toFixed, UNIT, type Vec } from '../geometry.js';
import type { Rng } from '../rng.js';
import type { RoundTimes } from '../simulation/types.js';

export type BotParams = {
    /** Probability to choose the solution, slowly decreasing each round. */
    skill: number;

    /** Seconds before deciding. */
    reaction: number;

    /** Probability to reconsider choice later. */
    hesit: number;

    /** Sometimes follows another player instead of thinking. */
    follower: boolean;
};

export const createBotParams = (rng: Rng, follower: boolean): BotParams => ({
    skill: rng.range(0.62, 0.95),
    reaction: rng.range(0.5, 2.8),
    hesit: rng.range(0.1, 0.55),
    follower,
});

/**
 * Scenario constraint for this round:
 * - free: natural behavior
 * - fall: bot must be eliminated this round
 * - survive: bot must survive this round (still hesitates, but always gets back in time)
 */
export type BotFate = 'free' | 'fall' | 'survive';

export type BotRoundContext = {
    roundIndex: number;
    times: RoundTimes;
    solution: Move;
    lastMove: null | Move;
    occupied: Set<Move>;
    fate: BotFate;
};

export type BotWorld = {
    positionOf: (idx: number) => Vec;
    aliveIndexes: number[];

    /** Human player, preferred target for followers. */
    humanIdx: null | number;
};

const LATE_CHECK_BEFORE_END_MS = 1600;

/**
 * Credible fake player. Produces targets (clicks) over time, like a human would.
 */
export class BotBrain {
    private ctx: null | BotRoundContext = null;
    private skill = 0;
    private target: null | Vec = null;

    private decideAt = 0;
    private decided = false;
    private nextWanderAt = 0;
    private reconsiderAt: number[] = [];
    private lateCheckDone = false;

    private followee: null | number = null;
    private nextFollowAt = 0;

    constructor(
        readonly idx: number,
        readonly params: BotParams,
        private rng: Rng,
        private config: GameConfig,
    ) {}

    startRound(ctx: BotRoundContext): void {
        const { rng, params } = this;

        this.ctx = ctx;
        this.skill = Math.min(0.97, Math.max(0.3, params.skill - 0.022 * ctx.roundIndex));
        this.decideAt = ctx.times.appearAt + Math.round(params.reaction * rng.range(0.7, 1.3) * 1000);
        this.decided = false;
        this.nextWanderAt = ctx.times.appearAt + rng.int(150, 600);
        this.reconsiderAt = [];
        this.lateCheckDone = false;
        this.followee = null;
        this.target = null;

        if (rng.chance(params.hesit)) {
            const first = this.decideAt + rng.int(700, 2000);

            this.reconsiderAt.push(first);

            if (rng.chance(params.hesit * 0.5)) {
                this.reconsiderAt.push(first + rng.int(700, 2000));
            }
        }
    }

    /**
     * Called frequently. Returns a new target when bot clicks.
     */
    update(t: number, world: BotWorld): null | Vec {
        const ctx = this.ctx;

        if (ctx === null || t >= ctx.times.dropAt || t < ctx.times.appearAt) {
            return null;
        }

        const position = world.positionOf(this.idx);

        // Before deciding: small random wandering
        if (t < this.decideAt) {
            if (t >= this.nextWanderAt) {
                this.nextWanderAt = t + this.rng.int(500, 1100);

                return this.setTarget({
                    x: position.x + toFixed(this.rng.range(-0.6, 0.6)),
                    y: position.y + toFixed(this.rng.range(-0.6, 0.6)),
                });
            }

            return null;
        }

        if (!this.decided) {
            this.decided = true;

            if (this.params.follower && ctx.fate !== 'fall' && this.rng.chance(0.5)) {
                this.followee = this.chooseFollowee(world);
            }

            if (this.followee === null) {
                return this.setTarget(this.choose());
            }
        }

        const rescue = this.rescue(t, position);

        if (rescue !== null) {
            return rescue;
        }

        if (!this.lateCheckDone && t >= ctx.times.dropAt - LATE_CHECK_BEFORE_END_MS) {
            this.lateCheckDone = true;
            this.followee = null;

            return this.lateCheck(t, position);
        }

        if (this.reconsiderAt.length > 0 && t >= this.reconsiderAt[0]) {
            this.reconsiderAt.shift();
            this.followee = null;

            return this.setTarget(this.choose());
        }

        if (this.followee !== null && t >= this.nextFollowAt) {
            this.nextFollowAt = t + this.rng.int(250, 600);

            if (!world.aliveIndexes.includes(this.followee)) {
                this.followee = null;

                return this.setTarget(this.choose());
            }

            const p = world.positionOf(this.followee);

            return this.setTarget({
                x: p.x + toFixed(this.rng.range(-0.15, 0.15)),
                y: p.y + toFixed(this.rng.range(-0.15, 0.15)),
            });
        }

        return null;
    }

    private setTarget(target: Vec): Vec {
        this.target = target;

        return target;
    }

    private chooseFollowee(world: BotWorld): null | number {
        const others = world.aliveIndexes.filter(i => i !== this.idx);

        if (others.length === 0) {
            return null;
        }

        if (world.humanIdx !== null && others.includes(world.humanIdx) && this.rng.chance(0.7)) {
            return world.humanIdx;
        }

        return this.rng.pick(others);
    }

    private choose(): Vec {
        const ctx = this.ctx!;

        if (ctx.fate !== 'fall' && this.rng.chance(this.skill)) {
            return this.pointInCell(ctx.solution);
        }

        return this.pointInCell(this.wrongCell());
    }

    /**
     * Mistakes: neighbour of solution (50%), neighbour of last move (25%), or any empty cell.
     */
    private wrongCell(): Move {
        const { solution, lastMove, occupied } = this.ctx!;
        const isCandidate = (m: Move) => m !== solution && !occupied.has(m);
        const anyEmpty = allMoves(this.config.boardsize).filter(isCandidate);
        const r = this.rng.next();
        let candidates: Move[] = [];

        if (r < 0.5) {
            candidates = neighbours(solution, this.config.boardsize).filter(isCandidate);
        } else if (r < 0.75 && lastMove !== null) {
            candidates = neighbours(lastMove, this.config.boardsize).filter(isCandidate);
        }

        if (candidates.length === 0) {
            candidates = anyEmpty;
        }

        return this.rng.pick(candidates);
    }

    private nearestWrongCell(position: Vec): Move {
        const { solution, occupied } = this.ctx!;
        let best: null | Move = null;
        let bestDistance = Infinity;

        for (const move of allMoves(this.config.boardsize)) {
            if (move === solution || occupied.has(move)) {
                continue;
            }

            const d = distance(position, moveCenter(move));

            if (d < bestDistance) {
                bestDistance = d;
                best = move;
            }
        }

        return best ?? this.wrongCell();
    }

    private pointInCell(move: Move): Vec {
        const c = moveCenter(move);

        return {
            x: c.x + toFixed(this.rng.range(-0.2, 0.2)),
            y: c.y + toFixed(this.rng.range(-0.2, 0.2)),
        };
    }

    private msToReach(from: Vec, to: Vec): number {
        return (distance(from, to) / UNIT / this.config.speed) * 1000;
    }

    private targetCell(): null | Move {
        return this.target === null ? null : cellAt(this.target, this.config.boardsize);
    }

    /**
     * 1.6s before end: a misplaced bot sometimes joins the solution if it still can,
     * a well placed bot rarely changes its mind.
     */
    private lateCheck(t: number, position: Vec): null | Vec {
        const ctx = this.ctx!;
        const solutionCenter = moveCenter(ctx.solution);
        const onSolution = this.targetCell() === ctx.solution;

        if (!onSolution) {
            if (ctx.fate === 'fall') {
                // Make sure not to be just crossing the solution cell when time is over
                if (this.target !== null && t + this.msToReach(position, this.target) + 200 >= ctx.times.dropAt) {
                    return this.setTarget(moveCenter(this.nearestWrongCell(position)));
                }

                return null;
            }

            const canReach = t + this.msToReach(position, solutionCenter) + 150 < ctx.times.dropAt;

            if (canReach && (ctx.fate === 'survive' || this.rng.chance(this.skill * 0.35))) {
                return this.setTarget(this.pointInCell(ctx.solution));
            }

            return null;
        }

        if (ctx.fate === 'fall') {
            return this.setTarget(moveCenter(this.nearestWrongCell(position)));
        }

        if (ctx.fate === 'free' && this.rng.chance(0.04)) {
            return this.setTarget(this.pointInCell(this.wrongCell()));
        }

        return null;
    }

    /**
     * Bots that must survive (scenario) always get back on solution in time.
     */
    private rescue(t: number, position: Vec): null | Vec {
        const ctx = this.ctx!;

        if (ctx.fate !== 'survive' || this.targetCell() === ctx.solution) {
            return null;
        }

        const solutionCenter = moveCenter(ctx.solution);
        const remaining = ctx.times.dropAt - t;

        if (this.msToReach(position, solutionCenter) + 500 >= remaining) {
            this.followee = null;

            return this.setTarget(solutionCenter);
        }

        return null;
    }
}
