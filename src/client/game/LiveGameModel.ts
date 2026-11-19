import { clampTarget, type Vec } from '../../shared/geometry.js';
import type { DropEvent, LiveGameState, LiveRound } from '../../shared/protocol.js';
import { GameSimulation, getRoundTimes, positionOnSegment } from '../../shared/simulation/GameSimulation.js';
import { tupleToInput, type InputTuple, type Segment } from '../../shared/simulation/types.js';
import { playerColor, type DisplayPlayer, type GameDisplay } from './GameDisplay.js';
import type { ServerClock } from './ServerClock.js';

/**
 * Display other players a little in the past, so that their clicks arrive before being displayed.
 * Own dot is displayed at current server time, and leaves as soon as clicked (see click()).
 */
const DISPLAY_DELAY_MS = 80;

/** Own click not confirmed after this delay: rejected by server, back to server trajectory */
const PREDICTION_TIMEOUT_MS = 1500;

/**
 * Once click is confirmed, own dot is ahead of server trajectory (it left when clicked,
 * server makes it leave when receiving the click). It plays server trajectory slower
 * until server catches up: 0.3 = at 70% speed, never backwards.
 */
const CATCH_UP_RATE = 0.3;

/** Remaining small gap (dot direction changed while click was travelling) fades out with this time constant */
const GAP_FADE_MS = 80;

/**
 * Live game: runs the same simulation as the server, from server timestamped clicks.
 */
export class LiveGameModel implements GameDisplay {
    readonly config;
    readonly players: DisplayPlayer[];
    readonly simulation: GameSimulation;
    readonly gameId: string;
    readonly startedAt: number;
    myIdx: null | number;
    readonly isMe: boolean;

    private rounds = new Map<number, LiveRound>();
    /** Own last click, not yet confirmed: dot goes there from where it was displayed when clicked */
    private prediction: null | { segment: Segment; sentAt: number } = null;

    /**
     * Clamped targets of own clicks sent and not yet confirmed, oldest first.
     * Prediction ends only when the last one is confirmed, so that an older click
     * with the same target (double click, A -> B -> A) is not taken as its confirmation.
     */
    private unconfirmedTargets: Vec[] = [];

    /**
     * After confirmation: own dot is displayed `lead` ms ahead on server trajectory, lead decreasing,
     * plus a fading spatial gap. `at`: server game time of confirmation.
     */
    private catchUp: null | { lead: number; gap: Vec; at: number } = null;

    /** Set when local simulation differs from server, state must be reloaded */
    desynced = false;

    spectators: number;

    constructor(
        state: LiveGameState,
        myPublicId: null | string,
        private clock: ServerClock,
        private sendMove: (target: Vec) => void,
    ) {
        this.config = state.config;
        this.gameId = state.gameId;
        this.startedAt = state.startedAt;
        this.spectators = state.spectators;
        this.players = state.players.map((profile, idx) => ({ profile, color: playerColor(idx) }));

        const idx = myPublicId === null ? -1 : state.players.findIndex(p => p.publicId === myPublicId);

        this.myIdx = idx >= 0 ? idx : null;
        this.isMe = this.myIdx !== null;
        this.simulation = new GameSimulation(state.config, state.startPositions);

        state.rounds.forEach(r => this.rounds.set(r.roundIndex, r));

        // Rebuild simulation from all clicks since game start
        for (const tuple of state.inputs) {
            const input = tupleToInput(tuple);

            this.resolveKnownRoundsBefore(input.t);
            this.simulation.applyInput(input);
        }

        this.resolveKnownRoundsBefore(Infinity);
    }

    private resolveKnownRoundsBefore(t: number): void {
        const sim = this.simulation;

        while (!sim.over) {
            const round = this.rounds.get(sim.currentRound);

            if (!round?.solution || sim.getCurrentRoundTimes().dropAt > t) {
                return;
            }

            sim.resolveRound(round.solution);
        }
    }

    time(): number {
        return this.clock.now() - this.startedAt - DISPLAY_DELAY_MS;
    }

    /** Server game time, without display delay */
    serverGameTime(): number {
        return this.clock.now() - this.startedAt;
    }

    getRound(roundIndex: number): undefined | LiveRound {
        return this.rounds.get(roundIndex);
    }

    onRoundStart(round: LiveRound): void {
        this.rounds.set(round.roundIndex, round);
    }

