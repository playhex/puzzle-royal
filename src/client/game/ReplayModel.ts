import type { Move } from '@playhex/move-notation';
import type { GameConfig } from '../../shared/config.js';
import type { Vec } from '../../shared/geometry.js';
import type { PlayerProfile } from '../../shared/profile.js';
import type { LiveRound } from '../../shared/protocol.js';
import { GameSimulation, getRoundTimes } from '../../shared/simulation/GameSimulation.js';
import { tupleToInput, type Input, type InputTuple } from '../../shared/simulation/types.js';
import { playerColor, type DisplayPlayer, type GameDisplay } from './GameDisplay.js';

export type ReplayData = {
    gameId: string;
    startedAt: string;
    endedAt: string;
    config: GameConfig;
    players: { profile: PlayerProfile; finalPlace: number; eliminatedRound: null | number }[];
    startPositions: Vec[];
    rounds: (LiveRound & { solution: Move })[];
    inputs: InputTuple[];
};

/**
 * Replays recorded clicks with the same simulation code: same positions, same eliminations.
 */
export class ReplayModel implements GameDisplay {
    readonly config: GameConfig;
    readonly players: DisplayPlayer[];
    readonly isMe = false;
    myIdx: null | number = null;

    simulation!: GameSimulation;
    private inputs: Input[];
    private nextInput = 0;
    private playhead = -500;
    private lastTickAt = performance.now();

    playing = true;
    speed = 1;

    constructor(readonly data: ReplayData) {
        this.config = data.config;
        this.players = data.players.map((p, idx) => ({ profile: p.profile, color: playerColor(idx) }));
        this.inputs = data.inputs.map(tupleToInput).sort((a, b) => a.t - b.t);
        this.reset();
    }

    get duration(): number {
        const last = this.data.rounds[this.data.rounds.length - 1];

        return last ? last.times.endAt : 0;
    }

    private reset(): void {
        this.simulation = new GameSimulation(this.config, this.data.startPositions);
        this.nextInput = 0;
    }

    time(): number {
        return this.playhead;
    }

    tick(): void {
        const now = performance.now();

        if (this.playing) {
            this.playhead = Math.min(this.duration, this.playhead + (now - this.lastTickAt) * this.speed);

            if (this.playhead >= this.duration) {
                this.playing = false;
            }
        }

        this.lastTickAt = now;
        this.advanceTo(this.playhead);
    }

    seek(t: number): void {
        if (t < this.playhead) {
            this.reset();
        }

        this.playhead = Math.max(-500, Math.min(this.duration, t));
        this.advanceTo(this.playhead);
    }

    seekRound(roundIndex: number): void {
        this.seek(getRoundTimes(this.config, roundIndex).appearAt);
    }

    private advanceTo(t: number): void {
        const sim = this.simulation;

        while (true) {
            const input = this.inputs[this.nextInput];
            const dropAt = sim.over ? Infinity : sim.getCurrentRoundTimes().dropAt;

            if (input && input.t <= t && input.t < dropAt) {
                sim.applyInput(input);
                this.nextInput++;
                continue;
            }

            const round = this.data.rounds[sim.currentRound];

            if (!sim.over && round && t >= dropAt) {
                sim.resolveRound(round.solution);
                continue;
            }

            if (input && input.t <= t) {
                // input after game over or rejected, skip
                this.nextInput++;
                continue;
            }

            return;
        }
    }

    getRound(roundIndex: number): undefined | LiveRound {
        return this.data.rounds[roundIndex];
    }
}
