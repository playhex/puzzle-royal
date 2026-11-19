<script setup lang="ts">
import { liveActions } from '../live.js';
import { useLobby } from '../composables/useLobby.js';

const { players, me, remaining, join } = useLobby();
</script>

<template>
    <div class="p-2">
        <div class="d-flex justify-content-between align-items-center mb-1">
            <strong>Next game</strong>
            <span v-if="remaining !== null" class="badge text-bg-primary">{{ remaining }}s</span>
        </div>

        <p v-if="players.length > 0" class="small text-body-secondary mb-2">
            {{ players.length }} player{{ players.length === 1 ? '' : 's' }} playing next
        </p>

        <div class="d-flex gap-2">
            <button v-if="!me" class="btn btn-sm btn-primary" @click="join">Join next</button>
            <template v-else>
                <button class="btn btn-sm" :class="me.ready ? 'btn-success' : 'btn-outline-success'" @click="liveActions.ready(!me.ready)">{{ me.ready ? 'Ready ✓' : 'Ready' }}</button>
                <button class="btn btn-sm btn-outline-secondary" @click="liveActions.leave()">Leave</button>
            </template>
        </div>
    </div>
</template>
