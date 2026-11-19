import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '../env.js';

const key = (): Buffer => {
    const k = Buffer.from(env.tokenEncryptionKey, 'hex');

    if (k.length !== 32) {
        throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes hex (64 chars)');
    }

    return k;
};

/** AES-256-GCM, output base64(iv | tag | ciphertext) */
export const encryptToken = (plain: string): string => {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key(), iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);

    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
};

export const decryptToken = (encoded: string): string => {
    const raw = Buffer.from(encoded, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));

    decipher.setAuthTag(raw.subarray(12, 28));

    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
};

export const randomToken = (): string => randomBytes(32).toString('base64url');

export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
