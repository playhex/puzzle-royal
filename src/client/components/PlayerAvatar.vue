<script setup lang="ts">
import type { PlayerProfile } from '../../shared/profile.js';

withDefaults(defineProps<{ player: PlayerProfile; size?: number }>(), { size: 28 });
</script>

<template>
    <span class="avatar" :style="{ width: size + 'px', height: size + 'px', fontSize: (size * 0.5) + 'px' }">
        <img v-if="player.avatarUrl" :src="player.avatarUrl" alt="" referrerpolicy="no-referrer">
        <span v-else>{{ player.pseudo.slice(0, 1).toUpperCase() }}</span>
    </span>
</template>

<style scoped>
.avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    clip-path: polygon(50% 0, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%);
    background: var(--bs-secondary-bg);
    color: var(--bs-secondary-color);
    font-weight: bold;
    text-decoration: none;
    overflow: hidden;
}

.avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}
</style>
