<script setup lang="ts">
import { markRaw, shallowRef } from 'vue';
import { defaultGameConfig } from '../../shared/config.js';
import { TutorialModel } from '../game/TutorialModel.js';
import { useSessionStore } from '../stores/session.js';
import AppHeader from '../components/AppHeader.vue';
import GameScreen from '../components/GameScreen.vue';
import { loginUrl } from '../api.js';

const session = useSessionStore();
const config = defaultGameConfig;

/** Created when rules are read: game clock starts at creation */
const model = shallowRef<null | TutorialModel>(null);
const start = () => model.value = markRaw(new TutorialModel(session.me?.profile ?? null));
</script>

<template>
    <div class="page d-flex flex-column">
        <AppHeader />

        <main v-if="!model" class="rules container py-4">
            <h2 class="mb-3">Rules</h2>
            <ul class="mb-4">
                <li>Each round is a <strong>{{ config.boardsize }}x{{ config.boardsize }}</strong> Hex puzzle.</li>
                <li>It is always <strong class="red">Red</strong> to play.</li>
                <li>Only <strong>one</strong> cell wins.</li>
                <li>You have <strong>{{ config.playMs / 1000 }} seconds</strong> to stand on it. Tap where you want to go.</li>
                <li>Not on the winning cell when time is up? You fall and are <strong>eliminated</strong>.</li>
                <li>Game ends when one player is left, or when all the last players fall together.</li>
            </ul>
            <button class="btn btn-lg btn-primary w-100" @click="start">Play demo</button>
        </main>

        <GameScreen v-else :key="model.game.schedule.join('|')" :display="model" :settings="session.boardSettings">
            <template #end>
                <div class="d-flex gap-2 justify-content-center">
                    <button class="btn btn-outline-secondary" @click="start">Try again</button>
                    <RouterLink v-if="session.me" to="/play?join=1" class="btn btn-primary">Play online</RouterLink>
                    <a v-else :href="loginUrl('/play?join=1')" class="btn btn-primary">Play online</a>
                </div>
            </template>
        </GameScreen>
    </div>
</template>

<style scoped>
.page {
    height: 100%;
}

.rules {
    max-width: 560px;
    font-size: 1.2rem;
}

.rules li {
    margin-bottom: 0.6rem;
}

.red {
    color: #e03131;
}

</style>
