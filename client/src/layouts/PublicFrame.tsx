/**
 * CrypticStorage - the chrome-free frame shared by public pages and one-fact style screens.
 * Brand top left, one quiet action top right, a single centred column.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

export const Logo: React.FC<{ className?: string }> = ({ className = 'h-6 w-6' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
    <circle cx="12" cy="10.5" r="2.2" />
    <path d="M12 12.7v3.8" />
  </svg>
);

export const Brand: React.FC<{ to?: string }> = ({ to = '/' }) => (
  <Link to={to} className="inline-flex items-center gap-2 font-sans text-[17px] font-semibold text-ink">
    <Logo className="h-6 w-6 text-accent" />
    CrypticStorage
  </Link>
);

export const quietAction =
  'inline-flex h-11 items-center rounded-lg px-3 font-sans text-[15px] font-semibold text-ink-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export interface PublicFrameProps {
  children: React.ReactNode;
  /** The one quiet action at top right. */
  action?: React.ReactNode;
  /** 'form' is a 400 px column, 'page' is 560 px. */
  width?: 'form' | 'page';
}

export const PublicFrame: React.FC<PublicFrameProps> = ({ children, action, width = 'page' }) => (
  <div className="flex min-h-screen flex-col bg-bg text-ink">
    <header className="flex h-16 flex-none items-center justify-between pl-5 pr-3 md:h-[76px] md:pl-10 md:pr-8">
      <Brand />
      {action}
    </header>
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="flex flex-1 flex-col items-center px-4 pb-16 pt-8 md:px-10 md:pt-16"
    >
      <div className={`w-full ${width === 'form' ? 'max-w-[400px]' : 'max-w-[560px]'}`}>{children}</div>
    </motion.main>
  </div>
);
