import type { Puzzle } from '../puzzle.js';

/**
 * Tutorial puzzles, hardcoded, from PlayHex V7 collection.
 * Ordered by increasing number of stones.
 */
export const tutorialPuzzles: Puzzle[] = [
    { // 353a0fd7-ede8-4ba8-b809-cb7c73c8fa93
        redStones: ['a6', 'c4', 'd6'],
        blueStones: ['a7', 'd5', 'e3'],
        lastMove: 'd5',
        solution: 'b6',
    },
    { // 614813f0-3e82-4478-bb7b-c036140a1bf9
        redStones: ['b3', 'f2', 'f5'],
        blueStones: ['b6', 'c7', 'e1', 'f3'],
        lastMove: 'f3',
        solution: 'e4',
    },
    { // df85eab1-b0ae-410b-9884-30d5704d537b
        redStones: ['b5', 'd5', 'e3', 'e6'],
        blueStones: ['b4', 'c7', 'e2', 'f2', 'f4'],
        lastMove: 'e2',
        solution: 'c3',
    },
    { // 050fde30-2626-4ba9-812d-fbe9880a81f0
        redStones: ['b4', 'b6', 'd3', 'd5', 'f2', 'g5'],
        blueStones: ['a6', 'b5', 'c4', 'd4', 'd6', 'e3', 'e5'],
        lastMove: 'd4',
        solution: 'f3',
    },
    { // 293874ae-179a-438f-b3e4-219e6fc1ce4e
        redStones: ['c2', 'd4', 'd6', 'e2', 'e3', 'f4', 'f5', 'g2'],
        blueStones: ['b5', 'd2', 'd5', 'e1', 'e5', 'e6', 'f1', 'g1', 'g4'],
        lastMove: 'd2',
        solution: 'c3',
    },
];
