<script setup lang="ts">
import { onMounted, watchEffect } from 'vue';
import { connectLive, live } from './live.js';
import { useLobby } from './composables/useLobby.js';
import { useSessionStore } from './stores/session.js';

const session = useSessionStore();
const { players, me, remaining } = useLobby();

// Show countdown or missing players in tab title while waiting in room
const baseTitle = document.title;

watchEffect(() => {
    let prefix = '';

    if (me.value && live.lobby && !live.lobby.waitingForGameEnd) {
        if (remaining.value !== null) {
            prefix = `${remaining.value}s... `;
        } else {
            const missing = Math.max(0, live.lobby.minPlayers - players.value.length);

            if (missing > 0) prefix = `waiting ${missing} more... `;
        }
    }

    document.title = prefix + baseTitle;
});

onMounted(async () => {
    await session.load();
    connectLive(session.me?.profile.publicId ?? null);
});

// Coming back from PlayHex (e.g. after changing board settings there): reload profile and settings
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        void session.refresh();
    }
});
</script>

<template>
    <RouterView v-if="session.loaded" />
</template>
