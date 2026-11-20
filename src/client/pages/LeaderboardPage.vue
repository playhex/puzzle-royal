<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, type Leaderboard } from '../api.js';
import AppHeader from '../components/AppHeader.vue';
import PlayerName from '../components/PlayerName.vue';

const leaderboard = ref<null | Leaderboard>(null);

onMounted(async () => {
    leaderboard.value = await api.leaderboard().catch(() => []);
});

const medals = ['🥇', '🥈', '🥉'];
const winRate = (wins: number, games: number) => games > 0 ? `${Math.round(wins / games * 100)}%` : '-';
</script>

<template>
    <div>
        <AppHeader />
        <main class="container py-4" style="max-width: 800px">
            <h3>Top players</h3>
            <p class="small text-body-secondary">Last 365 days</p>

            <table v-if="leaderboard" class="table table-sm align-middle">
                <thead>
                    <tr><th>#</th><th>Player</th><th class="text-end">Wins</th><th class="text-end">Games</th><th class="text-end">Win rate</th><th class="text-end">Outlasted</th></tr>
                </thead>
                <tbody>
                    <tr v-for="(p, i) in leaderboard" :key="p.player.publicId">
                        <td class="fw-semibold">{{ medals[i] ?? i + 1 }}</td>
                        <td><PlayerName :player="p.player" link /></td>
                        <td class="text-end fw-bold">{{ p.wins }}</td>
                        <td class="text-end">{{ p.gamesPlayed }}</td>
                        <td class="text-end">{{ winRate(p.wins, p.gamesPlayed) }}</td>
                        <td class="text-end">{{ p.opponentsSurvived }}</td>
                    </tr>
                    <tr v-if="leaderboard.length === 0"><td colspan="6" class="text-body-secondary small">No game played yet</td></tr>
                </tbody>
            </table>
        </main>
    </div>
</template>
