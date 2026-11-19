import 'bootstrap/dist/css/bootstrap.min.css';
import './style.css';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router.js';

const applyColorScheme = () => {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    document.documentElement.setAttribute('data-bs-theme', dark ? 'dark' : 'light');
};

applyColorScheme();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyColorScheme);

createApp(App).use(createPinia()).use(router).mount('#app');
