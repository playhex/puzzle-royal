<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, type RecentGame } from '../api.js';

const games = ref<null | RecentGame[]>(null);

onMounted(async () => {
    games.value = await api.recentGames().catch(() => []);
});

const formatDate = (d: string) => new Date(d).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
</script>

<template>
    <table v-if="games" class="table table-sm align-middle">
        <thead>
            <tr><th>Date</th><th>Players</th><th>Winner</th><th>Rounds</th><th /></tr>
        </thead>
        <tbody>
            <tr v-for="g in games" :key="g.gameId">
                <td class="small">{{ formatDate(g.endedAt) }}</td>
                <td>{{ g.playersCount }}</td>
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
            <tr v-if="games.length === 0"><td colspan="5" class="text-body-secondary small">No game yet</td></tr>
        </tbody>
    </table>
</template>
