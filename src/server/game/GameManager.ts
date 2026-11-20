import type { Server, Socket } from 'socket.io';
import { defaultGameConfig, defaultWaitingRoomConfig, type GameConfig, type WaitingRoomConfig } from '../../shared/config.js';
import type { ClientToServerEvents, LobbyState, ServerToClientEvents } from '../../shared/protocol.js';
import { randomSeed } from '../../shared/rng.js';
import { inputToTuple } from '../../shared/simulation/types.js';
import type { PlayerProfile } from '../../shared/profile.js';
import { serverNow } from '../clock.js';
import { WaitingRoom } from '../lobby/WaitingRoom.js';
import { GameServer, type GameRecord } from './GameServer.js';
import { markPuzzleShown, pickGameStartPuzzles, pickRandomPuzzles } from './puzzleProvider.js';
import { saveGame } from './GameRecorder.js';

export type SocketData = {
    /** null for anonymous viewers */
    profile: null | PlayerProfile;
};

type HexFallSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type HexFallServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const PUZZLES_PRELOAD = 64;
const LOBBY_CHECK_INTERVAL_MS = 250;

/** Delay before retrying when a game could not start */
const START_RETRY_MS = 5000;

/**
 * Only one game at a time, plus the waiting room for next game, always open.
 */
export class GameManager {
    private room: WaitingRoom;
    private game: null | GameServer = null;
    private lastGameEndAt = -Infinity;
    private starting = false;
    private startError: null | string = null;
    private lastStartFailAt = -Infinity;
    private lastLobbyJson = '';
    private interval: null | ReturnType<typeof setInterval> = null;

    constructor(
        private io: HexFallServer,
        private gameConfig: GameConfig = defaultGameConfig,
        private roomConfig: WaitingRoomConfig = defaultWaitingRoomConfig,
        private onGameSaved: (record: GameRecord) => Promise<void> = saveGame,
    ) {
        this.room = new WaitingRoom(roomConfig, serverNow);
    }

    start(): void {
        this.io.on('connection', socket => this.onConnection(socket));
        this.interval = setInterval(() => this.checkLobby(), LOBBY_CHECK_INTERVAL_MS);
    }

    stop(): void {
        if (this.interval) clearInterval(this.interval);
        this.game?.stop();
    }

    private viewerKey(socket: HexFallSocket): string {
        return socket.data.profile?.publicId ?? socket.id;
    }

    private viewerKeys(): Set<string> {
        return new Set([...this.io.of('/').sockets.values()].map(s => this.viewerKey(s)));
    }

    private gameSpectators(): number {
        const game = this.game;

        return [...this.viewerKeys()].filter(k => !game?.isPlayer(k)).length;
    }

    private lobbySpectators(): Pick<LobbyState, 'spectators' | 'anonymousSpectators'> {
        const spectators = new Map<string, PlayerProfile>();
        let anonymousSpectators = 0;

        for (const socket of this.io.of('/').sockets.values()) {
            const profile = socket.data.profile;

            if (!profile) {
                ++anonymousSpectators;
            } else if (!this.room.has(profile.publicId)) {
                spectators.set(profile.publicId, profile);
            }
        }

        return { spectators: [...spectators.values()], anonymousSpectators };
    }

    private getLobbyState(): LobbyState {
        return {
            players: this.room.getPlayers().map(({ profile, ready, connected }) => ({ profile, ready, connected })),
            deadline: this.room.getDeadline(),
            waitingForGameEnd: this.room.isCountdownOver() && this.game !== null,
            startError: this.startError,
            minPlayers: this.roomConfig.minPlayers,
            ...this.lobbySpectators(),
        };
    }

    private broadcastLobby(force = false): void {
        const lobby = this.getLobbyState();
        const json = JSON.stringify(lobby);

        if (force || json !== this.lastLobbyJson) {
            this.lastLobbyJson = json;
            this.io.emit('lobby', lobby);
        }
    }

