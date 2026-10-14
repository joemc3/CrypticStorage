/**
 * CrypticStorage - Login Page
 */

import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../layouts/AuthLayout';
import { LoginForm, type LoginData } from '../components/auth/LoginForm';
import { useAuth } from '../hooks/useAuth';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginUser, resendVerification, verifyTwoFactor, cancelTwoFactor, isLoading, pendingTwoFactorEmail } = useAuth();
  const [error, setError] = useState<string | undefined>();
  const [unverified, setUnverified] = useState<string | undefined>();
  const [resent, setResent] = useState(false);

  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/dashboard';

  const handleSubmit = async (data: LoginData) => {
    setError(undefined);
    setUnverified(undefined);
    try {
      if (pendingTwoFactorEmail) {
        await verifyTwoFactor(data.twoFactorCode ?? '');
        navigate(from, { replace: true });
        return;
      }
      const result = await loginUser({ email: data.email, password: data.password });
      if (!result.requiresTwoFactor) navigate(from, { replace: true });
    } catch (err) {
      if ((err as { code?: string } | null)?.code === 'EMAIL_UNVERIFIED') {
        setUnverified(data.email.trim().toLowerCase());
        setResent(false);
        return;
      }
      setError(err instanceof Error ? err.message : 'Sign in failed');
    }
  };

  const handleResend = async () => {
    if (!unverified) return;
    try {
      await resendVerification(unverified);
    } catch {
      /* the server answers the same either way */
    }
    setResent(true);
  };

  if (unverified) {
    return (
      <AuthLayout>
        <div className="flex flex-col gap-5">
          <h1 className="font-serif text-[30px] font-semibold leading-9 text-ink">Check your email</h1>
          <p className="font-sans text-base leading-6 text-ink-2">
            <span className="text-ink">{unverified}</span> is not verified yet. Open the link we sent to finish, then sign in.
          </p>
          <button
            type="button"
            onClick={handleResend}
            className="w-full rounded-lg border border-line-strong bg-surface px-4 py-3 font-sans text-[15px] font-medium text-ink hover:bg-surface-2"
          >
            Resend the email
          </button>
          {resent && <p role="status" className="text-center font-sans text-sm text-ink-3">Sent. Nothing after a few minutes? Check spam.</p>}
          <button type="button" onClick={() => setUnverified(undefined)} className="self-center font-sans text-sm font-medium text-ink-2 hover:text-ink">
            Back to sign in
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <LoginForm
        onSubmit={handleSubmit}
        onRegister={() => navigate('/register', { state: { from } })}
        twoFactorRequired={pendingTwoFactorEmail !== null}
        onCancelTwoFactor={() => {
          cancelTwoFactor();
          setError(undefined);
        }}
        isLoading={isLoading}
        error={error}
      />
      {!pendingTwoFactorEmail && (
        <p className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400">
          Zero-knowledge means there is no password reset. If you lose your password, your files cannot be recovered.
        </p>
      )}
    </AuthLayout>
  );
};

export default LoginPage;
