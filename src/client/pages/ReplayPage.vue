<script setup lang="ts">
import { markRaw, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../api.js';
import { ReplayModel } from '../game/ReplayModel.js';
import { useSessionStore } from '../stores/session.js';
import AppHeader from '../components/AppHeader.vue';
import GameScreen from '../components/GameScreen.vue';
import ReplayTimeline from '../components/ReplayTimeline.vue';

const route = useRoute();
const session = useSessionStore();
const model = shallowRef<null | ReplayModel>(null);
const error = ref<null | string>(null);

const speed = ref(1);
const follow = ref<null | number>(null);

/**
 * Round displayed, refreshed by interval. Only this is read by template: page is rendered again
 * only when round changes (Vue sets select and options values again on each render, closing an opened select).
 */
const currentRound = ref(0);
let interval: ReturnType<typeof setInterval>;

onMounted(async () => {
    try {
        const data = await api.game(String(route.params.gameId));
        const m = markRaw(new ReplayModel(data));

        // Follow logged in player if they played this game
        const myIdx = data.players.findIndex(p => p.profile.publicId === session.me?.profile.publicId);

        m.myIdx = myIdx >= 0 ? myIdx : null;
        follow.value = m.myIdx;
        model.value = m;
    } catch {
        error.value = 'Game not found';
    }

    interval = setInterval(() => {
        if (!model.value) return;

        const t = model.value.time();

        currentRound.value = [...model.value.data.rounds].reverse().find(r => t >= r.times.appearAt)?.roundIndex ?? 0;
    }, 100);
});

onBeforeUnmount(() => clearInterval(interval));

const togglePlay = () => {
    const m = model.value!;

    if (!m.playing && m.time() >= m.duration) {
        m.seek(-500);
    }

    m.playing = !m.playing;
};

const setSpeed = (s: number) => {
    speed.value = s;
    model.value!.speed = s;
};


const setFollow = (idx: null | number) => {
    follow.value = idx;
    model.value!.myIdx = idx;

    // Force dots redraw with new highlighted player
    model.value = markRaw(Object.assign(Object.create(Object.getPrototypeOf(model.value)), model.value));
};
</script>

<template>
    <div class="page d-flex flex-column">
        <AppHeader class="desktop-header" />

        <p v-if="error" class="container py-4 text-danger">{{ error }}</p>

        <template v-if="model">
            <GameScreen :display="model" :settings="session.boardSettings" @select-player="setFollow">
                <template #end>
                    <button class="btn btn-outline-secondary" @click="togglePlay">Replay again</button>
                </template>
            </GameScreen>

            <div class="controls border-top p-2 d-flex align-items-center gap-2 flex-wrap">
                <ReplayTimeline :model="model" @toggle-play="togglePlay" />
                <select class="form-select form-select-sm w-auto" :value="String(speed)" @change="setSpeed(Number(($event.target as HTMLSelectElement).value))">
                    <option v-for="s in [0.25, 0.5, 1, 2, 4]" :key="s" :value="String(s)">×{{ s }}</option>
                </select>
                <select class="form-select form-select-sm w-auto" :value="String(currentRound)" @change="model.seekRound(Number(($event.target as HTMLSelectElement).value))">
                    <option v-for="r in model.data.rounds" :key="r.roundIndex" :value="String(r.roundIndex)">Round {{ r.roundIndex + 1 }}</option>
                </select>
                <select class="form-select form-select-sm w-auto" :value="follow === null ? '' : String(follow)" @change="setFollow(($event.target as HTMLSelectElement).value === '' ? null : Number(($event.target as HTMLSelectElement).value))">
                    <option value="">Follow nobody</option>
                    <option v-for="(p, idx) in model.players" :key="idx" :value="String(idx)">Follow {{ p.profile.pseudo }}</option>
                </select>
            </div>
        </template>
    </div>
</template>

<style scoped>
.page {
    height: 100%;
}

@media (max-width: 767px) {
    .desktop-header {
        display: none !important;
    }
}
</style>
