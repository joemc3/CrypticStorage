import React, { useState, useMemo } from 'react';
import { EnvelopeIcon, LockClosedIcon, UserIcon } from '@heroicons/react/24/outline';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { motion } from 'framer-motion';

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
  displayName?: string;
}

interface PasswordStrength {
  score: number; // 0-4
  label: string;
  color: string;
}

const calculatePasswordStrength = (password: string): PasswordStrength => {
  let score = 0;

  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  const labels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];
  const colors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-blue-500', 'bg-green-500'];

  return {
    score,
    label: labels[score] || 'Very Weak',
    color: colors[score] || 'bg-red-500',
  };
};

export const RegisterForm: React.FC<RegisterFormProps> = ({
  onSubmit,
  onLogin,
  isLoading = false,
  error,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [errors, setErrors] = useState<Partial<RegisterData>>({});
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const passwordStrength = useMemo(() => calculatePasswordStrength(password), [password]);

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
      newErrors.password = 'Password must be at least 8 characters';
    } else if (passwordStrength.score < 2) {
      newErrors.password = 'Password is too weak';
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0 && acceptedTerms;
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
      displayName: displayName || undefined,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-md mx-auto"
    >
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Create Account</h2>
        <p className="text-gray-600 dark:text-gray-400 mt-2">Sign up to get started</p>
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
          type="text"
          label="Display Name (Optional)"
          placeholder="Enter your name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          leftIcon={<UserIcon className="h-5 w-5" />}
          disabled={isLoading}
          autoComplete="name"
        />

        <div>
          <Input
            type="password"
            label="Password"
            placeholder="Create a password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            leftIcon={<LockClosedIcon className="h-5 w-5" />}
            disabled={isLoading}
            autoComplete="new-password"
          />
          {password && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-2"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-600 dark:text-gray-400">Password Strength:</span>
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  {passwordStrength.label}
                </span>
              </div>
              <div className="flex gap-1">
                {[0, 1, 2, 3, 4].map((index) => (
                  <div
                    key={index}
                    className={`h-1 flex-1 rounded-full transition-all ${
                      index < passwordStrength.score ? passwordStrength.color : 'bg-gray-200 dark:bg-gray-700'
                    }`}
                  />
                ))}
              </div>
              <ul className="mt-2 space-y-1 text-xs text-gray-600 dark:text-gray-400">
                <li className={password.length >= 8 ? 'text-green-600 dark:text-green-400' : ''}>
                  ✓ At least 8 characters
                </li>
                <li
                  className={
                    /[a-z]/.test(password) && /[A-Z]/.test(password) ? 'text-green-600 dark:text-green-400' : ''
                  }
                >
                  ✓ Uppercase and lowercase letters
                </li>
                <li className={/\d/.test(password) ? 'text-green-600 dark:text-green-400' : ''}>
                  ✓ At least one number
                </li>
                <li className={/[^a-zA-Z0-9]/.test(password) ? 'text-green-600 dark:text-green-400' : ''}>
                  ✓ At least one special character
                </li>
              </ul>
            </motion.div>
          )}
        </div>

        <Input
          type="password"
          label="Confirm Password"
          placeholder="Confirm your password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={errors.confirmPassword}
          success={confirmPassword && password === confirmPassword ? 'Passwords match' : undefined}
          leftIcon={<LockClosedIcon className="h-5 w-5" />}
          disabled={isLoading}
          autoComplete="new-password"
        />

        <div className="flex items-start">
          <input
            type="checkbox"
            id="terms"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
            className="mt-1 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
            disabled={isLoading}
          />
          <label htmlFor="terms" className="ml-2 text-sm text-gray-600 dark:text-gray-400">
            I agree to the{' '}
            <a href="/terms" className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="/privacy" className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">
              Privacy Policy
            </a>
          </label>
        </div>

        <Button type="submit" isLoading={isLoading} disabled={!acceptedTerms} className="w-full">
          Create Account
        </Button>

        {onLogin && (
          <div className="text-center mt-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Already have an account?{' '}
              <button
                type="button"
                onClick={onLogin}
                className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium"
                disabled={isLoading}
              >
                Sign in
              </button>
            </p>
          </div>
        )}
      </form>
    </motion.div>
  );
};
