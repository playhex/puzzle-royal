import { env } from '../env.js';

export const OAUTH_SCOPE = 'openid read offline_access';

export type TokenResponse = {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    scope: string;
    token_type: string;
};

export type PlayhexMe = {
    publicId: string;
    pseudo: string;
    slug: string;
    isGuest: boolean;
    avatarPath?: null | string;
    avatarThumbnailPath?: null | string;
    countryFlag?: null | string;
    currentRating?: null | { rating: number; deviation: number };
};

export class PlayhexAuthError extends Error {}

export const getRedirectUri = (): string => `${env.appUrl}/callback`;

export const getAuthorizeUrl = (state: string): string => {
    const url = new URL(`${env.playhexUrl}/oidc/auth`);

    url.searchParams.set('client_id', env.oauthClientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', getRedirectUri());
    url.searchParams.set('scope', OAUTH_SCOPE);
    url.searchParams.set('state', state);

    // Needed by PlayHex (oidc-provider) to issue a refresh token with offline_access
    url.searchParams.set('prompt', 'consent');

    return url.toString();
};

const tokenRequest = async (params: Record<string, string>): Promise<TokenResponse> => {
    const basic = Buffer.from(`${encodeURIComponent(env.oauthClientId)}:${encodeURIComponent(env.oauthClientSecret)}`).toString('base64');
    const response = await fetch(`${env.playhexUrl}/oidc/token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${basic}`,
        },
        body: new URLSearchParams(params),
    });

    if (!response.ok) {
        throw new PlayhexAuthError(`Token endpoint error ${response.status}: ${await response.text()}`);
    }

    return response.json() as Promise<TokenResponse>;
};

export const exchangeCode = (code: string): Promise<TokenResponse> => tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: getRedirectUri(),
});

export const refreshAccessToken = (refreshToken: string): Promise<TokenResponse> => tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
});

const apiGet = async <T>(path: string, accessToken: string): Promise<T> => {
    const response = await fetch(`${env.playhexUrl}${path}`, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });

    if (response.status === 401) {
        throw new PlayhexAuthError(`Unauthorized on ${path}`);
    }

    if (!response.ok) {
        throw new Error(`PlayHex API ${path}: ${response.status}`);
    }

    return response.json() as Promise<T>;
};

/**
 * Current player. currentRating (with deviation) is loaded by this route,
 * but missing for players who never played a rated game.
 */
export const fetchMe = (accessToken: string) => apiGet<PlayhexMe>('/api/auth/me', accessToken);

export const fetchPlayerSettings = (accessToken: string) => apiGet<Record<string, unknown>>('/api/player-settings', accessToken);
