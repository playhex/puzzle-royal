<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, type AdminPuzzleData, type Difficulty } from '../api.js';
import AppHeader from '../components/AppHeader.vue';
import PuzzleThumbnail from '../components/PuzzleThumbnail.vue';

const route = useRoute();
const router = useRouter();

const puzzle = ref<null | (AdminPuzzleData & { initialDifficulty: null | Difficulty })>(null);

/** Ids of puzzles seen before current one, to go back */
const history = ref<number[]>([]);
const remaining = ref(0);
const loading = ref(true);
const error = ref<null | string>(null);

/** Cell clicked, null until answered */
const answer = ref<null | string>(null);
const saving = ref(false);

const difficulties: { value: Difficulty; label: string }[] = [
    { value: 1, label: '1 - Easy' },
    { value: 2, label: '2 - Medium' },
    { value: 3, label: '3 - Hard' },
];

const load = async (after = 0) => {
    loading.value = true;
    answer.value = null;

    try {
        const result = await api.adminNextUnratedPuzzle(after);

        puzzle.value = result.puzzle;
        remaining.value = result.remaining;
        error.value = null;
    } catch {
        error.value = 'Admin only (add your PlayHex publicId to ADMIN_PUBLIC_IDS in .env)';
    } finally {
        loading.value = false;
    }
};

const loadById = async (id: number) => {
    loading.value = true;
    answer.value = null;

    try {
        const result = await api.adminPuzzle(id);

        puzzle.value = result.puzzle;
        remaining.value = result.remaining;
        error.value = null;
    } catch (e) {
        error.value = `Could not load puzzle #${id}: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
        loading.value = false;
    }
};

const back = async () => {
    const id = history.value.pop();

    if (id !== undefined) {
        await loadById(id);
    }
};

/** Keep current puzzle id in url, to share or reload it */
watch(() => puzzle.value?.id, id => {
    const params = id === undefined ? {} : { id: String(id) };

    if ((route.params.id ?? '') !== (params.id ?? '')) {
        void router.replace({ name: 'admin-puzzles-rate', params });
    }
});

const onCellClick = (move: string) => {
    if (answer.value === null) {
        answer.value = move;
    }
};

const rate = async (difficulty: Difficulty) => {
    if (!puzzle.value) return;

    saving.value = true;

    try {
        await api.adminSetInitialDifficulty(puzzle.value.id, difficulty);
        await next();
    } catch (e) {
        error.value = `Could not save difficulty: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
        saving.value = false;
    }
};

const next = async () => {
    if (!puzzle.value) return;

    history.value.push(puzzle.value.id);
    await load(puzzle.value.id);
};

onMounted(() => {
    const id = Number(route.params.id);

    void (id > 0 ? loadById(id) : load());
});
</script>

<template>
    <div>
        <AppHeader />
        <main class="container py-4" style="max-width: 600px">
            <div class="d-flex justify-content-between align-items-baseline">
                <h3>Rate new puzzles</h3>
                <RouterLink to="/admin" class="small">Admin</RouterLink>
            </div>

            <p v-if="error" class="text-danger">{{ error }}</p>
            <p v-else-if="loading" class="text-body-secondary">Loading...</p>
            <template v-else-if="puzzle">
                <p class="small text-body-secondary">
                    Puzzle #{{ puzzle.id }} · {{ remaining }} not yet rated · Red to play and win
                </p>

                <div class="text-center">
                    <PuzzleThumbnail
                        v-bind="puzzle"
                        :solution="answer === null ? null : puzzle.solution"
                        :wrong-cell="answer !== null && answer !== puzzle.solution ? answer : null"
                        :clickable="answer === null"
                        :width="500"
                        style="max-width: 100%; height: auto"
                        @cell-click="onCellClick"
                    />
                </div>

                <p v-if="answer === null" class="text-center">Click the winning cell</p>
                <p v-else-if="answer === puzzle.solution" class="text-center text-success fw-bold">Correct ({{ answer }})</p>
                <p v-else class="text-center text-danger fw-bold">Wrong: {{ answer }}, solution is {{ puzzle.solution }}</p>

                <div class="d-flex justify-content-center gap-2 mb-3">
                    <button
                        v-for="d in difficulties" :key="d.value"
                        :class="['btn', puzzle.initialDifficulty === d.value ? 'btn-primary' : 'btn-outline-primary']"
                        :disabled="saving"
                        @click="rate(d.value)"
                    >{{ d.label }}</button>
                </div>

                <div class="d-flex justify-content-center gap-2">
                    <button class="btn btn-outline-secondary" :disabled="saving || history.length === 0" @click="back">Back</button>
                    <button class="btn btn-secondary" :disabled="saving" @click="next">Skip</button>
                </div>
            </template>
            <template v-else>
                <p>No more puzzles to rate{{ remaining > 0 ? ` after this one (${remaining} skipped, reload to see them again)` : '' }}.</p>
                <button v-if="history.length > 0" class="btn btn-outline-secondary" @click="back">Back</button>
            </template>
        </main>
    </div>
</template>
