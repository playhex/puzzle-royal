import type { Vec } from '../../shared/geometry.js';
import { TUTORIAL_BOT_NAMES, TutorialGame } from '../../shared/bots/TutorialGame.js';
import { tutorialPuzzles } from '../../shared/bots/tutorialPuzzles.js';
import type { PlayerProfile } from '../../shared/profile.js';
import type { LiveRound } from '../../shared/protocol.js';
import { randomSeed } from '../../shared/rng.js';
import { playerColor, type DisplayPlayer, type GameDisplay } from './GameDisplay.js';

const START_DELAY_MS = 2000;

const botProfile = (name: string, i: number): PlayerProfile => ({
    publicId: `bot-${i}`,
    pseudo: name,
    slug: name.toLowerCase(),
    isGuest: false,
    avatarUrl: null,
    countryFlag: null,
    rating: 1350 + ((i * 137) % 500),
    ratingDeviation: 80,
});

/**
 * Solo tutorial against bots, entirely client side, nothing recorded.
 */
export class TutorialModel implements GameDisplay {
    readonly game: TutorialGame;
    readonly players: DisplayPlayer[];
    readonly myIdx = 0;
    readonly isMe = true;
    private rounds = new Map<number, LiveRound>();
    private startedAt = performance.now() + START_DELAY_MS;

    constructor(me: null | PlayerProfile) {
        this.game = new TutorialGame(tutorialPuzzles, randomSeed());

        const human: PlayerProfile = me ?? { ...botProfile('You', 99), publicId: 'me', pseudo: 'You', rating: 1500, ratingDeviation: 350 };

        this.players = [human, ...TUTORIAL_BOT_NAMES.map(botProfile)].map((profile, idx) => ({ profile, color: playerColor(idx) }));
    }

    get config() {
        return this.game.config;
    }

    get simulation() {
        return this.game.simulation;
    }

    time(): number {
        return performance.now() - this.startedAt;
    }

    tick(): void {
        for (const event of this.game.update(this.time())) {
            if (event.type === 'roundStart') {
                this.rounds.set(event.roundIndex, {
                    roundIndex: event.roundIndex,
                    puzzle: event.puzzle,
                    origin: event.origin,
                    times: this.simulation.getCurrentRoundTimes(),
                    solution: event.puzzle.solution,
                });
            }
        }
    }

    getRound(roundIndex: number): undefined | LiveRound {
        return this.rounds.get(roundIndex);
    }

    click(target: Vec): void {
        this.game.humanClick(Math.round(this.time()), target);
    }
}
