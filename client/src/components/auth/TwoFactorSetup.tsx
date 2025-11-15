import React, { useState } from 'react';
import { QrCodeIcon, ShieldCheckIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../common/Card';
import { motion } from 'framer-motion';

export interface TwoFactorSetupProps {
  secret: string;
  qrCodeUrl: string;
  onVerify: (code: string) => Promise<boolean>;
  onComplete: () => void;
  isLoading?: boolean;
}

export const TwoFactorSetup: React.FC<TwoFactorSetupProps> = ({
  secret,
  qrCodeUrl,
  onVerify,
  onComplete,
  isLoading = false,
}) => {
  const [verificationCode, setVerificationCode] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState<'setup' | 'verify'>('setup');

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
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center py-8"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
        >
          <CheckCircleIcon className="h-20 w-20 text-green-500 mx-auto mb-4" />
        </motion.div>
        <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Two-Factor Authentication Enabled!
        </h3>
        <p className="text-gray-600 dark:text-gray-400">Your account is now more secure.</p>
      </motion.div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-100 dark:bg-indigo-900 rounded-full mb-4">
          <ShieldCheckIcon className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
        </div>
        <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
          Enable Two-Factor Authentication
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Add an extra layer of security to your account
        </p>
      </div>

      <div className="space-y-6">
        {/* Setup Steps */}
        <Card variant="bordered">
          <CardHeader>
            <CardTitle>Step 1: Scan QR Code</CardTitle>
            <CardDescription>Use your authenticator app to scan this QR code</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center space-y-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                className="bg-white p-4 rounded-lg shadow-md"
              >
                <img src={qrCodeUrl} alt="QR Code" className="w-48 h-48" />
              </motion.div>

              <div className="text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  Can't scan the QR code? Use this key instead:
                </p>
                <div className="flex items-center justify-center gap-2 bg-gray-100 dark:bg-gray-700 px-4 py-2 rounded-lg">
                  <code className="text-sm font-mono text-gray-900 dark:text-gray-100">{secret}</code>
                  <button
                    onClick={handleCopySecret}
                    className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                  >
                    {copied ? (
                      <CheckCircleIcon className="h-5 w-5 text-green-500" />
                    ) : (
                      <DocumentDuplicateIcon className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="w-full max-w-sm">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  Recommended authenticator apps:
                </p>
                <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                  <li>• Google Authenticator</li>
                  <li>• Microsoft Authenticator</li>
                  <li>• Authy</li>
                  <li>• 1Password</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Verification Step */}
        <Card variant="bordered">
          <CardHeader>
            <CardTitle>Step 2: Verify Code</CardTitle>
            <CardDescription>
              Enter the 6-digit code from your authenticator app to complete setup
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3"
                >
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </motion.div>
              )}

              <Input
                type="text"
                placeholder="Enter 6-digit code"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                error={error}
                leftIcon={<ShieldCheckIcon className="h-5 w-5" />}
                disabled={isLoading}
                maxLength={6}
                autoComplete="one-time-code"
                className="text-center text-2xl tracking-widest"
              />

              <Button onClick={handleVerify} isLoading={isLoading} className="w-full">
                Verify and Enable 2FA
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Security Notice */}
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <div className="flex gap-3">
            <ShieldCheckIcon className="h-5 w-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-yellow-900 dark:text-yellow-200 mb-1">
                Important Security Notice
              </h4>
              <ul className="text-sm text-yellow-800 dark:text-yellow-300 space-y-1">
                <li>• Keep your secret key in a safe place as a backup</li>
                <li>• You'll need your authenticator app to sign in from now on</li>
                <li>• If you lose access to your authenticator, you may lose access to your account</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
