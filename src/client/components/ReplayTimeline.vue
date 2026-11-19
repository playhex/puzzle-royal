<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import type { ReplayModel } from '../game/ReplayModel.js';

/**
 * Play/pause and time slider. Refreshes itself every 100ms, in its own component
 * so that the replay page (and its selects) is not rendered again at each refresh.
 */
const props = defineProps<{ model: ReplayModel }>();
const emit = defineEmits<{ togglePlay: [] }>();

const playing = ref(true);
const position = ref(0);
let interval: ReturnType<typeof setInterval>;

onMounted(() => {
    interval = setInterval(() => {
        position.value = props.model.time();
        playing.value = props.model.playing;
    }, 100);
});

onBeforeUnmount(() => clearInterval(interval));

const seek = (e: Event) => props.model.seek(Number((e.target as HTMLInputElement).value));
</script>

<template>
    <button class="btn btn-sm btn-primary" style="width: 4.5rem" @click="emit('togglePlay')">{{ playing ? 'Pause' : 'Play' }}</button>
    <input type="range" class="form-range" style="flex: 1 1 200px; width: auto" min="-500" :max="model.duration" step="10" :value="position" @input="seek">
</template>
