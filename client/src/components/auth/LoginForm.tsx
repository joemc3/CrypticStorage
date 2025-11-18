import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '../common/Button';
import { Input } from '../common/Input';

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
    <div className="w-full">
      {/* Header */}
      <div className="text-center mb-8">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h2 className="font-display text-3xl text-text-primary mb-2">Access Vault</h2>
          <p className="font-mono text-xs tracking-wider text-text-muted">
            AUTHENTICATE TO CONTINUE
          </p>
        </motion.div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Error Alert */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 bg-cipher-crimson/10 border border-cipher-crimson/30 rounded-lg"
          >
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-cipher-crimson flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p className="text-sm text-cipher-crimson font-mono">{error}</p>
            </div>
          </motion.div>
        )}

        {/* Email Input */}
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Input
            type="email"
            label="EMAIL"
            placeholder="agent@cryptic.io"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
            leftIcon={
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            }
            disabled={isLoading}
            autoComplete="email"
          />
        </motion.div>

        {/* Password Input */}
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Input
            type="password"
            label="PASSPHRASE"
            placeholder="Enter your passphrase"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            leftIcon={
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            }
            disabled={isLoading}
            autoComplete="current-password"
          />
        </motion.div>

        {/* 2FA Input */}
        {showTwoFactor && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ duration: 0.3 }}
          >
            <Input
              type="text"
              label="2FA CODE"
              placeholder="000000"
              value={twoFactorCode}
              onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              error={errors.twoFactorCode}
              leftIcon={
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              }
              disabled={isLoading}
              maxLength={6}
              autoComplete="one-time-code"
            />
          </motion.div>
        )}

        {/* Forgot Password */}
        {onForgotPassword && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-right"
          >
            <button
              type="button"
              onClick={onForgotPassword}
              className="font-mono text-xs text-text-muted hover:text-cipher-phosphor transition-colors"
              disabled={isLoading}
            >
              FORGOT PASSPHRASE?
            </button>
          </motion.div>
        )}

        {/* Submit Button */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Button type="submit" isLoading={isLoading} className="w-full">
            {showTwoFactor ? 'VERIFY ACCESS' : 'DECRYPT & ENTER'}
          </Button>
        </motion.div>

        {/* Register Link */}
        {onRegister && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-center pt-4"
          >
            <p className="font-mono text-xs text-text-muted">
              NEW AGENT?{' '}
              <button
                type="button"
                onClick={onRegister}
                className="text-cipher-phosphor hover:text-cipher-amber transition-colors"
                disabled={isLoading}
              >
                CREATE VAULT
              </button>
            </p>
          </motion.div>
        )}
      </form>
    </div>
  );
};
