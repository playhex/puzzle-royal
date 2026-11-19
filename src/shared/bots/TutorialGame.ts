import type { Move } from '@playhex/move-notation';
import { defaultGameConfig, type GameConfig } from '../config.js';
import type { Vec } from '../geometry.js';
import { occupiedCells, type Puzzle } from '../puzzle.js';
import { Rng } from '../rng.js';
import { createStartPositions, GameSimulation } from '../simulation/GameSimulation.js';
import type { Input, RoundResult } from '../simulation/types.js';
import { BotBrain, createBotParams } from './BotBrain.js';
import { botFateAt, createTutorialSchedule } from './tutorialScenario.js';

export const TUTORIAL_BOTS_COUNT = 10;
export const TUTORIAL_FOLLOWERS_COUNT = 2;

export const TUTORIAL_BOT_NAMES = [
    'Hexy', 'Bridget', 'Ladderman', 'Ziggurat', 'Blocker',
    'Edgy', 'Templar', 'Swapper', 'Mirror', 'Acute',
];

export type TutorialEvent =
    | { type: 'roundStart'; roundIndex: number; puzzle: Puzzle; origin: null | Move }
    | { type: 'drop'; result: RoundResult }
    | { type: 'gameOver' }
;

/**
 * Solo game against bots: same simulation as online games,
 * player index 0 is the human, then bots.
 * Bots elimination is scripted so that all bots fall at the latest on last puzzle.
 */
export class TutorialGame {
    readonly simulation: GameSimulation;
    readonly humanIdx = 0;
    readonly bots: BotBrain[] = [];
    readonly schedule: number[][];

    private startedRound = -1;
    private overNotified = false;

    constructor(
        readonly puzzles: Puzzle[],
        seed: number,
        readonly config: GameConfig = defaultGameConfig,
    ) {
        const rng = new Rng(seed);
        const playersCount = 1 + TUTORIAL_BOTS_COUNT;

        this.simulation = new GameSimulation(config, createStartPositions(playersCount, config.boardsize, rng));
        this.schedule = createTutorialSchedule(rng, TUTORIAL_BOTS_COUNT, puzzles.length);

        for (let i = 0; i < TUTORIAL_BOTS_COUNT; ++i) {
            const follower = i < TUTORIAL_FOLLOWERS_COUNT;

            this.bots.push(new BotBrain(1 + i, createBotParams(rng, follower), new Rng(rng.int(0, 2 ** 31)), config));
        }
    }

    humanClick(t: number, target: Vec): null | Input {
        const input: Input = { t, idx: this.humanIdx, x: Math.round(target.x), y: Math.round(target.y) };

        return this.simulation.applyInput(input) ? input : null;
    }

    /**
     * Advance game to time t (ms since game start). Call it frequently (each frame).
     */
    update(t: number): TutorialEvent[] {
        const events: TutorialEvent[] = [];
        const sim = this.simulation;

        while (!sim.over) {
            const roundIndex = sim.currentRound;
            const times = sim.getCurrentRoundTimes();

            if (t < times.appearAt) {
                break;
            }

            if (this.startedRound < roundIndex) {
                this.startedRound = roundIndex;
                events.push(this.startRound(roundIndex));
            }

            const tBots = Math.min(t, times.dropAt - 1);
            const world = {
                positionOf: (idx: number) => sim.positionAt(idx, tBots),
                aliveIndexes: sim.getAliveIndexes(),
                humanIdx: this.humanIdx,
            };

            for (const bot of this.bots) {
                if (!sim.alive[bot.idx]) {
                    continue;
                }

                const target = bot.update(tBots, world);

                if (target !== null) {
                    sim.applyInput({ t: tBots, idx: bot.idx, x: target.x, y: target.y });
                }
            }

            if (t < times.dropAt) {
                break;
            }

            events.push({ type: 'drop', result: sim.resolveRound(this.puzzles[roundIndex].solution) });

            // Safety: after last puzzle, game is over whatever happens
            if (!sim.over && sim.currentRound >= this.puzzles.length) {
                throw new Error('Tutorial schedule should have eliminated all bots');
            }
        }

        if (sim.over && !this.overNotified) {
            const lastRoundEnd = sim.getCurrentRoundTimes().appearAt;

            if (t >= lastRoundEnd) {
                this.overNotified = true;
                events.push({ type: 'gameOver' });
            }
        }

        return events;
    }

    private startRound(roundIndex: number): TutorialEvent {
        const puzzle = this.puzzles[roundIndex];
        const times = this.simulation.getCurrentRoundTimes();

        for (const bot of this.bots) {
            bot.startRound({
                roundIndex,
                times,
                solution: puzzle.solution,
                lastMove: puzzle.lastMove,
                occupied: occupiedCells(puzzle),
                fate: botFateAt(this.schedule, bot.idx - 1, roundIndex),
            });
        }

        return {
            type: 'roundStart',
            roundIndex,
            puzzle,
            origin: roundIndex === 0 ? null : this.puzzles[roundIndex - 1].solution,
        };
    }
}
