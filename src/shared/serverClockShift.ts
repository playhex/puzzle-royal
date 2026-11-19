/**
 * Client/server clock shift measures, same approach as PlayHex (shared/app/serverDateShift.ts),
 * but compensating latency with half the round trip, because Hex Fall needs a precise server time.
 */

/** How many last measured shifts are kept to get a median value. */
export const MAX_MEASURES = 5;

/** Delay before next measure while we have not enough measures, or they are too different. */
export const UNSTABLE_MEASURE_INTERVAL = 5000;

/** Delay before next measure when last measures are similar. */
export const STABLE_MEASURE_INTERVAL = 60000;

/** Max difference between a measure and the median to consider it similar. */
export const SHIFT_STABILITY_THRESHOLD = 150;

/**
 * Shift = local clock - server clock.
 * Assumes server time was read at the middle of the round trip.
 *
 * @param sentAt Local time when request was sent
 * @param receivedAt Local time when answer was received
 * @param serverTime Server time in the answer
 */
export const measureShift = (sentAt: number, receivedAt: number, serverTime: number): number =>
    (sentAt + receivedAt) / 2 - serverTime;

/** Median of measured shifts. 0 if no measure yet. */
export const getMedianShift = (shifts: number[]): number => {
    if (shifts.length === 0) {
        return 0;
    }

    const sorted = [...shifts].sort((a, b) => a - b);

    return sorted[Math.floor(shifts.length / 2)];
};

/** Delay to wait before measuring shift again. */
export const getNextMeasureDelay = (shifts: number[]): number => {
    if (shifts.length < MAX_MEASURES) {
        return UNSTABLE_MEASURE_INTERVAL;
    }

    const median = getMedianShift(shifts);
    const isStable = shifts.every(shift => Math.abs(shift - median) <= SHIFT_STABILITY_THRESHOLD);

    return isStable ? STABLE_MEASURE_INTERVAL : UNSTABLE_MEASURE_INTERVAL;
};
