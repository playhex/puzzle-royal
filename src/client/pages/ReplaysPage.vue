<script setup lang="ts">
import AppHeader from '../components/AppHeader.vue';
import RecentGamesTable from '../components/RecentGamesTable.vue';
</script>

<template>
    <div>
        <AppHeader />
        <main class="container py-4" style="max-width: 800px">
            <h3>Featured replays</h3>
            <RecentGamesTable featured class="mb-5" />

            <h3>Replays</h3>
            <RecentGamesTable />
        </main>
    </div>
</template>
