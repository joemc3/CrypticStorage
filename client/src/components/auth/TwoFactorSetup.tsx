import React, { useState } from 'react';
import { DocumentDuplicateIcon, CheckIcon } from '@heroicons/react/24/outline';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../common/Card';

export interface TwoFactorSetupProps {
  secret: string;
  qrCodeUrl: string;
  onVerify: (code: string) => Promise<boolean>;
  onComplete: () => void;
  isLoading?: boolean;
}

export const TwoFactorSetup: React.FC<TwoFactorSetupProps> = ({ secret, qrCodeUrl, onVerify, onComplete, isLoading = false }) => {
  const [verificationCode, setVerificationCode] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleCopySecret = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleVerify = async () => {
    setError('');

    if (verificationCode.length !== 6) {
      setError('Code must be 6 digits');
      return;
    }

    try {
      const success = await onVerify(verificationCode);
      if (success) {
        setIsVerified(true);
        setTimeout(() => {
          onComplete();
        }, 1500);
      } else {
        setError('Invalid code. Please try again.');
        setVerificationCode('');
      }
    } catch (err: any) {
      setError(err.message || 'Verification failed. Please try again.');
      setVerificationCode('');
    }
  };

  if (isVerified) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center" role="status">
        <CheckIcon className="h-10 w-10 text-accent-text" aria-hidden="true" />
        <h3 className="text-base font-semibold text-ink">Two-factor authentication is on</h3>
        <p className="text-sm text-ink-2">Every sign-in now needs a code from your authenticator app.</p>
      </div>
    );
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Step 1: Scan the QR code</CardTitle>
          <CardDescription>Use your authenticator app to scan this code.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <div className="rounded-lg bg-white p-3">
            <img src={qrCodeUrl} alt="QR Code" className="h-44 w-44" />
          </div>

          <div className="flex flex-col items-center gap-2 text-center">
            <p className="text-sm text-ink-2">Cannot scan it? Type this key into the app instead.</p>
            <div className="flex max-w-full items-center gap-2 rounded-lg border border-line bg-surface-2 py-1 pl-3 pr-1">
              <code className="min-w-0 break-all font-mono text-sm font-medium tracking-[.06em] text-ink">{secret}</code>
              <button
                type="button"
                onClick={handleCopySecret}
                aria-label={copied ? 'Key copied' : 'Copy key'}
                className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-lg text-ink-2 hover:bg-surface hover:text-ink"
              >
                {copied ? <CheckIcon className="h-5 w-5" aria-hidden="true" /> : <DocumentDuplicateIcon className="h-5 w-5" aria-hidden="true" />}
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Step 2: Enter the code</CardTitle>
          <CardDescription>Type the six digits your authenticator app shows now.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Input
            type="text"
            label="Six-digit code"
            code
            inputMode="numeric"
            value={verificationCode}
            onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            error={error || undefined}
            disabled={isLoading}
            maxLength={6}
            autoComplete="one-time-code"
          />
          <Button onClick={handleVerify} isLoading={isLoading} className="w-full">
            Verify and turn on
          </Button>
        </CardContent>
      </Card>

      <p className="text-sm text-ink-2">
        If you lose your authenticator app and your backup codes, you lose access to your account. There is no reset.
      </p>
    </div>
  );
};
