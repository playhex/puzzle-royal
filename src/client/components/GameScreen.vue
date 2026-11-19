<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive } from 'vue';
import type { BoardSettings } from '../../shared/boardSettings.js';
import type { PlayerProfile } from '../../shared/profile.js';
import { getPhaseAt, getRoundTimes } from '../../shared/simulation/GameSimulation.js';
import { colorToCss, isEliminatedAt, isOverAt, type GameDisplay } from '../game/GameDisplay.js';
import BoardCanvas from './BoardCanvas.vue';
import PlayerIconsBar from './PlayerIconsBar.vue';
import PlayerName from './PlayerName.vue';

const props = defineProps<{
    display: GameDisplay;
    settings: BoardSettings;

    /** Viewers who are not players, null to hide */
    spectators?: null | number;
}>();

const emit = defineEmits<{ selectPlayer: [idx: number] }>();

type Row = { idx: number; profile: PlayerProfile; color: string; eliminated: boolean; me: boolean };

const hud = reactive({
    started: false,
    startsInMs: 0,
    roundIndex: 0,
    phase: 'appear' as string,
    remainingMs: 0,
    playMs: 1,
    countdown: null as null | number,
    rows: [] as Row[],
    fallen: null as null | { place: number; round: number; fresh: boolean },
    over: false,
    myPlace: null as null | number,
    winners: [] as PlayerProfile[],
    roundsCount: 0,
});

const update = () => {
    const display = props.display;
    const sim = display.simulation;
    const t = display.time();
    const lastRound = sim.over ? sim.currentRound - 1 : null;

    // Game over: stay on last round instead of showing next one
    const phase = lastRound !== null && t >= getRoundTimes(display.config, lastRound).dropAt
        ? { roundIndex: lastRound, phase: 'drop' as const, times: getRoundTimes(display.config, lastRound) }
        : getPhaseAt(display.config, t);

    hud.started = t >= 0;
    hud.startsInMs = Math.max(0, -t);

    if (phase) {
        hud.roundIndex = phase.roundIndex;
        hud.phase = phase.phase;
        hud.playMs = display.config.playMs;
        hud.remainingMs = phase.phase === 'play' ? phase.times.dropAt - t : phase.phase === 'appear' ? display.config.playMs : 0;
        hud.countdown = phase.phase === 'play' && hud.remainingMs <= 3000 ? Math.ceil(hud.remainingMs / 1000) : null;
    }

    const eliminated = display.players.map((_, idx) => isEliminatedAt(display, idx, t));

    const rows: Row[] = display.players.map((p, idx) => ({
        idx,
        profile: p.profile,
        color: colorToCss(p.color),
        eliminated: eliminated[idx],
        me: idx === display.myIdx,
    }));

    // Me first, then alive, then eliminated, last fallen first
    rows.sort((a, b) => {
        if (a.me !== b.me) return a.me ? -1 : 1;
        if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
        if (a.eliminated) return (sim.eliminatedRound[b.idx] ?? 0) - (sim.eliminatedRound[a.idx] ?? 0) || a.idx - b.idx;
        return a.idx - b.idx;
    });

    hud.rows = rows;

    const me = display.myIdx;

    if (display.isMe && me !== null && eliminated[me]) {
        const round = sim.eliminatedRound[me]!;

        hud.fallen = {
            place: sim.places[me] ?? 0,
            round: round + 1,
            fresh: t < getRoundTimes(display.config, round).endAt + 2500,
        };
    } else {
        hud.fallen = null;
    }

    hud.over = isOverAt(display, t);
    hud.myPlace = display.isMe && me !== null ? sim.places[me] : null;
    hud.winners = display.players.filter((_, idx) => sim.places[idx] === 1).map(p => p.profile);
    hud.roundsCount = sim.results.length;
};

let frame = 0;
const loop = () => {
    update();
    frame = requestAnimationFrame(loop);
};

onMounted(loop);
onBeforeUnmount(() => cancelAnimationFrame(frame));

const ordinal = (n: number) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] ?? ['th', 'st', 'nd', 'rd'][n % 100] ?? 'th');
</script>

