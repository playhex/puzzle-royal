import { Router } from 'express';
import { exchangeCode, getAuthorizeUrl } from './playhexApi.js';
import { createSession, destroySession, parseCookies, saveTokens, syncPlayerFromPlayhex } from './sessions.js';
import { randomToken } from './tokenCrypto.js';
import { env } from '../env.js';

const STATE_COOKIE = 'hexfall_oauth_state';
const RETURN_COOKIE = 'hexfall_return_to';

const safeReturnPath = (path: unknown): string =>
    typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') ? path : '/';

export const authRouter = Router();

authRouter.get('/login', (req, res) => {
    const state = randomToken();
    const cookieOptions = { httpOnly: true, sameSite: 'lax' as const, secure: env.isProduction, maxAge: 10 * 60 * 1000, path: '/' };

    res.cookie(STATE_COOKIE, state, cookieOptions);
    res.cookie(RETURN_COOKIE, safeReturnPath(req.query.return), cookieOptions);
    res.redirect(getAuthorizeUrl(state));
});

authRouter.get('/callback', async (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const returnTo = safeReturnPath(cookies[RETURN_COOKIE]);

    res.clearCookie(STATE_COOKIE, { path: '/' });
    res.clearCookie(RETURN_COOKIE, { path: '/' });

    if (typeof req.query.error === 'string') {
        // Player denied authorization
        res.redirect(`/?login_error=${encodeURIComponent(req.query.error)}`);
        return;
    }

    if (!cookies[STATE_COOKIE] || req.query.state !== cookies[STATE_COOKIE] || typeof req.query.code !== 'string') {
        res.status(400).send('Invalid OAuth state, please retry to log in.');
        return;
    }

    try {
        const tokens = await exchangeCode(req.query.code);
        const player = await syncPlayerFromPlayhex(tokens.access_token);

        await saveTokens(player.publicId, tokens);
        await createSession(res, player.publicId);

        res.redirect(returnTo);
    } catch (e) {
        console.error('OAuth callback error', e);
        res.status(502).send('Could not log in with PlayHex, please retry.');
    }
});

authRouter.post('/logout', async (req, res) => {
    await destroySession(req, res);
    res.json({ ok: true });
});
