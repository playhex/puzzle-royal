<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, type AdminPuzzle } from '../api.js';
import AppHeader from '../components/AppHeader.vue';
import PuzzleThumbnail from '../components/PuzzleThumbnail.vue';

const puzzles = ref<AdminPuzzle[]>([]);
const error = ref<null | string>(null);

onMounted(async () => {
    try {
        puzzles.value = await api.adminPuzzles();
    } catch {
        error.value = 'Admin only (set ADMIN_PUBLIC_IDS in .env)';
    }
});

const pct = (v: number) => `${Math.round(v * 100)}%`;
const difficultyLabel = (d: null | number) => d === null ? '-' : ['', 'Easy', 'Medium', 'Hard'][d];
const round = (v: null | number) => v === null ? '-' : Math.round(v);
</script>

<template>
    <div>
        <AppHeader />
        <main class="container-fluid py-3">
            <h3>Puzzles by elimination rate</h3>
            <p v-if="error" class="text-danger">{{ error }}</p>
            <p v-else class="small text-body-secondary">Only puzzles played at least once online. Yellow: solution.</p>

            <table class="table table-sm align-middle">
                <thead>
                    <tr>
                        <th>Puzzle</th><th>Initial diff.</th><th>Elim. rate</th><th>Shown</th><th>Present</th><th>Eliminated</th>
                        <th>Rounds w/ elim.</th><th>All fell</th><th>None fell</th><th>Avg reach</th>
                        <th>Most wrong cell</th><th>Avg rating elim. / surv.</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="p in puzzles" :key="p.id">
                        <td>
                            <PuzzleThumbnail v-bind="p.puzzle" :width="150" />
                            <div class="small text-body-secondary">#{{ p.id }}</div>
                        </td>
                        <td>{{ difficultyLabel(p.initialDifficulty) }}</td>
                        <td class="fw-bold">{{ pct(p.eliminationRate) }}</td>
                        <td>{{ p.timesShown }}</td>
                        <td>{{ p.playersPresent }}</td>
                        <td>{{ p.playersEliminated }}</td>
                        <td>{{ p.roundsWithElimination }}</td>
                        <td>{{ p.roundsAllFell }}</td>
                        <td>{{ p.roundsNoneFell }}</td>
                        <td>{{ p.avgReachMs === null ? '-' : (p.avgReachMs / 1000).toFixed(1) + 's' }}</td>
                        <td>{{ p.mostWrongCell ? `${p.mostWrongCell.cell} (${p.mostWrongCell.count})` : '-' }}</td>
                        <td>{{ round(p.avgEliminatedRating) }} / {{ round(p.avgSurvivorRating) }}</td>
                    </tr>
                </tbody>
            </table>
        </main>
    </div>
</template>
