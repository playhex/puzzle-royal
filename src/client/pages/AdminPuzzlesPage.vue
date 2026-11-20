<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { createSortedRowModel, rowSortingFeature, sortFns, tableFeatures, useTable, type ColumnDef } from '@tanstack/vue-table';
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

const features = tableFeatures({ rowSortingFeature, sortedRowModel: createSortedRowModel(), sortFns });

// null values become undefined, so that they are always sorted last
const col = (id: string, header: string, value: (p: AdminPuzzle) => null | number): ColumnDef<typeof features, AdminPuzzle> => ({
    id,
    header,
    accessorFn: p => value(p) ?? undefined,
    sortUndefined: 'last',
});

const columns = [
    col('id', 'Puzzle', p => p.id),
    col('initialDifficulty', 'Initial diff.', p => p.initialDifficulty),
    col('eliminationRate', 'Elim. rate', p => p.eliminationRate),
    col('timesShown', 'Shown', p => p.timesShown),
    col('playersPresent', 'Present', p => p.playersPresent),
    col('playersEliminated', 'Eliminated', p => p.playersEliminated),
    col('roundsWithElimination', 'Rounds w/ elim.', p => p.roundsWithElimination),
    col('roundsAllFell', 'All fell', p => p.roundsAllFell),
    col('roundsNoneFell', 'None fell', p => p.roundsNoneFell),
    col('avgReachMs', 'Avg reach', p => p.avgReachMs),
    col('mostWrongCell', 'Most wrong cell', p => p.mostWrongCell?.count ?? null),
    col('avgEliminatedRating', 'Avg rating elim. / surv.', p => p.avgEliminatedRating),
];

const table = useTable({ features, columns, data: puzzles });

const sortIcon = (dir: false | 'asc' | 'desc') => dir === 'asc' ? '▲' : dir === 'desc' ? '▼' : '';
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
                    <tr v-for="group in table.getHeaderGroups()" :key="group.id">
                        <th
                            v-for="header in group.headers"
                            :key="header.id"
                            class="sortable"
                            @click="header.column.getToggleSortingHandler()?.($event)"
                        >
                            {{ header.column.columnDef.header }}
                            {{ sortIcon(header.column.getIsSorted()) }}
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="row in table.getRowModel().rows" :key="row.id">
                        <template v-for="p in [row.original]" :key="p.id">
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
                        </template>
                    </tr>
                </tbody>
            </table>
        </main>
    </div>
</template>

<style scoped>
.sortable {
    cursor: pointer;
    user-select: none;
}
</style>
