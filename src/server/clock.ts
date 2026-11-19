/**
 * Monotonic server time, in ms, comparable to Date.now().
 * Used for game timings and sent to clients for clock synchronization.
 */
export const serverNow = (): number => Math.round(performance.timeOrigin + performance.now());
