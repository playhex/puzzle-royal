import { randomUUID } from 'node:crypto';
import type { Move } from '@playhex/move-notation';
import type { GameConfig } from '../../shared/config.js';
import { clampTarget, type Vec } from '../../shared/geometry.js';
import type { PlayerProfile } from '../../shared/profile.js';
import type { DropEvent, GameEndEvent, LiveGameState, LiveRound } from '../../shared/protocol.js';
import { Rng } from '../../shared/rng.js';
import { createStartPositions, GameSimulation } from '../../shared/simulation/GameSimulation.js';
import { inputToTuple, type Input, type RoundResult } from '../../shared/simulation/types.js';
import type { ServerPuzzle } from './puzzleProvider.js';

/** Anti flood: at most this number of clicks per player per second */
const MAX_INPUTS_PER_SECOND = 20;

/** Delay between game creation and first round, so that all clients receive game state */
export const GAME_START_LEAD_MS = 3000;

export type GameRecordRound = LiveRound & {
    puzzleId: number;
    solution: Move;
    result: RoundResult;
};

/**
 * Everything needed to save and replay a game.
 */
export type GameRecord = {
    gameId: string;
    startedAt: Date;
    endedAt: Date;
    seed: number;
    config: GameConfig;
    players: PlayerProfile[];
    startPositions: Vec[];
    rounds: GameRecordRound[];
    inputs: Input[];
    places: (null | number)[];
    eliminatedRound: (null | number)[];
};

export type GameServerEvents = {
    onRoundStart: (round: LiveRound, puzzleId: number) => void;
    onInput: (input: Input) => void;
    onDrop: (event: DropEvent) => void;
    onEnd: (event: GameEndEvent, record: GameRecord) => void;
};

type Timer = ReturnType<typeof setTimeout>;

/**
 * Authoritative live game: timestamps clicks, runs simulation, schedules phases.
 * The solution of current round is never exposed before drop phase.
 */
export class GameServer {
    readonly gameId = randomUUID();
    readonly simulation: GameSimulation;
    readonly startedAt: number;

    private readonly startedAtDate: Date;
    private readonly rounds: GameRecordRound[] = [];
    private currentRound: null | (LiveRound & { puzzle: ServerPuzzle }) = null;
    private readonly inputs: Input[] = [];
    private readonly playerIndexes = new Map<string, number>();

    /** Times of last accepted clicks per player, for anti flood */
    private readonly recentInputs: number[][];
    private readonly timers = new Set<Timer>();
    private stopped = false;

    constructor(
        readonly players: PlayerProfile[],
        private puzzles: ServerPuzzle[],
        private loadMorePuzzles: (excludeIds: number[]) => Promise<ServerPuzzle[]>,
        readonly config: GameConfig,
        readonly seed: number,
        private events: GameServerEvents,
        private now: () => number,
    ) {
        const rng = new Rng(seed);

        this.startedAt = now() + GAME_START_LEAD_MS;
        this.startedAtDate = new Date(Date.now() + GAME_START_LEAD_MS);
        this.simulation = new GameSimulation(config, createStartPositions(players.length, config.boardsize, rng));
        this.recentInputs = players.map(() => []);
        players.forEach((p, idx) => this.playerIndexes.set(p.publicId, idx));
    }

    start(): void {
        this.startRound(0);
    }

    stop(): void {
        this.stopped = true;
        this.timers.forEach(t => clearTimeout(t));
        this.timers.clear();
    }

    /** Time since game start */
    gameTime(): number {
        return this.now() - this.startedAt;
    }

    isPlayer(publicId: string): boolean {
        return this.playerIndexes.has(publicId);
    }

    get over(): boolean {
        return this.simulation.over;
    }

    /**
     * Player click.
     */
    move(publicId: string, target: Vec): boolean {
        const idx = this.playerIndexes.get(publicId);

        if (idx === undefined || !Number.isFinite(target?.x) || !Number.isFinite(target?.y)) {
            return false;
        }

        const t = this.gameTime();
        const recent = this.recentInputs[idx];

        while (recent.length > 0 && recent[0] <= t - 1000) {
            recent.shift();
        }

        if (recent.length >= MAX_INPUTS_PER_SECOND) {
            return false;
        }
        const clamped = clampTarget(target, this.config.boardsize, this.config.targetMargin);
        const input: Input = { t, idx, x: clamped.x, y: clamped.y };

        if (!this.simulation.applyInput(input)) {
            return false;
        }

        recent.push(t);
        this.inputs.push(input);
        this.events.onInput(input);

        return true;
    }

