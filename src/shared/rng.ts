/**
 * Seeded pseudo random generator (mulberry32).
 * Same seed gives same sequence on every JS engine.
 */
export class Rng {
    private state: number;

    constructor(seed: number) {
        this.state = seed >>> 0;
    }

    /** Float in [0, 1) */
    next(): number {
        let t = (this.state = (this.state + 0x6D2B79F5) >>> 0);

        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    range(min: number, max: number): number {
        return min + this.next() * (max - min);
    }

    int(minInclusive: number, maxExclusive: number): number {
        return minInclusive + Math.floor(this.next() * (maxExclusive - minInclusive));
    }

    chance(probability: number): boolean {
        return this.next() < probability;
    }

    pick<T>(items: readonly T[]): T {
        if (items.length === 0) {
            throw new Error('Cannot pick from empty list');
        }

        return items[this.int(0, items.length)];
    }

    shuffle<T>(items: T[]): T[] {
        for (let i = items.length - 1; i > 0; --i) {
            const j = this.int(0, i + 1);

            [items[i], items[j]] = [items[j], items[i]];
        }

        return items;
    }
}

export const randomSeed = (): number => Math.floor(Math.random() * 2 ** 31);
