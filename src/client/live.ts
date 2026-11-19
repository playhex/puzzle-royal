import { markRaw, shallowReactive } from 'vue';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, GameEndEvent, LiveGameState, LobbyState, ServerToClientEvents } from '../shared/protocol.js';
import { LiveGameModel } from './game/LiveGameModel.js';
import { ServerClock } from './game/ServerClock.js';

type HexFallSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Connection to Hex Fall server: waiting room and current game.
 */
export const live = shallowReactive({
    connected: false,
    lobby: null as null | LobbyState,
    game: null as null | LiveGameModel,

    /** Last finished game event, to show end screen */
    lastGameEnd: null as null | GameEndEvent,

    /** Increments on each game event, to refresh views watching the (non reactive) game model */
    version: 0,
});

let socket: null | HexFallSocket = null;
let clock: null | ServerClock = null;
let myPublicId: null | string = null;

const setGame = (state: null | LiveGameState) => {
    if (state === null) {
        live.game = null;
        return;
    }

    live.game = markRaw(new LiveGameModel(state, myPublicId, clock!, target => socket?.emit('move', target)));

    // A new game started: forget previous end screen
    if (live.lastGameEnd?.gameId !== state.gameId) {
        live.lastGameEnd = null;
    }

    live.version++;
};

/** A getState request is in progress: do not send another one on each desynced event */
let resyncing = false;

const resync = () => {
    if (!socket || resyncing) {
        return;
    }

    resyncing = true;

    socket.emit('getState', ({ lobby, game }) => {
        resyncing = false;
        live.lobby = lobby;

        // Keep finished game displayed (end screen) until another one starts
        if (game !== null || live.lastGameEnd === null) {
            setGame(game);
        }
    });
};

export const connectLive = (publicId: null | string): HexFallSocket => {
    if (socket) {
        return socket;
    }

    myPublicId = publicId;
    socket = io({ transports: ['websocket', 'polling'] });
    clock = new ServerClock(socket);

    socket.on('connect', () => {
        live.connected = true;
        resync();
    });

    socket.on('disconnect', () => {
        live.connected = false;

        // getState answer is lost on disconnection, resync again on reconnection
        resyncing = false;
    });
    socket.on('lobby', lobby => live.lobby = lobby);
    socket.on('game', state => setGame(state));

    socket.on('roundStart', round => {
        live.game?.onRoundStart(round);
        live.version++;
    });

    socket.on('input', input => {
        live.game?.onInput(input);

        if (live.game?.desynced) resync();
    });

    socket.on('drop', event => {
        live.game?.onDrop(event);
        live.version++;

        if (live.game?.desynced) resync();
    });

    socket.on('gameEnd', event => {
        live.lastGameEnd = event;
        live.version++;
    });

    socket.on('spectators', count => {
        if (live.game) {
            live.game.spectators = count;
            live.version++;
        }
    });

    return socket;
};

export const liveActions = {
    join: () => new Promise<null | string>(resolve => socket?.emit('join', error => resolve(error))),
    leave: () => socket?.emit('leave'),
    ready: (ready: boolean) => socket?.emit('ready', ready),
    waitMore: () => socket?.emit('waitMore'),
    clock: () => clock,
    dismissFinishedGame: () => {
        live.game = null;
        live.lastGameEnd = null;
    },
};
