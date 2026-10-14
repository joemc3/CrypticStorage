/**
 * CrypticStorage - Login Page
 */

import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../layouts/AuthLayout';
import { quietAction } from '../layouts/PublicFrame';
import { LoginForm, type LoginData } from '../components/auth/LoginForm';
import { useAuth } from '../hooks/useAuth';

const quietBtn =
  'w-full h-11 rounded-lg border border-line-strong bg-surface px-4 font-sans text-[15px] font-semibold text-ink hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

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
          <h1 className="font-serif text-[30px] font-semibold leading-9 text-ink md:text-[44px] md:leading-[50px]">Check your email</h1>
          <p className="font-sans text-base leading-6 text-ink-2">
            <span className="text-ink">{unverified}</span> is not verified yet. Open the link we sent to finish, then sign in.
          </p>
          <button type="button" onClick={handleResend} className={quietBtn}>
            Resend the email
          </button>
          {resent && <p role="status" className="text-center font-sans text-sm text-ink-3">Sent. Nothing after a few minutes? Check spam.</p>}
          <button type="button" onClick={() => setUnverified(undefined)} className="self-center rounded-lg px-3 py-2 font-sans text-sm font-semibold text-ink-2 hover:text-ink">
            Back to sign in
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      action={
        <Link to="/register" state={{ from }} className={quietAction}>
          Create account
        </Link>
      }
    >
      <LoginForm
        onSubmit={handleSubmit}
        twoFactorRequired={pendingTwoFactorEmail !== null}
        onCancelTwoFactor={() => {
          cancelTwoFactor();
          setError(undefined);
        }}
        isLoading={isLoading}
        error={error}
      />
    </AuthLayout>
  );
};

export default LoginPage;
