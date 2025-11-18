import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '../common/Button';
import { Input } from '../common/Input';

export interface RegisterFormProps {
  onSubmit: (data: RegisterData) => Promise<void>;
  onLogin?: () => void;
  isLoading?: boolean;
  error?: string;
}

export interface RegisterData {
  email: string;
  password: string;
  confirmPassword: string;
}

export const RegisterForm: React.FC<RegisterFormProps> = ({
  onSubmit,
  onLogin,
  isLoading = false,
  error,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Partial<RegisterData>>({});

  const validate = (): boolean => {
    const newErrors: Partial<RegisterData> = {};

    if (!email) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Invalid email format';
    }

    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 8) {
      newErrors.password = 'Minimum 8 characters required';
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      newErrors.password = 'Include uppercase, lowercase, and number';
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    await onSubmit({
      email,
      password,
      confirmPassword,
    });
  };

  // Password strength indicator
  const getPasswordStrength = () => {
    if (!password) return { level: 0, label: '', color: '' };
    let strength = 0;
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;

    if (strength <= 2) return { level: strength, label: 'WEAK', color: 'bg-cipher-crimson' };
    if (strength <= 3) return { level: strength, label: 'FAIR', color: 'bg-cipher-amber' };
    return { level: strength, label: 'STRONG', color: 'bg-cipher-phosphor' };
  };

  const passwordStrength = getPasswordStrength();

  return (
    <div className="w-full">
      {/* Header */}
      <div className="text-center mb-8">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h2 className="font-display text-3xl text-text-primary mb-2">Create Vault</h2>
          <p className="font-mono text-xs tracking-wider text-text-muted">
            INITIALIZE ENCRYPTED STORAGE
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
            label="MASTER PASSPHRASE"
            placeholder="Create a strong passphrase"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            leftIcon={
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
              </svg>
            }
            disabled={isLoading}
            autoComplete="new-password"
          />
          {/* Password Strength */}
          {password && (
            <div className="mt-2">
              <div className="flex gap-1 mb-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      i <= passwordStrength.level ? passwordStrength.color : 'bg-cipher-slate/30'
                    }`}
                  />
                ))}
              </div>
              <p className="font-mono text-xs text-text-muted">
                STRENGTH: <span className={passwordStrength.level >= 4 ? 'text-cipher-phosphor' : passwordStrength.level >= 3 ? 'text-cipher-amber' : 'text-cipher-crimson'}>{passwordStrength.label}</span>
              </p>
            </div>
          )}
        </motion.div>

        {/* Confirm Password Input */}
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Input
            type="password"
            label="CONFIRM PASSPHRASE"
            placeholder="Repeat your passphrase"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            error={errors.confirmPassword}
            leftIcon={
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            }
            disabled={isLoading}
            autoComplete="new-password"
          />
        </motion.div>

        {/* Security Notice */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="p-3 bg-cipher-charcoal/50 border border-cipher-slate/30 rounded-lg"
        >
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-cipher-amber flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <p className="font-mono text-xs text-text-muted leading-relaxed">
              Your passphrase derives your encryption keys. We cannot recover it if lost. Store it securely.
            </p>
          </div>
        </motion.div>

        {/* Submit Button */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Button type="submit" isLoading={isLoading} className="w-full">
            INITIALIZE VAULT
          </Button>
        </motion.div>

        {/* Login Link */}
        {onLogin && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="text-center pt-4"
          >
            <p className="font-mono text-xs text-text-muted">
              EXISTING AGENT?{' '}
              <button
                type="button"
                onClick={onLogin}
                className="text-cipher-phosphor hover:text-cipher-amber transition-colors"
                disabled={isLoading}
              >
                ACCESS VAULT
              </button>
            </p>
          </motion.div>
        )}
      </form>
    </div>
  );
};