<template>
    <div class="game-screen">
        <div class="board-area">
            <BoardCanvas :display="display" :settings="settings" />

            <div class="timebar">
                <div
                    class="timebar-fill"
                    :class="{ urgent: hud.remainingMs <= 3000 }"
                    :style="{ width: (hud.phase === 'drop' ? 0 : Math.max(0, hud.remainingMs / hud.playMs) * 100) + '%' }"
                />
            </div>

            <div v-if="!hud.started" class="center-message">
                <div class="fs-4">Get ready</div>
                <div class="display-3 fw-bold">{{ Math.ceil(hud.startsInMs / 1000) }}</div>
            </div>

            <div v-else-if="hud.countdown !== null && !hud.over" :key="hud.countdown" class="countdown">{{ hud.countdown }}</div>

            <div v-if="hud.fallen && hud.fallen.fresh && !hud.over" class="fallen-banner">
                <div class="fs-3 fw-bold">Fallen!</div>
                <div>{{ ordinal(hud.fallen.place) }} place · round {{ hud.fallen.round }}</div>
            </div>
            <div v-else-if="hud.fallen && !hud.over" class="spectating-chip badge text-bg-secondary">Spectating</div>

            <div v-if="hud.over" class="end-screen">
                <div class="card shadow">
                    <div class="card-body text-center">
                        <h2 v-if="hud.myPlace !== null" class="card-title">
                            {{ hud.myPlace === 1 ? 'You won!' : `${ordinal(hud.myPlace)} place` }}
                        </h2>
                        <h2 v-else class="card-title">Game over</h2>
                        <p v-if="hud.winners.length > 0" class="mb-1">Winner: <strong>{{ hud.winners.map(w => w.pseudo).join(', ') }}</strong></p>
                        <p v-else class="mb-1">No winner: last players fell together</p>
                        <p class="text-body-secondary">{{ hud.roundsCount }} round{{ hud.roundsCount > 1 ? 's' : '' }}</p>
                        <slot name="end" />
                    </div>
                </div>
            </div>
        </div>

        <aside class="side">
            <div class="players p-2">
                <div
                    v-for="row in hud.rows"
                    :key="row.idx"
                    class="player-row d-flex align-items-center gap-2 cursor-pointer"
                    :class="{ eliminated: row.eliminated, me: row.me }"
                    @click="emit('selectPlayer', row.idx)"
                >
                    <span class="dot" :style="{ background: row.color }" />
                    <PlayerName :player="row.profile" :avatar-size="row.me ? 36 : 24" />
                </div>
            </div>
            <div v-if="spectators !== null && spectators !== undefined" class="px-2 pb-2 small text-body-secondary">
                {{ spectators }} spectator{{ spectators === 1 ? '' : 's' }}
            </div>
            <template v-if="$slots.side">
                <hr class="my-0 mx-2">
                <slot name="side" />
            </template>
        </aside>

        <PlayerIconsBar
            class="mobile-only"
            :players="hud.rows.map(r => ({ idx: r.idx, profile: r.profile, eliminated: r.eliminated, me: r.me }))"
        />
    </div>
</template>

<style scoped>
.game-screen {
    display: flex;
    flex: 1;
    min-height: 0;
}

.board-area {
    position: relative;
    flex: 1;
    min-width: 0;
}

.side {
    width: 280px;
    border-left: 1px solid var(--bs-border-color);
    overflow-y: auto;
}

.dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
}

.players {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.player-row {
    padding: 0.2rem 0.5rem;
    border-radius: 0.375rem;
    font-size: 0.9rem;
    background: rgba(var(--bs-success-rgb), 0.1);
}

.player-row.me {
    padding: 0.35rem 0.5rem;
    font-size: 1.1rem;
    font-weight: bold;
}

.player-row.eliminated {
    background: none;
    text-decoration: line-through;
    opacity: 0.5;
}

.timebar {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 6px;
    background: rgba(127, 127, 127, 0.25);
    pointer-events: none;
}

.timebar-fill {
    height: 100%;
    background: #37b24d;
}

.timebar-fill.urgent {
    background: #e03131;
}

.countdown {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: min(30vw, 30vh);
    font-weight: 900;
    color: #e03131;
    opacity: 0.35;
    pointer-events: none;
    animation: pop 1s ease-out;
}

@keyframes pop {
    from { transform: translate(-50%, -50%) scale(1.4); opacity: 0.6; }
    to { transform: translate(-50%, -50%) scale(1); opacity: 0.2; }
}

.center-message, .fallen-banner {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    pointer-events: none;
    text-shadow: 0 0 8px var(--bs-body-bg);
}

.fallen-banner {
    top: 25%;
    background: rgba(224, 49, 49, 0.9);
    color: white;
    padding: 0.75rem 1.5rem;
    border-radius: 0.5rem;
    text-shadow: none;
}

.spectating-chip {
    position: absolute;
    bottom: 14px;
    left: 8px;
}

.end-screen {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.35);
    padding: 1rem;
}

.end-screen .card {
    min-width: min(320px, 100%);
}

.mobile-only {
    display: none;
}

@media (max-width: 767px), (orientation: portrait) and (max-width: 1024px) {
    .game-screen {
        flex-direction: column;
    }

    .side {
        display: none;
    }

    .mobile-only {
        display: flex;
    }
}
</style>
