import { describe, expect, it } from 'vitest';
import { getMedianShift, getNextMeasureDelay, measureShift, STABLE_MEASURE_INTERVAL, UNSTABLE_MEASURE_INTERVAL } from '../src/shared/serverClockShift.js';

describe('server clock shift', () => {
    it('compensates half round trip', () => {
        // client is 1000ms ahead, 100ms round trip: server read at local 1050 = server 50
        expect(measureShift(1000, 1100, 50)).toBe(1000);
    });

    it('takes median', () => {
        expect(getMedianShift([])).toBe(0);
        expect(getMedianShift([5, 1, 900, 3, 4])).toBe(4);
    });

    it('measures often until stable', () => {
        expect(getNextMeasureDelay([1, 2])).toBe(UNSTABLE_MEASURE_INTERVAL);
        expect(getNextMeasureDelay([1, 2, 3, 4, 5])).toBe(STABLE_MEASURE_INTERVAL);
        expect(getNextMeasureDelay([1, 2, 3, 4, 900])).toBe(UNSTABLE_MEASURE_INTERVAL);
    });
});
