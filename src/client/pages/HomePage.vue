<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../api.js';
import { useLobby } from '../composables/useLobby.js';
import AppHeader from '../components/AppHeader.vue';
import BackgroundArt from '../components/BackgroundArt.vue';

const route = useRoute();
const { playLabel, play } = useLobby();
const hasReplays = ref(false);
const puzzlesCount = ref<null | number>(null);

onMounted(async () => {
    api.puzzlesCount().then(n => puzzlesCount.value = n).catch(() => {});
    hasReplays.value = (await api.recentGames().catch(() => [])).length > 0;
});
</script>

<template>
    <div class="page d-flex flex-column">
        <BackgroundArt />
        <AppHeader />

        <main class="home d-flex flex-column align-items-center gap-5 p-3 text-center">
            <div v-if="route.query.login_error" class="alert alert-warning">Login cancelled ({{ route.query.login_error }}).</div>

            <h1 class="hexfall-title display-3 m-0">Hex <span class="fall">Fall</span></h1>

            <div class="buttons d-flex flex-column gap-4">
                <button class="btn btn-lg btn-primary" @click="play">{{ playLabel }}</button>
                <div class="d-flex flex-column gap-2">
                    <RouterLink to="/tutorial" class="btn btn-outline-secondary">Tutorial</RouterLink>
                    <RouterLink v-if="hasReplays" to="/replays" class="btn btn-outline-secondary">Replays</RouterLink>
                </div>
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
</style>
