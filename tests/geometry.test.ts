import { describe, expect, it } from 'vitest';
import { UNIT, cellAt, cellCenter, cellDistance, clampTarget, distance, moveCenter, neighbours, SQRT3_2, toFixed } from '../src/shared/geometry.js';

describe('geometry', () => {
    it('neighbour cells centers are at distance 1', () => {
        const a = moveCenter('d4');

        for (const n of neighbours('d4', 7)) {
            expect(distance(a, moveCenter(n)) / UNIT).toBeCloseTo(1, 3);
        }
    });

    it('finds cell at center and near edges', () => {
        expect(cellAt(moveCenter('a1'), 7)).toBe('a1');
        expect(cellAt(moveCenter('g7'), 7)).toBe('g7');
        expect(cellAt(cellCenter({ row: 3, col: 2 }), 7)).toBe('c4');

        // slightly to the right of d4 center, but still inside (inner radius = 0.5)
        const d4 = moveCenter('d4');
        expect(cellAt({ x: d4.x + toFixed(0.45), y: d4.y }, 7)).toBe('d4');
        expect(cellAt({ x: d4.x + toFixed(0.4), y: d4.y }, 7)).toBe('d4');
        expect(cellAt({ x: d4.x + toFixed(0.55), y: d4.y }, 7)).toBe('e4');

        // vertically, row above
        expect(cellAt({ x: d4.x, y: d4.y - toFixed(0.55) }, 7)).toBe('d4');
        expect(cellAt({ x: d4.x, y: d4.y - toFixed(SQRT3_2) }, 7)).not.toBe('d4');
    });

    it('returns null outside board', () => {
        expect(cellAt({ x: toFixed(-1), y: 0 }, 7)).toBe(null);
        expect(cellAt({ x: toFixed(3), y: toFixed(-0.9) }, 7)).toBe(null);
    });

    it('clamps targets around board', () => {
        const t = clampTarget({ x: toFixed(-50), y: toFixed(100) }, 7, 1);

        expect(t.x).toBe(toFixed(-1));
        expect(t.y).toBe(toFixed(6 * SQRT3_2 + 1));
    });

    it('computes cell distance', () => {
        expect(cellDistance('a1', 'a1')).toBe(0);
        expect(cellDistance('a1', 'b1')).toBe(1);
        expect(cellDistance('a1', 'a7')).toBe(6);
        expect(cellDistance('g1', 'a7')).toBe(6);
        expect(cellDistance('a1', 'g7')).toBe(12);
    });
});
