import { decryptAtRest, encryptAtRest, randomBackupCode, randomToken, safeEqual, sha256Hex } from '../../src/lib/crypto';
import { signAccessToken, signContentToken, verifyAccessToken, verifyContentToken } from '../../src/lib/jwt';
import { generateTotpSecret, verifyTotp } from '../../src/lib/totp';
import { authenticator } from 'otplib';

describe('crypto helpers', () => {
  it('round-trips secrets encrypted at rest with fresh nonces', () => {
    const a = encryptAtRest('JBSWY3DPEHPK3PXP');
    const b = encryptAtRest('JBSWY3DPEHPK3PXP');
    expect(a).not.toBe(b);
    expect(decryptAtRest(a)).toBe('JBSWY3DPEHPK3PXP');
    expect(decryptAtRest(b)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('detects tampering', () => {
    const blob = Buffer.from(encryptAtRest('secret'), 'base64');
    blob[blob.length - 1] = blob[blob.length - 1]! ^ 0x01;
    expect(() => decryptAtRest(blob.toString('base64'))).toThrow();
  });

  it('produces url-safe tokens and readable backup codes', () => {
    expect(randomToken(24)).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(randomBackupCode()).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('jwt', () => {
  it('separates access and content token issuers and scopes', () => {
    const access = signAccessToken({ sub: 'u1', sid: 's1', scope: 'access' });
    expect(verifyAccessToken(access)).toEqual({ sub: 'u1', sid: 's1', scope: 'access' });
    expect(() => verifyContentToken(access, 'download')).toThrow();

    const content = signContentToken({ fid: 'f1', scope: 'download', lid: 'l1' });
    expect(verifyContentToken(content, 'download')).toMatchObject({ fid: 'f1', lid: 'l1' });
    expect(() => verifyContentToken(content, 'upload')).toThrow();
    expect(() => verifyAccessToken(content)).toThrow();
  });
});

describe('totp', () => {
  it('verifies current codes and rejects junk', () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, authenticator.generate(secret))).toBe(true);
    expect(verifyTotp(secret, '12345')).toBe(false);
    expect(verifyTotp(secret, 'abcdef')).toBe(false);
  });
});
