<script setup lang="ts">
import { onMounted } from 'vue';
import { connectLive } from './live.js';
import { useSessionStore } from './stores/session.js';

const session = useSessionStore();

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
