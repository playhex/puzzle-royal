<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../api.js';
import { useLobby } from '../composables/useLobby.js';
import AppHeader from '../components/AppHeader.vue';
import BackgroundArt from '../components/BackgroundArt.vue';
import FeaturedReplay from '../components/FeaturedReplay.vue';
import type { PlayerProfile } from '../../shared/profile.js';

const route = useRoute();
const { playLabel, play } = useLobby();
const hasReplays = ref(false);
const puzzlesCount = ref<null | number>(null);
const topPlayers = ref<PlayerProfile[]>([]);
const medals = ['🥇', '🥈', '🥉'];

onMounted(async () => {
    api.leaderboard().then(l => topPlayers.value = l.slice(0, 5).map(p => p.player)).catch(() => {});
    api.puzzlesCount().then(n => puzzlesCount.value = n).catch(() => {});
    hasReplays.value = ((await api.recentGames('endedAt', 'desc', 0, 1).catch(() => null))?.games.length ?? 0) > 0;
});
</script>

<template>
    <div class="page d-flex flex-column">
        <BackgroundArt />
        <AppHeader />

        <main class="home d-flex flex-column align-items-center gap-5 p-3 text-center">
            <div v-if="route.query.login_error" class="alert alert-warning">Login cancelled ({{ route.query.login_error }}).</div>

            <h1 class="hexfall-title display-3 m-0">Hex <span class="fall">Fall</span></h1>

            <div class="home-row">
                <aside class="side text-start">
                    <template v-if="topPlayers.length > 0">
                        <h6 class="text-body-secondary">Top players</h6>
                        <ol class="list-unstyled m-0 fs-5">
                            <li v-for="(p, i) in topPlayers" :key="p.publicId" class="text-truncate">
                                <span class="text-body-secondary me-1">{{ medals[i] ?? `${i + 1}.` }}</span>
                                <RouterLink :to="`/profile/${p.publicId}`" class="text-reset">{{ p.pseudo }}</RouterLink>
                            </li>
                        </ol>
                    </template>
                </aside>

                <div class="buttons d-flex flex-column gap-4">
                    <button class="btn btn-lg btn-success" @click="play">{{ playLabel }}</button>
                    <div class="d-flex flex-column gap-2">
                        <RouterLink to="/tutorial" class="btn btn-outline-info">Tutorial</RouterLink>
                        <RouterLink to="/leaderboard" class="btn btn-outline-warning">Leaderboard</RouterLink>
                        <RouterLink v-if="hasReplays" to="/replays" class="btn btn-outline-primary">Replays</RouterLink>
                    </div>
                </div>

                <aside class="side">
                    <FeaturedReplay />
                </aside>
            </div>
        </main>

        <p v-if="puzzlesCount !== null" class="mt-auto mb-0 py-3 text-center text-secondary small">{{ puzzlesCount }} puzzles</p>
    </div>
</template>

<style scoped>
.page {
    min-height: 100%;
}

.home {
    padding-top: 15vh !important;
}

.buttons {
    width: min(260px, 100%);
}

.home-row {
    display: grid;
    grid-template-columns: 1fr min(260px, 100%) 1fr;
    align-items: start;
    gap: 3rem 8rem;
    width: min(1200px, 100%);
}

.home-row > .buttons {
    width: auto;
}

/* Titles above the row, so that side contents top is aligned with first button */
@media (min-width: 768px) {
    .side {
        position: relative;
    }

    .side :deep(h6) {
        position: absolute;
        bottom: 100%;
        left: 0;
        right: 0;
        margin-bottom: 0.5rem;
        white-space: nowrap;
    }
}

.side:first-child {
    justify-self: end;
    min-width: 0;
    max-width: 200px;
}

.side:last-child {
    width: min(280px, 100%);
}

@media (max-width: 767px) {
    .home-row {
        grid-template-columns: 1fr;
        justify-items: center;
    }

    .home-row > .buttons {
        width: min(260px, 100%);
        order: -1;
    }

    .side:first-child {
        justify-self: center;
    }
}
</style>
