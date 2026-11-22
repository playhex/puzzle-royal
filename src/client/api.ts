import type { BoardSettings } from '../shared/boardSettings.js';
import type { PlayerProfile } from '../shared/profile.js';
import type { ReplayData } from './game/ReplayModel.js';

const post = async <T>(url: string, body: unknown): Promise<T> => {
    const response = await fetch(url, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        throw new Error(`${url}: ${response.status}`);
    }

    return response.json() as Promise<T>;
};

const get = async <T>(url: string): Promise<T> => {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });

    if (!response.ok) {
        throw new Error(`${url}: ${response.status}`);
    }

    return response.json() as Promise<T>;
};

export type Me = {
    profile: PlayerProfile;
    settings: BoardSettings;
    isAdmin: boolean;
};

export type RecentGame = {
    gameId: string;
    endedAt: string;
    playersCount: number;
    roundsCount: number;
    winners: { publicId: string; pseudo: string; countryFlag: null | string }[];
};

export type PlayerStats = {
    player: null | PlayerProfile;

    /** Full size avatar, not the thumbnail */
    avatarOriginalUrl: null | string;

    gamesPlayed: number;
    wins: number;
    puzzlesSolved: number;
    opponentsSurvivedTotal: number;
    /** Top 8 */
    opponentsSurvived: { publicId: string; pseudo: string; count: number }[];

    /** Last 10 games */
    games: (RecentGame & { place: number })[];
};

export type GamesSort = 'endedAt' | 'playersCount' | 'roundsCount';

export type GamesPage = { games: RecentGame[]; hasMore: boolean };

/** Top 50 of the last 365 days, by opponents outlasted then fewer games played */
export type Leaderboard = { player: PlayerProfile; wins: number; gamesPlayed: number; opponentsSurvived: number }[];

/** 1 easy, 2 medium, 3 hard */
export type Difficulty = 1 | 2 | 3;

export type AdminPuzzleData = { id: number; redStones: string[]; blueStones: string[]; lastMove: null | string; solution: string };

export type AdminPuzzle = {
    id: number;
    puzzle: AdminPuzzleData;
    initialDifficulty: null | Difficulty;
    timesShown: number;
    playersPresent: number;
    roundsWithElimination: number;
    playersEliminated: number;
    eliminationRate: number;
    roundsAllFell: number;
    roundsNoneFell: number;
    avgReachMs: null | number;
    mostWrongCell: null | { cell: string; count: number };
    avgEliminatedRating: null | number;
    avgSurvivorRating: null | number;
};

export const api = {
    me: () => get<null | Me>('/api/me'),
    leaderboard: () => get<Leaderboard>('/api/leaderboard'),
    featuredGames: () => get<RecentGame[]>('/api/games/featured'),
    recentGames: (sort: GamesSort = 'endedAt', order: 'asc' | 'desc' = 'desc', offset = 0, limit = 20) =>
        get<GamesPage>(`/api/games/recent?sort=${sort}&order=${order}&offset=${offset}&limit=${limit}`),
    puzzlesCount: async () => (await get<{ count: number }>('/api/puzzles/count')).count,
    game: (gameId: string) => get<ReplayData>(`/api/games/${encodeURIComponent(gameId)}`),
    playerStats: (publicId: string) => get<PlayerStats>(`/api/players/${encodeURIComponent(publicId)}/stats`),
    adminCheck: () => get<{ ok: true }>('/api/admin/check'),
    adminPuzzles: () => get<AdminPuzzle[]>('/api/admin/puzzles'),
    adminNextUnratedPuzzle: (after = 0) => get<{ puzzle: null | (AdminPuzzleData & { initialDifficulty: null | Difficulty }); remaining: number }>(`/api/admin/puzzles/unrated/next?after=${after}`),
    adminPuzzle: (id: number) => get<{ puzzle: AdminPuzzleData & { initialDifficulty: null | Difficulty }; remaining: number }>(`/api/admin/puzzles/${id}`),
    adminSetInitialDifficulty: (id: number, difficulty: null | Difficulty) => post<{ ok: true }>(`/api/admin/puzzles/${id}/initial-difficulty`, { difficulty }),
    logout: () => fetch('/logout', { method: 'POST' }),
};

export const loginUrl = (returnTo: string): string => `/login?return=${encodeURIComponent(returnTo)}`;
