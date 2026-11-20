import { sql } from 'drizzle-orm';
import {
    bigint, boolean, char, datetime, double, index, int, json, mysqlTable, primaryKey, smallint, text, tinyint, unique, varchar,
} from 'drizzle-orm/mysql-core';

/**
 * Puzzles, imported from the puzzle generator. Only what is needed to play.
 */
export const puzzle = mysqlTable('puzzle', {
    id: int('id').autoincrement().primaryKey(),
    redStones: varchar('red_stones', { length: 255 }).notNull(),
    blueStones: varchar('blue_stones', { length: 255 }).notNull(),
    lastMove: varchar('last_move', { length: 4 }),
    solution: varchar('solution', { length: 4 }).notNull(),

    /** Difficulty set by an admin after import: 1 easy, 2 medium, 3 hard. null when not yet rated */
    initialDifficulty: tinyint('initial_difficulty'),

    importedAt: datetime('imported_at').notNull().default(sql`CURRENT_TIMESTAMP`),

    /** Last time this puzzle appeared in a game, to show least recently shown ones first. null when never shown */
    lastShownAt: datetime('last_shown_at'),
}, t => [
    /** Stones are sorted on import, so a same position is never imported twice */
    unique('puzzle_position_unq').on(t.redStones, t.blueStones),
    index('puzzle_initial_difficulty_idx').on(t.initialDifficulty),
    index('puzzle_last_shown_at_idx').on(t.lastShownAt),
]);

/**
 * Difficulty stats, incremented at each online round.
 */
export const puzzleStats = mysqlTable('puzzle_stats', {
    puzzleId: int('puzzle_id').primaryKey().references(() => puzzle.id),
    timesShown: int('times_shown').notNull().default(0),
    playersPresent: int('players_present').notNull().default(0),
    roundsWithElimination: int('rounds_with_elimination').notNull().default(0),
    playersEliminated: int('players_eliminated').notNull().default(0),
    roundsAllFell: int('rounds_all_fell').notNull().default(0),
    roundsNoneFell: int('rounds_none_fell').notNull().default(0),
    survivorReachMsSum: bigint('survivor_reach_ms_sum', { mode: 'number' }).notNull().default(0),
    survivorReachCount: int('survivor_reach_count').notNull().default(0),
    eliminatedRatingSum: double('eliminated_rating_sum').notNull().default(0),
    survivorRatingSum: double('survivor_rating_sum').notNull().default(0),
    survivorsCount: int('survivors_count').notNull().default(0),
});

/**
 * Where eliminated players were, per puzzle. 'out' when outside board.
 */
export const puzzleWrongCell = mysqlTable('puzzle_wrong_cell', {
    puzzleId: int('puzzle_id').notNull().references(() => puzzle.id),
    cell: varchar('cell', { length: 4 }).notNull(),
    count: int('count').notNull().default(0),
}, t => [primaryKey({ columns: [t.puzzleId, t.cell] })]);

/**
 * PlayHex players who logged in Hex Fall. Profile is refreshed on each visit.
 */
