import { describe, expect, it } from 'vitest';
import { Rng } from '../src/shared/rng.js';
import { createTutorialSchedule } from '../src/shared/bots/tutorialScenario.js';
import { TutorialGame } from '../src/shared/bots/TutorialGame.js';
import { tutorialPuzzles } from '../src/shared/bots/tutorialPuzzles.js';
import { moveCenter } from '../src/shared/geometry.js';

const runTutorial = (seed: number, humanPlays: 'perfect' | 'idle') => {
    const game = new TutorialGame(tutorialPuzzles, seed);
    const eliminatedBotsPerRound: number[][] = [];
    let over = false;

    for (let t = 0; t < 200_000 && !over; t += 20) {
        for (const event of game.update(t)) {
            if (event.type === 'roundStart' && humanPlays === 'perfect') {
                game.humanClick(t, moveCenter(event.puzzle.solution));
            }

            if (event.type === 'drop') {
                eliminatedBotsPerRound.push(event.result.eliminated.map(e => e.idx).filter(i => i !== 0).map(i => i - 1).sort());
            }

            if (event.type === 'gameOver') {
                over = true;
            }
        }
    }

    return { game, eliminatedBotsPerRound, over };
};

describe('tutorial schedule', () => {
    it('distributes all bots, at least one per round', () => {
        for (let seed = 0; seed < 500; ++seed) {
            const schedule = createTutorialSchedule(new Rng(seed), 10, 5);

            expect(schedule).toHaveLength(5);
            expect(schedule.flat().sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
            schedule.forEach(round => expect(round.length).toBeGreaterThanOrEqual(1));
            schedule.slice(0, 4).forEach(round => expect(round.length).toBeLessThanOrEqual(4));
        }
    });
});

describe('tutorial game', () => {
    it('bots fall as scheduled, all eliminated at the latest on 5th puzzle', () => {
        for (let seed = 0; seed < 200; ++seed) {
            const { game, eliminatedBotsPerRound, over } = runTutorial(seed, 'perfect');

            expect(over).toBe(true);
            expect(eliminatedBotsPerRound).toEqual(game.schedule.map(r => [...r].sort()));
            expect(game.simulation.places[0]).toBe(1);
        }
    });

    it('continues as spectator when human falls', () => {
        for (let seed = 0; seed < 50; ++seed) {
            const { game, over } = runTutorial(seed, 'idle');

            expect(over).toBe(true);
            expect(game.simulation.alive.filter(Boolean).length).toBeLessThanOrEqual(1);
        }
    });
});
