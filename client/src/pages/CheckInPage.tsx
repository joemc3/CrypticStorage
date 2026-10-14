/**
 * CrypticStorage - Check-in Page (/check-in/:token)
 * Reached from a reminder email. Public: the link itself is the proof, so nobody has to sign in.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { Spinner } from '../components/common/Spinner';
import { PublicLayout } from '../layouts/PublicLayout';
import ApiService from '../services/api.service';

type State = 'pending' | 'ok' | 'failed';

export const CheckInPage: React.FC = () => {
  const { token = '' } = useParams<{ token: string }>();
  const [state, setState] = useState<State>('pending');
  // The token may be single use. StrictMode runs effects twice in dev, so both runs share one in-flight call.
  const attempt = useRef<{ token: string; promise: Promise<unknown> } | null>(null);

  useEffect(() => {
    let live = true;
    if (attempt.current?.token !== token) attempt.current = { token, promise: ApiService.checkIn(token) };
    attempt.current.promise.then(
      () => live && setState('ok'),
      () => live && setState('failed')
    );
    return () => {
      live = false;
    };
  }, [token]);

  const title = 'font-sans text-2xl font-semibold leading-[30px] tracking-tight text-ink md:text-[28px] md:leading-[34px]';
  const primary =
    'inline-flex h-11 w-full items-center justify-center rounded-lg bg-accent px-4 font-sans text-[15px] font-semibold text-accent-ink hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

  return (
    <PublicLayout narrow>
      <div className="flex flex-col gap-5 pt-6">
        {state === 'pending' && <Spinner size="lg" color="text-accent" label="Checking your link…" />}

        {state === 'ok' && (
          <>
            <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-accent-soft text-accent-text">
              <CheckIcon className="h-6 w-6" aria-hidden="true" />
            </div>
            <h1 className={title}>Your clock is reset.</h1>
            <p className="font-sans text-base text-ink-2">Nothing else is needed.</p>
            <Link to="/login" className={`${primary} mt-2`}>
              Sign in
            </Link>
          </>
        )}

        {state === 'failed' && (
          <>
            <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-danger-soft text-danger-text">
              <XMarkIcon className="h-6 w-6" aria-hidden="true" />
            </div>
            <h1 className={title}>This link is invalid or has expired.</h1>
            <p className="font-sans text-base text-ink-2">Signing in to your safe also resets the clock.</p>
            <Link to="/login" className={`${primary} mt-2`}>
              Sign in
            </Link>
          </>
        )}
      </div>
    </PublicLayout>
  );
};

export default CheckInPage;
