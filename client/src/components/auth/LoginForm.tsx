import React, { useState } from 'react';
import { EnvelopeIcon, LockClosedIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { motion } from 'framer-motion';

export interface LoginFormProps {
  onSubmit: (data: LoginData) => Promise<void>;
  onForgotPassword?: () => void;
  onRegister?: () => void;
  isLoading?: boolean;
  error?: string;
}

export interface LoginData {
  email: string;
  password: string;
  twoFactorCode?: string;
}

export const LoginForm: React.FC<LoginFormProps> = ({
  onSubmit,
  onForgotPassword,
  onRegister,
  isLoading = false,
  error,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [showTwoFactor, setShowTwoFactor] = useState(false);
  const [errors, setErrors] = useState<Partial<LoginData>>({});

  const validate = (): boolean => {
    const newErrors: Partial<LoginData> = {};

    if (!email) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Invalid email format';
    }

    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }

    if (showTwoFactor && !twoFactorCode) {
      newErrors.twoFactorCode = '2FA code is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    try {
      await onSubmit({
        email,
        password,
        twoFactorCode: showTwoFactor ? twoFactorCode : undefined,
      });
    } catch (err: any) {
      if (err.message?.includes('2FA') || err.message?.includes('two-factor')) {
        setShowTwoFactor(true);
      }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-md mx-auto"
    >
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Welcome Back</h2>
        <p className="text-gray-600 dark:text-gray-400 mt-2">Sign in to your account</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
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
          type="email"
          label="Email"
          placeholder="Enter your email"
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
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          leftIcon={<LockClosedIcon className="h-5 w-5" />}
          disabled={isLoading}
          autoComplete="current-password"
        />

        {showTwoFactor && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ duration: 0.3 }}
          >
            <Input
              type="text"
              label="Two-Factor Code"
              placeholder="Enter 6-digit code"
              value={twoFactorCode}
              onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              error={errors.twoFactorCode}
              leftIcon={<ShieldCheckIcon className="h-5 w-5" />}
              disabled={isLoading}
              maxLength={6}
              autoComplete="one-time-code"
            />
          </motion.div>
        )}

        {onForgotPassword && (
          <div className="text-right">
            <button
              type="button"
              onClick={onForgotPassword}
              className="text-sm text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
              disabled={isLoading}
            >
              Forgot password?
            </button>
          </div>
        )}

        <Button type="submit" isLoading={isLoading} className="w-full">
          {showTwoFactor ? 'Verify & Sign In' : 'Sign In'}
        </Button>

        {onRegister && (
          <div className="text-center mt-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Don't have an account?{' '}
              <button
                type="button"
                onClick={onRegister}
                className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium"
                disabled={isLoading}
              >
                Sign up
              </button>
            </p>
          </div>
        )}
      </form>
    </motion.div>
  );
};
