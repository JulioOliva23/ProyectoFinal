import { UnlockCodeCipher } from '../src/common/crypto/unlock-code-cipher';

describe('UnlockCodeCipher (RN-03)', () => {
  const cipher = new UnlockCodeCipher('a'.repeat(64));

  it('round-trips a PIN without storing it in plaintext [003/RF-4.2]', () => {
    const stored = cipher.encrypt('1234');
    expect(stored).not.toContain('1234');
    expect(cipher.decrypt(stored)).toBe('1234');
  });

  it('produces a different ciphertext each time (random IV) [003/RF-4.2]', () => {
    expect(cipher.encrypt('1-5-9-6')).not.toBe(cipher.encrypt('1-5-9-6'));
  });

  it('rejects tampered ciphertext [003/RF-4.2]', () => {
    const [iv, tag, data] = cipher.encrypt('1234').split('.');
    const tampered = [iv, tag, Buffer.from('xxxx').toString('base64')].join('.');
    expect(() => cipher.decrypt(tampered)).toThrow();
    expect(data).toBeDefined();
  });

  it('refuses weak keys [003/RF-4.2]', () => {
    expect(() => new UnlockCodeCipher('short')).toThrow();
  });
});
