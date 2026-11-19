import type { Rng } from '../rng.js';
import type { BotFate } from './BotBrain.js';

/**
 * Decides which bots fall at which round, so that bots fall progressively,
 * a few per round, and all are eliminated at the latest on last round.
 *
 * @returns For each round, the bot indexes (0..botsCount-1) that fall
 */
export const createTutorialSchedule = (rng: Rng, botsCount: number, roundsCount: number): number[][] => {
    const counts = Array.from({ length: roundsCount }, () => 1);
    const weights = counts.map((_, i) => 1 + i);
    const maxPerRound = Math.ceil(botsCount / roundsCount) + 1;
    let extra = botsCount - roundsCount;

    while (extra > 0) {
        const eligible = counts.flatMap((c, i) => (c < maxPerRound || i === roundsCount - 1) ? [i] : []);
        const totalWeight = eligible.reduce((sum, i) => sum + weights[i], 0);
        let r = rng.next() * totalWeight;
        let chosen = eligible[eligible.length - 1];

        for (const i of eligible) {
            r -= weights[i];

            if (r < 0) {
                chosen = i;
                break;
            }
        }

        counts[chosen]++;
        extra--;
    }

    const bots = rng.shuffle(Array.from({ length: botsCount }, (_, i) => i));
    const schedule: number[][] = [];
    let offset = 0;

    for (const count of counts) {
        schedule.push(bots.slice(offset, offset + count));
        offset += count;
    }

    return schedule;
};

export const botFateAt = (schedule: number[][], bot: number, roundIndex: number): BotFate => {
    const fallRound = schedule.findIndex(bots => bots.includes(bot));

    if (fallRound === roundIndex) {
        return 'fall';
    }

    return fallRound > roundIndex ? 'survive' : 'free';
};
