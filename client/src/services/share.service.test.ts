// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ApiService from './api.service';
import CryptoService from './crypto.service';
import ShareService from './share.service';
import { fileKeyFor } from './file.service';

const FILE_KEY = { fileKey: true } as unknown as CryptoKey;
vi.mock('./file.service', () => ({ fileKeyFor: vi.fn() }));

describe('share.service shareWithUser', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(fileKeyFor).mockResolvedValue(FILE_KEY);
    vi.spyOn(ApiService, 'getFile').mockResolvedValue({ id: 'f1' } as never);
    vi.spyOn(ApiService, 'shareWithUser').mockResolvedValue({ id: 's1' } as never);
  });

  it('wraps with the key it was given and never asks the directory again', async () => {
    const getPublicKey = vi.spyOn(ApiService, 'getPublicKey');
    const imported = { fake: 'key' } as unknown as CryptoKey;
    const importPublicKey = vi.spyOn(CryptoService, 'importPublicKey').mockResolvedValue(imported);
    const wrap = vi.spyOn(CryptoService, 'wrapKeyForRecipient').mockResolvedValue('wrapped');

    await ShareService.shareWithUser('f1', ' Bob@Example.com ', 'VERIFIED-SPKI');

    expect(getPublicKey).toHaveBeenCalledTimes(0);
    expect(importPublicKey).toHaveBeenCalledWith('VERIFIED-SPKI');
    expect(wrap).toHaveBeenCalledWith(FILE_KEY, imported);
    expect(ApiService.shareWithUser).toHaveBeenCalledWith(expect.objectContaining({ recipientEmail: 'bob@example.com', encryptedFileKey: 'wrapped' }));
  });

  it('still looks the key up when none is given', async () => {
    const getPublicKey = vi.spyOn(ApiService, 'getPublicKey').mockResolvedValue({ publicKey: 'LOOKED-UP' } as never);
    vi.spyOn(CryptoService, 'importPublicKey').mockResolvedValue({} as CryptoKey);
    vi.spyOn(CryptoService, 'wrapKeyForRecipient').mockResolvedValue('wrapped');
    await ShareService.shareWithUser('f1', 'bob@example.com');
    expect(getPublicKey).toHaveBeenCalledTimes(1);
  });
});
