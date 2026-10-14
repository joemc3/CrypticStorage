import React, { useState } from 'react';
import { EyeIcon, EyeSlashIcon, LockClosedIcon } from '@heroicons/react/24/outline';

export interface LoginFormProps {
  onSubmit: (data: LoginData) => Promise<void>;
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

const label = 'mb-1 block font-sans text-sm font-medium text-ink';
const field =
  'block h-11 w-full rounded-lg border bg-surface px-3 font-sans text-base text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60';
const primary =
  'h-11 w-full rounded-lg bg-accent px-4 font-sans text-[15px] font-semibold text-accent-ink hover:bg-accent-hover disabled:opacity-[0.42] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
const quiet =
  'self-center rounded-lg px-3 py-2 font-sans text-sm font-semibold text-ink-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export const LoginForm: React.FC<LoginFormProps> = ({ onSubmit, twoFactorRequired = false, onCancelTwoFactor, isLoading = false, error }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [useBackup, setUseBackup] = useState(false);
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

  const errorBox = error && (
    <p role="alert" className="rounded-lg border border-danger bg-danger-soft px-3 py-2 font-sans text-sm text-danger-text">
      {error}
    </p>
  );

  if (twoFactorRequired) {
    return (
      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <div className="flex flex-col gap-2">
          <h1 className="font-sans text-2xl font-semibold leading-[30px] tracking-tight text-ink md:text-[28px] md:leading-[34px]">
            {useBackup ? 'Backup code' : 'Two-factor code'}
          </h1>
          <p className="font-sans text-base text-ink-2">
            {useBackup
              ? 'Each backup code works once. You have the list you saved when you turned two-factor on.'
              : 'Enter the six-digit code from your authenticator app.'}
          </p>
        </div>
        {errorBox}
        <div>
          <label htmlFor="login-code" className={label}>
            {useBackup ? 'Backup code' : 'Six-digit code'}
          </label>
          <input
            id="login-code"
            type="text"
            value={twoFactorCode}
            onChange={(e) => setTwoFactorCode(e.target.value)}
            placeholder={useBackup ? 'XXXX-XXXX' : '123456'}
            inputMode={useBackup ? 'text' : 'numeric'}
            autoComplete="one-time-code"
            spellCheck={false}
            autoFocus
            disabled={isLoading}
            aria-invalid={errors.twoFactorCode ? true : undefined}
            className={`${field} font-mono ${useBackup ? 'text-base tracking-wider' : 'text-[26px] tracking-[0.2em]'} ${errors.twoFactorCode ? 'border-danger' : 'border-line-strong'}`}
          />
          {errors.twoFactorCode && <p className="mt-1 font-sans text-[13px] text-danger-text">{errors.twoFactorCode}</p>}
        </div>
        <button type="submit" disabled={isLoading} className={primary}>
          {isLoading ? 'Verifying…' : 'Verify'}
        </button>
        <button
          type="button"
          onClick={() => {
            setUseBackup((v) => !v);
            setTwoFactorCode('');
            setErrors({});
          }}
          disabled={isLoading}
          className={quiet}
        >
          {useBackup ? 'Use the authenticator code' : 'Use a backup code instead'}
        </button>
        {onCancelTwoFactor && (
          <button type="button" onClick={onCancelTwoFactor} disabled={isLoading} className={`${quiet} -mt-3`}>
            Back to sign in
          </button>
        )}
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <h1 className="font-sans text-2xl font-semibold leading-[30px] tracking-tight text-ink md:text-[28px] md:leading-[34px]">Sign in</h1>
      {errorBox}
      <div>
        <label htmlFor="login-email" className={label}>
          Email
        </label>
        <input
          id="login-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="username"
          disabled={isLoading}
          aria-invalid={errors.email ? true : undefined}
          className={`${field} ${errors.email ? 'border-danger' : 'border-line-strong'}`}
        />
        {errors.email && <p className="mt-1 font-sans text-[13px] text-danger-text">{errors.email}</p>}
      </div>
      <div>
        <label htmlFor="login-password" className={label}>
          Password
        </label>
        <div className="relative">
          <input
            id="login-password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            autoComplete="current-password"
            disabled={isLoading}
            aria-invalid={errors.password ? true : undefined}
            className={`${field} pr-12 ${errors.password ? 'border-danger' : 'border-line-strong'}`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-ink-3 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {showPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
          </button>
        </div>
        {errors.password && <p className="mt-1 font-sans text-[13px] text-danger-text">{errors.password}</p>}
      </div>
      <button type="submit" disabled={isLoading} className={primary}>
        {isLoading ? 'Signing in…' : 'Sign in'}
      </button>
      <p className="flex items-center gap-2 font-sans text-[13px] leading-[18px] text-ink-3">
        <LockClosedIcon className="h-4 w-4 flex-none" aria-hidden="true" />
        There is no password reset.
      </p>
    </form>
  );
};
