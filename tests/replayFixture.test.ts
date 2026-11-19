import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { replayGame } from '../src/shared/simulation/GameSimulation.js';
import { tupleToInput, type InputTuple } from '../src/shared/simulation/types.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/recorded-game.json', import.meta.url), 'utf8'));

describe('replay of a recorded game', () => {
    it('finds same eliminations and places from recorded clicks only', () => {
        const simulation = replayGame(
            fixture.config,
            fixture.startPositions,
            fixture.solutions,
            (fixture.inputs as InputTuple[]).map(tupleToInput),
        );

        expect(simulation.results.map(r => r.eliminated.map(e => e.idx))).toEqual(fixture.expected.eliminations);
        expect(simulation.places).toEqual(fixture.expected.places);
    });
});
