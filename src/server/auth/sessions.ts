import { and, eq, gt, lt } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { pickBoardSettings } from '../../shared/boardSettings.js';
import { db } from '../db/index.js';
import { oauthToken, session } from '../db/schema.js';
import { env } from '../env.js';
import { findPlayer, upsertPlayer, type PlayerRow } from '../players.js';
import { fetchMe, fetchPlayerSettings, PlayhexAuthError, refreshAccessToken, type TokenResponse } from './playhexApi.js';
import { decryptToken, encryptToken, randomToken, sha256 } from './tokenCrypto.js';

export const SESSION_COOKIE = 'hexfall_sid';
const SESSION_DURATION_MS = 180 * 24 * 3600 * 1000;

/**
 * Profile and board settings are refreshed from PlayHex on each page load (/api/me),
 * so that changes made on PlayHex apply when coming back. Only throttled against fast reloads.
 */
const PROFILE_SYNC_INTERVAL_MS = 5000;

export const parseCookies = (header: undefined | string): Record<string, string> => {
    const cookies: Record<string, string> = {};

    for (const part of (header ?? '').split(';')) {
        const i = part.indexOf('=');

        if (i <= 0) {
            continue;
        }

        try {
            cookies[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
        } catch {
            // Malformed cookie (not ours): ignore it
        }
    }

    return cookies;
};

export const saveTokens = async (playerPublicId: string, tokens: TokenResponse): Promise<void> => {
    const now = new Date();
    const values = {
        playerPublicId,
        accessTokenEnc: encryptToken(tokens.access_token),
        accessExpiresAt: new Date(now.getTime() + (tokens.expires_in - 60) * 1000),
        // Refresh token may not be returned on refresh (not rotated): keep the previous one
        ...(tokens.refresh_token ? { refreshTokenEnc: encryptToken(tokens.refresh_token) } : {}),
        scope: tokens.scope,
        updatedAt: now,
    };
    const { playerPublicId: _, ...update } = values;

    await db.insert(oauthToken).values(values).onDuplicateKeyUpdate({ set: update });
};

/**
 * Fetch profile and settings from PlayHex and store them.
 */
export const syncPlayerFromPlayhex = async (accessToken: string): Promise<PlayerRow> => {
    const [me, rawSettings] = await Promise.all([fetchMe(accessToken), fetchPlayerSettings(accessToken)]);

    return upsertPlayer(me, pickBoardSettings(rawSettings));
};

export const createSession = async (res: Response, playerPublicId: string): Promise<void> => {
    const id = randomToken();
    const now = new Date();

    await db.insert(session).values({
        idHash: sha256(id),
        playerPublicId,
        createdAt: now,
        expiresAt: new Date(now.getTime() + SESSION_DURATION_MS),
        lastSeenAt: now,
    });

    res.cookie(SESSION_COOKIE, id, {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.isProduction,
        maxAge: SESSION_DURATION_MS,
        path: '/',
    });
};

export const destroySession = async (req: Request, res: Response): Promise<void> => {
    const id = parseCookies(req.headers.cookie)[SESSION_COOKIE];

    if (id) {
        await db.delete(session).where(eq(session.idHash, sha256(id)));
    }

    res.clearCookie(SESSION_COOKIE, { path: '/' });
};

/**
 * Player logged in with this cookie header, or null.
 */
export const getSessionPlayer = async (cookieHeader: undefined | string): Promise<null | PlayerRow> => {
    const id = parseCookies(cookieHeader)[SESSION_COOKIE];

    if (!id) {
        return null;
    }

    const rows = await db.select().from(session)
        .where(and(eq(session.idHash, sha256(id)), gt(session.expiresAt, new Date())))
        .limit(1);

    if (rows.length === 0) {
        return null;
    }

    await db.update(session).set({ lastSeenAt: new Date() }).where(eq(session.idHash, rows[0].idHash));

    return findPlayer(rows[0].playerPublicId);
};

/** Access token requests in progress, per player */
const pendingAccessTokens = new Map<string, Promise<null | string>>();

/**
 * Valid access token for this player, refreshing it with refresh token if needed.
 * Returns null if player must authorize again.
 *
 * Concurrent calls for a same player (e.g. several tabs loading) share the same request,
 * so that a refresh token is never used twice (PlayHex may rotate it and revoke the grant on reuse).
 */
const getAccessToken = (playerPublicId: string): Promise<null | string> => {
    let pending = pendingAccessTokens.get(playerPublicId);

    if (!pending) {
        pending = loadAccessToken(playerPublicId).finally(() => pendingAccessTokens.delete(playerPublicId));
        pendingAccessTokens.set(playerPublicId, pending);
    }

    return pending;
};

const loadAccessToken = async (playerPublicId: string): Promise<null | string> => {
    const rows = await db.select().from(oauthToken).where(eq(oauthToken.playerPublicId, playerPublicId)).limit(1);
    const token = rows[0];

    if (!token) {
        return null;
    }

    if (token.accessExpiresAt > new Date()) {
        return decryptToken(token.accessTokenEnc);
    }

    if (!token.refreshTokenEnc) {
        return null;
    }

    try {
        const refreshed = await refreshAccessToken(decryptToken(token.refreshTokenEnc));

        await saveTokens(playerPublicId, refreshed);

        return refreshed.access_token;
    } catch (e) {
        if (e instanceof PlayhexAuthError) {
            return null;
        }

        throw e;
    }
};

/**
 * On player return: refresh profile (pseudo, avatar, rating, board settings) from PlayHex
 * if not done recently, without asking authorization again.
 *
 * @returns Updated player, or null if authorization has been revoked (player must log in again)
 */
export const refreshPlayerIfNeeded = async (row: PlayerRow): Promise<null | PlayerRow> => {
    if (Date.now() - row.profileSyncedAt.getTime() < PROFILE_SYNC_INTERVAL_MS) {
        return row;
    }

    try {
        const accessToken = await getAccessToken(row.publicId);

        if (accessToken === null) {
            return null;
        }

        return await syncPlayerFromPlayhex(accessToken);
    } catch (e) {
        if (e instanceof PlayhexAuthError) {
            return null;
        }

        // PlayHex unreachable: keep cached profile
        console.warn('Could not refresh player profile from PlayHex', e);

        return row;
    }
};

export const purgeExpiredSessions = async (): Promise<void> => {
    await db.delete(session).where(lt(session.expiresAt, new Date()));
};
