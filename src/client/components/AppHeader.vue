<script setup lang="ts">
import { useRoute } from 'vue-router';
import { formatRating } from '../../shared/rating.js';
import { loginUrl } from '../api.js';
import { useLobby } from '../composables/useLobby.js';
import { useSessionStore } from '../stores/session.js';
import PlayerAvatar from './PlayerAvatar.vue';

const session = useSessionStore();
const route = useRoute();
const { me: meInLobby, players, remaining } = useLobby();
</script>

<template>
    <nav class="navbar py-2">
        <div class="container">
            <RouterLink to="/" class="navbar-brand hexfall-title m-0">Hex <span class="fall">Fall</span></RouterLink>

            <div class="d-flex align-items-center gap-2">
                <RouterLink
                    v-if="meInLobby && route.name !== 'play'"
                    to="/play"
                    class="btn btn-sm btn-primary d-flex align-items-center gap-2"
                    title="Back to waiting room"
                >
                    <span class="spinner-grow spinner-grow-sm" aria-hidden="true" />
                    <span>Waiting</span>
                    <span v-if="remaining !== null" class="fw-bold">{{ remaining }}s</span>
                    <span class="badge text-bg-light">{{ players.length }}</span>
                </RouterLink>

                <RouterLink
                    v-if="session.me"
                    :to="`/profile/${session.me.profile.publicId}`"
                    class="d-flex align-items-center gap-2 text-reset text-decoration-none"
                >
                    <span class="text-end lh-sm">
                        <span class="d-block fw-semibold">{{ session.me.profile.pseudo }}</span>
                        <small class="text-body-secondary">
                            <span v-if="session.me.profile.countryFlag" class="me-1">{{ session.me.profile.countryFlag }}</span>
                            {{ formatRating(session.me.profile.rating, session.me.profile.ratingDeviation) }}
                        </small>
                    </span>
                    <PlayerAvatar :player="session.me.profile" :size="36" />
                </RouterLink>
                <a v-else :href="loginUrl(route.fullPath)" class="btn btn-sm btn-outline-primary">Log in</a>
            </div>
        </div>
    </nav>
</template>
