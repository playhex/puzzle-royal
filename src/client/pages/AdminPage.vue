<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../api.js';
import AppHeader from '../components/AppHeader.vue';

const status = ref<'loading' | 'ok' | 'forbidden'>('loading');

onMounted(async () => {
    try {
        await api.adminCheck();
        status.value = 'ok';
    } catch {
        status.value = 'forbidden';
    }
});
</script>

<template>
    <div>
        <AppHeader />
        <main class="container py-4" style="max-width: 800px">
            <h3>Admin</h3>
            <p v-if="status === 'forbidden'" class="text-danger">Admin only (add your PlayHex publicId to ADMIN_PUBLIC_IDS in .env)</p>
            <ul v-else-if="status === 'ok'" class="list-unstyled d-flex flex-column gap-2">
                <li><RouterLink to="/admin/puzzles">Puzzles stats</RouterLink></li>
                <li><RouterLink to="/admin/puzzles/rate">Rate new puzzles</RouterLink></li>
            </ul>
        </main>
    </div>
</template>
