import type { Move } from '@playhex/move-notation';
import type { GameConfig } from './config.js';
import type { Vec } from './geometry.js';
import type { PlayerProfile } from './profile.js';
import type { PublicPuzzle } from './puzzle.js';
import type { InputTuple, RoundTimes } from './simulation/types.js';

export type LobbyPlayer = {
    profile: PlayerProfile;
    ready: boolean;
    connected: boolean;
};

export type LobbyState = {
    players: LobbyPlayer[];

    /** Server time when next game can start, null while not enough players */
    deadline: null | number;

    /** Countdown is over but a game is still running */
    waitingForGameEnd: boolean;

    /** Why next game could not start (e.g. no puzzle), null if fine */
    startError: null | string;

    minPlayers: number;

    /** Logged in viewers not registered */
    spectators: PlayerProfile[];

    /** Viewers not logged in */
    anonymousSpectators: number;
};

export type LiveRound = {
    roundIndex: number;
    puzzle: PublicPuzzle;

    /** Appear wave starts from there, null on first round (board center) */
    origin: null | Move;

    times: RoundTimes;

    /** Only sent once play phase is over */
    solution?: Move;
};

export type LiveGameState = {
    gameId: string;

    /** Server time of game t=0 */
    startedAt: number;

    config: GameConfig;
    players: PlayerProfile[];
    startPositions: Vec[];

    /** Revealed rounds: resolved ones with solution, and current one without. */
    rounds: LiveRound[];

    /** All accepted clicks since game start */
    inputs: InputTuple[];

    /** Viewers who are not players of this game */
    spectators: number;

    over: boolean;
};

export type DropEvent = {
    roundIndex: number;
    solution: Move;

    /** Authoritative eliminated players indexes, client checks its own simulation against it */
    eliminated: number[];
};

export type GameEndEvent = {
    gameId: string;
    places: (null | number)[];
    roundsCount: number;
};

export type ServerToClientEvents = {
    lobby: (lobby: LobbyState) => void;
    game: (game: null | LiveGameState) => void;
    roundStart: (round: LiveRound) => void;
    input: (input: InputTuple) => void;
    drop: (event: DropEvent) => void;
    gameEnd: (event: GameEndEvent) => void;
    spectators: (count: number) => void;
};

export type ClientToServerEvents = {
    getServerTime: (answer: (serverTime: number) => void) => void;

    /** Full state, for initial load or resync */
    getState: (answer: (state: { lobby: LobbyState; game: null | LiveGameState }) => void) => void;

    join: (answer: (error: null | string) => void) => void;
    leave: () => void;
    ready: (ready: boolean) => void;

    /** Brings countdown back to at least `waitMoreMs` */
    waitMore: () => void;

    /** Click, fixed point board coordinates */
    move: (target: Vec) => void;
};
