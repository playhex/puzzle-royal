import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { loginUrl } from '../api.js';
import { live, liveActions } from '../live.js';
import { useSessionStore } from '../stores/session.js';
import { useNow } from './useNow.js';

/**
 * Waiting room state from the viewer point of view, and the Play button.
 */
export const useLobby = () => {
    const session = useSessionStore();
    const router = useRouter();
    const now = useNow();

    const players = computed(() => live.lobby?.players ?? []);
    const me = computed(() => players.value.find(p => p.profile.publicId === session.me?.profile.publicId) ?? null);
    const gameRunning = computed(() => live.game !== null && live.lastGameEnd === null);

    /** Seconds before next game, null when no countdown */
    const remaining = computed(() => {
        const lobby = live.lobby;

        if (!lobby || lobby.deadline === null || lobby.waitingForGameEnd) {
            return null;
        }

        return Math.max(0, Math.ceil((lobby.deadline - now.value) / 1000));
    });

    const playLabel = computed(() => {
        if (me.value) return 'Back to room';
        if (gameRunning.value) return 'Watch and join next';
        if (players.value.length > 0) return `Join (${players.value.length} player${players.value.length === 1 ? '' : 's'})`;
        return 'Create room';
    });

    const join = async (): Promise<null | string> => {
        if (!session.me) {
            window.location.href = loginUrl('/play?join=1');
            return null;
        }

        return me.value ? null : liveActions.join();
    };

    const play = async () => {
        const error = await join();

        if (error === null && session.me) {
            await router.push('/play');
        }
    };

    return { players, me, gameRunning, remaining, playLabel, join, play };
};
