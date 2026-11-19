const required = (name: string): string => {
    const value = process.env[name];

    if (value === undefined || value === '') {
        throw new Error(`Missing env variable ${name}, see .env.dist`);
    }

    return value;
};

const optional = (name: string, defaultValue: string): string => process.env[name] || defaultValue;

export const env = {
    get port() { return Number(optional('PORT', '3700')); },
    get appUrl() { return optional('APP_URL', 'http://localhost:5173').replace(/\/$/, ''); },
    get databaseUrl() { return required('DATABASE_URL'); },
    get playhexUrl() { return optional('PLAYHEX_URL', 'http://localhost:13000').replace(/\/$/, ''); },
    get oauthClientId() { return required('OAUTH_CLIENT_ID'); },
    get oauthClientSecret() { return required('OAUTH_CLIENT_SECRET'); },
    get cookieSecret() { return required('COOKIE_SECRET'); },
    get tokenEncryptionKey() { return required('TOKEN_ENCRYPTION_KEY'); },
    get adminPublicIds() { return optional('ADMIN_PUBLIC_IDS', '').split(',').map(s => s.trim()).filter(Boolean); },
    get isProduction() { return process.env.NODE_ENV === 'production'; },
};
