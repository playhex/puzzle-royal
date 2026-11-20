<script setup lang="ts">
import { computed } from 'vue';
import { parseMove } from '@playhex/move-notation';

const props = withDefaults(defineProps<{
    redStones: string[];
    blueStones: string[];
    lastMove?: null | string;
    solution?: null | string;
    /** Wrong cell clicked, shown in red outline */
    wrongCell?: null | string;
    boardsize?: number;
    width?: number;
    clickable?: boolean;
}>(), { lastMove: null, solution: null, wrongCell: null, boardsize: 7, width: 180, clickable: false });

const emit = defineEmits<{ cellClick: [move: string] }>();

const R = 10;
const W = R * Math.sqrt(3);

const center = (row: number, col: number) => ({ x: (col + row / 2) * W + W, y: row * 1.5 * R + R * 1.5 });

const hexPoints = (cx: number, cy: number, r = R) => Array.from({ length: 6 }, (_, i) => {
    const a = Math.PI / 6 + i * Math.PI / 3;

    return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
}).join(' ');

const cells = computed(() => {
    const red = new Set(props.redStones), blue = new Set(props.blueStones);
    const result = [];

    for (let row = 0; row < props.boardsize; ++row) {
        for (let col = 0; col < props.boardsize; ++col) {
            const move = String.fromCharCode(97 + col) + (row + 1);
            const { x, y } = center(row, col);

            result.push({ move, x, y, color: red.has(move) ? 'red' : blue.has(move) ? 'blue' : null });
        }
    }

    return result;
});

const mark = (move: null | string) => {
    if (!move) return null;
    const { row, col } = parseMove(move as never);

    return center(row, col);
};

const viewWidth = computed(() => (props.boardsize + (props.boardsize - 1) / 2) * W + W);
const viewHeight = computed(() => (props.boardsize - 1) * 1.5 * R + 3 * R);
</script>

<template>
    <svg :width="width" :viewBox="`0 0 ${viewWidth} ${viewHeight}`" class="puzzle-thumb">
        <polygon
            v-for="c in cells" :key="c.move" :points="hexPoints(c.x, c.y)"
            :class="['cell', { clickable: clickable && !c.color }]"
            @click="clickable && !c.color && emit('cellClick', c.move)"
        />
        <g pointer-events="none">
            <polygon v-for="c in cells.filter(c => c.color)" :key="'s' + c.move" :points="hexPoints(c.x, c.y, R * 0.8)" :fill="c.color === 'red' ? '#e03131' : '#1c7ed6'" />
            <circle v-if="mark(lastMove)" :cx="mark(lastMove)!.x" :cy="mark(lastMove)!.y" r="2.5" fill="white" />
            <polygon v-if="mark(wrongCell)" :points="hexPoints(mark(wrongCell)!.x, mark(wrongCell)!.y, R * 0.8)" fill="none" stroke="#e03131" stroke-width="2" />
            <polygon v-if="mark(solution)" :points="hexPoints(mark(solution)!.x, mark(solution)!.y, R * 0.8)" fill="none" stroke="#ffd43b" stroke-width="2" />
        </g>
    </svg>
</template>

<style scoped>
.cell {
    fill: var(--bs-secondary-bg);
    stroke: var(--bs-border-color);
    stroke-width: 1;
}

.cell.clickable {
    cursor: pointer;
}

.cell.clickable:hover {
    fill: var(--bs-tertiary-color);
}
</style>
