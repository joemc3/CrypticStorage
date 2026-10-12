import React, { useState } from 'react';
import { EnvelopeIcon, LockClosedIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { motion } from 'framer-motion';

export interface LoginFormProps {
  onSubmit: (data: LoginData) => Promise<void>;
  onForgotPassword?: () => void;
  onRegister?: () => void;
  /** When set, the form only asks for the second factor. */
  twoFactorRequired?: boolean;
  onCancelTwoFactor?: () => void;
  isLoading?: boolean;
  error?: string;
}

export interface LoginData {
  email: string;
  password: string;
  twoFactorCode?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const LoginForm: React.FC<LoginFormProps> = ({ onSubmit, onForgotPassword, onRegister, twoFactorRequired = false, onCancelTwoFactor, isLoading = false, error }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [errors, setErrors] = useState<Partial<LoginData>>({});

  const validate = (): boolean => {
    const next: Partial<LoginData> = {};
    if (twoFactorRequired) {
      if (!twoFactorCode.trim()) next.twoFactorCode = 'Enter the code from your authenticator app or a backup code';
    } else {
      if (!email) next.email = 'Email is required';
      else if (!EMAIL_RE.test(email)) next.email = 'Invalid email format';
      if (!password) next.password = 'Password is required';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    await onSubmit({ email, password, twoFactorCode: twoFactorRequired ? twoFactorCode.trim() : undefined });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="w-full max-w-md mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{twoFactorRequired ? 'Two-factor check' : 'Welcome back'}</h2>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          {twoFactorRequired ? 'Enter the 6-digit code from your authenticator app, or one of your backup codes.' : 'Sign in to your account'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </motion.div>
        )}

        {twoFactorRequired ? (
          <>
            <Input
              type="text"
              label="Verification code"
              placeholder="123456 or XXXX-XXXX"
              value={twoFactorCode}
              onChange={(e) => setTwoFactorCode(e.target.value)}
              error={errors.twoFactorCode}
              leftIcon={<ShieldCheckIcon className="h-5 w-5" />}
              disabled={isLoading}
              autoComplete="one-time-code"
              autoFocus
              className="text-center text-xl tracking-widest"
            />
            <Button type="submit" isLoading={isLoading} className="w-full">
              Verify and sign in
            </Button>
            {onCancelTwoFactor && (
              <button type="button" onClick={onCancelTwoFactor} className="w-full text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200" disabled={isLoading}>
                Back to sign in
              </button>
            )}
          </>
        ) : (
          <>
            <Input
              type="email"
              label="Email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={errors.email}
              leftIcon={<EnvelopeIcon className="h-5 w-5" />}
              disabled={isLoading}
              autoComplete="email"
            />
            <Input
              type="password"
              label="Password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
              leftIcon={<LockClosedIcon className="h-5 w-5" />}
              disabled={isLoading}
              autoComplete="current-password"
            />
            {onForgotPassword && (
              <div className="text-right">
                <button type="button" onClick={onForgotPassword} className="text-sm text-indigo-600 hover:text-indigo-500 dark:text-indigo-400" disabled={isLoading}>
                  Forgot password?
                </button>
              </div>
            )}
            <Button type="submit" isLoading={isLoading} className="w-full">
              Sign in
            </Button>
            {onRegister && (
              <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-4">
                Don&apos;t have an account?{' '}
                <button type="button" onClick={onRegister} className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 font-medium" disabled={isLoading}>
                  Sign up
                </button>
              </p>
            )}
          </>
        )}
      </form>
    </motion.div>
  );
};
