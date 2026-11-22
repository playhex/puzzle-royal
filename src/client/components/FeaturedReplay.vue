<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, onMounted, shallowRef } from 'vue';
import { api } from '../api.js';
import { ReplayModel } from '../game/ReplayModel.js';
import { useSessionStore } from '../stores/session.js';
import BoardCanvas from './BoardCanvas.vue';

/**
 * Best game (players² × rounds), replayed in loop.
 */
const session = useSessionStore();
const model = shallowRef<null | ReplayModel>(null);
const LOOP_PAUSE_MS = 3000;
let interval: ReturnType<typeof setInterval>;
let endedAt: null | number = null;

/** Max names shown, winners included */
const MAX_NAMES = 5;

const joinNames = (names: string[]) => names.length <= 1
    ? names.join('')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/**
 * "Winner outlasted A, B, C, D and 3 others", or "X and Y outlasted …" when last players fell together.
 */
const summary = computed(() => {
    if (!model.value) return null;

    const players = [...model.value.data.players].sort((a, b) => a.finalPlace - b.finalPlace);
    const winners = players.filter(p => p.finalPlace === 1).map(p => p.profile.pseudo);
    const others = players.filter(p => p.finalPlace !== 1).map(p => p.profile.pseudo);
    const shown = others.slice(0, Math.max(1, MAX_NAMES - winners.length));

    if (others.length === 0) {
        return { winners: joinNames(winners), outlasted: null };
    }

    return {
        winners: joinNames(winners),
        // Show the last name rather than "and 1 other"
        outlasted: others.length - shown.length > 1
            ? `${shown.join(', ')} and ${others.length - shown.length} others`
            : joinNames(others),
    };
});

onMounted(async () => {
    const [featured] = await api.featuredGames().catch(() => []);
    const data = featured ? await api.game(featured.gameId).catch(() => null) : null;

    if (data === null) return;

    model.value = markRaw(new ReplayModel(data));

    interval = setInterval(() => {
        const m = model.value!;

        if (m.playing) return;

        endedAt ??= Date.now();

        if (Date.now() - endedAt > LOOP_PAUSE_MS) {
            endedAt = null;
            m.seek(-500);
            m.playing = true;
        }
    }, 500);
});

onBeforeUnmount(() => clearInterval(interval));
</script>

<template>
    <RouterLink v-if="model" :to="`/replay/${model.data.gameId}`" class="featured-replay d-block text-reset text-decoration-none">
        <h6 class="text-body-secondary">Previously…</h6>
        <div class="board border rounded">
            <BoardCanvas :display="model" :settings="session.boardSettings" />
        </div>
        <small class="text-body-secondary">
            <template v-if="summary?.outlasted">
                <strong>{{ summary.winners }}</strong> outlasted {{ summary.outlasted }}
            </template>
            <template v-else-if="summary">
                <strong>{{ summary.winners }}</strong> fell together
            </template>
        </small>
    </RouterLink>
</template>

<style scoped>
.board {
    position: relative;
    aspect-ratio: 1;
    overflow: hidden;
}
</style>
