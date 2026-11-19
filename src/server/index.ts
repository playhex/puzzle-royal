import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/protocol.js';
import { apiRouter } from './api.js';
import { authRouter } from './auth/routes.js';
import { getSessionPlayer, purgeExpiredSessions } from './auth/sessions.js';
import { env } from './env.js';
import { GameManager, type SocketData } from './game/GameManager.js';
import { toProfile } from './players.js';

const app = express();

app.disable('x-powered-by');
app.use(authRouter);
app.use('/api', apiRouter);

if (env.isProduction) {
    const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist/client');

    app.use(express.static(clientDist));
    app.get(/^\/(?!api|socket\.io).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'internal_error' });
});

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer);

io.use(async (socket, next) => {
    try {
        const player = await getSessionPlayer(socket.handshake.headers.cookie);

        socket.data.profile = player ? toProfile(player) : null;
        next();
    } catch (e) {
        next(e instanceof Error ? e : new Error(String(e)));
    }
});

const manager = new GameManager(io);

manager.start();

setInterval(() => void purgeExpiredSessions().catch(console.error), 3600_000);

httpServer.listen(env.port, () => {
    console.log(`Hex Fall server on http://localhost:${env.port} (public url ${env.appUrl})`);
});
