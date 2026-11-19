import { eq } from 'drizzle-orm';
import { pickBoardSettings, type BoardSettings } from '../shared/boardSettings.js';
import type { PlayerProfile } from '../shared/profile.js';
import { DEFAULT_DEVIATION, DEFAULT_RATING } from '../shared/rating.js';
import { db } from './db/index.js';
import { player } from './db/schema.js';
import { env } from './env.js';
import type { PlayhexMe } from './auth/playhexApi.js';

export type PlayerRow = typeof player.$inferSelect;

export const toAvatarUrl = (path: null | undefined | string): null | string => {
    if (!path) {
        return null;
    }

    return /^https?:\/\//.test(path) ? path : `${env.playhexUrl}${path}`;
};

/** PlayHex guests pseudo is a number, displayed "Guest 123456" */
export const displayPseudo = (pseudo: string, isGuest: boolean): string => isGuest ? `Guest ${pseudo}` : pseudo;

export const toProfile = (row: PlayerRow): PlayerProfile => ({
    publicId: row.publicId,
    pseudo: displayPseudo(row.pseudo, row.isGuest),
    slug: row.slug,
    isGuest: row.isGuest,
    avatarUrl: toAvatarUrl(row.avatarThumbnailPath ?? row.avatarPath),
    countryFlag: row.countryFlag,
    rating: row.rating,
    ratingDeviation: row.ratingDeviation,
});

export const toSettings = (row: PlayerRow): BoardSettings => pickBoardSettings(row.settings as Record<string, unknown> | null);

export const findPlayer = async (publicId: string): Promise<null | PlayerRow> => {
    const rows = await db.select().from(player).where(eq(player.publicId, publicId)).limit(1);

    return rows[0] ?? null;
};

/**
 * Creates or updates player from PlayHex data.
 */
export const upsertPlayer = async (me: PlayhexMe, settings: BoardSettings): Promise<PlayerRow> => {
    const values = {
        publicId: me.publicId,
        pseudo: me.pseudo,
        slug: me.slug,
        isGuest: me.isGuest,
        avatarPath: me.avatarPath ?? null,
        avatarThumbnailPath: me.avatarThumbnailPath ?? null,
        countryFlag: me.countryFlag ?? null,
        rating: me.currentRating?.rating ?? DEFAULT_RATING,
        ratingDeviation: me.currentRating?.deviation ?? DEFAULT_DEVIATION,
        settings,
        profileSyncedAt: new Date(),
    };

    const { publicId: _, ...update } = values;

    await db.insert(player).values(values).onDuplicateKeyUpdate({ set: update });

    return (await findPlayer(me.publicId))!;
};
