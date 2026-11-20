<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { connectLive, live, liveActions } from '../live.js';
import { useLobby } from '../composables/useLobby.js';
import { useSessionStore } from '../stores/session.js';
import AppHeader from '../components/AppHeader.vue';
import BackgroundArt from '../components/BackgroundArt.vue';
import GameScreen from '../components/GameScreen.vue';
import NextGamePanel from '../components/NextGamePanel.vue';
import PlayerAvatar from '../components/PlayerAvatar.vue';
import { defaultWaitingRoomConfig } from '../../shared/config.js';
import { formatRating } from '../../shared/rating.js';

const session = useSessionStore();
const route = useRoute();
const router = useRouter();
const { players, me, remaining, playLabel, join } = useLobby();

onMounted(() => {
    // Coming back from login with ?join=1
    if (route.query.join && session.me) {
        const socket = connectLive(session.me.profile.publicId);
        const doJoin = () => void join();

        if (socket.connected) doJoin();
        else socket.once('connect', doJoin);

        void router.replace('/play');
    }
});

const playAgain = async () => {
    await join();
    liveActions.dismissFinishedGame();
};

const missing = computed(() => Math.max(0, (live.lobby?.minPlayers ?? 0) - players.value.length));
const waitMoreSeconds = defaultWaitingRoomConfig.waitMoreMs / 1000;

// Re-evaluated when live.version changes
const gameSpectators = computed(() => {
    void live.version;

    return live.game?.spectators ?? 0;
});
</script>

<template>
    <div class="page d-flex flex-column">
        <GameScreen
            v-if="live.game"
            :key="live.game.gameId"
            :display="live.game"
            :settings="session.boardSettings"
            :spectators="gameSpectators"
        >
            <template #end>
                <div class="d-flex gap-2 justify-content-center">
                    <button v-if="session.me" class="btn btn-primary" @click="playAgain">Play again</button>
                    <button class="btn btn-outline-secondary" @click="liveActions.dismissFinishedGame()">Back</button>
                </div>
            </template>
            <template #side>
                <NextGamePanel />
            </template>
        </GameScreen>

        <template v-else>
            <BackgroundArt />
            <AppHeader />

            <main class="waiting container py-3">
                <div class="d-flex align-items-center gap-2 flex-wrap mb-3">
                    <span class="fs-5 me-auto">
                        <template v-if="!live.lobby">Connecting…</template>
                        <template v-else-if="live.lobby.waitingForGameEnd">Starting after current game ends…</template>
                        <template v-else-if="remaining !== null && remaining > 0">
                            Starts in <strong :class="{ 'text-warning': remaining < 10 }">{{ remaining }}</strong>s
                        </template>
                        <template v-else-if="remaining !== null">Starting…</template>
                        <template v-else>Waiting for {{ missing }} more player{{ missing === 1 ? '' : 's' }}</template>
                    </span>

                    <template v-if="me">
                        <button
                            class="btn"
                            :class="me.ready ? 'btn-success' : 'btn-outline-success'"
                            @click="liveActions.ready(!me.ready)"
                        >{{ me.ready ? 'Ready ✓' : 'Ready' }}</button>
                        <button
                            v-if="remaining !== null"
                            class="btn btn-sm btn-outline-warning"
                            :disabled="remaining > waitMoreSeconds"
                            @click="liveActions.waitMore()"
                        >Wait more</button>
                        <button class="btn btn-sm btn-outline-danger" @click="liveActions.leave()">Leave</button>
                    </template>
                    <button v-else class="btn btn-primary" @click="join">{{ playLabel }}</button>
                </div>

                <div v-if="live.lobby?.startError" class="alert alert-danger">Could not start game: {{ live.lobby.startError }}</div>

                <div class="player-grid">
                    <div
                        v-for="p in players"
                        :key="p.profile.publicId"
                        class="player-card"
                        :class="{ ready: p.ready, me: p.profile.publicId === me?.profile.publicId, away: !p.connected }"
                    >
                        <PlayerAvatar :player="p.profile" :size="56" />
                        <div class="text-truncate w-100 fw-semibold">
                            {{ p.profile.pseudo }}
                            <small v-if="p.profile.countryFlag">{{ p.profile.countryFlag }}</small>
                        </div>
                        <small class="text-body-secondary">{{ formatRating(p.profile.rating, p.profile.ratingDeviation) }}</small>
                    </div>
                </div>

                <p v-if="live.lobby && (live.lobby.spectators.length > 0 || live.lobby.anonymousSpectators > 0)" class="small text-body-secondary mt-3 mb-0">
                    Watching:
                    <template v-for="(s, i) in live.lobby.spectators" :key="s.publicId">
                        <template v-if="i > 0">, </template>
                        <RouterLink :to="`/profile/${s.publicId}`" class="text-reset">{{ s.pseudo }}</RouterLink>
                    </template>
                    <template v-if="live.lobby.anonymousSpectators > 0">
                        {{ live.lobby.spectators.length > 0 ? ' and ' : '' }}{{ live.lobby.anonymousSpectators }} anonymous
                    </template>
                </p>
            </main>
        </template>
    </div>
</template>

<style scoped>
.page {
    height: 100%;
}

.waiting {
    /* About 6 player cards per row */
    max-width: 880px;
}

.player-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 0.75rem;
}

.player-card {
    aspect-ratio: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    padding: 0.5rem;
    text-align: center;
    border: 1px solid var(--bs-border-color);
    border-radius: 0.5rem;
    transition: background-color 0.2s, border-color 0.2s;
}

.player-card.me {
    border-width: 2px;
}

.player-card.ready {
    background: var(--bs-success-bg-subtle);
    border-color: var(--bs-success);
}

.player-card.away {
    opacity: 0.5;
}
</style>