    private broadcastSpectators(): void {
        if (this.game) {
            this.io.emit('spectators', this.gameSpectators());
        }

        this.broadcastLobby();
    }

    private onConnection(socket: HexFallSocket): void {
        const publicId = socket.data.profile?.publicId ?? null;

        if (publicId && this.room.has(publicId)) {
            this.room.setConnected(publicId, true);
        }

        this.broadcastSpectators();

        socket.on('getServerTime', answer => {
            if (typeof answer === 'function') answer(serverNow());
        });

        socket.on('getState', answer => {
            if (typeof answer !== 'function') return;

            answer({
                lobby: this.getLobbyState(),
                game: this.game?.getState(this.gameSpectators()) ?? null,
            });
        });

        socket.on('join', answer => {
            const profile = socket.data.profile;

            if (!profile) {
                if (typeof answer === 'function') answer('You must be logged in to play');
                return;
            }

            this.room.join(profile);
            this.broadcastLobby();
            if (typeof answer === 'function') answer(null);
        });

        socket.on('leave', () => {
            if (publicId) {
                this.room.leave(publicId);
                this.broadcastLobby();
            }
        });

        socket.on('ready', ready => {
            if (publicId) {
                this.room.setReady(publicId, ready === true);
                this.broadcastLobby();
            }
        });

        socket.on('waitMore', () => {
            if (publicId) {
                this.room.waitMore(publicId);
                this.broadcastLobby();
            }
        });

        socket.on('move', target => {
            if (publicId && this.game) {
                this.game.move(publicId, target);
            }
        });

        socket.on('disconnect', () => {
            if (publicId && ![...this.io.of('/').sockets.values()].some(s => s.data.profile?.publicId === publicId)) {
                this.room.setConnected(publicId, false);
            }

            this.broadcastSpectators();
        });
    }

    private canStartNow(): boolean {
        return this.game === null && !this.starting && serverNow() >= this.lastGameEndAt + this.roomConfig.delayAfterGameMs;
    }

    private checkLobby(): void {
        this.room.removeDisconnected();

        if (
            this.room.isCountdownOver()
            && this.room.count >= this.roomConfig.minPlayers
            && this.canStartNow()
            && serverNow() >= this.lastStartFailAt + START_RETRY_MS
        ) {
            void this.startGame().catch(e => {
                console.error('Could not start game', e);
                this.starting = false;
                this.startError = e instanceof Error ? e.message : String(e);
                this.lastStartFailAt = serverNow();
                this.broadcastLobby();
            });
        }

        this.broadcastLobby();
    }

    private async startGame(): Promise<void> {
        this.starting = true;

        const puzzles = await pickGameStartPuzzles(PUZZLES_PRELOAD);

        if (puzzles.length === 0) {
            throw new Error('No puzzle in database, run pnpm puzzles:import');
        }

        // Players may have left while puzzles were loading
        if (this.room.count < this.roomConfig.minPlayers) {
            this.starting = false;
            return;
        }

        const players = this.room.takePlayers().map(p => p.profile);
        const io = this.io;

        const game = new GameServer(
            players,
            puzzles,
            exclude => pickRandomPuzzles(PUZZLES_PRELOAD, exclude),
            this.gameConfig,
            randomSeed(),
            {
                onRoundStart: (round, puzzleId) => {
                    io.emit('roundStart', round);
                    void markPuzzleShown(puzzleId).catch(e => console.error('Could not mark puzzle as shown', puzzleId, e));
                },
                onInput: input => io.emit('input', inputToTuple(input)),
                onDrop: event => io.emit('drop', event),
                onEnd: (event, record) => {
                    io.emit('gameEnd', event);
                    this.game = null;
                    this.lastGameEndAt = serverNow();
                    this.broadcastLobby(true);

                    this.onGameSaved(record).catch(e => console.error('Could not save game', record.gameId, e));
                },
            },
            serverNow,
        );

        this.game = game;
        this.starting = false;
        this.startError = null;
        game.start();

        io.emit('game', game.getState(this.gameSpectators()));
        this.broadcastLobby(true);
    }
}
