import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ mode }) => {
    // Load all .env variables, not only VITE_ prefixed ones
    const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
    const serverUrl = `http://localhost:${env.PORT || 3700}`;

    return {
        plugins: [vue()],
        build: {
            outDir: 'dist/client',
            emptyOutDir: true,
        },
        server: {
            port: Number(env.CLIENT_PORT || 5173),
            strictPort: true,
            proxy: {
                '/api': serverUrl,
                '/login': serverUrl,
                '/callback': serverUrl,
                '/logout': serverUrl,
                '/socket.io': { target: serverUrl, ws: true },
            },
        },
    };
});
