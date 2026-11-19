import { createRouter, createWebHistory } from 'vue-router';

export const router = createRouter({
    history: createWebHistory(),
    routes: [
        { path: '/', name: 'home', component: () => import('./pages/HomePage.vue') },
        { path: '/play', name: 'play', component: () => import('./pages/PlayPage.vue') },
        { path: '/tutorial', name: 'tutorial', component: () => import('./pages/TutorialPage.vue') },
        { path: '/replays', name: 'replays', component: () => import('./pages/ReplaysPage.vue') },
        { path: '/replay/:gameId', name: 'replay', component: () => import('./pages/ReplayPage.vue') },
        { path: '/profile/:publicId', name: 'profile', component: () => import('./pages/ProfilePage.vue') },
        { path: '/admin/puzzles', name: 'admin-puzzles', component: () => import('./pages/AdminPuzzlesPage.vue') },
    ],
});
