/**
 * CrypticStorage - Verify Page (/verify/:token)
 */

import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Spinner } from '../components/common/Spinner';
import { useAuth } from '../hooks/useAuth';

type State = { kind: 'pending' } | { kind: 'ok'; email: string } | { kind: 'failed' };

export const VerifyPage: React.FC = () => {
  const { token = '' } = useParams<{ token: string }>();
  const { verifyEmail, resendVerification } = useAuth();
  const [state, setState] = useState<State>({ kind: 'pending' });
  const [email, setEmail] = useState('');
  const [resent, setResent] = useState(false);

  useEffect(() => {
    let live = true;
    verifyEmail(token).then(
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

  return (
    <main className="min-h-screen bg-bg text-ink">
      <div className="mx-auto flex w-full max-w-[400px] flex-col gap-5 px-4 pt-24">
        {state.kind === 'pending' && <Spinner size="lg" label="Checking your link…" />}

        {state.kind === 'ok' && (
          <>
            <h1 className="font-serif text-[30px] font-semibold leading-9 text-ink">Your email is verified.</h1>
            <p className="font-sans text-base text-ink-2">{state.email} · your safe is ready.</p>
            <Link to="/login" className="w-full rounded-lg bg-accent px-4 py-3 text-center font-sans text-[15px] font-medium text-accent-ink hover:bg-accent-hover">
              Sign in
            </Link>
          </>
        )}

        {state.kind === 'failed' && (
          <form onSubmit={resend} className="flex flex-col gap-5">
            <h1 className="font-serif text-[30px] font-semibold leading-9 text-ink">This link has expired or was already used.</h1>
            <div>
              <label htmlFor="verify-email" className="mb-1 block font-sans text-sm font-medium text-ink">Your email</label>
              <input
                id="verify-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="block w-full rounded-lg border border-line bg-surface px-3 py-2.5 font-sans text-base text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <button type="submit" className="w-full rounded-lg bg-accent px-4 py-3 font-sans text-[15px] font-medium text-accent-ink hover:bg-accent-hover">
              Send a new link
            </button>
            {resent && <p className="font-sans text-sm text-ink-2" role="status">If that address has an unverified account, a new link is on its way.</p>}
          </form>
        )}
      </div>
    </main>
  );
};

export default VerifyPage;