    getState(spectators: number): LiveGameState {
        return {
            gameId: this.gameId,
            startedAt: this.startedAt,
            config: this.config,
            players: this.players,
            startPositions: this.simulation.startPositions,
            rounds: [
                ...this.rounds.map(r => this.toPublicRound(r, true)),
                ...(this.currentRound ? [this.toPublicRound(this.currentRound, false)] : []),
            ],
            inputs: this.inputs.map(inputToTuple),
            spectators,
            over: this.over,
        };
    }

    private toPublicRound(round: LiveRound & { puzzle: ServerPuzzle | LiveRound['puzzle'] }, withSolution: boolean): LiveRound {
        const { redStones, blueStones, lastMove } = round.puzzle;
        const publicRound: LiveRound = {
            roundIndex: round.roundIndex,
            puzzle: { redStones, blueStones, lastMove },
            origin: round.origin,
            times: round.times,
        };

        if (withSolution && 'solution' in round && round.solution) {
            publicRound.solution = round.solution;
        }

        return publicRound;
    }

    private schedule(gameTime: number, callback: () => void | Promise<void>): void {
        const timer = setTimeout(() => {
            this.timers.delete(timer);

            if (!this.stopped) {
                // then() also catches synchronous errors of callback, which would otherwise crash the process
                void Promise.resolve().then(callback).catch(e => console.error('Game timer error', e));
            }
        }, Math.max(0, this.startedAt + gameTime - this.now()));

        this.timers.add(timer);
    }

    private startRound(roundIndex: number): void {
        void this.scheduleRound(roundIndex).catch(e => console.error('Could not schedule round', roundIndex, e));
    }

    private async scheduleRound(roundIndex: number): Promise<void> {
        if (roundIndex >= this.puzzles.length) {
            try {
                this.puzzles.push(...await this.loadMorePuzzles(this.puzzles.map(p => p.id)));

                if (roundIndex >= this.puzzles.length) {
                    // Every puzzle already played: allow repeating
                    this.puzzles.push(...await this.loadMorePuzzles([]));
                }
            } catch (e) {
                console.error('Could not load more puzzles, repeating already played ones', e);
            }
        }

        // Puzzles could not be loaded: repeat already played ones, so that the game can go on
        const puzzle = this.puzzles[roundIndex] ?? this.puzzles[roundIndex % this.puzzles.length];
        const times = this.simulation.getCurrentRoundTimes();
        const origin = roundIndex === 0 ? null : this.rounds[roundIndex - 1].solution;

        this.schedule(times.appearAt, () => {
            this.currentRound = { roundIndex, puzzle, origin, times };
            this.events.onRoundStart(this.toPublicRound(this.currentRound, false), puzzle.id);
        });

        this.schedule(times.dropAt, () => this.resolveRound());
    }

    private resolveRound(): void {
        const current = this.currentRound!;
        const result = this.simulation.resolveRound(current.puzzle.solution);

        this.rounds.push({ ...current, puzzleId: current.puzzle.id, solution: current.puzzle.solution, result });
        this.currentRound = null;

        this.events.onDrop({
            roundIndex: current.roundIndex,
            solution: current.puzzle.solution,
            eliminated: result.eliminated.map(e => e.idx),
        });

        if (!result.gameOver) {
            this.startRound(current.roundIndex + 1);
            return;
        }

        this.schedule(current.times.endAt, () => {
            const record: GameRecord = {
                gameId: this.gameId,
                startedAt: this.startedAtDate,
                endedAt: new Date(),
                seed: this.seed,
                config: this.config,
                players: this.players,
                startPositions: this.simulation.startPositions,
                rounds: this.rounds,
                inputs: this.inputs,
                places: this.simulation.places,
                eliminatedRound: this.simulation.eliminatedRound,
            };

            this.events.onEnd({ gameId: this.gameId, places: this.simulation.places, roundsCount: this.rounds.length }, record);
        });
    }
}
