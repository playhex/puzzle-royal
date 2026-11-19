import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePuzzleFile } from '../src/server/puzzles/puzzleFile.js';

const valid = { redStones: 'e4 a7 b3', blueStones: 'd2 b6 c6', lastMove: 'b6', solution: 'a6' };

describe('puzzle file', () => {
    it('normalizes stones order, so a same position is always the same row', () => {
        expect(parsePuzzleFile(valid)).toEqual({ redStones: 'b3 e4 a7', blueStones: 'd2 b6 c6', lastMove: 'b6', solution: 'a6' });
    });

    it('accepts no last move', () => {
        expect(parsePuzzleFile({ ...valid, lastMove: null }).lastMove).toBe(null);
        expect(parsePuzzleFile({ ...valid, lastMove: undefined }).lastMove).toBe(null);
    });

    it('rejects invalid puzzles', () => {
        expect(() => parsePuzzleFile(null)).toThrow('not an object');
        expect(() => parsePuzzleFile({ ...valid, redStones: ['a1'] })).toThrow('redStones');
        expect(() => parsePuzzleFile({ ...valid, redStones: 'h1' })).toThrow('invalid cell "h1"');
        expect(() => parsePuzzleFile({ ...valid, blueStones: 'a7' })).toThrow('occupied twice');
        expect(() => parsePuzzleFile({ ...valid, lastMove: 'a7' })).toThrow('must be a blue stone');
        expect(() => parsePuzzleFile({ ...valid, solution: 'b3' })).toThrow('not an empty cell');
        expect(() => parsePuzzleFile({ ...valid, solution: undefined })).toThrow('solution');
    });

    it('validates all fixture puzzles', () => {
        const puzzles = JSON.parse(readFileSync(new URL('../fixtures/puzzles.json', import.meta.url), 'utf8')) as unknown[];

        expect(puzzles.length).toBe(50);
        puzzles.forEach((p, i) => expect(() => parsePuzzleFile(p), `#${i}`).not.toThrow());
    });
});
