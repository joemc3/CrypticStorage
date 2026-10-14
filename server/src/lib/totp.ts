import { authenticator } from 'otplib';
import QRCode from 'qrcode';

authenticator.options = { window: 1 };

export function generateTotpSecret(): string {
  return authenticator.generateSecret(20);
}

export function verifyTotp(secret: string, token: string): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  try {
    return authenticator.check(token, secret);
  } catch {
    return false;
  }
}

export async function totpQrCodeDataUrl(email: string, secret: string): Promise<string> {
  const uri = authenticator.keyuri(email, 'CrypticStorage', secret);
  return QRCode.toDataURL(uri, { errorCorrectionLevel: 'M', margin: 1, width: 240 });
}