export const player = mysqlTable('player', {
    publicId: char('public_id', { length: 36 }).primaryKey(),
    pseudo: varchar('pseudo', { length: 64 }).notNull(),
    slug: varchar('slug', { length: 64 }).notNull(),
    isGuest: boolean('is_guest').notNull().default(false),
    avatarPath: varchar('avatar_path', { length: 255 }),
    avatarThumbnailPath: varchar('avatar_thumbnail_path', { length: 255 }),
    countryFlag: varchar('country_flag', { length: 8 }),
    rating: double('rating').notNull().default(1500),
    ratingDeviation: double('rating_deviation').notNull().default(350),

    /** Board display preferences from PlayHex player settings */
    settings: json('settings'),

    profileSyncedAt: datetime('profile_synced_at').notNull(),
    createdAt: datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

/**
 * PlayHex OAuth tokens, encrypted, never sent to browser.
 */
export const oauthToken = mysqlTable('oauth_token', {
    playerPublicId: char('player_public_id', { length: 36 }).primaryKey().references(() => player.publicId),
    accessTokenEnc: text('access_token_enc').notNull(),
    accessExpiresAt: datetime('access_expires_at').notNull(),
    refreshTokenEnc: text('refresh_token_enc'),
    scope: varchar('scope', { length: 255 }).notNull(),
    updatedAt: datetime('updated_at').notNull(),
});

export const session = mysqlTable('session', {
    /** sha256 of session id stored in cookie */
    idHash: char('id_hash', { length: 64 }).primaryKey(),
    playerPublicId: char('player_public_id', { length: 36 }).notNull().references(() => player.publicId),
    createdAt: datetime('created_at').notNull(),
    expiresAt: datetime('expires_at').notNull(),
    lastSeenAt: datetime('last_seen_at').notNull(),
}, t => [index('session_player_idx').on(t.playerPublicId)]);

/**
 * Recorded games, replayed with the shared simulation.
 */
export const replayGame = mysqlTable('replay_game', {
    id: int('id').autoincrement().primaryKey(),
    publicId: char('public_id', { length: 36 }).notNull().unique(),
    startedAt: datetime('started_at', { fsp: 3 }).notNull(),
    endedAt: datetime('ended_at', { fsp: 3 }).notNull(),
    seed: int('seed').notNull(),

    /** GameConfig used for this game, so replays stay exact if config changes */
    config: json('config').notNull(),

    playersCount: smallint('players_count').notNull(),
    roundsCount: smallint('rounds_count').notNull(),
}, t => [index('replay_game_ended_at_idx').on(t.endedAt)]);

export const replayPlayer = mysqlTable('replay_player', {
    gameId: int('game_id').notNull().references(() => replayGame.id),
    idx: tinyint('idx').notNull(),
    playerPublicId: char('player_public_id', { length: 36 }).notNull().references(() => player.publicId),

    // Snapshot at game time
    pseudo: varchar('pseudo', { length: 64 }).notNull(),
    avatarUrl: varchar('avatar_url', { length: 512 }),
    countryFlag: varchar('country_flag', { length: 8 }),
    rating: double('rating').notNull(),
    ratingDeviation: double('rating_deviation').notNull(),

    startX: int('start_x').notNull(),
    startY: int('start_y').notNull(),

    /** null if never eliminated (winner) */
    eliminatedRound: smallint('eliminated_round'),
    finalPlace: smallint('final_place').notNull(),
}, t => [
    primaryKey({ columns: [t.gameId, t.idx] }),
    index('replay_player_player_idx').on(t.playerPublicId),
]);

export const replayRound = mysqlTable('replay_round', {
    gameId: int('game_id').notNull().references(() => replayGame.id),
    roundIndex: smallint('round_index').notNull(),
    puzzleId: int('puzzle_id').notNull().references(() => puzzle.id),

    /** Cell from which appear wave starts, null on first round */
    originCell: varchar('origin_cell', { length: 4 }),

    // ms since game start
    appearMs: int('appear_ms').notNull(),
    playMs: int('play_ms').notNull(),
    dropMs: int('drop_ms').notNull(),
    endMs: int('end_ms').notNull(),

    aliveBefore: smallint('alive_before').notNull(),
    eliminatedCount: smallint('eliminated_count').notNull(),
}, t => [primaryKey({ columns: [t.gameId, t.roundIndex] })]);

/**
 * All clicks of a game, [t, idx, x, y][], replayed with the shared simulation.
 */
export const replayInputs = mysqlTable('replay_inputs', {
    gameId: int('game_id').primaryKey().references(() => replayGame.id),
    inputs: json('inputs').notNull(),
});

export const playerStats = mysqlTable('player_stats', {
    playerPublicId: char('player_public_id', { length: 36 }).primaryKey().references(() => player.publicId),
    gamesPlayed: int('games_played').notNull().default(0),
    wins: int('wins').notNull().default(0),
    puzzlesSolved: int('puzzles_solved').notNull().default(0),
    opponentsSurvivedTotal: int('opponents_survived_total').notNull().default(0),
});

export const playerSurvivedOpponent = mysqlTable('player_survived_opponent', {
    playerPublicId: char('player_public_id', { length: 36 }).notNull().references(() => player.publicId),
    opponentPublicId: char('opponent_public_id', { length: 36 }).notNull(),

    /** Last known pseudo */
    opponentPseudo: varchar('opponent_pseudo', { length: 64 }).notNull(),

    count: int('count').notNull().default(0),
}, t => [primaryKey({ columns: [t.playerPublicId, t.opponentPublicId] })]);