    onInput(tuple: InputTuple): void {
        const input = tupleToInput(tuple);

        if (!this.simulation.applyInput(input)) {
            this.desynced = true;
        }

        if (input.idx === this.myIdx) {
            this.confirmOwnClick(input.x, input.y, input.t);
        }
    }

    /**
     * Own click confirmed by server. Unconfirmed clicks sent before it have been rejected
     * (server confirms in order). Prediction ends once the last sent click is confirmed.
     */
    private confirmOwnClick(x: number, y: number, t: number): void {
        const i = this.unconfirmedTargets.findIndex(to => to.x === x && to.y === y);

        if (i < 0) {
            return;
        }

        this.unconfirmedTargets.splice(0, i + 1);

        if (this.unconfirmedTargets.length === 0 && this.prediction) {
            this.endPrediction(t - this.prediction.segment.t0);
        }
    }

    onDrop(event: DropEvent): void {
        const round = this.rounds.get(event.roundIndex);

        if (round) {
            round.solution = event.solution;
        }

        if (this.simulation.over || this.simulation.currentRound !== event.roundIndex) {
            this.desynced = true;
            return;
        }

        this.resetOwnDot();

        const result = this.simulation.resolveRound(event.solution);
        const eliminated = result.eliminated.map(e => e.idx);

        if (eliminated.join() !== event.eliminated.join()) {
            this.desynced = true;
        }
    }

    /**
     * Own dot leaves immediately, from where it is displayed, towards clicked target.
     * Server will make it leave a bit later (when receiving the click): see catch up.
     */
    click(target: Vec): void {
        if (this.myIdx === null) {
            return;
        }

        const t = this.serverGameTime();

        if (!this.simulation.canMove(this.myIdx, t)) {
            return;
        }

        const from = this.ownPosition(this.simulation.getCurrentRoundTimes().dropAt, t);
        const to = clampTarget(target, this.config.boardsize, this.config.targetMargin);

        this.prediction = {
            segment: { t0: t, from, to },
            sentAt: performance.now(),
        };
        this.unconfirmedTargets.push(to);
        this.sendMove(target);
    }

    /**
     * Switches from predicted segment to server trajectory, without visible jump.
     *
     * @param lead How much later server made the dot leave, 0 if click was rejected
     */
    private endPrediction(lead: number): void {
        const idx = this.myIdx!;
        const maxT = this.simulation.getCurrentRoundTimes().dropAt;
        const now = this.serverGameTime();
        const displayed = positionOnSegment(this.prediction!.segment, Math.min(now, maxT), this.config.speed);
        const server = this.simulation.positionAt(idx, Math.min(now + Math.max(0, lead), maxT));

        this.prediction = null;
        this.unconfirmedTargets = [];
        this.catchUp = {
            lead: Math.max(0, lead),
            gap: { x: displayed.x - server.x, y: displayed.y - server.y },
            at: now,
        };
    }

    pendingTarget(): null | Vec {
        return this.prediction?.segment.to ?? null;
    }

    /**
     * Own dot displayed position, at current server time (not delayed like others).
     *
     * @param maxT Positions are frozen at drop
     */
    ownPosition(maxT: number, now = this.serverGameTime()): Vec {
        const idx = this.myIdx!;

        if (this.prediction && performance.now() - this.prediction.sentAt > PREDICTION_TIMEOUT_MS) {
            this.endPrediction(0);
        }

        if (this.prediction) {
            return positionOnSegment(this.prediction.segment, Math.min(now, maxT), this.config.speed);
        }

        if (!this.catchUp) {
            return this.simulation.positionAt(idx, Math.min(now, maxT));
        }

        const elapsed = Math.max(0, now - this.catchUp.at);
        const lead = Math.max(0, this.catchUp.lead - CATCH_UP_RATE * elapsed);
        const fade = Math.exp(-elapsed / GAP_FADE_MS);
        const server = this.simulation.positionAt(idx, Math.min(now + lead, maxT));
        const { gap } = this.catchUp;

        if (lead === 0 && fade < 0.01) {
            this.catchUp = null;
        }

        return { x: server.x + gap.x * fade, y: server.y + gap.y * fade };
    }

    /**
     * Round resolved by server: forget prediction, show server positions.
     */
    private resetOwnDot(): void {
        this.prediction = null;
        this.unconfirmedTargets = [];
        this.catchUp = null;
    }

    roundTimes(roundIndex: number) {
        return getRoundTimes(this.config, roundIndex);
    }
}
