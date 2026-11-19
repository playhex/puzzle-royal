<script setup lang="ts">
import type { PlayerProfile } from '../../shared/profile.js';
import { formatRating, isRatingConfident } from '../../shared/rating.js';
import PlayerAvatar from './PlayerAvatar.vue';

withDefaults(defineProps<{ player: PlayerProfile; avatar?: boolean; avatarSize?: number; rating?: boolean; link?: boolean }>(), {
    avatar: true,
    avatarSize: 28,
    rating: true,
    link: false,
});
</script>

<template>
    <span class="player-name d-inline-flex align-items-center gap-2 text-truncate">
        <PlayerAvatar v-if="avatar" :player="player" :size="avatarSize" />
        <RouterLink v-if="link" :to="`/profile/${player.publicId}`" class="text-truncate text-reset">{{ player.pseudo }}</RouterLink>
        <span v-else class="text-truncate">{{ player.pseudo }}</span>
        <small v-if="player.countryFlag">{{ player.countryFlag }}</small>
        <small
            v-if="rating"
            :class="isRatingConfident(player.ratingDeviation) ? 'text-body-secondary' : 'text-body-tertiary'"
        >{{ formatRating(player.rating, player.ratingDeviation) }}</small>
    </span>
</template>
