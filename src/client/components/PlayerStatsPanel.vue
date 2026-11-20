<script setup lang="ts">
import { ref, watch } from 'vue';
import { api, type PlayerStats } from '../api.js';
import { formatRating, isRatingConfident } from '../../shared/rating.js';
import PlayerAvatar from './PlayerAvatar.vue';

const props = withDefaults(defineProps<{ publicId: string; showPlayer?: boolean }>(), { showPlayer: false });
const stats = ref<null | PlayerStats>(null);

watch(() => props.publicId, async id => {
    stats.value = await api.playerStats(id).catch(() => null);
}, { immediate: true });

const formatDate = (d: string) => new Date(d).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
</script>

<template>
    <div v-if="stats">
        <div v-if="showPlayer && stats.player" class="d-flex flex-column align-items-center text-center mb-4">
            <PlayerAvatar :player="{ ...stats.player, avatarUrl: stats.avatarOriginalUrl }" :size="160" />
            <h2 class="mt-3 mb-1">{{ stats.player.pseudo }}</h2>
            <div class="text-body-secondary">
                <span v-if="stats.player.countryFlag" class="me-2">{{ stats.player.countryFlag }}</span>
                <span :class="{ 'text-body-tertiary': !isRatingConfident(stats.player.ratingDeviation) }">
                    {{ formatRating(stats.player.rating, stats.player.ratingDeviation) }}
                </span>
            </div>
        </div>
        <div class="row g-2 text-center mb-3">
            <div class="col-3"><div class="border rounded p-2"><div class="fs-4 fw-bold">{{ stats.gamesPlayed }}</div><small>games</small></div></div>
            <div class="col-3"><div class="border rounded p-2"><div class="fs-4 fw-bold">{{ stats.wins }}</div><small>wins</small></div></div>
            <div class="col-3"><div class="border rounded p-2"><div class="fs-4 fw-bold">{{ stats.puzzlesSolved }}</div><small>puzzles solved</small></div></div>
            <div class="col-3"><div class="border rounded p-2"><div class="fs-4 fw-bold">{{ stats.opponentsSurvivedTotal }}</div><small>opponents outlasted</small></div></div>
        </div>

        <template v-if="stats.opponentsSurvived.length">
            <h5>Rivals outlasted</h5>
            <ul class="list-inline mb-4">
                <li v-for="o in stats.opponentsSurvived" :key="o.publicId" class="list-inline-item me-3">
                    <RouterLink :to="`/profile/${o.publicId}`">{{ o.pseudo }}</RouterLink>
                    <span class="text-body-secondary"> ×{{ o.count }}</span>
                </li>
            </ul>
        </template>

        <h5>Last games</h5>
        <table v-if="stats.games.length" class="table table-sm align-middle">
            <thead><tr><th>Date</th><th>Place</th><th>Winner</th><th>Rounds</th><th /></tr></thead>
            <tbody>
                <tr v-for="g in stats.games" :key="g.gameId">
                    <td class="small">{{ formatDate(g.endedAt) }}</td>
                    <td>{{ g.place }} / {{ g.playersCount }}</td>
                    <td>
                        <span v-for="(w, i) in g.winners" :key="w.publicId">
                            <span v-if="i > 0">, </span>
                            <RouterLink :to="`/profile/${w.publicId}`">{{ w.pseudo }}</RouterLink>
                            <small v-if="w.countryFlag" class="ms-1">{{ w.countryFlag }}</small>
                        </span>
                        <span v-if="g.winners.length === 0" class="text-body-secondary">No winner</span>
                    </td>
                    <td>{{ g.roundsCount }}</td>
                    <td><RouterLink :to="`/replay/${g.gameId}`" class="btn btn-sm btn-outline-secondary">Replay</RouterLink></td>
                </tr>
            </tbody>
        </table>
        <p v-else class="text-body-secondary small">No game played yet.</p>
    </div>
</template>
