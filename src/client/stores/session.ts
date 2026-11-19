import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { defaultBoardSettings, type BoardSettings } from '../../shared/boardSettings.js';
import { api, type Me } from '../api.js';

export const useSessionStore = defineStore('session', () => {
    const me = ref<null | Me>(null);
    const loaded = ref(false);

    const load = async () => {
        try {
            me.value = await api.me();
        } catch (e) {
            console.error('Could not load session', e);
            me.value = null;
        } finally {
            loaded.value = true;
        }
    };

    /**
     * Reloads profile and board settings (refreshed from PlayHex by server), keeping current ones on error.
     */
    const refresh = async () => {
        if (!me.value) {
            return;
        }

        try {
            me.value = await api.me();
        } catch (e) {
            console.warn('Could not refresh session', e);
        }
    };

    const logout = async () => {
        await api.logout();
        window.location.href = '/';
    };

    /** PlayHex board preferences, PlayHex defaults when not logged in */
    const boardSettings = computed<BoardSettings>(() => me.value?.settings ?? defaultBoardSettings);

    return { me, loaded, load, refresh, logout, boardSettings };
});
