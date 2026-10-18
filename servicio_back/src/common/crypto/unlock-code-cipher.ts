import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// RN-03: device unlock codes (PIN / pattern / password) must be readable by
// the assigned technician, so they are ENCRYPTED (AES-256-GCM), not hashed.
// Stored format: base64(iv).base64(authTag).base64(ciphertext).
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

export class UnlockCodeCipher {
  private readonly key: Buffer;

  constructor(hexKey: string) {
    if (!/^[0-9a-fA-F]{64}$/.test(hexKey)) {
      throw new Error('UNLOCK_CODE_ENCRYPTION_KEY must be 64 hex characters');
    }
    this.key = Buffer.from(hexKey, 'hex');
  }

  encrypt(plain: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), data].map((part) => part.toString('base64')).join('.');
  }

  // Throws on tampering (GCM auth tag mismatch).
  decrypt(stored: string): string {
    const [iv, tag, data] = stored.split('.').map((part) => Buffer.from(part, 'base64'));
    if (!iv || !tag || !data) throw new Error('Malformed unlock code ciphertext');
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }
}
