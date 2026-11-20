<script setup lang="ts">
import darkArt from '../../../assets/dark.svg';
</script>

<template>
    <div class="background-art" :style="{ backgroundImage: `url(${darkArt})` }" aria-hidden="true"></div>
</template>

<style scoped>
.background-art {
    position: fixed;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    background-size: contain;
    background-position: center;
    background-repeat: no-repeat;
    opacity: 0.15;
}
</style>
