<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import AppHeader from '../components/AppHeader.vue';
import PlayerStatsPanel from '../components/PlayerStatsPanel.vue';
import { useSessionStore } from '../stores/session.js';

const route = useRoute();
const session = useSessionStore();
const publicId = computed(() => String(route.params.publicId));
const isMe = computed(() => session.me?.profile.publicId === publicId.value);
</script>

<template>
    <div>
        <AppHeader />
        <main class="container py-4" style="max-width: 800px">
            <div v-if="isMe" class="d-flex justify-content-end gap-2 mb-2">
                <RouterLink v-if="session.me?.isAdmin" to="/admin" class="btn btn-sm btn-outline-secondary">Admin</RouterLink>
                <button class="btn btn-sm btn-outline-secondary" @click="session.logout()">Log out</button>
            </div>

            <PlayerStatsPanel :public-id="publicId" show-player />
        </main>
    </div>
</template>
