<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { BoardSettings } from '../../shared/boardSettings.js';
import { FallBoardView } from '../board/FallBoardView.js';
import type { GameDisplay } from '../game/GameDisplay.js';

const props = defineProps<{ display: GameDisplay; settings: BoardSettings }>();
const container = ref<HTMLElement>();
let view: null | FallBoardView = null;

onMounted(async () => {
    view = new FallBoardView(props.display.config.boardsize);
    view.applySettings(props.settings);
    view.setDisplay(props.display);
    await view.mount(container.value!);
});

watch(() => props.display, display => view?.setDisplay(display));
watch(() => props.settings, settings => view?.applySettings(settings), { deep: true });

onBeforeUnmount(() => {
    view?.destroy();
    view = null;
});
</script>

<template>
    <div ref="container" class="board-canvas" />
</template>

<style scoped>
.board-canvas {
    position: absolute;
    inset: 0;
    overflow: hidden;
}
</style>
