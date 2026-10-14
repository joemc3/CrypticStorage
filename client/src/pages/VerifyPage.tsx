/**
 * CrypticStorage - Verify Page (/verify/:token)
 */

import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { Spinner } from '../components/common/Spinner';
import { PublicLayout } from '../layouts/PublicLayout';
import { useAuth } from '../hooks/useAuth';

type State = { kind: 'pending' } | { kind: 'ok'; email: string } | { kind: 'failed' };

export const VerifyPage: React.FC = () => {
  const { token = '' } = useParams<{ token: string }>();
  const { verifyEmail, resendVerification } = useAuth();
  const [state, setState] = useState<State>({ kind: 'pending' });
  const [email, setEmail] = useState('');
  const [resent, setResent] = useState(false);
  // The token is single use. StrictMode runs effects twice in dev, so both runs share one in-flight call.
  const attempt = useRef<{ token: string; promise: Promise<{ email: string }> } | null>(null);

  useEffect(() => {
    let live = true;
    if (attempt.current?.token !== token) attempt.current = { token, promise: verifyEmail(token) };
    attempt.current.promise.then(
      (result) => live && setState({ kind: 'ok', email: result.email }),
      () => live && setState({ kind: 'failed' })
    );
    return () => {
      live = false;
    };
  }, [token, verifyEmail]);

  const resend = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await resendVerification(email);
    } catch {
      /* the server answers the same either way */
    }
    setResent(true);
  };

  const title = 'font-sans text-2xl font-semibold leading-[30px] tracking-tight text-ink md:text-[28px] md:leading-[34px]';
  const primary =
    'inline-flex h-11 w-full items-center justify-center rounded-lg bg-accent px-4 font-sans text-[15px] font-semibold text-accent-ink hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

  return (
    <PublicLayout narrow>
      <div className="flex flex-col gap-5 pt-6">
        {state.kind === 'pending' && <Spinner size="lg" color="text-accent" label="Checking your link…" />}

        {state.kind === 'ok' && (
          <>
            <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-accent-soft text-accent-text">
              <CheckIcon className="h-6 w-6" aria-hidden="true" />
            </div>
            <h1 className={title}>Your email is verified.</h1>
            <p className="font-sans text-base text-ink-2">{state.email} · your safe is ready.</p>
            <Link to="/login" className={`${primary} mt-2`}>
              Sign in
            </Link>
          </>
        )}

        {state.kind === 'failed' && (
          <form onSubmit={resend} className="flex flex-col gap-5">
            <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-danger-soft text-danger-text">
              <XMarkIcon className="h-6 w-6" aria-hidden="true" />
            </div>
            <h1 className={title}>This link has expired or was already used.</h1>
            <div>
              <label htmlFor="verify-email" className="mb-1 block font-sans text-sm font-medium text-ink">Your email</label>
              <input
                id="verify-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="block h-11 w-full rounded-lg border border-line-strong bg-surface px-3 font-sans text-base text-ink focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <button type="submit" className={primary}>
              Send a new link
            </button>
            {resent && <p className="font-sans text-sm text-ink-2" role="status">If that address has an unverified account, a new link is on its way.</p>}
          </form>
        )}
      </div>
    </PublicLayout>
  );
};

export default VerifyPage;
