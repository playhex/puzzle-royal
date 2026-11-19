<script setup lang="ts">
import type { PlayerProfile } from '../../shared/profile.js';
import PlayerAvatar from './PlayerAvatar.vue';

defineProps<{ players: { idx: number; profile: PlayerProfile; eliminated: boolean; me: boolean }[] }>();

/** Same hexagon as PlayerAvatar clip-path */
const HEXAGON = '50,0 93,25 93,75 50,100 7,75 7,25';
</script>

<template>
    <div class="icons-bar">
        <span
            v-for="p in players"
            :key="p.idx"
            class="icon"
            :class="{ eliminated: p.eliminated }"
            :title="p.profile.pseudo"
        >
            <PlayerAvatar :player="p.profile" :size="p.me ? 34 : 26" />
            <svg v-if="!p.eliminated" class="border" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <polygon :points="HEXAGON" vector-effect="non-scaling-stroke" />
            </svg>
        </span>
    </div>
</template>

<style scoped>
.icons-bar {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 6px;
    padding: 6px 8px calc(6px + env(safe-area-inset-bottom));
}

.icon {
    position: relative;
    display: inline-flex;
}

.icon .border {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
}

.icon .border polygon {
    fill: none;
    stroke: #37b24d;
    stroke-width: 2.5px;
    stroke-linejoin: round;
}

.icon.eliminated {
    filter: grayscale(1);
    opacity: 0.4;
}
</style>
