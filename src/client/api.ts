import type { BoardSettings } from '../shared/boardSettings.js';
import type { PlayerProfile } from '../shared/profile.js';
import type { ReplayData } from './game/ReplayModel.js';

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

export type AdminPuzzle = {
    id: number;
    puzzle: { redStones: string[]; blueStones: string[]; lastMove: null | string; solution: string };
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
    recentGames: () => get<RecentGame[]>('/api/games/recent'),
    puzzlesCount: async () => (await get<{ count: number }>('/api/puzzles/count')).count,
    game: (gameId: string) => get<ReplayData>(`/api/games/${encodeURIComponent(gameId)}`),
    playerStats: (publicId: string) => get<PlayerStats>(`/api/players/${encodeURIComponent(publicId)}/stats`),
    adminPuzzles: () => get<AdminPuzzle[]>('/api/admin/puzzles'),
    logout: () => fetch('/logout', { method: 'POST' }),
};

export const loginUrl = (returnTo: string): string => `/login?return=${encodeURIComponent(returnTo)}`;
