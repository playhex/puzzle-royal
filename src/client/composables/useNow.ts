import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';
import { liveActions } from '../live.js';

/**
 * Server time, refreshed every 200ms while component is mounted.
 */
export const useNow = (): Ref<number> => {
    const now = ref(Date.now());
    let interval: ReturnType<typeof setInterval>;
    const tick = () => now.value = liveActions.clock()?.now() ?? Date.now();

    onMounted(() => {
        tick();
        interval = setInterval(tick, 200);
    });

    onBeforeUnmount(() => clearInterval(interval));

    return now;
};
