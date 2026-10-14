/**
 * CrypticStorage - 404 Not Found Page
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { PublicLayout } from '../layouts/PublicLayout';
import { useAuthStore } from '../stores/auth.store';

export const NotFoundPage: React.FC = () => {
  const signedIn = useAuthStore((s) => s.status !== 'anonymous');
  return (
    <PublicLayout narrow>
      <div className="flex flex-col gap-5 pt-6">
        <span className="font-mono text-[13px] text-ink-3">404</span>
        <h1 className="font-sans text-2xl font-semibold leading-[30px] tracking-tight text-ink md:text-[28px] md:leading-[34px]">Nothing is kept at this address.</h1>
        <p className="font-sans text-base text-ink-2">It may be mistyped, or it pointed at something that was moved or deleted.</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Link
            to={signedIn ? '/dashboard' : '/login'}
            className="inline-flex h-11 items-center rounded-lg bg-accent px-5 font-sans text-[15px] font-semibold text-accent-ink hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Go to your safe
          </Link>
          <Link to="/" className="inline-flex h-11 items-center rounded-lg px-3 font-sans text-[15px] font-semibold text-ink-2 hover:text-ink">
            Home
          </Link>
        </div>
      </div>
    </PublicLayout>
  );
};

export default NotFoundPage;
