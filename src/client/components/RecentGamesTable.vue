<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, type GamesSort, type RecentGame } from '../api.js';

/**
 * Featured: best games, fixed list.
 * Otherwise: all games, sortable by column, paginated server side with "Load more".
 */
const props = defineProps<{ featured?: boolean }>();
const PAGE_SIZE = 20;

const games = ref<null | RecentGame[]>(null);
const hasMore = ref(false);
const loading = ref(false);
const sort = ref<GamesSort>('endedAt');
const order = ref<'asc' | 'desc'>('desc');

/**
 * Loads next page, or first page when reset.
 */
const load = async (reset: boolean) => {
    if (props.featured) {
        games.value = await api.featuredGames().catch(() => []);
        return;
    }

    loading.value = true;

    try {
        const offset = reset ? 0 : games.value?.length ?? 0;
        const page = await api.recentGames(sort.value, order.value, offset, PAGE_SIZE);

        games.value = reset ? page.games : [...(games.value ?? []), ...page.games];
        hasMore.value = page.hasMore;
    } catch {
        games.value ??= [];
        hasMore.value = false;
    } finally {
        loading.value = false;
    }
};

/**
 * Click on same column toggles order, on another column sorts desc.
 */
const sortBy = (column: GamesSort) => {
    if (props.featured || loading.value) return;

    if (sort.value === column) {
        order.value = order.value === 'desc' ? 'asc' : 'desc';
    } else {
        sort.value = column;
        order.value = 'desc';
    }

    void load(true);
};

const sortIcon = (column: GamesSort) => sort.value !== column ? '' : order.value === 'desc' ? ' ▼' : ' ▲';

onMounted(() => load(true));

const formatDate = (d: string) => new Date(d).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
</script>

<template>
    <div v-if="games">
        <table class="table table-sm align-middle" :class="{ sortable: !featured }">
            <thead>
                <tr>
                    <th @click="sortBy('endedAt')">Date<template v-if="!featured">{{ sortIcon('endedAt') }}</template></th>
                    <th @click="sortBy('playersCount')">Players<template v-if="!featured">{{ sortIcon('playersCount') }}</template></th>
                    <th>Winner</th>
                    <th @click="sortBy('roundsCount')">Rounds<template v-if="!featured">{{ sortIcon('roundsCount') }}</template></th>
                    <th />
                </tr>
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

        <div v-if="hasMore" class="text-center">
            <button class="btn btn-outline-secondary" :disabled="loading" @click="load(false)">Load more</button>
        </div>
    </div>
</template>

<style scoped>
.sortable th:not(:nth-child(3), :last-child) {
    cursor: pointer;
    user-select: none;
}
</style>
